const { mockClient } = require("aws-sdk-client-mock");
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const textractMock = mockClient(TextractClient);
const bedrockMock = mockClient(BedrockRuntimeClient);

const { analyze, handler } = require("./analyzeHandler");
const { corsHeaders } = require("./cors");

describe("analyze — text input", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, MOCK_BEDROCK: "true" };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("returns a full response matching the contract shape for a scam message", async () => {
    const result = await analyze({
      language: "en",
      inputType: "text",
      rawText: "URGENT: Share your OTP immediately to verify.",
    });

    expect(result.riskLevel).toBe("high");
    expect(result.riskDisclaimer).toMatch(/risk signal/i);
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["urgency", "otp_request"]));
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.inputSummary).toMatchObject({ inputType: "text", ocrUsed: false, redactionApplied: true });
    expect(result.reportingLinks).toEqual({ helpline: "1930", portal: "https://cybercrime.gov.in/" });
    expect(result.evidenceBundle).toEqual({ available: false });
    expect(result).not.toHaveProperty("rawText");
  });

  test("uses a crypto-random UUID case id for every case", async () => {
    const result = await analyze({
      language: "en",
      inputType: "text",
      rawText: "URGENT: Share your OTP immediately to verify.",
    });

    expect(result.caseId).toMatch(
      /^case_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  test("redacts sensitive substrings before they reach the detector's evidence snippets", async () => {
    const result = await analyze({
      language: "en",
      inputType: "text",
      rawText: "URGENT: share your OTP, call 9876543210 immediately.",
    });

    const allEvidenceText = JSON.stringify(result.evidence);
    expect(allEvidenceText).not.toContain("9876543210");
  });

  test("rejects a request with no text and no image", async () => {
    await expect(
      analyze({ language: "en", inputType: "text", rawText: "" })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  test("rejects an unsupported language", async () => {
    await expect(
      analyze({ language: "fr", inputType: "text", rawText: "hello" })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_LANGUAGE" });
  });

  test("rejects an unsupported inputType", async () => {
    await expect(
      analyze({ language: "en", inputType: "audio", rawText: "hello" })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_INPUT_TYPE" });
  });

  test("rejects text over the length limit", async () => {
    await expect(
      analyze({ language: "en", inputType: "text", rawText: "a".repeat(8001) })
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });
});

describe("analyze — image input", () => {
  const ORIGINAL_ENV = process.env;
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const VALID_PNG_BASE64 = Buffer.concat([PNG_MAGIC, Buffer.from("fake-png-body")]).toString(
    "base64"
  );

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, MOCK_BEDROCK: "true" };
    textractMock.reset();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("runs OCR, redacts sensitive data found in the screenshot, then analyzes the redacted text", async () => {
    textractMock.on(DetectDocumentTextCommand).resolves({
      Blocks: [
        { BlockType: "LINE", Text: "URGENT: verify with OTP, call 9876543210" },
      ],
    });

    const result = await analyze({
      language: "en",
      inputType: "image",
      imageBase64: VALID_PNG_BASE64,
      imageMimeType: "image/png",
    });

    expect(result.inputSummary.ocrUsed).toBe(true);
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["urgency", "otp_request"]));
    expect(JSON.stringify(result)).not.toContain("9876543210");
  });

  test("rejects an unsupported image MIME type", async () => {
    await expect(
      analyze({ language: "en", inputType: "image", imageBase64: VALID_PNG_BASE64, imageMimeType: "image/gif" })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("rejects image bytes whose magic does not match the declared MIME (M2)", async () => {
    await expect(
      analyze({
        language: "en",
        inputType: "image",
        imageBase64: JPEG_MAGIC.toString("base64"),
        imageMimeType: "image/png",
      })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("raises ANALYSIS_FAILED when OCR finds no text", async () => {
    textractMock.on(DetectDocumentTextCommand).resolves({ Blocks: [] });

    await expect(
      analyze({ language: "en", inputType: "image", imageBase64: VALID_PNG_BASE64, imageMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "ANALYSIS_FAILED" });
  });

  test("surfaces a Textract failure as OCR_FAILED without leaking internal details", async () => {
    textractMock.on(DetectDocumentTextCommand).rejects(new Error("internal AWS stack trace"));

    await expect(
      analyze({ language: "en", inputType: "image", imageBase64: VALID_PNG_BASE64, imageMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "OCR_FAILED" });
  });
});

describe("analyze — LLM judge with pre-written rules (fallback mode)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, MOCK_BEDROCK: "true" };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("returns a verdict derived from the regex risk level when Bedrock is unavailable", async () => {
    const result = await analyze({
      language: "en",
      inputType: "text",
      rawText: "URGENT: Share your OTP immediately to verify.",
    });

    expect(result.verdict).toBe("scam");
    expect(result.verdictConfidence).toBe("medium");
    expect(result.riskLevel).toBe("high");
    expect(result.nextSteps).toEqual(result.checklist);
    expect(result).not.toHaveProperty("reputation");
  });

  test("returns 'legit' verdict for a benign transactional message", async () => {
    const result = await analyze({
      language: "en",
      inputType: "text",
      rawText: "Your transaction of Rs 500 at BigBazar succeeded. Ref: 123456.",
    });

    expect(result.verdict).toBe("legit");
    expect(result.riskLevel).toBe("low");
  });

  test("includes reputation findings when onlineLookup is requested", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Heading: "9876543210",
        AbstractText: "This number is reported as a scam by multiple users.",
        AbstractURL: "https://example.com/report",
        RelatedTopics: [],
      }),
    });

    try {
      const result = await analyze({
        language: "en",
        inputType: "text",
        rawText: "URGENT: Share your OTP, call 9876543210 immediately.",
        onlineLookup: true,
        lookupPhones: ["9876543210"],
      });

      expect(result.reputation).toBeDefined();
      expect(result.reputation.available).toBe(true);
      expect(result.reputation.entities[0]).toMatchObject({ type: "phone", value: "9876543210" });
      expect(result.reputation.entities[0].findings[0].scamRelated).toBe(true);
      expect(result.verdict).toBe("scam");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("degrades gracefully when the online lookup fails", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error("ENOTFOUND"));

    try {
      const result = await analyze({
        language: "en",
        inputType: "text",
        rawText: "URGENT: Share your OTP, call 9876543210 immediately.",
        onlineLookup: true,
        lookupPhones: ["9876543210"],
      });

      expect(result.reputation).toEqual(
        expect.objectContaining({ available: false, reason: "error" })
      );
      expect(result.verdict).toBe("scam");
      expect(result.riskLevel).toBe("high");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("drops invalid lookupPhones during validation", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Heading: "", AbstractText: "", RelatedTopics: [] }),
    });

    try {
      const result = await analyze({
        language: "en",
        inputType: "text",
        rawText: "URGENT: Share your OTP, call 9876543210 immediately.",
        onlineLookup: true,
        lookupPhones: ["12345", "not-a-number"],
      });

      // No valid phones -> no entities -> lookup reports no_entities.
      expect(result.reputation).toEqual(
        expect.objectContaining({ available: false, reason: "no_entities" })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("never sends lookupPhones when onlineLookup is not requested", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn();

    try {
      const result = await analyze({
        language: "en",
        inputType: "text",
        rawText: "URGENT: Share your OTP, call 9876543210 immediately.",
        lookupPhones: ["9876543210"],
      });

      expect(result).not.toHaveProperty("reputation");
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("analyze — LLM judge with pre-written rules (Bedrock mode)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    bedrockMock.reset();
    process.env = {
      ...ORIGINAL_ENV,
      MOCK_BEDROCK: "false",
      BEDROCK_MODEL_ID: "anthropic.claude-3-haiku-20240307-v1:0",
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function encodeBody(obj) {
    return new TextEncoder().encode(JSON.stringify(obj));
  }

  test("uses the LLM verdict, explanation, and next steps when Bedrock responds", async () => {
    bedrockMock.on(InvokeModelCommand).resolves({
      body: encodeBody({
        content: [
          {
            text: JSON.stringify({
              verdict: "scam",
              confidence: "high",
              riskLevel: "high",
              matchedPatterns: ["otp_request"],
              explanation: "The message asks for your OTP under time pressure.",
              nextSteps: ["Do not share the OTP.", "Call 1930.", "Report at cybercrime.gov.in."],
            }),
          },
        ],
      }),
    });

    const result = await analyze({
      language: "en",
      inputType: "text",
      rawText: "URGENT: Share your OTP immediately to verify.",
    });

    expect(result.verdict).toBe("scam");
    expect(result.verdictConfidence).toBe("high");
    expect(result.explanation).toContain("OTP");
    expect(result.nextSteps).toHaveLength(3);
    expect(result.checklist).toHaveLength(4);
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["otp_request", "urgency"]));
  });

  test("falls back to the deterministic verdict when Bedrock output is malformed", async () => {
    bedrockMock.on(InvokeModelCommand).resolves({
      body: encodeBody({ content: [{ text: "not json" }] }),
    });

    const result = await analyze({
      language: "en",
      inputType: "text",
      rawText: "URGENT: Share your OTP immediately to verify.",
    });

    expect(result.verdict).toBe("scam");
    expect(result.verdictConfidence).toBe("medium");
    expect(result.explanation).toMatch(/risk signal/i);
  });
});

describe("handler — Lambda proxy integration", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, MOCK_BEDROCK: "true", ALLOWED_ORIGIN: "https://scamsahayak.example" };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("responds to OPTIONS preflight with CORS headers and no body", async () => {
    const response = await handler({ httpMethod: "OPTIONS" });
    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://scamsahayak.example");
    expect(response.headers["Access-Control-Allow-Methods"]).toContain("POST");
  });

  test("returns 200 with CORS headers for a valid text request", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ language: "en", inputType: "text", rawText: "hello there" }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://scamsahayak.example");
    const parsed = JSON.parse(response.body);
    expect(parsed.riskLevel).toBe("low");
  });

  test("returns a structured 400 error for malformed JSON", async () => {
    const response = await handler({ httpMethod: "POST", body: "{not json" });
    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe("INVALID_REQUEST");
    expect(parsed.error.requestId).toBeTruthy();
  });

  test("returns a structured error with the correct status code for a validation failure", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ language: "xx", inputType: "text", rawText: "hi" }),
    });
    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe("UNSUPPORTED_LANGUAGE");
  });

  test("never leaks a raw stack trace for an unexpected internal error", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ language: "en", inputType: "text", rawText: null }),
    });
    const parsed = JSON.parse(response.body);
    expect(parsed.error.message).not.toMatch(/at Object|node_modules|\.js:\d+/);
  });
});

