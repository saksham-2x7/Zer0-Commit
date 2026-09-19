/**
 * E2E-encrypted messaging persistence — zero-knowledge by construction.
 * The server stores ONLY ciphertext messages and per-member wrapped group
 * keys; plaintext and the AES group key never leave the browser. Public
 * keys live in a separate member-key registry (used for key verification
 * fingerprints), never inside a thread.
 *
 * DynamoDB in deployed mode (MESSAGES_TABLE_NAME set), in-memory Map
 * locally — same pattern as persistence/caseStore.js.
 */

const crypto = require("node:crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const localThreads = new Map();
const localMemberKeys = new Map();

let cachedDocClient = null;
function getDocClient() {
  if (!cachedDocClient) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });
    cachedDocClient = DynamoDBDocumentClient.from(client);
  }
  return cachedDocClient;
}

function isDeployedMode() {
  return Boolean(process.env.MESSAGES_TABLE_NAME);
}

function newId(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/** abcd-ef01-2345-6789 — first 16 hex chars of the public key digest. */
function fingerprintFor(publicKeyJwk) {
  const digest = crypto.createHash("sha256").update(JSON.stringify(publicKeyJwk)).digest("hex");
  return digest.slice(0, 16).replace(/(.{4})(?=.)/g, "$1-");
}

async function saveThread(thread) {
  if (!isDeployedMode()) {
    localThreads.set(thread.threadId, thread);
    return thread;
  }
  const docClient = getDocClient();
  await docClient.send(
    new PutCommand({
      TableName: process.env.MESSAGES_TABLE_NAME,
      Item: { pk: `thread#${thread.threadId}`, ...thread },
    })
  );
  return thread;
}

async function getThread(threadId) {
  if (!isDeployedMode()) {
    return localThreads.get(threadId) || null;
  }
  const docClient = getDocClient();
  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.MESSAGES_TABLE_NAME,
      Key: { pk: `thread#${threadId}` },
    })
  );
  return result.Item || null;
}

async function registerMemberKey(memberId, publicKeyJwk) {
  const record = {
    memberId,
    publicKeyJwk,
    fingerprint: fingerprintFor(publicKeyJwk),
    createdAt: new Date().toISOString(),
  };
  if (!isDeployedMode()) {
    localMemberKeys.set(memberId, record);
    return record;
  }
  const docClient = getDocClient();
  await docClient.send(
    new PutCommand({
      TableName: process.env.MESSAGES_TABLE_NAME,
      Item: { pk: `key#${memberId}`, ...record },
    })
  );
  return record;
}

async function getMemberKey(memberId) {
  if (!isDeployedMode()) {
    return localMemberKeys.get(memberId) || null;
  }
  const docClient = getDocClient();
  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.MESSAGES_TABLE_NAME,
      Key: { pk: `key#${memberId}` },
    })
  );
  return result.Item || null;
}

async function createThread(name, memberIds) {
  const thread = {
    threadId: newId("thr"),
    name,
    createdAt: new Date().toISOString(),
    memberIds,
    wrappedKeys: {},
    messages: [],
  };
  await saveThread(thread);
  return thread;
}

async function storeWrappedKey(threadId, memberId, { wrappedKey, iv, ownerPublicKeyId }) {
  const thread = await getThread(threadId);
  if (!thread) {
    return null;
  }
  thread.wrappedKeys[memberId] = { wrappedKey, iv, ownerPublicKeyId };
  await saveThread(thread);
  return thread.wrappedKeys[memberId];
}

async function addMessage(threadId, { senderId, iv, ciphertext }) {
  const thread = await getThread(threadId);
  if (!thread) {
    return null;
  }
  const message = {
    messageId: newId("msg"),
    senderId,
    iv,
    ciphertext,
    createdAt: new Date().toISOString(),
  };
  thread.messages.push(message);
  await saveThread(thread);
  return message;
}

function listThreads() {
  const threads = [...localThreads.values()];
  return threads.map((t) => ({
    threadId: t.threadId,
    name: t.name,
    createdAt: t.createdAt,
    memberIds: t.memberIds,
    messageCount: t.messages.length,
  }));
}

function listMessages(threadId) {
  const thread = localThreads.get(threadId);
  return thread ? thread.messages : null;
}

/** Test hook — clears in-memory state between tests. */
function clearStore() {
  localThreads.clear();
  localMemberKeys.clear();
}

module.exports = {
  registerMemberKey,
  getMemberKey,
  createThread,
  getThread,
  storeWrappedKey,
  addMessage,
  listThreads,
  listMessages,
  fingerprintFor,
  isDeployedMode,
  clearStore,
};