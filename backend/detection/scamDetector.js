/**
 * PRAHARI'S FILE — deterministic scam-pattern detection engine.
 * Keeps the exported function name and return shape EXACTLY as defined in
 * backend/api/CONTRACT.md. Pure and synchronous: no AWS SDK, no network
 * calls, no side effects.
 *
 * Pattern keys (fixed, see CONTRACT.md):
 *   "urgency", "otp_request", "screen_share_request",
 *   "suspicious_link", "impersonation", "suspicious_collect_request"
 */

// Each pattern is a list of regexes (case-insensitive, Hindi + English) that,
// if any match, count as evidence for that pattern key.
const PATTERN_RULES = {
  urgency: [
    /\burgent(ly)?\b/i,
    /\bimmediately\b/i,
    /\bact now\b/i,
    /\bwithin\s+\d+\s*(hour|hr|minute|min|day)s?\b/i,
    /\b(account|card|kyc|sim)\s+(will\s+be\s+|is\s+being\s+)?(blocked|suspended|deactivated|frozen|closed)\b/i,
    /\blast\s+(warning|chance|reminder)\b/i,
    /\bexpir(es|ing|ed)\s+(today|soon)\b/i,
    /तुरंत/,
    /जल्दी/,
    /अभी/,
    /आखिरी\s*चेतावनी/,
  ],
  otp_request: [
    /\botp\b/i,
    /\bone[\s-]?time[\s-]?password\b/i,
    /\bpin\b/i,
    /\bcvv\b/i,
    /\bshare\s+your\s+password\b/i,
    /ओटीपी/,
    /पिन\s*(नंबर|कोड)?/,
  ],
  screen_share_request: [
    /\banydesk\b/i,
    /\bteamviewer\b/i,
    /\bquick\s*support\b/i,
    /\bscreen[\s-]?shar(e|ing)\b/i,
    /\bremote\s+access\b/i,
    /\binstall\s+this\s+app\b/i,
    /स्क्रीन\s*शेयर/,
  ],
  suspicious_link: [
    /https?:\/\/\S+/i,
    /\bwww\.\S+/i,
    /\bbit\.ly\b/i,
    /\btinyurl\b/i,
    /\bclick\s+(here|this\s+link|below)\b/i,
    /लिंक\s*पर\s*क्लिक/,
  ],
  impersonation: [
    /\b(we are|this is)\s+(calling|writing)\s+from\b/i,
    /\b(rbi|reserve bank|income tax|customs|cbi|trai|police)\b/i,
    /\bofficial(ly)?\s+(bank|government|govt)\s+(representative|official|notice)\b/i,
    /\byour\s+bank\s+(account\s+)?manager\b/i,
    /सरकारी\s*अधिकारी/,
    /बैंक\s*प्रतिनिधि/,
  ],
  suspicious_collect_request: [
    /\bupi\s+collect\b/i,
    /\bapprove\s+the\s+(payment\s+)?request\b/i,
    /\baccept\s+(the\s+)?(payment|collect)\s+request\b/i,
    /\bpay\s*(₹|rs\.?|inr)\s*1\b/i,
    /\bto\s+receive\s+(the\s+)?(money|refund|cashback|prize)\b/i,
    /यूपीआई\s*कलेक्ट/,
    /भुगतान\s*अनुरोध\s*स्वीकार/,
  ],
};

const HIGH_RISK_PATTERNS = new Set([
  "otp_request",
  "screen_share_request",
  "suspicious_collect_request",
]);

function findEvidence(text, pattern) {
  const rules = PATTERN_RULES[pattern];
  for (const rule of rules) {
    const match = text.match(rule);
    if (match) {
      const index = Math.max(0, match.index - 20);
      return text.slice(index, index + 100).trim();
    }
  }
  return null;
}

function detectScamPatterns(text) {
  const safeText = typeof text === "string" ? text : "";
  const matchedPatterns = [];
  const evidence = [];

  for (const pattern of Object.keys(PATTERN_RULES)) {
    const snippet = findEvidence(safeText, pattern);
    if (snippet !== null) {
      matchedPatterns.push(pattern);
      evidence.push({ pattern, snippet });
    }
  }

  let riskLevel = "low";
  const hasHighRiskPattern = matchedPatterns.some((p) => HIGH_RISK_PATTERNS.has(p));
  if (matchedPatterns.length >= 2 || hasHighRiskPattern) {
    riskLevel = "high";
  } else if (matchedPatterns.length === 1) {
    riskLevel = "medium";
  }

  return { riskLevel, matchedPatterns, evidence };
}

module.exports = { detectScamPatterns };
