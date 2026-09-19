/**
 * Typed API errors — maps directly to the error codes in CONTRACT.md.
 * analyzeHandler catches ApiError and serializes { error: { code, message, requestId } }.
 */

const ERROR_CODES = [
  "INVALID_REQUEST",
  "UNSUPPORTED_LANGUAGE",
  "UNSUPPORTED_INPUT_TYPE",
  "INPUT_TOO_LARGE",
  "INVALID_IMAGE",
  "OCR_FAILED",
  "ANALYSIS_FAILED",
  "LOOKUP_FAILED",
  "NOT_FOUND",
  "INTERNAL_ERROR",
];

const STATUS_BY_CODE = {
  INVALID_REQUEST: 400,
  UNSUPPORTED_LANGUAGE: 400,
  UNSUPPORTED_INPUT_TYPE: 400,
  INPUT_TOO_LARGE: 413,
  INVALID_IMAGE: 400,
  OCR_FAILED: 422,
  ANALYSIS_FAILED: 422,
  LOOKUP_FAILED: 502,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

class ApiError extends Error {
  constructor(code, message) {
    if (!ERROR_CODES.includes(code)) {
      throw new Error(`Unknown ApiError code: ${code}`);
    }
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
  }
}

module.exports = { ApiError, ERROR_CODES, STATUS_BY_CODE };
