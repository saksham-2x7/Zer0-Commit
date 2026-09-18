/**
 * Screenshot OCR via Amazon Textract. Only ever receives image bytes —
 * never persists them. Returns plain extracted text; callers are
 * responsible for redacting it before it reaches the detector, Bedrock,
 * logs, or storage.
 */

const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { ApiError } = require("../api/errors");
const {
  SUPPORTED_IMAGE_MIME_TYPES,
  BASE64_PATTERN,
  getMaxInputBytes,
} = require("../api/validation");

let cachedClient = null;
function getClient() {
  if (!cachedClient) {
    cachedClient = new TextractClient({ region: process.env.AWS_REGION || "ap-south-1" });
  }
  return cachedClient;
}

/**
 * @param {{ bytes?: Buffer, imageBase64?: string, imageMimeType: string }} input
 *   Prefer `bytes` — the pre-decoded Buffer from backend/api/validation.js,
 *   so base64 is decoded exactly once. `imageBase64` is accepted for direct
 *   callers and decoded here as the (only) decode step.
 * @returns {Promise<{ text: string }>}
 */
async function extractText({ bytes, imageBase64, imageMimeType }) {
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(imageMimeType)) {
    throw new ApiError("INVALID_IMAGE", "Image must be image/png or image/jpeg.");
  }

  let imageBytes;
  if (Buffer.isBuffer(bytes) && bytes.length > 0) {
    imageBytes = bytes;
  } else if (typeof imageBase64 === "string" && BASE64_PATTERN.test(imageBase64)) {
    imageBytes = Buffer.from(imageBase64, "base64");
  } else {
    throw new ApiError("INVALID_IMAGE", "Could not decode the provided image data.");
  }
  if (imageBytes.length === 0) {
    throw new ApiError("INVALID_IMAGE", "Could not decode the provided image data.");
  }
  if (imageBytes.length > getMaxInputBytes()) {
    throw new ApiError("INPUT_TOO_LARGE", "Image is too large.");
  }

  let response;
  try {
    const client = getClient();
    response = await client.send(
      new DetectDocumentTextCommand({ Document: { Bytes: imageBytes } })
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