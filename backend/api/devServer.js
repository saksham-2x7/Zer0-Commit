/**
 * Local-only HTTP server wrapping the Lambda handlers' inner functions for
 * frontend dev against real endpoints instead of mocking fetch. Not used in
 * deployment — Ship It mode uses the Lambda handlers via API Gateway (see
 * infra/template.yaml).
 *
 * Usage: MOCK_BEDROCK=true node backend/api/devServer.js
 *
 * Mirrors the Lambda error contract: unknown routes return a 404 body whose
 * error code is NOT_FOUND (see errors.js + CONTRACT.md), and request bodies
 * above the analyze-payload ceiling are rejected with 413 INPUT_TOO_LARGE.
 *
 * Routes are { method, path, fn } entries where path is an exact string or
 * a RegExp (capture groups are passed to fn as the second argument, so GET
 * routes can read path params like /api/family/:familyId).
 */

const http = require("http");
const { analyze } = require("./analyzeHandler");
const { ocr } = require("./ocrHandler");
const { extractHealthTags } = require("./healthTagsHandler");
const { generateFoodFeedback } = require("./foodFeedbackHandler");
const { report } = require("./reportHandler");
const familyHandler = require("./familyHandler");
const foodHandler = require("./foodHandler");
const locationHandler = require("./locationHandler");
const { corsHeaders } = require("./cors");
const { ApiError } = require("./errors");
const { getMaxInputBytes } = require("./validation");

const PORT = process.env.PORT || 3000;

// cors.js is deliberately fail-closed (no Access-Control-Allow-Origin
// without ALLOWED_ORIGIN) for the deployed Lambda path. This dev server only
// ever exists to be called by the local Vite dev server, so default it here
// rather than requiring every local-dev invocation to set it — without this,
// `MOCK_BEDROCK=true npm run dev:api` (the command the README and
// Playwright's webServer both use) emits no CORS header at all, and the
// frontend's fetch() calls fail with an opaque "couldn't reach the server".
if (!process.env.ALLOWED_ORIGIN) {
  process.env.ALLOWED_ORIGIN = "http://localhost:5173";
}

const ROUTES = [
  // Existing POST endpoints.
  { method: "POST", path: "/api/analyze", fn: analyze },
  { method: "POST", path: "/api/ocr", fn: ocr },
  { method: "POST", path: "/api/health-tags", fn: extractHealthTags },
  { method: "POST", path: "/api/food-feedback", fn: generateFoodFeedback },
  { method: "POST", path: "/api/report", fn: report },

  // Family circle.
  { method: "POST", path: "/api/family/create", fn: familyHandler.createFamilyHandler },
  { method: "POST", path: "/api/family/members", fn: familyHandler.addMemberHandler },
  { method: "POST", path: "/api/family/contacts", fn: familyHandler.addContactHandler },
  { method: "POST", path: "/api/family/alerts", fn: familyHandler.addAlertHandler },
  { method: "POST", path: "/api/family/confirm-alert", fn: familyHandler.confirmAlertHandler },
  { method: "GET", path: /^\/api\/family\/([^/]+)$/, fn: (_body, m) => familyHandler.getFamilyHandler({ familyId: m[1] }) },

  // Food/product scan with family allergy flags.
  { method: "POST", path: "/api/food-lookup", fn: foodHandler.foodLookupHandler },

  // Family live location sharing.
  { method: "POST", path: "/api/location/share", fn: locationHandler.shareLocationHandler },
  { method: "POST", path: "/api/location/stop", fn: locationHandler.stopLocationHandler },
  { method: "GET", path: /^\/api\/location\/family\/([^/]+)$/, fn: (_body, m) => locationHandler.getFamilyLocationsHandler({ familyId: m[1] }) },
];

function generateRequestId() {
  return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function maxRequestBodyBytes() {
  // /api/analyze carries the largest payload: a base64 image capped at the
  // Lambda's MaxInputBytes ceiling plus the JSON/field envelope.
  return Math.ceil((getMaxInputBytes() * 4) / 3) + 32 * 1024;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function findRoute(method, url) {
  return ROUTES.find((route) => {
    if (route.method !== method) {
      return false;
    }
    if (typeof route.path === "string") {
      return route.path === url;
    }
    return route.path.test(url);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    const headers = corsHeaders();
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const route = findRoute(req.method, req.url);
    if (!route) {
      sendJson(res, 404, {
        error: { code: "NOT_FOUND", message: "Endpoint not found", requestId: generateRequestId() },
      });
      return;
    }

    const bodyCap = maxRequestBodyBytes();
    if (Number(req.headers["content-length"] || 0) > bodyCap) {
      sendJson(res, 413, {
        error: { code: "INPUT_TOO_LARGE", message: "Request body too large.", requestId: generateRequestId() },
      });
      return;
    }

    let body = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (body.length + chunk.length > bodyCap) {
        tooLarge = true;
        return;
      }
      body += chunk;
    });
    req.on("end", async () => {
      const requestId = generateRequestId();

      if (tooLarge) {
        sendJson(res, 413, {
          error: { code: "INPUT_TOO_LARGE", message: "Request body too large.", requestId },
        });
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(body || "{}");
      } catch (err) {
        sendJson(res, 400, {
          error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON.", requestId },
        });
        return;
      }

      const match = typeof route.path === "string" ? null : req.url.match(route.path);
      try {
        const result = await route.fn(parsed, match);
        sendJson(res, 200, result);
      } catch (err) {
        if (err instanceof ApiError) {
          sendJson(res, err.statusCode, {
            error: { code: err.code, message: err.message, requestId },
          });
          return;
        }
        console.error("Unhandled error in dev server:", err.name || "UnknownError");
        sendJson(res, 500, {
          error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", requestId },
        });
      }
    });
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`ScamSahayak dev API listening on http://localhost:${PORT}`);
  });
}

module.exports = { createServer, maxRequestBodyBytes };