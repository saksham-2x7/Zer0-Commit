const { ApiError } = require("./errors");

const SUPPORTED_LANGUAGES = new Set(["en", "hi", "ta", "te", "bn", "mr"]);
const SUPPORTED_INPUT_TYPES = new Set(["text", "image"]);
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

const DEFAULT_MAX_TEXT_CHARS = 8000;

function getMaxInputBytes() {
  const configured = Number(process.env.MAX_INPUT_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : 4 * 1024 * 1024;
}

// Base64 is ~4/3 the size of raw bytes; this bounds the raw image size
// against the configurable MAX_INPUT_BYTES (read fresh each call so tests
// and deployments can change it at runtime).
function getMaxImageBase64Chars() {
  return Math.ceil((getMaxInputBytes() * 4) / 3);
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

// First bytes that any real file of each supported MIME type must start with.
const IMAGE_SIGNATURES = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

function hasValidMagicBytes(bytes, mimeType) {
  const signature = IMAGE_SIGNATURES[mimeType];
  return Boolean(signature) && signature.every((byte, i) => bytes[i] === byte);
}

/**
 * Single shared image validator used by BOTH /api/analyze and /api/ocr so the
 * two entry points can never drift: raw-size cap (configurable MAX_INPUT_BYTES),
 * base64 charset, base64 length BEFORE decoding (memory hygiene), exact MIME
 * match, and magic-byte verification.
 *
 * Returns { bytes, imageBase64, imageMimeType } where `bytes` is the decoded
 * Buffer — callers (the Textract flow) reuse it instead of decoding base64 a
 * second time.
 * Throws ApiError on any failure.
 */
function validateImageBytes(imageBase64, imageMimeType) {
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    throw new ApiError("INVALID_REQUEST", "Please provide an image.");
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(imageMimeType)) {
    throw new ApiError("INVALID_IMAGE", "Image must be image/png or image/jpeg.");
  }
  // Check the encoded length first so an oversized payload is rejected before
  // any decode work is done.
  if (imageBase64.length > getMaxImageBase64Chars()) {
    throw new ApiError("INPUT_TOO_LARGE", "Image is too large.");
  }
  if (!BASE64_PATTERN.test(imageBase64)) {
    throw new ApiError("INVALID_IMAGE", "Image data is not valid base64.");
  }

  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.length === 0) {
    throw new ApiError("INVALID_IMAGE", "Image data could not be decoded from base64.");
  }
  if (bytes.length > getMaxInputBytes()) {
    throw new ApiError("INPUT_TOO_LARGE", "Image is too large.");
  }
  if (!hasValidMagicBytes(bytes, imageMimeType)) {
    throw new ApiError(
      "INVALID_IMAGE",
      "Image data does not match its declared type (expected a valid PNG or JPEG file)."
    );
  }
  return { bytes, imageBase64, imageMimeType };
}

/**
 * Validates and normalizes an incoming /api/analyze request body.
 * Throws ApiError on any problem. Returns the normalized request otherwise.
 * For image input the normalized request carries the pre-decoded `bytes`.
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
  const validated = validateImageBytes(imageBase64, imageMimeType);

  return { language, inputType, ...validated };
}

module.exports = {
  validateAnalyzeRequest,
  validateImageBytes,
  getMaxInputBytes,
  BASE64_PATTERN,
  SUPPORTED_LANGUAGES,
  SUPPORTED_INPUT_TYPES,
  SUPPORTED_IMAGE_MIME_TYPES,
};