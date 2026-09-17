/**
 * Local-only HTTP server wrapping the Lambda handlers' inner functions for
 * frontend dev against real endpoints instead of mocking fetch. Not used in
 * deployment — Ship It mode uses the Lambda handlers via API Gateway (see
 * infra/template.yaml).
 *
 * Usage: MOCK_BEDROCK=true node backend/api/devServer.js
 */

const http = require("http");
const { analyze, corsHeaders } = require("./analyzeHandler");
const { ocr } = require("./ocrHandler");
const { extractHealthTags } = require("./healthTagsHandler");
const { generateFoodFeedback } = require("./foodFeedbackHandler");
const { ApiError } = require("./errors");

const PORT = process.env.PORT || 3000;

const ROUTES = {
  "/api/analyze": analyze,
  "/api/ocr": ocr,
  "/api/health-tags": extractHealthTags,
  "/api/food-feedback": generateFoodFeedback,
};

function generateRequestId() {
  return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

const server = http.createServer((req, res) => {
  const headers = corsHeaders();
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const routeFn = ROUTES[req.url];
  if (req.method !== "POST" || !routeFn) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "INVALID_REQUEST", message: "Not found", requestId: generateRequestId() } }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    const requestId = generateRequestId();
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON.", requestId } }));
      return;
    }

    try {
      const result = await routeFn(parsed);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      if (err instanceof ApiError) {
        res.writeHead(err.statusCode, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: err.code, message: err.message, requestId } }));
        return;
      }
      console.error("Unhandled error in dev server:", err.name || "UnknownError");
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", requestId } }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`ScamSahayak dev API listening on http://localhost:${PORT}`);
});
