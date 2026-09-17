const { mockClient } = require("aws-sdk-client-mock");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { generateExplanation } = require("./explainRisk");

const bedrockMock = mockClient(BedrockRuntimeClient);

function encodeBody(obj) {
  return new TextEncoder().encode(JSON.stringify(obj));
}

describe("generateExplanation", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    bedrockMock.reset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("returns the deterministic fallback when MOCK_BEDROCK=true", async () => {
    process.env.MOCK_BEDROCK = "true";

    const result = await generateExplanation({
      riskLevel: "high",
      matchedPatterns: ["otp_request"],
      language: "en",
    });

    expect(result.generationMode).toBe("fallback");
    expect(result.languageUsed).toBe("en");
    expect(result.checklist.length).toBeGreaterThan(0);
    expect(result.explanation).not.toMatch(/is a scam\b/i);
  });

  test("falls back when BEDROCK_MODEL_ID is not set", async () => {
    delete process.env.MOCK_BEDROCK;
    delete process.env.BEDROCK_MODEL_ID;

    const result = await generateExplanation({
      riskLevel: "medium",
      matchedPatterns: ["urgency"],
      language: "hi",
    });

    expect(result.generationMode).toBe("fallback");
    expect(result.languageUsed).toBe("hi");
  });

  test("returns Bedrock output when the model responds with valid JSON", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock.on(InvokeModelCommand).resolves({
      body: encodeBody({
        content: [
          {
            text: JSON.stringify({
              explanation: "This message shows urgency and asks for your OTP, a common scam pattern.",
              checklist: [
                "Never share your OTP, PIN, CVV, or password.",
                "Do not click on unknown or suspicious links.",
                "Verify via the bank's official app or listed customer care number.",
                "Report to the 1930 helpline or cybercrime.gov.in.",
              ],
            }),
          },
        ],
      }),
    });

    const result = await generateExplanation({
      riskLevel: "high",
      matchedPatterns: ["urgency", "otp_request"],
      language: "en",
    });

    expect(result.generationMode).toBe("bedrock");
    expect(result.explanation).toContain("OTP");
    expect(result.checklist).toHaveLength(4);
  });

  test("falls back safely when Bedrock returns malformed JSON", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock.on(InvokeModelCommand).resolves({
      body: encodeBody({ content: [{ text: "not valid json" }] }),
    });

    const result = await generateExplanation({
      riskLevel: "high",
      matchedPatterns: ["otp_request"],
      language: "en",
    });

    expect(result.generationMode).toBe("fallback");
    expect(result.checklist.length).toBeGreaterThan(0);
  });

  test("falls back safely when Bedrock output is missing required fields", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock.on(InvokeModelCommand).resolves({
      body: encodeBody({ content: [{ text: JSON.stringify({ explanation: "only explanation, no checklist" }) }] }),
    });

    const result = await generateExplanation({
      riskLevel: "medium",
      matchedPatterns: ["urgency"],
      language: "en",
    });

    expect(result.generationMode).toBe("fallback");
  });

  test("falls back safely and does not throw when Bedrock invocation fails", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock.on(InvokeModelCommand).rejects(new Error("ThrottlingException"));

    await expect(
      generateExplanation({ riskLevel: "high", matchedPatterns: ["otp_request"], language: "en" })
    ).resolves.toMatchObject({ generationMode: "fallback" });
  });

  test("never claims certainty that the message is a scam", async () => {
    process.env.MOCK_BEDROCK = "true";

    const result = await generateExplanation({
      riskLevel: "low",
      matchedPatterns: [],
      language: "en",
    });

    expect(result.explanation).not.toMatch(/definitely a scam/i);
    expect(result.explanation).not.toMatch(/^this is safe/i);
  });
});
