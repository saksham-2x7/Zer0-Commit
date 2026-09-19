/**
 * Case persistence — DynamoDB in deployed ("Ship It") mode, an in-memory
 * store in local ("Build It") mode. Selected by the presence of
 * CASES_TABLE_NAME so the same function signature works in both. Only ever
 * stores the REDACTED case record below — never raw text, raw images, or
 * raw OCR output.
 *
 * Stored shape (schemaVersion 1.0):
 * {
 *   caseId, createdAt, language, inputType, riskLevel, matchedPatterns,
 *   evidence, ocrUsed, redactionApplied, generationMode, schemaVersion,
 *   ttl
 * }
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const localStore = new Map();

let cachedDocClient = null;
function getDocClient() {
  if (!cachedDocClient) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });
    cachedDocClient = DynamoDBDocumentClient.from(client);
  }
  return cachedDocClient;
}

function isDeployedMode() {
  return Boolean(process.env.CASES_TABLE_NAME);
}

function retentionSeconds() {
  const days = Number(process.env.EVIDENCE_RETENTION_DAYS);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
  return safeDays * 86400;
}

/**
 * @param {object} record - the redacted case record (see shape above)
 */
async function saveCase(record) {
  const item = {
    ...record,
    schemaVersion: record.schemaVersion || "1.0",
    ttl: Math.floor(Date.now() / 1000) + retentionSeconds(),
  };

  if (!isDeployedMode()) {
    localStore.set(item.caseId, item);
    return item;
  }

  const docClient = getDocClient();
  await docClient.send(
    new PutCommand({
      TableName: process.env.CASES_TABLE_NAME,
      Item: item,
    })
  );
  return item;
}

function getLocalCase(caseId) {
  return localStore.get(caseId);
}

module.exports = { saveCase, getLocalCase, isDeployedMode };
