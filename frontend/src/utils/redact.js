/**
 * Client-side redaction — masks phone numbers, UPI IDs, emails, and long
 * account-like digit strings, and strips the path/query of URLs, BEFORE
 * anything is sent to the backend. Pure and synchronous.
 *
 * Kept in sync with backend/redaction/redact.js (same rule order, same
 * "first-2 + last-2 visible" masking, same normalized-to-original mapping).
 * On top of the shared rules, the normalization pass also maps non-ASCII
 * digit disguises back to ASCII — Devanagari, Bengali, Tamil, Telugu,
 * Kannada, Malayalam, Thai, Arabic-Indic, Persian/Urdu, and fullwidth — and
 * strips zero-width / bidi control characters, so disguised numbers render
 * masked in the UI preview AND never travel unmasked over the wire.
 */

const DIGIT_BLOCKS = [
  ["\u0966", "\u096F"], // Devanagari (०-९)
  ["\u09E6", "\u09EF"], // Bengali (০-৯)
  ["\u0BE6", "\u0BEF"], // Tamil (௦-௯)
  ["\u0C66", "\u0C6F"], // Telugu (౦-౯)
  ["\u0CE6", "\u0CEF"], // Kannada (೦-೯)
  ["\u0D66", "\u0D6F"], // Malayalam (൦-൯)
  ["\u0E50", "\u0E59"], // Thai (๐-๙)
  ["\u0660", "\u0669"], // Arabic-Indic (٠-٩)
  ["\u06F0", "\u06F9"], // Persian/Urdu (۰-۹)
  ["\uFF10", "\uFF19"], // Fullwidth (０-９)
];

function buildDigitMap(blocks) {
  const map = new Map();
  for (const [start, end] of blocks) {
    const startCode = start.codePointAt(0);
    const endCode = end.codePointAt(0);
    for (let code = startCode; code <= endCode; code += 1) {
      map.set(String.fromCodePoint(code), String(code - startCode));
    }
  }
  return map;
}

const DIGIT_MAP = buildDigitMap(DIGIT_BLOCKS);

// Zero-width (ZWSP, ZWNJ, ZWJ, BOM, word joiner) and bidi (LRM, RLM) control
// characters carry no visible meaning of their own — they're widely used to
// disguise real numbers, so they are stripped before pattern matching.
const STRIP_CHARS = new Set(["\u200b", "\u200c", "\u200d", "\ufeff", "\u2060", "\u200e", "\u200f"]);

const RULES = [
  // UPI id: name@bank (checked before phone/generic digit rules so the
  // digits inside a UPI id aren't partially masked by another rule first)
  { regex: /\b[\w.+-]{2,}@[a-zA-Z][\w-]{1,}\b/g },
  // email address
  { regex: /\b[\w.+-]{2,}@[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\b/g },
  // Indian phone numbers, optionally +91/91 prefixed
  { regex: /(\+?91[\s-]?)?\b[6-9]\d{9}\b/g },
  // Long account/card/Aadhaar-like numbers (9+ consecutive digits, optionally
  // spaced/dashed). A 12-digit Aadhaar match inside a 16-digit card number
  // would leak the middle digits — this single rule covers both.
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
 * Build a searchable copy of the text (disguised digits normalized to ASCII,
 * zero-width/bidi chars removed) plus a map from each normalized index back to
 * its original text index, so intervals found on the normalized text can be
 * re-applied to the original string.
 */
function normalize(text) {
  let normalized = "";
  const map = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (STRIP_CHARS.has(ch)) {
      continue;
    }
    const digit = DIGIT_MAP.get(ch);
    normalized += digit !== undefined ? digit : ch;
    map.push(i);
  }
  return { normalized, map };
}

export function redactText(text) {
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