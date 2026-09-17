/**
 * OCR-only endpoint used by the frontend's health-profile feature (scanning
 * a medical document/note). Deliberately separate from analyzeHandler.js:
 * this does NOT run scam detection, does NOT call Bedrock, and does NOT
 * persist anything (no DynamoDB case record, no S3 evidence bundle) — a
 * medical document is not a scam-check case.
 */

const { extractText } = require("../ocr/textractClient");
const { ApiError } = require("./errors");
const { SUPPORTED_IMAGE_MIME_TYPES } = require("./validation");
const { corsHeaders } = require("./analyzeHandler");

async function ocr({ imageBase64, imageMimeType }) {
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    throw new ApiError("INVALID_REQUEST", "Please provide an image.");
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(imageMimeType)) {
    throw new ApiError("INVALID_IMAGE", "Image must be image/png or image/jpeg.");
  }

  const { text } = await extractText({ imageBase64, imageMimeType });
  return { text };
}

function generateRequestId() {
  return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function errorBody(code, message, requestId) {
  return JSON.stringify({ error: { code, message, requestId } });
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  const requestId = event.requestContext?.requestId || generateRequestId();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return {
      statusCode: 400,
      headers: { ...headers, "Content-Type": "application/json" },
      body: errorBody("INVALID_REQUEST", "Request body must be valid JSON.", requestId),
    };
  }

  try {
    const result = await ocr(body || {});
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        statusCode: err.statusCode,
        headers: { ...headers, "Content-Type": "application/json" },
        body: errorBody(err.code, err.message, requestId),
      };
    }
    console.error("Unhandled error in ocrHandler:", err.name || "UnknownError");
    return {
      statusCode: 500,
      headers: { ...headers, "Content-Type": "application/json" },
      body: errorBody("INTERNAL_ERROR", "Something went wrong. Please try again.", requestId),
    };
  }
};

exports.ocr = ocr;
