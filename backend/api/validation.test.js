const { validateAnalyzeRequest, getMaxInputBytes } = require("./validation");

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const VALID_PNG_BASE64 = Buffer.concat([PNG_MAGIC, Buffer.from("fake-png-body")]).toString("base64");

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

  test.each(["en", "hi", "ta", "te", "bn", "mr"])("accepts language '%s'", (language) => {
    const result = validateAnalyzeRequest({ language, inputType: "text", rawText: "hello" });
    expect(result.language).toBe(language);
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

    test("defaults to 4 MB when MAX_INPUT_BYTES is unset (matches infra/template.yaml + CONTRACT.md)", () => {
      delete process.env.MAX_INPUT_BYTES;
      expect(getMaxInputBytes()).toBe(4 * 1024 * 1024);
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

  describe("image magic-byte validation (M2)", () => {
    test("accepts a real PNG payload", () => {
      const result = validateAnalyzeRequest({
        language: "en",
        inputType: "image",
        imageBase64: VALID_PNG_BASE64,
        imageMimeType: "image/png",
      });
      expect(result.imageMimeType).toBe("image/png");
    });

    test("rejects JPEG bytes declared as PNG (magic mismatch)", () => {
      expect(() =>
        validateAnalyzeRequest({
          language: "en",
          inputType: "image",
          imageBase64: JPEG_MAGIC.toString("base64"),
          imageMimeType: "image/png",
        })
      ).toThrow(expect.objectContaining({ code: "INVALID_IMAGE" }));
    });

    test("rejects malformed base64 even with a valid PNG prefix", () => {
      expect(() =>
        validateAnalyzeRequest({
          language: "en",
          inputType: "image",
          imageBase64: `${PNG_MAGIC.toString("base64")}!!!`,
          imageMimeType: "image/png",
        })
      ).toThrow(expect.objectContaining({ code: "INVALID_IMAGE" }));
    });
  });
});
