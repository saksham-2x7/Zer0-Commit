/**
 * Scheduled Lambda handler that keeps the blocklist table fresh from free
 * public threat feeds.
 *
 *   - URLhaus CSV (keyless): https://urlhaus.abuse.ch/downloads/csv/
 *   - PhishTank online-valid CSV (only when PHISHTANK_API_KEY is set):
 *     https://data.phishtank.com/data/<key>/online-valid.csv
 *
 * Parsed with plain Node (no new deps): a small CSV row parser tolerant of
 * quoted commas, the URLhaus/PhishTank comment headers, and hxxps/hxxp URL
 * schemas. Every unique registrable domain becomes a BlocklistTable row
 * (PK "value", attributes type="domain", source, listedAt) written with
 * BatchWriteItem in chunks of 25.
 *
 * FAIL-OPEN contract: a feed fetch or write failure logs a warning and
 * returns { synced: 0, error: "..." } — it never throws and never blocks the
 * analyze flow. URLhaus is the primary source; when it fails the refresh
 * aborts, when only PhishTank fails the URLhaus data is still written.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const URLHAUS_FEED_URL = "https://urlhaus.abuse.ch/downloads/csv/";
const PHISHTANK_FEED_URL = (apiKey) =>
  `https://data.phishtank.com/data/${encodeURIComponent(apiKey)}/online-valid.csv`;

const FETCH_TIMEOUT_MS = 45000;
const WRITE_BATCH_SIZE = 25;

// Same two-part suffix list as backend/reputation/blocklistCheck.js.
const MULTI_PART_SUFFIXES = new Set([
  "co.in", "ac.in", "net.in", "org.in", "gov.in", "res.in", "edu.in",
  "co.uk", "ac.uk", "org.uk", "gov.uk", "com.au", "co.jp", "co.nz", "com.br",
]);

let cachedDocClient = null;
function getDocClient() {
  if (!cachedDocClient) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });
    cachedDocClient = DynamoDBDocumentClient.from(client);
  }
  return cachedDocClient;
}

function chunk(values, size) {
  const groups = [];
  for (let i = 0; i < values.length; i += size) {
    groups.push(values.slice(i, i + size));
  }
  return groups;
}

function parseCsvRow(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsvRows(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"))
    .map(parseCsvRow);
}

function domainFromUrl(raw) {
  let value = String(raw || "").trim().toLowerCase();
  if (value === "") return "";
  value = value.replace(/hxxps:\/\//g, "https://").replace(/hxxp:\/\//g, "http://");
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(value)) value = `http://${value}`;
  try {
    return new URL(value).hostname.replace(/\.$/, "");
  } catch {
    return "";
  }
}

function registrableDomain(host) {
  const stripped = String(host || "").toLowerCase().replace(/^www\./, "");
  const labels = stripped.split(".").filter(Boolean);
  if (labels.length === 0) return "";
  if (labels.length < 2) return stripped;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }
  return lastTwo;
}

function entriesFromCsv(text, source, urlColumnIndex) {
  const listedAt = new Date().toISOString();
  const rows = parseCsvRows(text);
  const seen = new Set();
  const entries = [];
  for (const row of rows) {
    if (row.length <= urlColumnIndex) continue;
    const cell = String(row[urlColumnIndex]).trim().toLowerCase();
    if (cell === "" || cell === "url") continue; // header row
    const host = domainFromUrl(cell);
    if (!host) continue;
    const value = registrableDomain(host);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    entries.push({ value, type: "domain", source, listedAt });
  }
  return entries;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "ScamSahayak-BlocklistSync/0.1 (FirstCommit x AWS hackathon)",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function writeBlocklist(tableName, entries) {
  const docClient = getDocClient();
  let written = 0;
  for (const group of chunk(entries, WRITE_BATCH_SIZE)) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: group.map((entry) => ({ PutRequest: { Item: entry } })),
        },
      })
    );
    written += group.length;
  }
  return written;
}

/**
 * @param {object} [event] - schedule event; unused, kept for the Lambda shape.
 * @returns {Promise<{ synced: number, sources: Array<{ name: string, entries: number }>, error?: string }>}
 */
async function handler(event) {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    return { synced: 0, error: "TABLE_NAME not set", sources: [] };
  }

  const sources = [];
  const deduped = new Set();
  const entries = [];

  const addEntries = (feedEntries, sourceName) => {
    const added = [];
    for (const entry of feedEntries) {
      if (deduped.has(entry.value)) continue;
      deduped.add(entry.value);
      entries.push(entry);
      added.push(entry);
    }
    sources.push({ name: sourceName, entries: added.length });
  };

  try {
    const urlhausCsv = await fetchText(URLHAUS_FEED_URL);
    const urlhausEntries = entriesFromCsv(urlhausCsv, "urlhaus", 2);
    addEntries(urlhausEntries, "urlhaus");
  } catch (error) {
    console.warn("URLhaus blocklist sync failed, skipping refresh:", error.name || error.message);
    return { synced: 0, error: `urlhaus: ${error.message || error.name}`, sources };
  }

  const phishtankKey = process.env.PHISHTANK_API_KEY;
  if (phishtankKey) {
    try {
      const phishtankCsv = await fetchText(PHISHTANK_FEED_URL(phishtankKey));
      const phishtankEntries = entriesFromCsv(phishtankCsv, "phishtank", 1);
      addEntries(phishtankEntries, "phishtank");
    } catch (error) {
      console.warn("PhishTank blocklist sync failed, continuing with URLhaus only:", error.name || error.message);
      sources.push({ name: "phishtank", entries: 0, error: error.message || error.name });
    }
  }

  if (entries.length === 0) {
    return { synced: 0, sources };
  }

  try {
    const synced = await writeBlocklist(tableName, entries);
    return { synced, sources };
  } catch (error) {
    console.warn("Blocklist table write failed, failing open:", error.name || error.message);
    return { synced: 0, error: `dynamodb: ${error.message || error.name}`, sources };
  }
}

module.exports = {
  handler,
  parseCsvRow,
  parseCsvRows,
  domainFromUrl,
  registrableDomain,
  entriesFromCsv,
  chunk,
  URLHAUS_FEED_URL,
  PHISHTANK_FEED_URL,
};