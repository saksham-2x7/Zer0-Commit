const { ApiError, ERROR_CODES, STATUS_BY_CODE } = require("./errors");

describe("ApiError", () => {
  test("is an Error with the contract fields for a known code", () => {
    const err = new ApiError("INVALID_REQUEST", "Please provide text.");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe("ApiError");
    expect(err.code).toBe("INVALID_REQUEST");
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Please provide text.");
  });

  test("maps every code to its documented HTTP status", () => {
    const expected = {
      INVALID_REQUEST: 400,
      UNSUPPORTED_LANGUAGE: 400,
      UNSUPPORTED_INPUT_TYPE: 400,
      INPUT_TOO_LARGE: 413,
      INVALID_IMAGE: 400,
      OCR_FAILED: 422,
      ANALYSIS_FAILED: 422,
      NOT_FOUND: 404,
      INTERNAL_ERROR: 500,
    };
    for (const [code, status] of Object.entries(expected)) {
      expect(new ApiError(code).statusCode).toBe(status);
    }
  });

  test("throws a plain Error for an unknown code instead of creating a broken ApiError", () => {
    expect(() => new ApiError("MADE_UP_CODE", "nope")).toThrow(/Unknown ApiError code: MADE_UP_CODE/);
  });

  test("still throws the unknown-code Error even when no message is given", () => {
    expect(() => new ApiError("NOPE")).toThrow("Unknown ApiError code: NOPE");
  });

  test("exposes the same code list and status map the serializer uses", () => {
    expect(ERROR_CODES).toContain("INTERNAL_ERROR");
    expect(STATUS_BY_CODE.INPUT_TOO_LARGE).toBe(413);
    for (const code of ERROR_CODES) {
      expect(STATUS_BY_CODE[code]).toEqual(expect.any(Number));
    }
  });
});