const { mockClient } = require("aws-sdk-client-mock");
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { extractText } = require("./textractClient");

const textractMock = mockClient(TextractClient);

const VALID_IMAGE_BYTES = Buffer.from("fake-png-bytes");

beforeEach(() => {
  textractMock.reset();
});

describe("extractText", () => {
  test("returns joined line text for a valid screenshot", async () => {
    textractMock.on(DetectDocumentTextCommand).resolves({
      Blocks: [
        { BlockType: "PAGE" },
        { BlockType: "LINE", Text: "URGENT: Your account will be blocked." },
        { BlockType: "WORD", Text: "URGENT" },
        { BlockType: "LINE", Text: "Share your OTP immediately." },
      ],
    });

    const result = await extractText({
      bytes: VALID_IMAGE_BYTES,
      imageMimeType: "image/png",
    });

    expect(result.text).toBe("URGENT: Your account will be blocked.\nShare your OTP immediately.");
  });

  test("accepts pre-decoded bytes and does not re-decode base64", async () => {
    textractMock.on(DetectDocumentTextCommand).resolves({
      Blocks: [{ BlockType: "LINE", Text: "hello" }],
    });

    const result = await extractText({
      bytes: VALID_IMAGE_BYTES,
      imageBase64: "!!!this is not valid base64!!!",
      imageMimeType: "image/png",
    });

    expect(result.text).toBe("hello");
  });

  test("rejects an unsupported MIME type", async () => {
    await expect(
      extractText({ bytes: VALID_IMAGE_BYTES, imageMimeType: "image/gif" })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("rejects invalid base64 data (legacy imageBase64 path)", async () => {
    await expect(
      extractText({ imageBase64: "not base64 at all !!! ***", imageMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("returns empty text when Textract finds no lines", async () => {
    textractMock.on(DetectDocumentTextCommand).resolves({ Blocks: [] });

    const result = await extractText({
      bytes: VALID_IMAGE_BYTES,
      imageMimeType: "image/png",
    });

    expect(result.text).toBe("");
  });

  test("wraps a Textract failure as OCR_FAILED", async () => {
    textractMock.on(DetectDocumentTextCommand).rejects(new Error("Textract unavailable"));

    await expect(
      extractText({ bytes: VALID_IMAGE_BYTES, imageMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "OCR_FAILED" });
  });
});