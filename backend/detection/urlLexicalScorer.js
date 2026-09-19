/**
 * URL lexical risk scorer. Pure JavaScript, zero dependencies, no network.
 * Port of PhishGuard's feature set (MIT). Flags phishing-looking URLs based
 * only on their lexical shape so the caller can explain WHY (explainability).
 *
 * Export signature (stable, used by the main scam detector):
 *   scoreUrl(url) -> { score, risk, features }
 *     score:     number 0..100 (higher = more suspicious)
 *     risk:      "low" | "medium" | "high"
 *     features:  object of individual feature flags/values
 */

const BRAND_TOKENS = [
  "sbi",
  "hdfc",
  "icici",
  "axis",
  "paytm",
  "phonepe",
  "phone",
  "google",
  "microsoft",
  "amazon",
  "flipkart",
  "irctc",
  "aadhaar",
  "upi",
  "paypal",
];

const OFFICIAL_DOMAINS = new Set([
  "sbi.co.in",
  "onlinesbi.sbi",
  "hdfcbank.com",
  "icicibank.com",
  "axisbank.com",
  "paytm.com",
  "phonepe.com",
  "google.com",
  "google.co.in",
  "microsoft.com",
  "amazon.in",
  "amazon.com",
  "flipkart.com",
  "irctc.co.in",
  "uidai.gov.in",
  "india.gov.in",
]);

const SUSPICIOUS_TLDS = new Set([
  "tk",
  "ml",
  "ga",
  "cf",
  "gq",
  "xyz",
  "top",
  "icu",
  "buzz",
  "click",
  "link",
  "info",
]);

// Two-part public suffixes so registrable-domain extraction stays correct for
// sbi.co.in, uidai.gov.in, etc.
const MULTI_PART_TLDS = new Set([
  "co.in",
  "net.in",
  "org.in",
  "gen.in",
  "firm.in",
  "ind.in",
  "ac.in",
  "edu.in",
  "gov.in",
  "res.in",
  "mil.in",
  "nic.in",
  "govt.in",
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "com.br",
  "co.jp",
  "co.kr",
  "com.sg",
  "com.my",
  "co.za",
  "com.pk",
  "com.np",
]);

// Feature weights. IP host and brand impersonation weigh heaviest per spec.
const WEIGHTS = {
  has_ip_address: 35,
  brand_impersonation: 40,
  brand_in_subdomain: 30,
  punycode: 30,
  has_at_symbol: 20,
  suspicious_tld: 20,
  many_query_params: 15,
  has_hyphen_in_domain: 12,
  double_slash_in_path: 12,
  subdomain_count_suspicious: 12,
  digit_in_domain: 10,
  url_entropy_suspicious: 10,
  https_absent: 10,
  long_url: 8,
};

const ENTROPY_THRESHOLD = 4.0;
const MAX_SCORE = 100;

