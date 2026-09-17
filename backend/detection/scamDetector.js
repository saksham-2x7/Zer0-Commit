/**
 * PRAHARI'S FILE — replace the logic below with real pattern detection.
 * Keep the exported function name and return shape EXACTLY as defined in
 * backend/api/CONTRACT.md. This stub exists so the full pipeline runs
 * end-to-end from the first commit; the rest of the team is already
 * integrating against this shape.
 *
 * Pattern keys (fixed, see CONTRACT.md):
 *   "urgency", "otp_request", "screen_share_request",
 *   "suspicious_link", "impersonation", "suspicious_collect_request"
 */

function detectScamPatterns(text) {
  // --- STUB LOGIC: naive keyword check, English only. Replace this. ---
  const lower = (text || "").toLowerCase();
  const matchedPatterns = [];
  const evidence = [];

  if (lower.includes("otp") || lower.includes("pin")) {
    matchedPatterns.push("otp_request");
    evidence.push({ pattern: "otp_request", snippet: text.slice(0, 80) });
  }
  if (lower.includes("urgent") || lower.includes("immediately")) {
    matchedPatterns.push("urgency");
    evidence.push({ pattern: "urgency", snippet: text.slice(0, 80) });
  }

  let riskLevel = "low";
  if (
    matchedPatterns.length >= 2 ||
    matchedPatterns.includes("otp_request") ||
    matchedPatterns.includes("screen_share_request")
  ) {
    riskLevel = "high";
  } else if (matchedPatterns.length === 1) {
    riskLevel = "medium";
  }

  return { riskLevel, matchedPatterns, evidence };
}

module.exports = { detectScamPatterns };
