/**
 * Scam-relevant entity extraction from a raw message.
 *
 * Extracts the four entity kinds the reputation/blocklist pipeline needs:
 *   - urls: http(s):// URLs AND bare domains, including obfuscated forms
 *     (hxxp://, [.]/ (.)/ [dot], the word "dot" in place of "."). Trailing
 *     punctuation stripped, lower-cased, deduplicated.
 *   - upiIds: Indian UPI handles (local@psp) restricted to the well-known PSP
 *     families (okhdfc, axl, ybl, upi, paytm, sbi, ...) so plain email
 *     addresses are never misclassified as UPI.
 *   - phones: Indian mobile numbers (+91/91 prefix or a bare 10-digit run
 *     starting 6-9), normalized to the bare 10 digits, deduplicated.
 *   - senderHeaders: DLT sender IDs ("XX-XXXXXX" plus the optional T/P/S/G
 *     header-type letter) flagged isDlt: true, and other short alphanumeric
 *     sender-like tokens (e.g. "SBIINB", "VI-AP1") flagged isDlt: false.
 *
 * Extraction is heuristic and deliberately cheap — it feeds a fail-open
 * blocklist check, so false positives here only mean "look this up", never a
 * hard block. A plain-text message must yield all-empty arrays.
 */

const UPI_PSP_FAMILY = new Set([
  "okhdfc", "okaxis", "okicici", "okbizaxis", "okhdfcbank", "oksbi", "oksib",
  "axl", "axleb", "ybl", "yblpay", "yblservice", "upi", "paytm", "paytmqr",
  "sbi", "sbiupi", "hdfc", "icici", "axis", "aubank", "airtel", "phonepe",
  "gpay", "googlepay", "payzapp", "cred", "freecharge", "mobikwik",
]);

// All-caps English words that are message *content*, not sender ids. Guards
// non-DLT sender detection ("SBIINB" is a sender, "STOP" is not).
const NON_DLT_STOPWORDS = new Set([
  "SEND", "MONEY", "FREE", "WIN", "WON", "URGENT", "ALERT", "ALERTS", "KYC",
  "DONE", "CASH", "GIFT", "SALE", "OFFER", "PAY", "BANK", "LOAN", "CLAIM",
  "TODAY", "DEAR", "CLICK", "LINK", "REPLY", "UPDATE", "UPDATES", "NOTICE",
  "RESET", "VERIFY", "LOCKED", "STOP", "HELP", "HELLO", "YES", "NO", "INFO",
  "NEWS", "PROMO", "SMS", "OTP", "PIN", "EMI", "PLEASE", "ACT", "NOW",
  "THANK", "THANKS", "CALL", "TYPE", "TAP", "PRESS", "QUICK", "REWARD",
  "POINTS", "DETAILS", "CARD", "REGISTER", "LUCKY", "COPY", "CUT", "CHECK",
  "PROCESS", "REQUEST", "RECHARGE", "TRANSACTION", "BALANCE",
]);

// TLDs that are almost always time abbreviations, never real domains.
const TIME_TLD_STOPWORDS = new Set(["pm", "am"]);

