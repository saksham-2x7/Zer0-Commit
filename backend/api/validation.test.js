const { validateAnalyzeRequest, getMaxInputBytes } = require("./validation");

const VALID_PNG_BASE64 = Buffer.from("fake-png-bytes").toString("base64");

describe("validateAnalyzeRequest", () => {
  test("normalizes a valid text request", () => {
    const result = validateAnalyzeRequest({ language: "en", inputType: "text", rawText: "hello" });
    expect(result).toEqual({ language: "en", inputType: "text", rawText: "hello" });
  });

  test("normalizes a valid image request", () => {
    const result = validateAnalyzeRequest({
      language: "hi",
      inputType: "image",
      imageBase64: VALID_PNG_BASE64,
      imageMimeType: "image/png",
    });
    expect(result).toEqual({
      language: "hi",
      inputType: "image",
      imageBase64: VALID_PNG_BASE64,
      imageMimeType: "image/png",
    });
  });

  test("rejects a non-object body", () => {
    expect(() => validateAnalyzeRequest(null)).toThrow();
    expect(() => validateAnalyzeRequest("string")).toThrow();
  });

  test("rejects an unsupported language", () => {
    expect(() =>
      validateAnalyzeRequest({ language: "fr", inputType: "text", rawText: "hi" })
    ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_LANGUAGE" }));
  });

  test("rejects missing/blank text", () => {
    expect(() =>
      validateAnalyzeRequest({ language: "en", inputType: "text", rawText: "   " })
    ).toThrow(expect.objectContaining({ code: "INVALID_REQUEST" }));
  });

  test("rejects text over 8000 characters", () => {
    expect(() =>
      validateAnalyzeRequest({ language: "en", inputType: "text", rawText: "a".repeat(8001) })
    ).toThrow(expect.objectContaining({ code: "INPUT_TOO_LARGE" }));
  });

  test("rejects an unsupported image MIME type", () => {
    expect(() =>
      validateAnalyzeRequest({ language: "en", inputType: "image", imageBase64: VALID_PNG_BASE64, imageMimeType: "image/gif" })
    ).toThrow(expect.objectContaining({ code: "INVALID_IMAGE" }));
  });

  test("rejects invalid base64", () => {
    expect(() =>
      validateAnalyzeRequest({ language: "en", inputType: "image", imageBase64: "not base64!!", imageMimeType: "image/png" })
    ).toThrow(expect.objectContaining({ code: "INVALID_IMAGE" }));
  });

  describe("image size limit honors MAX_INPUT_BYTES", () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    afterAll(() => {
      process.env = ORIGINAL_ENV;
    });

    test("defaults to 5 MB when MAX_INPUT_BYTES is unset", () => {
      delete process.env.MAX_INPUT_BYTES;
      expect(getMaxInputBytes()).toBe(5 * 1024 * 1024);
    });

    test("uses a configured MAX_INPUT_BYTES to reject an otherwise-valid image", () => {
      process.env.MAX_INPUT_BYTES = "10"; // 10 bytes — anything realistic exceeds this
      expect(() =>
        validateAnalyzeRequest({
          language: "en",
          inputType: "image",
          imageBase64: VALID_PNG_BASE64,
          imageMimeType: "image/png",
        })
      ).toThrow(expect.objectContaining({ code: "INPUT_TOO_LARGE" }));
    });

    test("a small MAX_INPUT_BYTES does not affect the text length limit", () => {
      process.env.MAX_INPUT_BYTES = "10";
      const result = validateAnalyzeRequest({ language: "en", inputType: "text", rawText: "hello there" });
      expect(result.rawText).toBe("hello there");
    });
  });
});
