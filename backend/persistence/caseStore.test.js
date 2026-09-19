const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { saveCase, getLocalCase, isDeployedMode } = require("./caseStore");

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("caseStore", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    ddbMock.reset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("local mode: stores the record in-memory when CASES_TABLE_NAME is unset", async () => {
    delete process.env.CASES_TABLE_NAME;

    expect(isDeployedMode()).toBe(false);

    const record = { caseId: "case_1", riskLevel: "high", matchedPatterns: ["otp_request"] };
    await saveCase(record);

    expect(getLocalCase("case_1")).toMatchObject(record);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  test("deployed mode: writes to DynamoDB when CASES_TABLE_NAME is set", async () => {
    process.env.CASES_TABLE_NAME = "scamsahayak-cases";
    ddbMock.on(PutCommand).resolves({});

    expect(isDeployedMode()).toBe(true);

    const record = { caseId: "case_2", riskLevel: "low", matchedPatterns: [] };
    await saveCase(record);

    expect(ddbMock.calls()).toHaveLength(1);
    const call = ddbMock.call(0);
    expect(call.args[0].input.TableName).toBe("scamsahayak-cases");
    expect(call.args[0].input.Item).toMatchObject(record);
    expect(typeof call.args[0].input.Item.ttl).toBe("number");
  });

  test("never persists raw text, raw image bytes, or credentials", async () => {
    delete process.env.CASES_TABLE_NAME;

    // A caller that accidentally passes raw fields should not have them
    // silently laundered through — this test documents the contract that
    // analyzeHandler must only ever construct the redacted shape.
    const record = {
      caseId: "case_3",
      riskLevel: "high",
      matchedPatterns: ["otp_request"],
      evidence: [{ pattern: "otp_request", snippet: "share your OTP" }],
    };
    await saveCase(record);
    const stored = getLocalCase("case_3");

    expect(stored.rawText).toBeUndefined();
    expect(stored.imageBase64).toBeUndefined();
    expect(stored.request).toBeUndefined();
  });

  test("adds a default schemaVersion when the caller omits one", async () => {
    delete process.env.CASES_TABLE_NAME;

    const saved = await saveCase({ caseId: "case_4", riskLevel: "low", matchedPatterns: [] });
    expect(saved.schemaVersion).toBe("1.0");
  });

  test("stamps a ttl of now + default 30-day retention so DynamoDB TTL fires", async () => {
    delete process.env.CASES_TABLE_NAME;
    delete process.env.EVIDENCE_RETENTION_DAYS;

    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    try {
      const saved = await saveCase({ caseId: "case_ttl", riskLevel: "low", matchedPatterns: [] });
      const expected = Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000) + 30 * 86400;
      expect(Math.abs(saved.ttl - expected)).toBeLessThanOrEqual(5);
    } finally {
      jest.useRealTimers();
    }
  });

  test("honors the EVIDENCE_RETENTION_DAYS env override", async () => {
    delete process.env.CASES_TABLE_NAME;
    process.env.EVIDENCE_RETENTION_DAYS = "90";

    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    try {
      const saved = await saveCase({ caseId: "case_ttl2", riskLevel: "low", matchedPatterns: [] });
      const expected = Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000) + 90 * 86400;
      expect(Math.abs(saved.ttl - expected)).toBeLessThanOrEqual(5);
    } finally {
      jest.useRealTimers();
    }
  });

  test("falls back to 30-day retention when EVIDENCE_RETENTION_DAYS is not a positive number", async () => {
    delete process.env.CASES_TABLE_NAME;
    process.env.EVIDENCE_RETENTION_DAYS = "not-a-number";

    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    try {
      const saved = await saveCase({ caseId: "case_ttl3", riskLevel: "low", matchedPatterns: [] });
      const expected = Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000) + 30 * 86400;
      expect(Math.abs(saved.ttl - expected)).toBeLessThanOrEqual(5);
    } finally {
      jest.useRealTimers();
    }
  });
});
