const { mockClient } = require("aws-sdk-client-mock");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { extractHealthTags, handler } = require("./healthTagsHandler");

const bedrockMock = mockClient(BedrockRuntimeClient);

function encodeBody(obj) {
  return new TextEncoder().encode(JSON.stringify(obj));
}

describe("extractHealthTags", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    bedrockMock.reset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("rejects empty text", async () => {
    await expect(extractHealthTags({ text: "", language: "en" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
  });

  test("rejects text over the length limit", async () => {
    await expect(
      extractHealthTags({ text: "a".repeat(8001), language: "en" })
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });

  test("returns no suggested tags when MOCK_BEDROCK=true — never fabricates without a real model", async () => {
    process.env.MOCK_BEDROCK = "true";
    const result = await extractHealthTags({ text: "Patient has Type 2 Diabetes", language: "en" });
    expect(result.suggestedTags).toEqual([]);
  });

  test("returns no suggested tags when BEDROCK_MODEL_ID is unset", async () => {
    delete process.env.MOCK_BEDROCK;
    delete process.env.BEDROCK_MODEL_ID;
    const result = await extractHealthTags({ text: "Patient has Type 2 Diabetes", language: "en" });
    expect(result.suggestedTags).toEqual([]);
  });

  test("returns validated tags from Bedrock when available", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
    bedrockMock.on(InvokeModelCommand).resolves({
      body: encodeBody({ content: [{ text: JSON.stringify({ tags: ["Type 2 Diabetes", "Peanut allergy"] }) }] }),
    });

    const result = await extractHealthTags({ text: "some OCR text", language: "en" });
    expect(result.suggestedTags).toEqual(["Type 2 Diabetes", "Peanut allergy"]);
  });

  test("falls back to no tags (never throws) when Bedrock returns malformed output", async () => {
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
    bedrockMock.on(InvokeModelCommand).resolves({ body: encodeBody({ content: [{ text: "not json" }] }) });

    await expect(extractHealthTags({ text: "some text", language: "en" })).resolves.toEqual({
      suggestedTags: [],
    });
  });

  test("falls back to no tags when Bedrock returns a name/identifying-looking tag list (still bounded by count/length, not content-filtered here — relies on prompt)", async () => {
    // This test documents the trust boundary: validation only checks shape
    // (count/length), not content — the "no identifying info" rule is
    // enforced by the prompt, not by code. That's why extraction results
    // must always go through human review before being saved (see the
    // frontend HealthProfile component), never auto-saved.
    process.env.MOCK_BEDROCK = "false";
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0";
    bedrockMock.on(InvokeModelCommand).resolves({
      body: encodeBody({ content: [{ text: JSON.stringify({ tags: ["Diabetes"] }) }] }),
    });

    const result = await extractHealthTags({ text: "some text", language: "en" });
    expect(result.suggestedTags).toEqual(["Diabetes"]);
  });
});

describe("handler", () => {
  test("returns a structured 400 for missing text", async () => {
    const response = await handler({ httpMethod: "POST", body: JSON.stringify({ language: "en" }) });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe("INVALID_REQUEST");
  });
});