function deobfuscate(text) {
  return text
    .replace(/hxxps:\/\//gi, "https://")
    .replace(/hxxp:\/\//gi, "http://")
    .replace(/\[\.\]/gi, ".")
    .replace(/\(\.\)/gi, ".")
    .replace(/\[dot\]/gi, ".")
    .replace(/\sdot\s/gi, ".");
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeUrl(raw) {
  let value = String(raw).trim().toLowerCase();
  value = value.replace(/[.,;:!?)\]}'"]+$/, "");
  return value;
}

function hasHttpScheme(value) {
  return /^https?:\/\//i.test(value);
}

function hostOf(value) {
  const url = hasHttpScheme(value) ? value : `http://${value}`;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function extractUrls(deobText) {
  const lower = deobText.toLowerCase();
  const urls = [];

  const schemeRe = /https?:\/\/[^\s<>"'`]+/g;
  let match;
  while ((match = schemeRe.exec(lower)) !== null) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) urls.push(normalized);
  }

  const hostSet = new Set(urls.map(hostOf).filter(Boolean));

  const bareRe =
    /(?<![a-z0-9-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24})(?![a-z0-9.-])/g;
  while ((match = bareRe.exec(lower)) !== null) {
    const raw = match[1];
    const labels = raw.split(".");
    if (labels.length < 2) continue;
    const tld = labels[labels.length - 1];
    if (TIME_TLD_STOPWORDS.has(tld)) continue;
    // Host must contain at least one ASCII letter — rejects pure-numeric
    // dotted strings like "5.30" that the regex shape would otherwise match.
    if (!/[a-z]/.test(raw.replace(/\./g, ""))) continue;
    // Drop a bare domain that is exactly the host of an already-captured
    // scheme URL ("http://example.com/x" and "example.com").
    if (hostSet.has(raw)) continue;
    const normalized = normalizeUrl(raw);
    if (normalized) urls.push(normalized);
  }

  return unique(urls);
}

function extractUpiIds(deobText) {
  const upiIds = [];
  const re = /(?<![\w@])([A-Za-z0-9][A-Za-z0-9._-]{0,37})@((?:[A-Za-z0-9-]+\.)*[A-Za-z0-9-]{2,12})(?![\w@.])/g;
  let match;
  while ((match = re.exec(deobText)) !== null) {
    const local = match[1];
    const suffix = match[2].toLowerCase();
    const suffixParts = suffix.split(".");
    const last = suffixParts[suffixParts.length - 1];
    if (!UPI_PSP_FAMILY.has(suffix) && !UPI_PSP_FAMILY.has(last)) continue;
    upiIds.push(`${local.toLowerCase()}@${suffix}`);
  }
  return unique(upiIds);
}

function normalizePhone(raw) {
  const digits = String(raw).replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? last10 : null;
}

function extractPhones(deobText) {
  const phones = [];
  const compactRe = /(?<!\d)(?:\+91[\s-]?|91[\s-]?)?([6-9]\d{9})(?!\d)/g;
  const spacedRe =
    /(?<!\d)(?:\+91[\s-]?|91[\s-]?)?([6-9]\d{2}[\s-]\d{3}[\s-]\d{4}|[6-9]\d{4}[\s-]\d{5})(?!\d)/g;
  let match;
  const pushed = new Set();

  while ((match = compactRe.exec(deobText)) !== null) {
    const normalized = normalizePhone(match[1]);
    if (normalized && !pushed.has(normalized)) {
      pushed.add(normalized);
      phones.push(normalized);
    }
  }
  while ((match = spacedRe.exec(deobText)) !== null) {
    const normalized = normalizePhone(match[1]);
    if (normalized && !pushed.has(normalized)) {
      pushed.add(normalized);
      phones.push(normalized);
    }
  }
  return phones;
}

const DLT_SHAPE = /^[A-Za-z]{2}-[A-Z0-9]{4,8}[TPSG]?$/;

function extractSenderHeaders(deobText) {
  const headers = [];
  const seen = new Set();
  const tokenRe = /(?<![A-Z0-9])([A-Z0-9]{2,5}-[A-Z0-9]{1,8}|[A-Z0-9]{4,8})(?![A-Z0-9-])/g;
  let match;
  while ((match = tokenRe.exec(deobText)) !== null) {
    const original = match[1];
    const upper = original.toUpperCase();
    if (upper.length < 4 && !upper.includes("-")) continue;
    if (/\d{4,}/.test(upper) && !upper.includes("-")) continue; // bare long number
    const key = upper.toLowerCase();
    if (seen.has(key)) continue;

    if (DLT_SHAPE.test(upper)) {
      seen.add(key);
      headers.push({ value: original, isDlt: true });
      continue;
    }

    if (upper.includes("-")) {
      if (!/[A-Z]/.test(upper)) continue; // numeric-only hyphen token, skip
      seen.add(key);
      headers.push({ value: original, isDlt: false });
      continue;
    }

    // Standalone all-caps token, e.g. "SBIINB".
    if (!/[A-Z]/.test(upper)) continue;
    if (NON_DLT_STOPWORDS.has(upper)) continue;
    seen.add(key);
    headers.push({ value: original, isDlt: false });
  }
  return headers;
}

function extractEntities(text) {
  const result = { urls: [], upiIds: [], phones: [], senderHeaders: [] };
  if (typeof text !== "string" || text.trim() === "") return result;
  const deob = deobfuscate(text);
  result.urls = extractUrls(deob);
  result.upiIds = extractUpiIds(deob);
  result.phones = extractPhones(deob);
  result.senderHeaders = extractSenderHeaders(deob);
  return result;
}

module.exports = {
  extractEntities,
  deobfuscate,
  extractUrls,
  extractUpiIds,
  extractPhones,
  extractSenderHeaders,
  normalizePhone,
};