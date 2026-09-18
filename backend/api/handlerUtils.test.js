const { wrapHandler, errorBody, generateRequestId } = require("./handlerUtils");

describe("handlerUtils", () => {
  describe("wrapHandler", () => {
    test("answers OPTIONS preflight with CORS headers and no body", async () => {
      const handler = wrapHandler(async () => ({ ok: true }), "test");
      const ORIGINAL = process.env.ALLOWED_ORIGIN;
      process.env.ALLOWED_ORIGIN = "https://scamsahayak.example";
      try {
        const response = await handler({ httpMethod: "OPTIONS" });
        expect(response.statusCode).toBe(204);
        expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://scamsahayak.example");
        expect(response.headers["Access-Control-Allow-Methods"]).toContain("POST");
        expect(response.body).toBe("");
      } finally {
        if (ORIGINAL) process.env.ALLOWED_ORIGIN = ORIGINAL;
        else delete process.env.ALLOWED_ORIGIN;
      }
    });

    test("parses a JSON body and returns 200 with the handler result", async () => {
      const handler = wrapHandler(async (body) => ({ received: body.x }), "test");
      const response = await handler({ httpMethod: "POST", body: JSON.stringify({ x: 42 }) });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ received: 42 });
    });

    test("returns 400 INVALID_REQUEST for malformed JSON", async () => {
      const handler = wrapHandler(async () => ({ ok: true }), "test");
      const response = await handler({ httpMethod: "POST", body: "{not json" });
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error.code).toBe("INVALID_REQUEST");
      expect(JSON.parse(response.body).error.requestId).toBeTruthy();
    });

    test("serializes an ApiError with its status code", async () => {
      const { ApiError } = require("./errors");
      const handler = wrapHandler(
        async () => {
          throw new ApiError("INPUT_TOO_LARGE", "too big");
        },
        "test"
      );
      const response = await handler({ httpMethod: "POST", body: "{}" });
      expect(response.statusCode).toBe(413);
      expect(JSON.parse(response.body).error.code).toBe("INPUT_TOO_LARGE");
    });

    test("logs requestId on an unexpected internal error (500)", async () => {
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      const handler = wrapHandler(
        async () => {
          throw new TypeError("boom");
        },
        "testHandler"
      );
      let response;
      let logLine;
      try {
        response = await handler({
          httpMethod: "POST",
          body: "{}",
          requestContext: { requestId: "req-from-gateway" },
        });
        logLine = spy.mock.calls.find((args) => args[0].includes("testHandler"));
      } finally {
        spy.mockRestore();
      }

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error.code).toBe("INTERNAL_ERROR");
      expect(logLine).toBeTruthy();
      const logged = JSON.parse(logLine[1]);
      expect(logged.requestId).toBe("req-from-gateway");
      expect(logged.err).toBe("TypeError");
    });

    test("never leaks a raw stack trace in the 500 body", async () => {
      const handler = wrapHandler(
        async () => {
          throw new Error("secret internal detail");
        },
        "test"
      );
      const response = await handler({ httpMethod: "POST", body: "{}" });
      expect(JSON.parse(response.body).error.message).not.toMatch(/secret internal detail/);
    });
  });

  describe("errorBody", () => {
    test("serializes the contract error shape", () => {
      expect(JSON.parse(errorBody("INVALID_REQUEST", "nope", "req_1"))).toEqual({
        error: { code: "INVALID_REQUEST", message: "nope", requestId: "req_1" },
      });
    });
  });

  describe("generateRequestId", () => {
    test("returns a req_ prefixed id", () => {
      expect(generateRequestId()).toMatch(/^req_/);
      expect(generateRequestId()).not.toBe(generateRequestId());
    });
  });
});