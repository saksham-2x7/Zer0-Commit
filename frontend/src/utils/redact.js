/**
 * Client-side redaction — masks phone numbers, UPI IDs, and long
 * account-like digit strings BEFORE anything is sent to the backend.
 * Pure and synchronous.
 */

const PATTERNS = [
  // UPI ID: name@bank (check before phone/generic digit rules so the
  // digits inside a UPI id aren't partially masked by another rule first)
  { regex: /\b[\w.+-]{2,}@[a-zA-Z][\w-]{1,}\b/g, mask: (m) => maskMiddle(m, 2, 2) },
  // Indian phone numbers: optional +91/91 prefix, then 10 digits
  { regex: /(\+?91[\s-]?)?\b[6-9]\d{9}\b/g, mask: (m) => maskMiddle(m, 2, 2) },
  // Long account/card-like numbers (9+ consecutive digits, optionally spaced/dashed)
  { regex: /\b\d[\d\s-]{8,}\d\b/g, mask: (m) => maskMiddle(m.replace(/[\s-]/g, ""), 2, 2) },
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
  for (const { regex, mask } of PATTERNS) {
    result = result.replace(regex, (match) => mask(match));
  }
  return result;
}
