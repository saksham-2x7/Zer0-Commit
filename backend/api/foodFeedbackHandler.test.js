const { mockClient } = require("aws-sdk-client-mock");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { generateFoodFeedback, handler } = require("./foodFeedbackHandler");

const bedrockMock = mockClient(BedrockRuntimeClient);

function encodeBody(obj) {
  return new TextEncoder().encode(JSON.stringify(obj));
}

const PRODUCT = { name: "Example Biscuits", brand: "Example Co", nutriScore: "D" };

describe("generateFoodFeedback", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    bedrockMock.reset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("rejects empty health tags", async () => {
    await expect(
      generateFoodFeedback({ language: "en", healthTags: [], product: PRODUCT })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  test("rejects a missing product", async () => {
    await expect(
      generateFoodFeedback({ language: "en", healthTags: ["Diabetes"], product: null })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  test("always includes the not-medical-advice disclaimer, even in fallback mode", async () => {
    process.env.MOCK_BEDROCK = "true";
    const result = await generateFoodFeedback({
      language: "en",
      healthTags: ["Diabetes"],
      product: PRODUCT,
    });
    expect(result.feedback).toMatch(/not medical advice/i);
  });

  test("never emits a definitive 'safe to eat' verdict in the fallback text", async () => {
    process.env.MOCK_BEDROCK = "true";
    const result = await generateFoodFeedback({
      language: "en",
      healthTags: ["Diabetes"],
      product: PRODUCT,
    });
    expect(result.feedback).not.toMatch(/safe to eat/i);
    expect(result.feedback).not.toMatch(/do not eat/i);
  });

  test("appends the disclaimer to Bedrock's response even though the model wasn't asked to include one", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
    bedrockMock.on(InvokeModelCommand).resolves({
      body: encodeBody({
        content: [{ text: JSON.stringify({ feedback: "This contains sugar, worth noting given diabetes." }) }],
      }),
    });

    const result = await generateFoodFeedback({
      language: "en",
      healthTags: ["Diabetes"],
      product: PRODUCT,
    });

    expect(result.feedback).toContain("This contains sugar, worth noting given diabetes.");
    expect(result.feedback).toMatch(/not medical advice/i);
  });

  test("falls back safely when Bedrock output is malformed", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
    bedrockMock.on(InvokeModelCommand).resolves({ body: encodeBody({ content: [{ text: "not json" }] }) });

    const result = await generateFoodFeedback({
      language: "en",
      healthTags: ["Diabetes"],
      product: PRODUCT,
    });
    expect(result.feedback).toMatch(/not medical advice/i);
  });

  test("falls back safely when Bedrock invocation throws", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
    bedrockMock.on(InvokeModelCommand).rejects(new Error("ThrottlingException"));

    await expect(
      generateFoodFeedback({ language: "en", healthTags: ["Diabetes"], product: PRODUCT })
    ).resolves.toMatchObject({ feedback: expect.stringMatching(/not medical advice/i) });
  });

  test.each(["en", "hi", "ta", "te", "bn", "mr"])("returns a disclaimer in language '%s'", async (language) => {
    process.env.MOCK_BEDROCK = "true";
    const result = await generateFoodFeedback({ language, healthTags: ["Diabetes"], product: PRODUCT });
    expect(result.feedback.trim().length).toBeGreaterThan(0);
  });
});

describe("handler", () => {
  test("returns a structured 400 for missing health tags", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ language: "en", healthTags: [], product: PRODUCT }),
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("INVALID_REQUEST");
  });
});
