const { ApiError } = require("./errors");

const SUPPORTED_LANGUAGES = new Set(["hi", "en"]);
const SUPPORTED_INPUT_TYPES = new Set(["text", "image"]);
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

const DEFAULT_MAX_TEXT_CHARS = 8000;

function getMaxInputBytes() {
  const configured = Number(process.env.MAX_INPUT_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 5 * 1024 * 1024;
}

// Base64 is ~4/3 the size of raw bytes; this bounds the raw image size
// against the configurable MAX_INPUT_BYTES (read fresh each call so tests
// and deployments can change it at runtime).
function getMaxImageBase64Chars() {
  return Math.ceil((getMaxInputBytes() * 4) / 3);
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Validates and normalizes an incoming /api/analyze request body.
 * Throws ApiError on any problem. Returns the normalized request otherwise.
 */
function validateAnalyzeRequest(body) {
  if (!body || typeof body !== "object") {
    throw new ApiError("INVALID_REQUEST", "Request body must be a JSON object.");
  }

  const { language, inputType, rawText, imageBase64, imageMimeType } = body;

  if (!SUPPORTED_LANGUAGES.has(language)) {
    throw new ApiError("UNSUPPORTED_LANGUAGE", `Language must be one of: ${[...SUPPORTED_LANGUAGES].join(", ")}.`);
  }

  if (!SUPPORTED_INPUT_TYPES.has(inputType)) {
    throw new ApiError("UNSUPPORTED_INPUT_TYPE", `inputType must be one of: ${[...SUPPORTED_INPUT_TYPES].join(", ")}.`);
  }

  if (inputType === "text") {
    if (typeof rawText !== "string" || rawText.trim().length === 0) {
      throw new ApiError("INVALID_REQUEST", "Please provide text to analyze.");
    }
    if (rawText.length > DEFAULT_MAX_TEXT_CHARS) {
      throw new ApiError("INPUT_TOO_LARGE", `Text must be ${DEFAULT_MAX_TEXT_CHARS} characters or fewer.`);
    }
    return { language, inputType, rawText };
  }

  // inputType === "image"
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    throw new ApiError("INVALID_REQUEST", "Please provide an image to analyze.");
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(imageMimeType)) {
    throw new ApiError("INVALID_IMAGE", "Image must be image/png or image/jpeg.");
  }
  if (imageBase64.length > getMaxImageBase64Chars()) {
    throw new ApiError("INPUT_TOO_LARGE", "Image is too large.");
  }
  if (!BASE64_PATTERN.test(imageBase64)) {
    throw new ApiError("INVALID_IMAGE", "Image data is not valid base64.");
  }

  return { language, inputType, imageBase64, imageMimeType };
}

module.exports = {
  validateAnalyzeRequest,
  getMaxInputBytes,
  SUPPORTED_LANGUAGES,
  SUPPORTED_INPUT_TYPES,
  SUPPORTED_IMAGE_MIME_TYPES,
};
