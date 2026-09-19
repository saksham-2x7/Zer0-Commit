/**
 * E2E-encrypted family messaging API ("crypto chan"). The server only ever
 * sees ciphertext, wrapped keys, and public keys — it cannot read a single
 * message. All crypto happens in the browser (frontend/src/utils/crypto.js).
 *
 * Validation caps every field so oversized payloads are rejected before
 * they reach the store.
 */

const { ApiError } = require("./errors");
const { wrapHandler } = require("./handlerUtils");
const {
  registerMemberKey,
  getMemberKey,
  createThread,
  getThread,
  storeWrappedKey,
  addMessage,
  listThreads,
  listMessages,
} = require("../messaging/messageStore");

const MAX_NAME_LENGTH = 60;
const MAX_MEMBERS = 10;
const MIN_MEMBERS = 2;
const MAX_BLOB_LENGTH = 65536; // base64 ciphertext/wrapped key ceiling

function requireString(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError("INVALID_REQUEST", `${field} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new ApiError("INPUT_TOO_LARGE", `${field} must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function requireBlob(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError("INVALID_REQUEST", `${field} must be a non-empty base64 string.`);
  }
  if (value.length > MAX_BLOB_LENGTH) {
    throw new ApiError("INPUT_TOO_LARGE", `${field} exceeds the ${MAX_BLOB_LENGTH}-character ceiling.`);
  }
  return value;
}

function validatePublicKeyJwk(jwk) {
  if (!jwk || typeof jwk !== "object") {
    throw new ApiError("INVALID_REQUEST", "publicKeyJwk must be an object.");
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") {
    throw new ApiError("INVALID_REQUEST", "publicKeyJwk must be an EC P-256 public key.");
  }
  if (typeof jwk.x !== "string" || typeof jwk.y !== "string" || jwk.x.length === 0 || jwk.y.length === 0) {
    throw new ApiError("INVALID_REQUEST", "publicKeyJwk must include x and y coordinates.");
  }
  return jwk;
}

async function requireExistingThread(threadId) {
  const thread = await getThread(threadId);
  if (!thread) {
    throw new ApiError("NOT_FOUND", "Thread not found.");
  }
  return thread;
}

async function registerKeyHandler({ memberId, publicKeyJwk }) {
  const cleanMemberId = requireString(memberId, "memberId", 64);
  const jwk = validatePublicKeyJwk(publicKeyJwk);
  const record = await registerMemberKey(cleanMemberId, jwk);
  return { fingerprint: record.fingerprint };
}

async function createThreadHandler({ name, memberIds }) {
  const cleanName = requireString(name, "name", MAX_NAME_LENGTH);
  if (!Array.isArray(memberIds) || memberIds.length < MIN_MEMBERS || memberIds.length > MAX_MEMBERS) {
    throw new ApiError("INVALID_REQUEST", `memberIds must contain ${MIN_MEMBERS}-${MAX_MEMBERS} members.`);
  }
  const cleanIds = memberIds.map((id) => requireString(id, "memberId", 64));
  if (new Set(cleanIds).size !== cleanIds.length) {
    throw new ApiError("INVALID_REQUEST", "memberIds must be unique.");
  }
  const thread = await createThread(cleanName, cleanIds);
  return { threadId: thread.threadId };
}

async function storeWrappedKeyHandler({ threadId, memberId, wrappedKey, iv, ownerPublicKeyId }) {
  const cleanThreadId = requireString(threadId, "threadId", 64);
  const cleanMemberId = requireString(memberId, "memberId", 64);
  await requireExistingThread(cleanThreadId);
  const stored = await storeWrappedKey(cleanThreadId, cleanMemberId, {
    wrappedKey: requireBlob(wrappedKey, "wrappedKey"),
    iv: requireBlob(iv, "iv"),
    ownerPublicKeyId: requireString(ownerPublicKeyId, "ownerPublicKeyId", 64),
  });
  return { ok: true };
}

async function sendMessageHandler({ threadId, senderId, iv, ciphertext }) {
  const cleanThreadId = requireString(threadId, "threadId", 64);
  const cleanSenderId = requireString(senderId, "senderId", 64);
  const thread = await requireExistingThread(cleanThreadId);
  if (!thread.memberIds.includes(cleanSenderId)) {
    throw new ApiError("INVALID_REQUEST", "senderId is not a member of this thread.");
  }
  const message = await addMessage(cleanThreadId, {
    senderId: cleanSenderId,
    iv: requireBlob(iv, "iv"),
    ciphertext: requireBlob(ciphertext, "ciphertext"),
  });
  return { messageId: message.messageId };
}

async function listThreadsHandler() {
  return { threads: listThreads() };
}

async function listMessagesHandler({ threadId }) {
  const cleanThreadId = requireString(threadId, "threadId", 64);
  await requireExistingThread(cleanThreadId);
  const messages = listMessages(cleanThreadId);
  return { messages };
}

async function getMemberKeyHandler({ memberId }) {
  const cleanMemberId = requireString(memberId, "memberId", 64);
  const record = await getMemberKey(cleanMemberId);
  if (!record) {
    throw new ApiError("NOT_FOUND", "No public key registered for this member.");
  }
  return { publicKeyJwk: record.publicKeyJwk, fingerprint: record.fingerprint };
}

exports.handler = wrapHandler(listThreadsHandler, "messagingHandler");

exports.registerKey = wrapHandler(registerKeyHandler, "messagingHandler");
exports.createThread = wrapHandler(createThreadHandler, "messagingHandler");
exports.storeWrappedKey = wrapHandler(storeWrappedKeyHandler, "messagingHandler");
exports.sendMessage = wrapHandler(sendMessageHandler, "messagingHandler");
exports.listThreads = wrapHandler(listThreadsHandler, "messagingHandler");
exports.listMessages = wrapHandler(listMessagesHandler, "messagingHandler");
exports.getMemberKey = wrapHandler(getMemberKeyHandler, "messagingHandler");

exports.registerKeyHandler = registerKeyHandler;
exports.createThreadHandler = createThreadHandler;
exports.storeWrappedKeyHandler = storeWrappedKeyHandler;
exports.sendMessageHandler = sendMessageHandler;
exports.listThreadsHandler = listThreadsHandler;
exports.listMessagesHandler = listMessagesHandler;
exports.getMemberKeyHandler = getMemberKeyHandler;