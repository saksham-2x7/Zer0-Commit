/**
 * Server-side redaction — defense-in-depth for callers that hit
 * POST /api/analyze directly without going through the frontend's own
 * redaction pass. Pure and synchronous. Masks patterns that look like
 * phone numbers, UPI IDs, emails, and long account/card-like digit strings
 * before text reaches the detector, Bedrock, logs, or persistence.
 *
 * WILDLY IMPORTANT: this must stay byte-for-byte aligned with
 * frontend/src/utils/redact.js (the same rule order and the same
 * "first-2 + last-2 visible" masking). Frontend has NO separate Aadhaar rule
 * — a 12-digit match inside a 16-digit card number would leak the middle
 * digits — so backend must not add one either.
 *
 * On top of the frontend behaviour, add a normalization pass: non-ASCII digit
 * scripts (Devanagari, Bengali, Tamil, Telugu, Kannada, Malayalam, Thai,
 * Arabic-Indic, Persian/Urdu, fullwidth) are mapped to ASCII, and zero-width /
 * bidi-control characters (U+200B-U+200F, U+2060, U+FEFF) are stripped, so
 * disguised numbers are still caught. An index map keeps the masking applied
 * back onto the ORIGINAL characters.
 */

// Each entry is the code point of that script's digit zero; digits 1-9 follow.
const DIGIT_ZERO_CODE_POINTS = [
  0x0966, // Devanagari ०
  0x09e6, // Bengali ০
  0x0be6, // Tamil ௦
  0x0c66, // Telugu ౦
  0x0ce6, // Kannada ೦
  0x0d66, // Malayalam ൦
  0x0e50, // Thai ๐
  0x0660, // Arabic-Indic ٠
  0x06f0, // Persian/Urdu (Extended Arabic-Indic) ۰
  0xff10, // Fullwidth ０
];

const DIGIT_MAP = new Map();
for (const zero of DIGIT_ZERO_CODE_POINTS) {
  for (let d = 0; d <= 9; d++) {
    DIGIT_MAP.set(String.fromCodePoint(zero + d), String(d));
  }
}

// Zero-width characters plus bidi marks/word-joiner that can split a number.
const ZERO_WIDTH_CHARS = new Set([
  "\u200b",
  "\u200c",
  "\u200d",
  "\u200e",
  "\u200f",
  "\u2060",
  "\ufeff",
]);

const RULES = [
  // UPI id: name@bank
  { regex: /\b[\w.+-]{2,}@[a-zA-Z][\w-]{1,}\b/g },
  // email address
  { regex: /\b[\w.+-]{2,}@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\b/g },
  // Indian phone numbers, optionally +91/91 prefixed
  { regex: /(\+?91[\s-]?)?\b[6-9]\d{9}\b/g },
  // long account/card-like numbers (9+ consecutive digits, optionally
  // spaced/dashed). This is also what catches Aadhaar numbers and 16-digit
  // cards — the same rule the frontend relies on.
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

/**
 * Build a searchable copy of text (non-ASCII digits normalized, zero-width /
 * bidi chars removed) plus a map from each normalized index to its original
 * text index, so intervals found on the normalized text can be re-applied to
 * the original string.
 */
function normalize(text) {
  let normalized = "";
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ZERO_WIDTH_CHARS.has(ch)) {
      continue;
    }
    normalized += DIGIT_MAP.get(ch) ?? ch;
    map.push(i);
  }
  return { normalized, map };
}

function redactText(text) {
  if (typeof text !== "string" || text.length === 0) {
    return "";
  }
  const { normalized, map } = normalize(text);

  const intervals = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    for (const match of normalized.matchAll(re)) {
      const startOrig = map[match.index];
      const lastNormalized = match.index + match[0].length - 1;
      const endOrig = lastNormalized < map.length ? map[lastNormalized] + 1 : text.length;

      // Skip intervals that overlap an already-masked region.
      if (intervals.some((iv) => startOrig < iv.end && endOrig > iv.start)) {
        continue;
      }

      const masked = rule.replace ? rule.replace(match[0], match[1]) : maskMiddle(match[0]);
      intervals.push({ start: startOrig, end: endOrig, mask: masked });
    }
  }

  intervals.sort((a, b) => a.start - b.start);

  let result = "";
  let cursor = 0;
  for (const iv of intervals) {
    result += text.slice(cursor, iv.start);
    result += iv.mask;
    cursor = iv.end;
  }
  result += text.slice(cursor);
  return result;
}

module.exports = { redactText };