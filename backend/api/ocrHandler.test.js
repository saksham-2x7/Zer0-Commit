const { mockClient } = require("aws-sdk-client-mock");
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { ocr, handler } = require("./ocrHandler");

const textractMock = mockClient(TextractClient);
const VALID_PNG_BASE64 = Buffer.from("fake-png-bytes").toString("base64");

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
    const response = await handler({ httpMethod: "OPTIONS" });
    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBeTruthy();
  });
});
