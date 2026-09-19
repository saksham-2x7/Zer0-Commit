/**
 * Family persistence — DynamoDB in deployed ("Ship It") mode, an in-memory
 * store in local ("Build It") mode. Selected by the presence of
 * FAMILY_TABLE_NAME so the same function signature works in both (same
 * pattern as persistence/caseStore.js).
 *
 * Stored shape (one document per family):
 * {
 *   familyId, name, createdAt,
 *   members:   [{ memberId, name, role: admin|member|elder, allergies: string[], createdAt }],
 *   contacts:  [{ contactId, name, phone, note, flaggedBy, status, createdAt }],
 *   alerts:    [{ alertId, title, detail, riskLevel, createdAt, confirmedBy: string[] }],
 *   blocklist: [{ phone, addedBy, createdAt }]
 * }
 *
 * Allergies are self-reported short tags (never a medical record) and are
 * capped by the handler before they reach this store.
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

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
  return Boolean(process.env.FAMILY_TABLE_NAME);
}

function newId(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

async function saveFamily(family) {
  if (!isDeployedMode()) {
    localStore.set(family.familyId, family);
    return family;
  }
  const docClient = getDocClient();
  await docClient.send(
    new PutCommand({
      TableName: process.env.FAMILY_TABLE_NAME,
      Item: family,
    })
  );
  return family;
}

async function getFamily(familyId) {
  if (!isDeployedMode()) {
    return localStore.get(familyId) || null;
  }
  const docClient = getDocClient();
  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.FAMILY_TABLE_NAME,
      Key: { familyId },
    })
  );
  return result.Item || null;
}

async function createFamily({ name, adminName }) {
  const now = new Date().toISOString();
  const family = {
    familyId: newId("fam"),
    name,
    createdAt: now,
    members: [
      { memberId: newId("mem"), name: adminName, role: "admin", allergies: [], createdAt: now },
    ],
    contacts: [],
    alerts: [],
    blocklist: [],
  };
  await saveFamily(family);
  return family;
}

async function addMember(familyId, { name, role, allergies }) {
  const family = await getFamily(familyId);
  if (!family) {
    return null;
  }
  const member = {
    memberId: newId("mem"),
    name,
    role,
    allergies,
    createdAt: new Date().toISOString(),
  };
  family.members.push(member);
  await saveFamily(family);
  return member;
}

async function addContact(familyId, { name, phone, note, flaggedBy }) {
  const family = await getFamily(familyId);
  if (!family) {
    return null;
  }
  const contact = {
    contactId: newId("con"),
    name,
    phone,
    note,
    flaggedBy,
    status: "flagged",
    createdAt: new Date().toISOString(),
  };
  family.contacts.push(contact);
  await saveFamily(family);
  return contact;
}

async function addAlert(familyId, { title, detail, riskLevel }) {
  const family = await getFamily(familyId);
  if (!family) {
    return null;
  }
  const alert = {
    alertId: newId("alt"),
    title,
    detail,
    riskLevel,
    createdAt: new Date().toISOString(),
    confirmedBy: [],
  };
  family.alerts.push(alert);
  await saveFamily(family);
  return alert;
}

async function addBlocklistEntry(familyId, { phone, addedBy }) {
  const family = await getFamily(familyId);
  if (!family) {
    return null;
  }
  const entry = { phone, addedBy, createdAt: new Date().toISOString() };
  family.blocklist.push(entry);
  await saveFamily(family);
  return entry;
}

async function confirmAlert(familyId, alertId, memberId) {
  const family = await getFamily(familyId);
  if (!family) {
    return null;
  }
  const alert = family.alerts.find((a) => a.alertId === alertId);
  if (!alert) {
    return null;
  }
  if (!alert.confirmedBy.includes(memberId)) {
    alert.confirmedBy.push(memberId);
    await saveFamily(family);
  }
  return alert;
}

module.exports = {
  createFamily,
  getFamily,
  addMember,
  addContact,
  addAlert,
  addBlocklistEntry,
  confirmAlert,
  isDeployedMode,
};