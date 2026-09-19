const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const {
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
} = require("./messageStore");

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("messageStore", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    ddbMock.reset();
    process.env = { ...ORIGINAL_ENV };
    clearStore();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const JWK = { kty: "EC", crv: "P-256", x: "abc", y: "def" };

  test("local mode: registerMemberKey computes a stable fingerprint", async () => {
    delete process.env.MESSAGES_TABLE_NAME;

    const record = await registerMemberKey("mem_1", JWK);
    expect(record.fingerprint).toBe(fingerprintFor(JWK));
    expect(record.fingerprint).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);

    const again = await registerMemberKey("mem_1", JWK);
    expect(again.fingerprint).toBe(record.fingerprint);
  });

  test("local mode: getMemberKey returns the registered key", async () => {
    delete process.env.MESSAGES_TABLE_NAME;
    await registerMemberKey("mem_1", JWK);
    expect((await getMemberKey("mem_1")).publicKeyJwk).toEqual(JWK);
    expect(await getMemberKey("mem_missing")).toBeNull();
  });

  test("local mode: createThread seeds empty wrappedKeys and messages", async () => {
    delete process.env.MESSAGES_TABLE_NAME;

    const thread = await createThread("Family", ["mem_1", "mem_2"]);
    expect(thread.threadId).toMatch(/^thr_/);
    expect(thread.memberIds).toEqual(["mem_1", "mem_2"]);
    expect(thread.wrappedKeys).toEqual({});
    expect(thread.messages).toEqual([]);
  });

  test("local mode: storeWrappedKey records a wrapped group key per member", async () => {
    delete process.env.MESSAGES_TABLE_NAME;

    const thread = await createThread("Family", ["mem_1", "mem_2"]);
    const stored = await storeWrappedKey(thread.threadId, "mem_2", {
      wrappedKey: "base64wrapped",
      iv: "base64iv",
      ownerPublicKeyId: "mem_1",
    });

    expect(stored).toMatchObject({ wrappedKey: "base64wrapped", ownerPublicKeyId: "mem_1" });

    const reloaded = await getThread(thread.threadId);
    expect(reloaded.wrappedKeys.mem_2.wrappedKey).toBe("base64wrapped");
  });

  test("local mode: storeWrappedKey returns null for an unknown thread", async () => {
    delete process.env.MESSAGES_TABLE_NAME;
    expect(await storeWrappedKey("thr_missing", "mem_1", { wrappedKey: "w", iv: "i", ownerPublicKeyId: "m" })).toBeNull();
  });

  test("local mode: addMessage appends ciphertext only", async () => {
    delete process.env.MESSAGES_TABLE_NAME;

    const thread = await createThread("Family", ["mem_1", "mem_2"]);
    const message = await addMessage(thread.threadId, {
      senderId: "mem_1",
      iv: "base64iv",
      ciphertext: "base64cipher",
    });

    expect(message.messageId).toMatch(/^msg_/);
    expect(message.ciphertext).toBe("base64cipher");
    expect(message.plaintext).toBeUndefined();

    const reloaded = await getThread(thread.threadId);
    expect(reloaded.messages).toHaveLength(1);
    expect(reloaded.messages[0].senderId).toBe("mem_1");
  });

  test("local mode: listThreads returns metadata without messages", async () => {
    delete process.env.MESSAGES_TABLE_NAME;

    const thread = await createThread("Family", ["mem_1", "mem_2"]);
    await addMessage(thread.threadId, { senderId: "mem_1", iv: "iv", ciphertext: "ct" });

    const threads = listThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({ threadId: thread.threadId, name: "Family", messageCount: 1 });
    expect(threads[0].messages).toBeUndefined();
  });

  test("local mode: listMessages returns null for an unknown thread", async () => {
    delete process.env.MESSAGES_TABLE_NAME;
    expect(listMessages("thr_missing")).toBeNull();
  });

  test("deployed mode: writes thread and key records to DynamoDB", async () => {
    process.env.MESSAGES_TABLE_NAME = "scamsahayak-messages";
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(GetCommand).resolves({ Item: null });

    expect(isDeployedMode()).toBe(true);

    const thread = await createThread("Family", ["mem_1", "mem_2"]);
    await registerMemberKey("mem_1", JWK);

    expect(ddbMock.calls()).toHaveLength(2);
    const threadCall = ddbMock.call(0);
    expect(threadCall.args[0].input.TableName).toBe("scamsahayak-messages");
    expect(threadCall.args[0].input.Item.pk).toBe(`thread#${thread.threadId}`);
    const keyCall = ddbMock.call(1);
    expect(keyCall.args[0].input.Item.pk).toBe("key#mem_1");
  });
});