describe("corsHeaders", () => {
  test("omits the origin header (fail-closed) when ALLOWED_ORIGIN is unset", () => {
    const ORIGINAL = process.env.ALLOWED_ORIGIN;
    delete process.env.ALLOWED_ORIGIN;
    expect(corsHeaders()["Access-Control-Allow-Origin"]).toBeUndefined();
    if (ORIGINAL) process.env.ALLOWED_ORIGIN = ORIGINAL;
    else delete process.env.ALLOWED_ORIGIN;
  });

  test("uses the configured ALLOWED_ORIGIN when set", () => {
    const ORIGINAL = process.env.ALLOWED_ORIGIN;
    process.env.ALLOWED_ORIGIN = "https://scamsahayak.example";
    expect(corsHeaders()["Access-Control-Allow-Origin"]).toBe("https://scamsahayak.example");
    if (ORIGINAL) process.env.ALLOWED_ORIGIN = ORIGINAL;
    else delete process.env.ALLOWED_ORIGIN;
  });

  test("handler omits the origin header for OPTIONS when ALLOWED_ORIGIN is unset", async () => {
    const ORIGINAL = process.env.ALLOWED_ORIGIN;
    delete process.env.ALLOWED_ORIGIN;
    try {
      const response = await handler({ httpMethod: "OPTIONS" });
      expect(response.statusCode).toBe(204);
      expect(response.headers["Access-Control-Allow-Origin"]).toBeUndefined();
      expect(response.headers["Access-Control-Allow-Methods"]).toContain("POST");
    } finally {
      if (ORIGINAL) process.env.ALLOWED_ORIGIN = ORIGINAL;
      else delete process.env.ALLOWED_ORIGIN;
    }
  });
});
