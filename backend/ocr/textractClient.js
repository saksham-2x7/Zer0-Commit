/**
 * Screenshot OCR via Amazon Textract. Only ever receives image bytes —
 * never persists them. Returns plain extracted text; callers are
 * responsible for redacting it before it reaches the detector, Bedrock,
 * logs, or storage.
 */

const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { ApiError } = require("../api/errors");
const { SUPPORTED_IMAGE_MIME_TYPES } = require("../api/validation");

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

let cachedClient = null;
function getClient() {
  if (!cachedClient) {
    cachedClient = new TextractClient({ region: process.env.AWS_REGION || "ap-south-1" });
  }
  return cachedClient;
}

/**
 * @param {{ imageBase64: string, imageMimeType: string }} input
 * @returns {Promise<{ text: string }>}
 */
async function extractText({ imageBase64, imageMimeType }) {
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(imageMimeType)) {
    throw new ApiError("INVALID_IMAGE", "Image must be image/png or image/jpeg.");
  }

  if (typeof imageBase64 !== "string" || !BASE64_PATTERN.test(imageBase64)) {
    throw new ApiError("INVALID_IMAGE", "Could not decode the provided image data.");
  }

  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length === 0) {
    throw new ApiError("INVALID_IMAGE", "Could not decode the provided image data.");
  }

  let response;
  try {
    const client = getClient();
    response = await client.send(
      new DetectDocumentTextCommand({ Document: { Bytes: bytes } })
    );
  } catch (err) {
    throw new ApiError("OCR_FAILED", "Could not read text from the screenshot. Please try pasting the message text instead.");
  }

  const lines = (response.Blocks || [])
    .filter((block) => block.BlockType === "LINE" && typeof block.Text === "string")
    .map((block) => block.Text);

  return { text: lines.join("\n") };
}

module.exports = { extractText };
