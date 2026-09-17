/**
 * Server-side redaction — defense-in-depth for callers that hit
 * POST /api/analyze directly without going through the frontend's own
 * redaction pass. Pure and synchronous. Masks patterns that look like
 * phone numbers, UPI IDs, emails, Aadhaar-like numbers, and other long
 * account/card-like digit strings before text reaches the detector,
 * Bedrock, logs, or persistence.
 */

const RULES = [
  // UPI id: name@bank
  { regex: /\b[\w.+-]{2,}@[a-zA-Z][\w-]{1,}\b/g },
  // email address
  { regex: /\b[\w.+-]{2,}@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\b/g },
  // Indian phone numbers, optionally +91/91 prefixed
  { regex: /(\+?91[\s-]?)?\b[6-9]\d{9}\b/g },
  // Aadhaar-like 12-digit numbers, optionally spaced in groups of 4
  { regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
  // long account/card-like numbers (9+ consecutive digits, optionally spaced/dashed)
  { regex: /\b\d[\d\s-]{8,}\d\b/g },
  // URLs — keep the domain only, strip path/query which may carry personal tokens
  {
    regex: /\bhttps?:\/\/([^\s/?#]+)([^\s]*)/gi,
    replace: (_match, host) => `https://${host}/***`,
  },
];

function maskMiddle(value, keepStart = 2, keepEnd = 2) {
  const collapsed = value.replace(/[\s-]/g, "");
  if (collapsed.length <= keepStart + keepEnd) {
    return "*".repeat(collapsed.length);
  }
  const start = collapsed.slice(0, keepStart);
  const end = collapsed.slice(collapsed.length - keepEnd);
  return `${start}${"*".repeat(collapsed.length - keepStart - keepEnd)}${end}`;
}

function redactText(text) {
  if (typeof text !== "string" || text.length === 0) {
    return "";
  }
  let result = text;
  for (const rule of RULES) {
    result = result.replace(rule.regex, (...args) =>
      rule.replace ? rule.replace(...args) : maskMiddle(args[0])
    );
  }
  return result;
}

module.exports = { redactText };
