/**
 * Shared Lambda handler boilerplate for every API entry point: CORS headers,
 * request-id generation, OPTIONS preflight, JSON body parsing, and the
 * ApiError / INTERNAL_ERROR serialization contract from CONTRACT.md. Each
 * handler keeps only its business logic; wrapHandler(handler, name) adapts it
 * to the API Gateway proxy integration shape.
 */

const { ApiError } = require("./errors");
const { corsHeaders } = require("./cors");

function errorBody(code, message, requestId) {
  return JSON.stringify({ error: { code, message, requestId } });
}

function generateRequestId() {
  return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/**
 * @param {(body: any) => Promise<any>} handler - business logic, throws ApiError on contract violations
 * @param {string} name - handler name used in 500 error logs
 * @returns {(event: object) => Promise<object>} API Gateway proxy handler
 */
function wrapHandler(handler, name) {
  return async (event) => {
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
      const result = await handler(body);
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
      // Never leak a raw stack trace or internal error message to the caller,
      // but keep the requestId in the log line so failures are traceable.
      console.error(
        `Unhandled error in ${name}:`,
        JSON.stringify({ requestId, err: err.name || "UnknownError" })
      );
      return {
        statusCode: 500,
        headers: { ...headers, "Content-Type": "application/json" },
        body: errorBody("INTERNAL_ERROR", "Something went wrong. Please try again.", requestId),
      };
    }
  };
}

module.exports = { wrapHandler, errorBody, generateRequestId };