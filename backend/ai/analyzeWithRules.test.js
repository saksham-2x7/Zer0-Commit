const { mockClient } = require("aws-sdk-client-mock");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { analyzeWithRules, PATTERN_KEYS } = require("./analyzeWithRules");

const bedrockMock = mockClient(BedrockRuntimeClient);

function encodeBody(obj) {
  return new TextEncoder().encode(JSON.stringify(obj));
}

function bedrockReply(text) {
  return { body: encodeBody({ content: [{ text }] }) };
}

const VALID_OUTPUT = {
  verdict: "scam",
  confidence: "high",
  riskLevel: "high",
  matchedPatterns: ["otp_request", "urgency"],
  explanation: "The message asks for your OTP under time pressure, a common scam pattern.",
  nextSteps: ["Do not share the OTP.", "Call 1930.", "Report at cybercrime.gov.in."],
};

describe("analyzeWithRules", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    bedrockMock.reset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("returns deterministic fallback verdict when MOCK_BEDROCK=true", async () => {
    process.env.MOCK_BEDROCK = "true";

    const result = await analyzeWithRules({
      redactedText: "URGENT share your OTP",
      language: "en",
      reputation: null,
      regexResult: { riskLevel: "high", matchedPatterns: ["otp_request"] },
    });

    expect(result.generationMode).toBe("fallback");
    expect(result.verdict).toBe("scam");
    expect(result.confidence).toBe("medium");
    expect(result.riskLevel).toBe("high");
    expect(result.matchedPatterns).toEqual(["otp_request"]);
    expect(result.explanation).toBeNull();
    expect(result.nextSteps).toBeNull();
  });

  test("fallback verdict is 'legit' for low risk and 'uncertain' for medium", async () => {
    process.env.MOCK_BEDROCK = "true";

    const low = await analyzeWithRules({
      redactedText: "Your transaction of Rs 500 succeeded.",
      language: "en",
      reputation: null,
      regexResult: { riskLevel: "low", matchedPatterns: [] },
    });
    expect(low.verdict).toBe("legit");

    const medium = await analyzeWithRules({
      redactedText: "Please verify your details soon.",
      language: "en",
      reputation: null,
      regexResult: { riskLevel: "medium", matchedPatterns: ["urgency"] },
    });
    expect(medium.verdict).toBe("uncertain");
  });

  test("falls back when BEDROCK_MODEL_ID is not set", async () => {
    delete process.env.MOCK_BEDROCK;
    delete process.env.BEDROCK_MODEL_ID;

    const result = await analyzeWithRules({
      redactedText: "test",
      language: "hi",
      reputation: null,
      regexResult: { riskLevel: "low", matchedPatterns: [] },
    });

    expect(result.generationMode).toBe("fallback");
  });

  test("returns Bedrock output when the model responds with valid JSON", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock.on(InvokeModelCommand).resolves(bedrockReply(JSON.stringify(VALID_OUTPUT)));

    const result = await analyzeWithRules({
      redactedText: "URGENT: share your OTP now",
      language: "en",
      reputation: null,
      regexResult: { riskLevel: "high", matchedPatterns: ["otp_request"] },
    });

    expect(result.generationMode).toBe("bedrock");
    expect(result.verdict).toBe("scam");
    expect(result.confidence).toBe("high");
    expect(result.explanation).toContain("OTP");
    expect(result.nextSteps).toHaveLength(3);
  });

  test("accepts JSON wrapped in markdown fences", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock
      .on(InvokeModelCommand)
      .resolves(bedrockReply("```json\n" + JSON.stringify(VALID_OUTPUT) + "\n```"));

    const result = await analyzeWithRules({
      redactedText: "test",
      language: "en",
      reputation: null,
      regexResult: { riskLevel: "high", matchedPatterns: [] },
    });

    expect(result.generationMode).toBe("bedrock");
    expect(result.verdict).toBe("scam");
  });

  test("falls back safely when Bedrock returns malformed JSON", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock.on(InvokeModelCommand).resolves(bedrockReply("not valid json"));

    const result = await analyzeWithRules({
      redactedText: "test",
      language: "en",
      reputation: null,
      regexResult: { riskLevel: "high", matchedPatterns: ["otp_request"] },
    });

    expect(result.generationMode).toBe("fallback");
    expect(result.verdict).toBe("scam");
  });

  test("falls back when output has an unknown pattern key or invalid verdict", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock
      .on(InvokeModelCommand)
      .resolves(
        bedrockReply(
          JSON.stringify({ ...VALID_OUTPUT, matchedPatterns: ["not_a_real_key"] })
        )
      );

    const result = await analyzeWithRules({
      redactedText: "test",
      language: "en",
      reputation: null,
      regexResult: { riskLevel: "high", matchedPatterns: [] },
    });

    expect(result.generationMode).toBe("fallback");

    bedrockMock.reset();
    bedrockMock
      .on(InvokeModelCommand)
      .resolves(bedrockReply(JSON.stringify({ ...VALID_OUTPUT, verdict: "maybe" })));

    const result2 = await analyzeWithRules({
      redactedText: "test",
      language: "en",
      reputation: null,
      regexResult: { riskLevel: "high", matchedPatterns: [] },
    });

    expect(result2.generationMode).toBe("fallback");
  });

  test("falls back safely and does not throw when Bedrock invocation fails", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock.on(InvokeModelCommand).rejects(new Error("ThrottlingException"));

    await expect(
      analyzeWithRules({
        redactedText: "test",
        language: "en",
        reputation: null,
        regexResult: { riskLevel: "high", matchedPatterns: ["otp_request"] },
      })
    ).resolves.toMatchObject({ generationMode: "fallback", verdict: "scam" });
  });

  test("includes reputation findings in the prompt but never raw entity values", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock.on(InvokeModelCommand).resolves(bedrockReply(JSON.stringify(VALID_OUTPUT)));

    const reputation = {
      available: true,
      entities: [
        {
          type: "phone",
          value: "+919876543210",
          findings: [{ title: "Fraud report", snippet: "scam", url: "https://x", scamRelated: true }],
        },
      ],
      summary: "Found 1 fraud report.",
    };

    await analyzeWithRules({
      redactedText: "test",
      language: "en",
      reputation,
      regexResult: { riskLevel: "high", matchedPatterns: [] },
    });

    const calls = bedrockMock.commandCalls(InvokeModelCommand);
    expect(calls).toHaveLength(1);
    const sentBody = JSON.parse(calls[0].args[0].input.body);
    const userContent = sentBody.messages[0].content;
    expect(userContent).toContain("Fraud report");
    expect(userContent).not.toContain("+919876543210");
    expect(userContent).not.toContain("9876543210");
  });

  test("system prompt contains the pre-written rules and allowed pattern keys", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";

    bedrockMock.on(InvokeModelCommand).resolves(bedrockReply(JSON.stringify(VALID_OUTPUT)));

    await analyzeWithRules({
      redactedText: "test",
      language: "en",
      reputation: null,
      regexResult: { riskLevel: "high", matchedPatterns: [] },
    });

    const calls = bedrockMock.commandCalls(InvokeModelCommand);
    const sentBody = JSON.parse(calls[0].args[0].input.body);
    expect(sentBody.system).toContain("PRE-WRITTEN RULES");
    expect(sentBody.system).toContain('"scam" | "legit" | "uncertain"');
    for (const key of PATTERN_KEYS) {
      expect(sentBody.system).toContain(key);
    }
  });

  test("falls back to English for an unrecognized language code", async () => {
    process.env.MOCK_BEDROCK = "true";

    const result = await analyzeWithRules({
      redactedText: "test",
      language: "fr",
      reputation: null,
      regexResult: { riskLevel: "low", matchedPatterns: [] },
    });

    expect(result.generationMode).toBe("fallback");
    expect(result.verdict).toBe("legit");
  });
});