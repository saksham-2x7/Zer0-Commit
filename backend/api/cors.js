/**
 * Shared CORS header factory for all API handlers and the dev server.
 *
 * Fail-closed by design: when `ALLOWED_ORIGIN` is unset the
 * Access-Control-Allow-Origin header is OMITTED (no `*` wildcard default), so
 * cross-origin browser access is denied unless an origin is explicitly
 * configured. Only the origin is environment-dependent; the methods/headers
 * fields are constant across endpoints.
 */

function corsHeaders() {
  const origin = process.env.ALLOWED_ORIGIN;
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

module.exports = { corsHeaders };