import { useCallback, useEffect, useRef, useState } from "react";
import { t, errorCodeMessage } from "../i18n/translations";
import {
  registerMessagingKey,
  getMessagingKey,
  createMessagingThread,
  storeWrappedKey,
  sendMessage,
  listThreads,
  listMessages,
} from "../services/api";
import {
  generateMemberKeyPair,
  exportPrivateKeyJwk,
  importPrivateKeyJwk,
  deriveFingerprint,
  generateGroupKey,
  wrapGroupKeyForMember,
  unwrapGroupKey,
  encryptMessage,
  decryptMessage,
} from "../utils/crypto";

const MEMBER_ID_KEY = "scamsahayak-chat-member-id";
const PRIVATE_JWK_KEY = "scamsahayak-chat-private-jwk";
const FINGERPRINT_KEY = "scamsahayak-chat-fingerprint";

function readStored(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable — keys last for this session only
  }
}

function newMemberId() {
  const rand = Math.random().toString(36).slice(2, 10);
  return `mem_${rand}`;
}

export default function FamilyChat({ language }) {
  const [memberId, setMemberId] = useState(() => readStored(MEMBER_ID_KEY) || newMemberId());
  const [privateKey, setPrivateKey] = useState(null);
  const [fingerprint, setFingerprint] = useState(() => readStored(FINGERPRINT_KEY));
  const [ready, setReady] = useState(false);
  const [threads, setThreads] = useState([]); // { threadId, name, memberIds, groupKey|null }
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [messages, setMessages] = useState([]); // { messageId, senderId, createdAt, plaintext|null }
  const [draft, setDraft] = useState("");
  const [threadName, setThreadName] = useState("");
  const [threadMembers, setThreadMembers] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bootstrappedRef = useRef(false);

  // 1. Keypair bootstrap: generate once, persist the private JWK locally,
  //    register the public key server-side, show the fingerprint.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    (async () => {
      try {
        let key = privateKey;
        const storedJwk = readStored(PRIVATE_JWK_KEY);
        if (storedJwk) {
          key = await importPrivateKeyJwk(JSON.parse(storedJwk));
        } else {
          const pair = await generateMemberKeyPair();
          key = pair.privateKey;
          writeStored(PRIVATE_JWK_KEY, JSON.stringify(await exportPrivateKeyJwk(key)));
        }
        setPrivateKey(key);
        const publicJwk = await crypto.subtle.exportKey("jwk", key.publicKey);
        const fp = await deriveFingerprint(publicJwk);
        setFingerprint(fp);
        writeStored(FINGERPRINT_KEY, fp);
        writeStored(MEMBER_ID_KEY, memberId);
        await registerMessagingKey({ memberId, publicKeyJwk: publicJwk });
        setReady(true);
      } catch (err) {
        setError(errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Load threads; unwrap the group key for any thread we have a wrapped
  //    copy of (wrapped by whoever created it — ownerPublicKeyId).
  const loadThreads = useCallback(async () => {
    if (!ready || !privateKey) return;
    setLoading(true);
    setError(null);
    try {
      const { threads: all } = await listThreads();
      const mine = all.filter((th) => th.memberIds.includes(memberId));
      const withKeys = await Promise.all(
        mine.map(async (th) => {
          const wrapped = th.wrappedKeys && th.wrappedKeys[memberId];
          if (!wrapped) return { ...th, groupKey: null };
          try {
            const owner = await getMessagingKey(wrapped.ownerPublicKeyId);
            const groupKey = await unwrapGroupKey(
              wrapped.wrappedKey,
              wrapped.iv,
              privateKey,
              owner.publicKeyJwk,
              th.threadId
            );
            return { ...th, groupKey };
          } catch {
            return { ...th, groupKey: null };
          }
        })
      );
      setThreads(withKeys);
      if (withKeys.length > 0 && !selectedThreadId) {
        setSelectedThreadId(withKeys[0].threadId);
      }
    } catch (err) {
      setError(errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }, [ready, privateKey, memberId, selectedThreadId, language]);

  useEffect(() => {
    if (ready) loadThreads();
  }, [ready, loadThreads]);

  // 3. Load + decrypt messages for the selected thread.
  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    const thread = threads.find((th) => th.threadId === selectedThreadId);
    if (!thread || !thread.groupKey) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { messages: raw } = await listMessages(selectedThreadId);
        if (cancelled) return;
        const decrypted = await Promise.all(
          raw.map(async (m) => {
            try {
              const plaintext = await decryptMessage(thread.groupKey, m.iv, m.ciphertext);
              return { ...m, plaintext };
            } catch {
              return { ...m, plaintext: null };
            }
          })
        );
        setMessages(decrypted);
      } catch (err) {
        if (!cancelled) setError(errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedThreadId, threads, language]);

  async function handleCreateThread(e) {
    e.preventDefault();
    const others = threadMembers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const memberIds = [...new Set([memberId, ...others])];
    if (memberIds.length < 2) {
      setError(t(language, "chat.needMembers"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { threadId } = await createMessagingThread({ name: threadName, memberIds });
      const groupKey = await generateGroupKey();
      for (const id of memberIds) {
        const { publicKeyJwk } = await getMessagingKey(id);
        const { wrappedKey, iv } = await wrapGroupKeyForMember(
          groupKey,
          privateKey,
          publicKeyJwk,
          threadId
        );
        await storeWrappedKey({ threadId, memberId: id, wrappedKey, iv, ownerPublicKeyId: fingerprint });
      }
      setThreadName("");
      setThreadMembers("");
      setSelectedThreadId(threadId);
      await loadThreads();
    } catch (err) {
      setError(errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    const thread = threads.find((th) => th.threadId === selectedThreadId);
    if (!thread || !thread.groupKey || !draft.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { iv, ciphertext } = await encryptMessage(thread.groupKey, draft.trim());
      await sendMessage({ threadId: selectedThreadId, senderId: memberId, iv, ciphertext });
      setDraft("");
      await loadThreads();
    } catch (err) {
      setError(errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  const selectedThread = threads.find((th) => th.threadId === selectedThreadId);

  return (
    <section aria-labelledby="chat-title">
      <h2 id="chat-title" className="text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-6xl">
        {t(language, "chat.title")}
      </h2>
      <p className="mt-6 max-w-2xl text-xl font-semibold leading-relaxed">{t(language, "chat.subtitle")}</p>

      {fingerprint && (
        <p className="mt-6 inline-block border border-ink bg-soft px-4 py-3 font-mono text-lg font-black tracking-widest">
          {t(language, "chat.fingerprint")} {fingerprint}
        </p>
      )}
      <p className="mt-2 text-sm font-bold opacity-60">{t(language, "chat.memberId")} {memberId}</p>

      {error && (
        <p role="alert" className="mt-6 alert-red p-3 font-semibold">
          {error}
        </p>
      )}

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-3">
        {/* Thread list + create */}
        <div className="lg:col-span-1">
          <h3 className="border-b border-strong pb-2 text-sm font-black uppercase tracking-[0.2em]">
            {t(language, "chat.threadsTitle")}
          </h3>
          <ul className="mt-4 space-y-3">
            {threads.map((th) => (
              <li key={th.threadId}>
                <button
                  type="button"
                  onClick={() => setSelectedThreadId(th.threadId)}
                  className={`w-full border border-ink p-4 text-left transition-colors ${
                    selectedThreadId === th.threadId
                      ? "bg-ink text-on-ink border-strong"
                      : "bg-soft hover:bg-paper"
                  }`}
                >
                  <span className="block text-lg font-black">{th.name}</span>
                  <span className="mt-1 block text-xs font-bold uppercase tracking-widest opacity-60">
                    {th.memberIds.length} {t(language, "chat.members")}
                    {th.groupKey ? "" : ` · ${t(language, "chat.noKey")}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={handleCreateThread} className="mt-6 space-y-4 border border-ink bg-soft p-6">
            <h4 className="text-xs font-black uppercase tracking-widest">{t(language, "chat.newThread")}</h4>
            <div>
              <label htmlFor="thread-name" className="block text-xs font-black uppercase tracking-widest">
                {t(language, "chat.threadName")}
              </label>
              <input
                id="thread-name"
                value={threadName}
                onChange={(e) => setThreadName(e.target.value)}
                required
                maxLength={60}
                className="mt-2 field"
              />
            </div>
            <div>
              <label htmlFor="thread-members" className="block text-xs font-black uppercase tracking-widest">
                {t(language, "chat.threadMembers")}
              </label>
              <input
                id="thread-members"
                value={threadMembers}
                onChange={(e) => setThreadMembers(e.target.value)}
                placeholder={t(language, "chat.membersPlaceholder")}
                className="mt-2 field"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !ready}
              className="btn-primary disabled:cursor-not-allowed h-14 w-full px-6"
            >
              {t(language, "chat.createThreadButton")}
            </button>
          </form>
        </div>

        {/* Messages */}
        <div className="lg:col-span-2">
          <h3 className="border-b border-strong pb-2 text-sm font-black uppercase tracking-[0.2em]">
            {selectedThread ? selectedThread.name : t(language, "chat.messagesTitle")}
          </h3>

          {selectedThread && !selectedThread.groupKey && (
            <p className="mt-6 border border-ink bg-soft p-4 font-bold">
              {t(language, "chat.noKeyBody")}
            </p>
          )}

          <ul className="mt-6 space-y-4" aria-live="polite">
            {messages.map((m) => (
              <li key={m.messageId} className="border border-ink bg-soft p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-widest opacity-60">{m.senderId}</span>
                  <span className="text-xs font-bold opacity-40">{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-lg font-bold">
                  {m.plaintext !== null ? m.plaintext : t(language, "chat.cannotDecrypt")}
                </p>
              </li>
            ))}
            {selectedThread && messages.length === 0 && !loading && (
              <li className="font-bold opacity-60">{t(language, "chat.noMessages")}</li>
            )}
          </ul>

          {selectedThread && selectedThread.groupKey && (
            <form onSubmit={handleSend} className="mt-8 flex flex-col gap-4 md:flex-row">
              <label htmlFor="chat-draft" className="sr-only">
                {t(language, "chat.draftLabel")}
              </label>
              <input
                id="chat-draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
                className="field flex-1 text-lg"
              />
              <button
                type="submit"
                disabled={loading || !draft.trim()}
                className="btn-primary disabled:cursor-not-allowed h-16 px-10"
              >
                {t(language, "chat.sendButton")}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}