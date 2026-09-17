const { mockClient } = require("aws-sdk-client-mock");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://signed-url.example.com/evidence/case_1.json"),
}));

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { buildEvidenceBundle, storeEvidenceBundle, isDeployedMode } = require("./evidenceBundle");

const s3Mock = mockClient(S3Client);

describe("buildEvidenceBundle", () => {
  test("never includes raw text — only the already-redacted text passed in", () => {
    const bundle = buildEvidenceBundle({
      caseId: "case_1",
      language: "en",
      inputType: "text",
      redactedText: "URGENT: share your OTP, call 98******10",
      riskLevel: "high",
      matchedPatterns: ["urgency", "otp_request"],
      evidence: [{ pattern: "otp_request", snippet: "share your OTP" }],
      checklist: ["Never share your OTP."],
      reportingLinks: { helpline: "1930", portal: "https://cybercrime.gov.in/" },
    });

    expect(bundle.redactedText).not.toContain("9876543210");
    expect(bundle.disclaimer).toMatch(/risk signal, not an official fraud determination/i);
    expect(bundle.caseId).toBe("case_1");
  });
});

describe("storeEvidenceBundle", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    s3Mock.reset();
    getSignedUrl.mockClear();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("local mode: reports unavailable when EVIDENCE_BUCKET_NAME is unset", async () => {
    delete process.env.EVIDENCE_BUCKET_NAME;
    expect(isDeployedMode()).toBe(false);

    const result = await storeEvidenceBundle({ caseId: "case_1" });

    expect(result).toEqual({ available: false });
    expect(s3Mock.calls()).toHaveLength(0);
  });

  test("deployed mode: uploads to S3 with server-side encryption and returns a signed URL", async () => {
    process.env.EVIDENCE_BUCKET_NAME = "scamsahayak-evidence";
    s3Mock.on(PutObjectCommand).resolves({});
    expect(isDeployedMode()).toBe(true);

    const result = await storeEvidenceBundle({ caseId: "case_1", riskLevel: "high" });

    expect(result.available).toBe(true);
    expect(result.downloadUrl).toBe("https://signed-url.example.com/evidence/case_1.json");

    expect(s3Mock.calls()).toHaveLength(1);
    const call = s3Mock.call(0);
    expect(call.args[0].input.Bucket).toBe("scamsahayak-evidence");
    expect(call.args[0].input.Key).toBe("evidence/case_1.json");
    expect(call.args[0].input.ServerSideEncryption).toBe("AES256");
  });
});
