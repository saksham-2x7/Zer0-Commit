/**
 * Client-side redaction — masks phone numbers, UPI IDs, emails, and long
 * account-like digit strings, and strips the path/query of URLs, BEFORE
 * anything is sent to the backend. Pure and synchronous.
 *
 * Kept in sync with backend/redaction/redact.js (the backend re-applies
 * its own redaction defense-in-depth — this is what's actually sent to
 * the backend AND what's stored in local history, so it must not leak
 * more than the backend would).
 */

const PATTERNS = [
  // UPI ID: name@bank (check before phone/generic digit rules so the
  // digits inside a UPI id aren't partially masked by another rule first)
  { regex: /\b[\w.+-]{2,}@[a-zA-Z][\w-]{1,}\b/g, mask: (m) => maskMiddle(m, 2, 2) },
  // email address
  { regex: /\b[\w.+-]{2,}@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\b/g, mask: (m) => maskMiddle(m, 2, 2) },
  // Indian phone numbers: optional +91/91 prefix, then 10 digits
  { regex: /(\+?91[\s-]?)?\b[6-9]\d{9}\b/g, mask: (m) => maskMiddle(m, 2, 2) },
  // Long account/card/Aadhaar-like numbers (9+ consecutive digits, optionally spaced/dashed)
  { regex: /\b\d[\d\s-]{8,}\d\b/g, mask: (m) => maskMiddle(m.replace(/[\s-]/g, ""), 2, 2) },
  // URLs — keep the domain only, strip path/query which may carry personal tokens
  {
    regex: /\bhttps?:\/\/([^\s/?#]+)([^\s]*)/gi,
    mask: null,
    replace: (_match, host) => `https://${host}/***`,
  },
];

function maskMiddle(value, keepStart, keepEnd) {
  if (value.length <= keepStart + keepEnd) {
    return "*".repeat(value.length);
  }
  const start = value.slice(0, keepStart);
  const end = value.slice(value.length - keepEnd);
  const middle = "*".repeat(value.length - keepStart - keepEnd);
  return `${start}${middle}${end}`;
}

export function redactText(text) {
  if (typeof text !== "string" || text.length === 0) {
    return "";
  }
  let result = text;
  for (const rule of PATTERNS) {
    result = result.replace(rule.regex, (...args) =>
      rule.replace ? rule.replace(...args) : rule.mask(args[0])
    );
  }
  return result;
}
