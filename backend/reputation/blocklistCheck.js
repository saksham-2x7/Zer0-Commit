/**
 * Blocklist reputation checker backed by a DynamoDB table.
 *
 * Looks up the entities extracted by backend/detection/entityExtractor.js
 * (domains — registrable domain AND full host —, UPI ids, Indian phone
 * numbers) against the BlocklistTable. The table's partition key is the
 * entity `value` (string); each item carries `type` ("domain"|"url"|"upi"|
 * "phone"), `source` ("urlhaus"|"phishtank"|"manual") and `listedAt` (ISO).
 *
 * FAIL-OPEN contract: any AWS error (or a missing table name) resolves to
 * `{ checked: false, hits: [] }` and never throws, so the analyze flow is
 * never blocked by a blocklist outage — an outage just means "no signal".
 *
 * Lookups batch 100 keys per BatchGetItem call (the API limit).
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchGetCommand } = require("@aws-sdk/lib-dynamodb");

// Two-part public suffixes common enough that the registrable domain needs
// three labels ("example.co.in", "example.co.uk"). Kept small on purpose —
// for detection a single missed suffix shrinks one lookup, not a block.
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

function domainFromUrl(raw) {
  let value = String(raw || "").trim().toLowerCase();
  if (value === "") return "";
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

/**
 * Reduces extracted entities to the set of DynamoDB lookup keys.
 * @param {{ urls?: string[], upiIds?: string[], phones?: string[] }} entities
 * @returns {string[]}
 */
function buildLookupKeys(entities) {
  const keys = new Set();
  const urls = Array.isArray(entities && entities.urls) ? entities.urls : [];
  for (const raw of urls) {
    const host = domainFromUrl(raw);
    if (host) {
      keys.add(host);
      keys.add(registrableDomain(host));
    }
  }
  const upiIds = Array.isArray(entities && entities.upiIds) ? entities.upiIds : [];
  for (const upi of upiIds) {
    const value = String(upi).toLowerCase().trim();
    if (value) keys.add(value);
  }
  const phones = Array.isArray(entities && entities.phones) ? entities.phones : [];
  for (const phone of phones) {
    const digits = String(phone).replace(/\D/g, "");
    const last10 = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10)) keys.add(last10);
  }
  return [...keys];
}

/**
 * @param {{ urls?: string[], upiIds?: string[], phones?: string[] }} entities
 *   entity output from extractEntities (sender headers are not checked).
 * @param {string} tableName DynamoDB table holding the blocklist.
 * @returns {Promise<{ checked: boolean, hits: Array<{ type, value, source, listedAt }> }>}
 */
async function checkBlocklist(entities, tableName) {
  if (!tableName) {
    return { checked: false, hits: [] };
  }

  const keys = buildLookupKeys(entities);
  if (keys.length === 0) {
    return { checked: true, hits: [] };
  }

  const docClient = getDocClient();
  try {
    const hits = [];
    for (const group of chunk(keys, 100)) {
      const response = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: group.map((value) => ({ value })),
            },
          },
        })
      );
      const items = (response.Responses && response.Responses[tableName]) || [];
      for (const item of items) {
        hits.push({
          type: item.type || "unknown",
          value: item.value,
          source: item.source || null,
          listedAt: item.listedAt || null,
        });
      }
    }
    return { checked: true, hits };
  } catch (error) {
    console.warn("Blocklist check failed, failing open:", error.name || error.message);
    return { checked: false, hits: [] };
  }
}

module.exports = {
  checkBlocklist,
  buildLookupKeys,
  domainFromUrl,
  registrableDomain,
};