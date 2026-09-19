/**
 * Family last-known-location persistence — DynamoDB in deployed ("Ship It")
 * mode, an in-memory Map in local ("Build It") mode. Selected by the presence
 * of LOCATIONS_TABLE_NAME, the same pattern as family/familyStore.js.
 *
 * One item per family member, upserted on every share, auto-expired after 24
 * hours via the DynamoDB TTL attribute (`ttl`, epoch seconds). Local mode
 * does not expire rows.
 *
 * Stored shape (partition key `pk = loc#<familyId>#<memberId>`):
 * { pk, familyId, memberId, name, lat, lng, accuracy, updatedAt, ttl }
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const localStore = new Map();

const LOCATION_TTL_SECONDS = 86400;

let cachedDocClient = null;
function getDocClient() {
  if (!cachedDocClient) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });
    cachedDocClient = DynamoDBDocumentClient.from(client);
  }
  return cachedDocClient;
}

function isDeployedMode() {
  return Boolean(process.env.LOCATIONS_TABLE_NAME);
}

function locationKey(familyId, memberId) {
  return `loc#${familyId}#${memberId}`;
}

function nowEpochSeconds(now) {
  return Math.floor(now.getTime() / 1000);
}

function toPublicShape(item) {
  return {
    familyId: item.familyId,
    memberId: item.memberId,
    name: item.name,
    lat: item.lat,
    lng: item.lng,
    accuracy: item.accuracy,
    updatedAt: item.updatedAt,
  };
}

async function upsertLocation(familyId, memberId, { name, lat, lng, accuracy }) {
  const now = new Date();
  const item = {
    pk: locationKey(familyId, memberId),
    familyId,
    memberId,
    name,
    lat,
    lng,
    accuracy,
    updatedAt: now.toISOString(),
    ttl: nowEpochSeconds(now) + LOCATION_TTL_SECONDS,
  };
  if (!isDeployedMode()) {
    localStore.set(item.pk, item);
    return item;
  }
  const docClient = getDocClient();
  await docClient.send(
    new PutCommand({
      TableName: process.env.LOCATIONS_TABLE_NAME,
      Item: item,
    })
  );
  return item;
}

async function deleteLocation(familyId, memberId) {
  const pk = locationKey(familyId, memberId);
  if (!isDeployedMode()) {
    localStore.delete(pk);
    return true;
  }
  const docClient = getDocClient();
  await docClient.send(
    new DeleteCommand({
      TableName: process.env.LOCATIONS_TABLE_NAME,
      Key: { pk },
    })
  );
  return true;
}

async function getFamilyLocations(familyId) {
  const prefix = `loc#${familyId}#`;
  if (!isDeployedMode()) {
    return [...localStore.values()]
      .filter((item) => item.pk.startsWith(prefix))
      .map(toPublicShape)
      .sort((a, b) => a.memberId.localeCompare(b.memberId));
  }
  const docClient = getDocClient();
  const items = [];
  let LastEvaluatedKey;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: process.env.LOCATIONS_TABLE_NAME,
        FilterExpression: "begins_with(pk, :prefix)",
        ExpressionAttributeValues: { ":prefix": prefix },
        ExclusiveStartKey: LastEvaluatedKey,
      })
    );
    items.push(...(result.Items || []));
    LastEvaluatedKey = result.LastEvaluatedKey;
  } while (LastEvaluatedKey);
  return items
    .filter((item) => item.pk.startsWith(prefix))
    .map(toPublicShape)
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
}

/** Test hook — clears in-memory state between tests. */
function clearStore() {
  localStore.clear();
}

module.exports = {
  upsertLocation,
  deleteLocation,
  getFamilyLocations,
  isDeployedMode,
  clearStore,
};