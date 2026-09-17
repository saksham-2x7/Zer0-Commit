const { mockClient } = require("aws-sdk-client-mock");
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { extractText } = require("./textractClient");

const textractMock = mockClient(TextractClient);

const VALID_PNG_BASE64 = Buffer.from("fake-png-bytes").toString("base64");

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
      imageBase64: VALID_PNG_BASE64,
      imageMimeType: "image/png",
    });

    expect(result.text).toBe("URGENT: Your account will be blocked.\nShare your OTP immediately.");
  });

  test("rejects an unsupported MIME type", async () => {
    await expect(
      extractText({ imageBase64: VALID_PNG_BASE64, imageMimeType: "image/gif" })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("rejects invalid base64 data", async () => {
    await expect(
      extractText({ imageBase64: "not base64 at all !!! ***", imageMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("returns empty text when Textract finds no lines", async () => {
    textractMock.on(DetectDocumentTextCommand).resolves({ Blocks: [] });

    const result = await extractText({
      imageBase64: VALID_PNG_BASE64,
      imageMimeType: "image/png",
    });

    expect(result.text).toBe("");
  });

  test("wraps a Textract failure as OCR_FAILED", async () => {
    textractMock.on(DetectDocumentTextCommand).rejects(new Error("Textract unavailable"));

    await expect(
      extractText({ imageBase64: VALID_PNG_BASE64, imageMimeType: "image/png" })
    ).rejects.toMatchObject({ code: "OCR_FAILED" });
  });
});
