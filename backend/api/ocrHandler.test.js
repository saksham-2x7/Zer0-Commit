const { mockClient } = require("aws-sdk-client-mock");
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { ocr, handler } = require("./ocrHandler");

const textractMock = mockClient(TextractClient);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const VALID_PNG_BASE64 = Buffer.concat([PNG_MAGIC, Buffer.from("fake-body-payload")]).toString("base64");

beforeEach(() => {
  textractMock.reset();
});

describe("ocr", () => {
  test("returns extracted text for a valid image", async () => {
    textractMock.on(DetectDocumentTextCommand).resolves({
      Blocks: [{ BlockType: "LINE", Text: "Diagnosis: Type 2 Diabetes" }],
    });

    const result = await ocr({ imageBase64: VALID_PNG_BASE64, imageMimeType: "image/png" });
    expect(result.text).toBe("Diagnosis: Type 2 Diabetes");
  });

  test("rejects an image bigger than the 4 MiB cap", async () => {
    const oversizedBase64 = Buffer.concat([PNG_MAGIC, Buffer.alloc(4 * 1024 * 1024)]).toString(
      "base64"
    );
    await expect(ocr({ imageBase64: oversizedBase64, imageMimeType: "image/png" })).rejects.toMatchObject({
      code: "INPUT_TOO_LARGE",
    });
  });

  test("rejects image bytes that do not match the declared MIME type", async () => {
    await expect(
      ocr({ imageBase64: JPEG_MAGIC.toString("base64"), imageMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("rejects WebP bytes even when declared as PNG", async () => {
    await expect(
      ocr({ imageBase64: WEBP_BYTES.toString("base64"), imageMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("rejects malformed base64 even with a valid PNG prefix (M2)", async () => {
    await expect(
      ocr({ imageBase64: `${PNG_MAGIC.toString("base64")}!!!`, imageMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("honors MAX_INPUT_BYTES instead of a hardcoded 4 MiB cap (L1)", async () => {
    const ORIGINAL = process.env.MAX_INPUT_BYTES;
    process.env.MAX_INPUT_BYTES = "10";
    try {
      await expect(
        ocr({ imageBase64: VALID_PNG_BASE64, imageMimeType: "image/png" })
      ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
    } finally {
      if (ORIGINAL === undefined) delete process.env.MAX_INPUT_BYTES;
      else process.env.MAX_INPUT_BYTES = ORIGINAL;
    }
  });

  test("rejects a missing image", async () => {
    await expect(ocr({ imageMimeType: "image/png" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  test("rejects an unsupported MIME type", async () => {
    await expect(
      ocr({ imageBase64: VALID_PNG_BASE64, imageMimeType: "image/gif" })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("does not persist anything — this module has no persistence dependency at all", () => {
    // Structural guarantee: ocrHandler.js never requires caseStore or
    // evidenceBundle, so a medical document can never end up in DynamoDB/S3.
    const source = require("fs").readFileSync(require.resolve("./ocrHandler.js"), "utf8");
    expect(source).not.toMatch(/persistence\/caseStore/);
    expect(source).not.toMatch(/evidence\/evidenceBundle/);
  });
});

describe("handler", () => {
  test("returns a structured error without leaking internals on Textract failure", async () => {
    textractMock.on(DetectDocumentTextCommand).rejects(new Error("internal detail"));

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageBase64: VALID_PNG_BASE64, imageMimeType: "image/png" }),
    });

    expect(response.statusCode).toBe(422);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe("OCR_FAILED");
    expect(parsed.error.message).not.toMatch(/internal detail/);
  });

  test("responds to OPTIONS with CORS headers", async () => {
    const ORIGINAL = process.env.ALLOWED_ORIGIN;
    process.env.ALLOWED_ORIGIN = "https://scamsahayak.example";
    try {
      const response = await handler({ httpMethod: "OPTIONS" });
      expect(response.statusCode).toBe(204);
      expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://scamsahayak.example");
      expect(response.headers["Access-Control-Allow-Methods"]).toContain("POST");
    } finally {
      if (ORIGINAL) process.env.ALLOWED_ORIGIN = ORIGINAL;
      else delete process.env.ALLOWED_ORIGIN;
    }
  });

  test("returns 200 with extracted text for a string body", async () => {
    textractMock.on(DetectDocumentTextCommand).resolves({
      Blocks: [{ BlockType: "LINE", Text: "BP: 120/80" }],
    });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageBase64: VALID_PNG_BASE64, imageMimeType: "image/png" }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ text: "BP: 120/80" });
  });

  test("accepts an already-parsed body object and uses the requestContext requestId", async () => {
    textractMock.on(DetectDocumentTextCommand).resolves({
      Blocks: [{ BlockType: "LINE", Text: "ok" }],
    });

    const response = await handler({
      httpMethod: "POST",
      requestContext: { requestId: "req_fixed" },
      body: { imageBase64: VALID_PNG_BASE64, imageMimeType: "image/png" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ text: "ok" });
  });

  test("malformed JSON body -> 400 INVALID_REQUEST", async () => {
    const response = await handler({ httpMethod: "POST", body: "{oops" });
    expect(response.statusCode).toBe(400);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe("INVALID_REQUEST");
  });

  test("non-ApiError from the pipeline -> 500 INTERNAL_ERROR, no internals leaked", async () => {
    // Isolated module load with a textract layer that throws a raw Error, so
    // this exercises the handler's unhandled-error path. Must run last: it
    // resets the module registry.
    jest.resetModules();
    jest.doMock("../ocr/textractClient", () => ({
      extractText: async () => {
        throw new Error("leaky internal detail");
      },
    }));
    const isolated = require("./ocrHandler");

    const response = await isolated.handler({
      httpMethod: "POST",
      body: JSON.stringify({ imageBase64: VALID_PNG_BASE64, imageMimeType: "image/png" }),
    });

    expect(response.statusCode).toBe(500);
    const parsed = JSON.parse(response.body);
    expect(parsed.error.code).toBe("INTERNAL_ERROR");
    expect(parsed.error.message).not.toMatch(/leaky/);
  });
});
