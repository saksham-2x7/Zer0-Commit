/**
 * Family location API — share/stop a member's last-known location with the
 * family circle. Location rows are ephemeral (24h TTL in the store) and
 * deliberately decoupled from FamilyTable: the Lambda never needs family
 * config to upsert a point.
 *
 * Every mutation validates input before it reaches the store; the response
 * shapes match backend/api/CONTRACT.md.
 */

const { ApiError } = require("./errors");
const { wrapHandler } = require("./handlerUtils");
const {
  upsertLocation,
  deleteLocation,
  getFamilyLocations,
} = require("../location/locationStore");

const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 60;

function requireString(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError("INVALID_REQUEST", `${field} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new ApiError("INPUT_TOO_LARGE", `${field} must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function requireCoordinate(value, field, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ApiError("INVALID_REQUEST", `${field} must be a number between ${min} and ${max}.`);
  }
  return value;
}

function optionalAccuracy(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ApiError("INVALID_REQUEST", "accuracy must be a non-negative number.");
  }
  return value;
}

async function shareLocationHandler(body) {
  const familyId = requireString(body.familyId, "familyId", MAX_ID_LENGTH);
  const memberId = requireString(body.memberId, "memberId", MAX_ID_LENGTH);
  const name = requireString(body.name, "name", MAX_NAME_LENGTH);
  const lat = requireCoordinate(body.lat, "lat", -90, 90);
  const lng = requireCoordinate(body.lng, "lng", -180, 180);
  const accuracy = optionalAccuracy(body.accuracy);

  await upsertLocation(familyId, memberId, { name, lat, lng, accuracy });
  return { ok: true };
}

async function stopLocationHandler(body) {
  const familyId = requireString(body.familyId, "familyId", MAX_ID_LENGTH);
  const memberId = requireString(body.memberId, "memberId", MAX_ID_LENGTH);

  await deleteLocation(familyId, memberId);
  return { ok: true };
}

async function getFamilyLocationsHandler(body) {
  const familyId = requireString(body.familyId, "familyId", MAX_ID_LENGTH);
  const members = await getFamilyLocations(familyId);
  return { members };
}

exports.handler = wrapHandler(getFamilyLocationsHandler, "locationHandler");

exports.share = wrapHandler(shareLocationHandler, "locationHandler");
exports.stop = wrapHandler(stopLocationHandler, "locationHandler");
exports.family = wrapHandler(getFamilyLocationsHandler, "locationHandler");

exports.shareLocationHandler = shareLocationHandler;
exports.stopLocationHandler = stopLocationHandler;
exports.getFamilyLocationsHandler = getFamilyLocationsHandler;