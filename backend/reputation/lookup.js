/**
 * Online reputation lookup — checks whether a phone number or website domain
 * mentioned in a message has public reports of fraud/scam.
 *
 * Privacy model:
 * - Domains are extracted from the ALREADY-REDACTED text (redactText keeps
 *   the domain, strips the path), so domain lookups never touch personal data.
 * - Phone numbers are NEVER extracted server-side. The frontend only sends
 *   them in `lookupPhones` when the user explicitly opts in ("check this
 *   number online"), and they are used solely to build the search query.
 * - Raw numbers are never logged, persisted, or included in responses.
 *
 * Providers (first available wins):
 * 1. SerpAPI (SERPAPI_KEY env var) — Google results, best quality.
 * 2. DuckDuckGo Instant Answer API — keyless fallback, no signup.
 * Both run under a short timeout and degrade gracefully: any failure returns
 * { available: false, reason: "error" } so the rest of the pipeline is never
 * blocked by the network.
 */

const DEFAULT_TIMEOUT_MS = 4000;
const MAX_ENTITIES = 3;
const MAX_FINDINGS_PER_ENTITY = 3;

// Keywords that mark a finding as a fraud/scam report. English + Hindi.
const SCAM_KEYWORDS = [
  "scam",
  "fraud",
  "fraudulent",
  "cheat",
  "cheating",
  "fake",
  "spam",
  "phishing",
  "cybercrime",
  "complaint",
  "घोटाला",
  "धोखा",
  "फर्जी",
  "ठग",
  "साइबर अपराध",
];

function extractDomains(text) {
  if (typeof text !== "string") return [];
  const seen = new Set();
  const domains = [];
  const re = /https?:\/\/([^\s/?#]+)/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    const host = match[1].toLowerCase().replace(/^www\./, "");
    if (host && !seen.has(host)) {
      seen.add(host);
      domains.push(host);
    }
  }
  return domains;
}

function normalizePhones(phones) {
  if (!Array.isArray(phones)) return [];
  const seen = new Set();
  const normalized = [];
  for (const raw of phones) {
    const digits = String(raw).replace(/[^\d]/g, "");
    // Indian numbers: 10 digits, optionally +91/91 prefixed (12 digits).
    const valid = /^(?:\+?91)?[6-9]\d{9}$/.test(digits) || /^[6-9]\d{9}$/.test(digits);
    if (!valid) continue;
    const key = digits.slice(-10);
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(digits);
    }
  }
  return normalized.slice(0, MAX_ENTITIES);
}

function isScamFinding(title, snippet) {
  const haystack = `${title || ""} ${snippet || ""}`.toLowerCase();
  return SCAM_KEYWORDS.some((kw) => haystack.includes(kw.toLowerCase()));
}

function summarize(entities) {
  const totalFindings = entities.reduce((sum, e) => sum + e.findings.length, 0);
  const scamFindings = entities.reduce(
    (sum, e) => sum + e.findings.filter((f) => f.scamRelated).length,
    0
  );
  if (totalFindings === 0) {
    return "No public reports found for the checked number or website.";
  }
  if (scamFindings > 0) {
    return `Online search found ${scamFindings} report(s) mentioning fraud or scam for the checked number or website.`;
  }
  return "Online search found no fraud or scam reports for the checked number or website.";
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchSerpApi(query, timeoutMs) {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}`;
  const data = await fetchWithTimeout(url, timeoutMs);
  const results = Array.isArray(data.organic_results) ? data.organic_results : [];
  return results.map((r) => ({
    title: String(r.title || ""),
    snippet: String(r.snippet || ""),
    url: String(r.link || ""),
  }));
}

async function searchDuckDuckGo(query, timeoutMs) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const data = await fetchWithTimeout(url, timeoutMs);
  const findings = [];
  if (data.AbstractText) {
    findings.push({
      title: data.Heading || "Summary",
      snippet: String(data.AbstractText),
      url: String(data.AbstractURL || ""),
    });
  }
  const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
  for (const topic of topics) {
    if (topic.Topics) {
      for (const sub of topic.Topics) {
        if (sub.Text) {
          findings.push({ title: sub.Text, snippet: sub.Text, url: String(sub.FirstURL || "") });
        }
      }
    } else if (topic.Text) {
      findings.push({ title: topic.Text, snippet: topic.Text, url: String(topic.FirstURL || "") });
    }
  }
  return findings;
}

/**
 * @param {object} input
 * @param {string} input.redactedText - redacted text; domains are extracted from it
 * @param {string[]} [input.lookupPhones] - user-consented phone numbers (digits only)
 * @param {number} [input.timeoutMs]
 * @returns {Promise<{ available: boolean, reason: string, checkedAt: string,
 *   entities: Array<{type: string, value: string, findings: Array<{title, snippet, url, scamRelated}>}>,
 *   summary: string }>}
 */
async function lookupReputation({ redactedText, lookupPhones, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const domains = extractDomains(redactedText);
  const phones = normalizePhones(lookupPhones);

  const entities = [
    ...phones.map((p) => ({ type: "phone", value: p })),
    ...domains.map((d) => ({ type: "domain", value: d })),
  ].slice(0, MAX_ENTITIES);

  if (entities.length === 0) {
    return { available: false, reason: "no_entities", checkedAt: new Date().toISOString(), entities: [], summary: "" };
  }

  const hasSerpKey = Boolean(process.env.SERPAPI_KEY);
  const search = hasSerpKey ? searchSerpApi : searchDuckDuckGo;

  try {
    const results = await Promise.all(
      entities.map(async (entity) => {
        const query =
          entity.type === "phone"
            ? `+${entity.value} scam fraud report`
            : `${entity.value} scam fraud report`;
        const findings = await search(query, timeoutMs);
        return {
          ...entity,
          findings: findings.slice(0, MAX_FINDINGS_PER_ENTITY).map((f) => ({
            ...f,
            scamRelated: isScamFinding(f.title, f.snippet),
          })),
        };
      })
    );

    return {
      available: true,
      reason: "ok",
      checkedAt: new Date().toISOString(),
      entities: results,
      summary: summarize(results),
    };
  } catch (error) {
    console.error("Reputation lookup failed, degrading gracefully:", error.name || "UnknownError");
    return { available: false, reason: "error", checkedAt: new Date().toISOString(), entities: [], summary: "" };
  }
}

module.exports = { lookupReputation, extractDomains, normalizePhones, isScamFinding, summarize };