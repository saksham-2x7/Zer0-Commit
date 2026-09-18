/**
 * OCR-only endpoint used by the frontend's health-profile feature (scanning
 * a medical document/note). Deliberately separate from analyzeHandler.js:
 * this does NOT run scam detection, does NOT call Bedrock, and does NOT
 * persist anything (no DynamoDB case record, no S3 evidence bundle) — a
 * medical document is not a scam-check case.
 */

const { extractText } = require("../ocr/textractClient");
const { validateImageBytes } = require("./validation");
const { wrapHandler } = require("./handlerUtils");

async function ocr({ imageBase64, imageMimeType }) {
  // Shared with /api/analyze: size cap (MAX_INPUT_BYTES), base64 charset,
  // encoded-length check before decoding, exact MIME match, and magic bytes.
  // The decoded Buffer is reused by Textract — no second base64 decode.
  const { bytes } = validateImageBytes(imageBase64, imageMimeType);

  const { text } = await extractText({ bytes, imageMimeType });
  return { text };
}

exports.handler = wrapHandler(ocr, "ocrHandler");

exports.ocr = ocr;