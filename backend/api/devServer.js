/**
 * Local-only HTTP server wrapping analyzeHandler.analyze for frontend dev
 * against a real endpoint instead of mocking fetch. Not used in deployment —
 * Ship It mode uses the Lambda handler via API Gateway (see infra/template.yaml).
 *
 * Usage: MOCK_BEDROCK=true node backend/api/devServer.js
 */

const http = require("http");
const { analyze } = require("./analyzeHandler");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/analyze") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const request = JSON.parse(body || "{}");
      const result = await analyze(request);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`ScamSahayak dev API listening on http://localhost:${PORT}`);
});
