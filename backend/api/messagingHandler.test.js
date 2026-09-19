const { ApiError } = require("./errors");
const { clearStore } = require("../messaging/messageStore");
const {
  registerKeyHandler,
  createThreadHandler,
  storeWrappedKeyHandler,
  sendMessageHandler,
  listThreadsHandler,
  listMessagesHandler,
  getMemberKeyHandler,
} = require("./messagingHandler");

describe("messagingHandler", () => {
  beforeEach(() => {
    clearStore();
  });

  const JWK = { kty: "EC", crv: "P-256", x: "abc", y: "def" };

  test("registerKeyHandler returns a fingerprint for a valid EC P-256 key", async () => {
    const { fingerprint } = await registerKeyHandler({ memberId: "mem_1", publicKeyJwk: JWK });
    expect(fingerprint).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
  });

  test("registerKeyHandler rejects non-EC or non-P-256 keys", async () => {
    await expect(registerKeyHandler({ memberId: "mem_1", publicKeyJwk: { kty: "RSA" } })).rejects.toThrow(ApiError);
    await expect(
      registerKeyHandler({ memberId: "mem_1", publicKeyJwk: { kty: "EC", crv: "P-384", x: "a", y: "b" } })
    ).rejects.toThrow(ApiError);
    await expect(registerKeyHandler({ memberId: "mem_1", publicKeyJwk: { kty: "EC", crv: "P-256" } })).rejects.toThrow(
      ApiError
    );
  });

  test("createThreadHandler creates a thread with unique members", async () => {
    const { threadId } = await createThreadHandler({ name: "Family", memberIds: ["mem_1", "mem_2"] });
    expect(threadId).toMatch(/^thr_/);
  });

  test("createThreadHandler rejects too few, too many, or duplicate members", async () => {
    await expect(createThreadHandler({ name: "F", memberIds: ["mem_1"] })).rejects.toThrow(ApiError);
    await expect(
      createThreadHandler({ name: "F", memberIds: Array.from({ length: 11 }, (_, i) => `mem_${i}`) })
    ).rejects.toThrow(ApiError);
    await expect(createThreadHandler({ name: "F", memberIds: ["mem_1", "mem_1"] })).rejects.toThrow(ApiError);
  });

  test("storeWrappedKeyHandler stores a wrapped group key", async () => {
    const { threadId } = await createThreadHandler({ name: "Family", memberIds: ["mem_1", "mem_2"] });
    const { ok } = await storeWrappedKeyHandler({
      threadId,
      memberId: "mem_2",
      wrappedKey: "base64wrapped",
      iv: "base64iv",
      ownerPublicKeyId: "mem_1",
    });
    expect(ok).toBe(true);
  });

  test("storeWrappedKeyHandler rejects unknown threads", async () => {
    await expect(
      storeWrappedKeyHandler({ threadId: "thr_missing", memberId: "mem_1", wrappedKey: "w", iv: "i", ownerPublicKeyId: "m" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("sendMessageHandler stores ciphertext for a thread member", async () => {
    const { threadId } = await createThreadHandler({ name: "Family", memberIds: ["mem_1", "mem_2"] });
    const { messageId } = await sendMessageHandler({
      threadId,
      senderId: "mem_1",
      iv: "base64iv",
      ciphertext: "base64cipher",
    });
    expect(messageId).toMatch(/^msg_/);
  });

  test("sendMessageHandler rejects senders outside the thread", async () => {
    const { threadId } = await createThreadHandler({ name: "Family", memberIds: ["mem_1", "mem_2"] });
    await expect(
      sendMessageHandler({ threadId, senderId: "mem_999", iv: "iv", ciphertext: "ct" })
    ).rejects.toThrow(ApiError);
  });

  test("sendMessageHandler rejects oversized ciphertext", async () => {
    const { threadId } = await createThreadHandler({ name: "Family", memberIds: ["mem_1", "mem_2"] });
    await expect(
      sendMessageHandler({ threadId, senderId: "mem_1", iv: "iv", ciphertext: "x".repeat(70000) })
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });

  test("listThreadsHandler returns thread metadata", async () => {
    await createThreadHandler({ name: "Family", memberIds: ["mem_1", "mem_2"] });
    const { threads } = await listThreadsHandler({});
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ name: "Family", messageCount: 0 });
  });

  test("listMessagesHandler returns ciphertext messages", async () => {
    const { threadId } = await createThreadHandler({ name: "Family", memberIds: ["mem_1", "mem_2"] });
    await sendMessageHandler({ threadId, senderId: "mem_1", iv: "iv", ciphertext: "ct" });

    const { messages } = await listMessagesHandler({ threadId });
    expect(messages).toHaveLength(1);
    expect(messages[0].ciphertext).toBe("ct");
  });

  test("listMessagesHandler rejects unknown threads", async () => {
    await expect(listMessagesHandler({ threadId: "thr_missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("getMemberKeyHandler returns a registered public key", async () => {
    await registerKeyHandler({ memberId: "mem_1", publicKeyJwk: JWK });
    const { publicKeyJwk, fingerprint } = await getMemberKeyHandler({ memberId: "mem_1" });
    expect(publicKeyJwk).toEqual(JWK);
    expect(fingerprint).toMatch(/^[0-9a-f]{4}-/);
  });

  test("getMemberKeyHandler rejects unregistered members", async () => {
    await expect(getMemberKeyHandler({ memberId: "mem_missing" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});