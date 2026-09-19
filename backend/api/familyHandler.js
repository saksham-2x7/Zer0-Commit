/**
 * Family circle API — shared suspicious contacts, alerts, and member
 * health/allergy tags. Every mutation validates input before it reaches the
 * store; unknown families are a NOT_FOUND contract error.
 *
 * Allergies are self-reported short tags (never a medical record) with the
 * same caps as food feedback (<= MAX_TAGS tags, <= 60 chars per tag).
 */

const { ApiError } = require("./errors");
const { wrapHandler } = require("./handlerUtils");
const {
  createFamily,
  getFamily,
  addMember,
  addContact,
  addAlert,
  confirmAlert,
} = require("../family/familyStore");

const MAX_NAME_LENGTH = 60;
const MAX_PHONE_LENGTH = 20;
const MAX_NOTE_LENGTH = 200;
const MAX_TITLE_LENGTH = 80;
const MAX_DETAIL_LENGTH = 300;
const MAX_TAGS = 15;
const MAX_TAG_LENGTH = 60;

const ROLES = ["admin", "member", "elder"];
const RISK_LEVELS = ["low", "medium", "high"];

function requireString(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError("INVALID_REQUEST", `${field} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new ApiError("INPUT_TOO_LARGE", `${field} must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function optionalString(value, field, maxLength) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return requireString(value, field, maxLength);
}

function requireFamilyId(body) {
  return requireString(body.familyId, "familyId", 64);
}

function validateAllergies(allergies) {
  if (allergies === undefined || allergies === null) {
    return [];
  }
  if (!Array.isArray(allergies)) {
    throw new ApiError("INVALID_REQUEST", "allergies must be an array of strings.");
  }
  if (allergies.length > MAX_TAGS) {
    throw new ApiError("INPUT_TOO_LARGE", `At most ${MAX_TAGS} allergy tags are supported.`);
  }
  const cleaned = [];
  for (const tag of allergies) {
    if (typeof tag !== "string" || tag.trim().length === 0) {
      throw new ApiError("INVALID_REQUEST", "Each allergy tag must be a non-empty string.");
    }
    if (tag.length > MAX_TAG_LENGTH) {
      throw new ApiError("INPUT_TOO_LARGE", `Each allergy tag must be at most ${MAX_TAG_LENGTH} characters.`);
    }
    cleaned.push(tag.trim());
  }
  return [...new Set(cleaned)];
}

async function requireExistingFamily(familyId) {
  const family = await getFamily(familyId);
  if (!family) {
    throw new ApiError("NOT_FOUND", "Family not found.");
  }
  return family;
}

async function createFamilyHandler(body) {
  const name = requireString(body.name, "name", MAX_NAME_LENGTH);
  const adminName = requireString(body.adminName, "adminName", MAX_NAME_LENGTH);
  const family = await createFamily({ name, adminName });
  return { familyId: family.familyId, family };
}

async function addMemberHandler(body) {
  const familyId = requireFamilyId(body);
  await requireExistingFamily(familyId);
  const name = requireString(body.name, "name", MAX_NAME_LENGTH);
  const role = body.role || "member";
  if (!ROLES.includes(role)) {
    throw new ApiError("INVALID_REQUEST", `role must be one of: ${ROLES.join(", ")}.`);
  }
  const allergies = validateAllergies(body.allergies);
  const member = await addMember(familyId, { name, role, allergies });
  return { member };
}

async function addContactHandler(body) {
  const familyId = requireFamilyId(body);
  await requireExistingFamily(familyId);
  const name = requireString(body.name, "name", MAX_NAME_LENGTH);
  const phone = requireString(body.phone, "phone", MAX_PHONE_LENGTH);
  const note = optionalString(body.note, "note", MAX_NOTE_LENGTH);
  const flaggedBy = requireString(body.flaggedBy, "flaggedBy", 64);
  const contact = await addContact(familyId, { name, phone, note, flaggedBy });
  return { contact };
}

async function addAlertHandler(body) {
  const familyId = requireFamilyId(body);
  await requireExistingFamily(familyId);
  const title = requireString(body.title, "title", MAX_TITLE_LENGTH);
  const detail = optionalString(body.detail, "detail", MAX_DETAIL_LENGTH);
  const riskLevel = body.riskLevel || "medium";
  if (!RISK_LEVELS.includes(riskLevel)) {
    throw new ApiError("INVALID_REQUEST", `riskLevel must be one of: ${RISK_LEVELS.join(", ")}.`);
  }
  const alert = await addAlert(familyId, { title, detail, riskLevel });
  return { alert };
}

async function confirmAlertHandler(body) {
  const familyId = requireFamilyId(body);
  const alertId = requireString(body.alertId, "alertId", 64);
  const memberId = requireString(body.memberId, "memberId", 64);
  const alert = await confirmAlert(familyId, alertId, memberId);
  if (!alert) {
    throw new ApiError("NOT_FOUND", "Alert not found.");
  }
  return { alert };
}

async function getFamilyHandler(body) {
  const familyId = requireFamilyId(body);
  const family = await requireExistingFamily(familyId);
  return { family };
}

exports.handler = wrapHandler(getFamilyHandler, "familyHandler");

exports.createFamily = wrapHandler(createFamilyHandler, "familyHandler");
exports.addMember = wrapHandler(addMemberHandler, "familyHandler");
exports.addContact = wrapHandler(addContactHandler, "familyHandler");
exports.addAlert = wrapHandler(addAlertHandler, "familyHandler");
exports.confirmAlert = wrapHandler(confirmAlertHandler, "familyHandler");
exports.getFamily = wrapHandler(getFamilyHandler, "familyHandler");

exports.createFamilyHandler = createFamilyHandler;
exports.addMemberHandler = addMemberHandler;
exports.addContactHandler = addContactHandler;
exports.addAlertHandler = addAlertHandler;
exports.confirmAlertHandler = confirmAlertHandler;
exports.getFamilyHandler = getFamilyHandler;