function shannonEntropy(str) {
  const counts = new Map();
  for (const ch of str) {
    counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  const len = str.length || 1;
  let h = 0;
  for (const count of counts.values()) {
    const p = count / len;
    h -= p * Math.log2(p);
  }
  return Math.round(h * 100) / 100;
}

function isIpv4(host) {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

// Leetspeak pass: digits that stand in for letters (paypa1 -> paypal).
function normalizeHost(host) {
  return host
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b");
}

function containsBrand(str) {
  const lower = str.toLowerCase();
  const normalized = normalizeHost(lower);
  for (const token of BRAND_TOKENS) {
    if (lower.includes(token)) return token;
    if (normalized !== lower && normalized.includes(token)) return token;
  }
  return null;
}

// Registrable domain: sbi.co.in -> sbi.co.in; www.google.com -> google.com.
function partitionHost(hostname) {
  const labels = hostname.split(".");
  if (labels.length < 2) {
    return { registrable: hostname, subdomainPart: "", domainNamePart: labels[0] || "", regLabelCount: 1 };
  }
  const multi = MULTI_PART_TLDS.has(labels.slice(-2).join("."));
  const regLabelCount = multi ? Math.min(3, labels.length) : Math.min(2, labels.length);
  const registrable = labels.slice(labels.length - regLabelCount).join(".");
  // Part used for digit/hyphen checks: everything except the final TLD label.
  const domainNamePart = labels.slice(0, labels.length - 1).join(".");
  const subdomainPart = labels.slice(0, labels.length - regLabelCount).join(".");
  return { registrable, subdomainPart, domainNamePart, regLabelCount };
}

function scoreUrl(url) {
  const urlStr = typeof url === "string" ? url : String(url ?? "");

  let parsed = null;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    try {
      parsed = new URL("http://" + urlStr);
    } catch (err2) {
      return {
        score: 0,
        risk: "low",
        features: {
          has_ip_address: false,
          url_entropy: shannonEntropy(urlStr),
          subdomain_count: 0,
          has_hyphen_in_domain: false,
          digit_count: 0,
          digit_ratio: 0,
          digit_in_domain: false,
          suspicious_tld: false,
          brand_impersonation: false,
          long_url: urlStr.length > 75,
          many_query_params: false,
          has_at_symbol: urlStr.includes("@"),
          double_slash_in_path: false,
          punycode: /[^\x00-\x7F]/.test(urlStr),
          https_absent: true,
          brand_in_subdomain: false,
        },
      };
    }
  }

  const host = parsed.hostname.toLowerCase();
  const isIp = isIpv4(host);

  const features = {
    has_ip_address: isIp,
    url_entropy: shannonEntropy(urlStr),
    subdomain_count: 0,
    has_hyphen_in_domain: false,
    digit_count: 0,
    digit_ratio: 0,
    digit_in_domain: false,
    suspicious_tld: false,
    brand_impersonation: false,
    long_url: urlStr.length > 75,
    many_query_params: Array.from(parsed.searchParams.keys()).length >= 3,
    has_at_symbol: urlStr.includes("@"),
    double_slash_in_path: parsed.pathname.startsWith("//"),
    punycode: /[^\x00-\x7F]/.test(urlStr) || host.split(".").some((l) => l.startsWith("xn--")),
    https_absent: parsed.protocol !== "https:",
    brand_in_subdomain: false,
  };

  let registrable = host;
  if (!isIp) {
    const parts = partitionHost(host);
    registrable = parts.registrable;
    features.subdomain_count = host.split(".").length - parts.regLabelCount;
    features.has_hyphen_in_domain = parts.domainNamePart.includes("-");
    features.digit_count = (parts.domainNamePart.match(/\d/g) || []).length;
    features.digit_ratio =
      parts.domainNamePart.length > 0
        ? Math.round((features.digit_count / parts.domainNamePart.length) * 100) / 100
        : 0;
    features.digit_in_domain = features.digit_count > 0;
    features.suspicious_tld = SUSPICIOUS_TLDS.has(host.split(".").pop());

    if (parts.subdomainPart) {
      const subBrand = containsBrand(parts.subdomainPart);
      const regHasBrand = containsBrand(parts.registrable);
      features.brand_in_subdomain = subBrand !== null && regHasBrand === null;
    }
  }

  const clean = OFFICIAL_DOMAINS.has(registrable.toLowerCase());
  if (!clean) {
    features.brand_impersonation = containsBrand(host) !== null;
  }

  if (clean) {
    return { score: 0, risk: "low", features };
  }

  let score = 0;
  if (features.has_ip_address) score += WEIGHTS.has_ip_address;
  if (features.brand_impersonation) score += WEIGHTS.brand_impersonation;
  if (features.brand_in_subdomain) score += WEIGHTS.brand_in_subdomain;
  if (features.punycode) score += WEIGHTS.punycode;
  if (features.has_at_symbol) score += WEIGHTS.has_at_symbol;
  if (features.suspicious_tld) score += WEIGHTS.suspicious_tld;
  if (features.many_query_params) score += WEIGHTS.many_query_params;
  if (features.has_hyphen_in_domain) score += WEIGHTS.has_hyphen_in_domain;
  if (features.double_slash_in_path) score += WEIGHTS.double_slash_in_path;
  if (features.subdomain_count > 2) score += WEIGHTS.subdomain_count_suspicious;
  if (features.digit_in_domain) score += WEIGHTS.digit_in_domain;
  if (features.url_entropy >= ENTROPY_THRESHOLD) score += WEIGHTS.url_entropy_suspicious;
  if (features.https_absent) score += WEIGHTS.https_absent;
  if (features.long_url) score += WEIGHTS.long_url;
  score = Math.min(MAX_SCORE, Math.round(score));

  const risk = score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  return { score, risk, features };
}

module.exports = { scoreUrl };