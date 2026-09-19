/**
 * Talks to the backend per backend/api/CONTRACT.md. Never hardcode the API
 * URL — always read VITE_API_BASE_URL.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function post(path, body, signal) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  return handleResponse(response);
}

async function get(path, signal) {
  const response = await fetch(`${BASE_URL}${path}`, { signal });
  return handleResponse(response);
}

async function handleResponse(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError = data && data.error;
    const error = new Error((apiError && apiError.message) || `Request failed with status ${response.status}`);
    if (apiError && apiError.code) {
      error.code = apiError.code;
    }
    throw error;
  }

  return data;
}

export function analyzeMessage(
  { language, inputType, rawText, imageBase64, imageMimeType, onlineLookup, lookupPhones },
  signal
) {
  return post(
    "/api/analyze",
    { language, inputType, rawText, imageBase64, imageMimeType, onlineLookup, lookupPhones },
    signal
  );
}

/** OCR-only — used by the health-profile feature. No scam analysis, nothing persisted. */
export function ocrImage({ imageBase64, imageMimeType }) {
  return post("/api/ocr", { imageBase64, imageMimeType });
}

/** Suggests candidate health tags from OCR'd/typed text — never auto-saved, always reviewed by the user first. */
export function extractHealthTags({ text, language }) {
  return post("/api/health-tags", { text, language });
}

/** Conversational feedback on a scanned product against confirmed health tags. Not medical advice. */
export function getFoodFeedback({ language, healthTags, product }) {
  return post("/api/food-feedback", { language, healthTags, product });
}

/**
 * Guided scam-reporting flow. Call once with the description (+ optional
 * messages/screenshots) to get the analysis and follow-up questions, then
 * again with the answers to get the final step-by-step reporting guide.
 */
export function submitReport({ language, description, messages, screenshots, answers }, signal) {
  return post("/api/report", { language, description, messages, screenshots, answers }, signal);
}

// ---------------------------------------------------------------------------
// Family circle
// ---------------------------------------------------------------------------

export function createFamily({ name, adminName }) {
  return post("/api/family/create", { name, adminName });
}

export function getFamily(familyId) {
  return get(`/api/family/${familyId}`);
}

export function addFamilyMember({ familyId, name, role, allergies }) {
  return post("/api/family/members", { familyId, name, role, allergies });
}

export function addFamilyContact({ familyId, name, phone, note, flaggedBy }) {
  return post("/api/family/contacts", { familyId, name, phone, note, flaggedBy });
}

export function addFamilyAlert({ familyId, title, detail, riskLevel }) {
  return post("/api/family/alerts", { familyId, title, detail, riskLevel });
}

export function confirmFamilyAlert({ familyId, alertId, memberId }) {
  return post("/api/family/alerts/confirm", { familyId, alertId, memberId });
}

export function addFamilyBlocklist({ familyId, phone, addedBy }) {
  return post("/api/family/blocklist", { familyId, phone, addedBy });
}

// ---------------------------------------------------------------------------
// Food / product lookup (family-wide allergen flags)
// ---------------------------------------------------------------------------

export function foodLookup({ barcode, familyId }) {
  return post("/api/food-lookup", { barcode, familyId });
}

// ---------------------------------------------------------------------------
// Family chat (zero-knowledge E2E)
// ---------------------------------------------------------------------------

export function registerMessagingKey({ memberId, publicKeyJwk }) {
  return post("/api/messaging/keys", { memberId, publicKeyJwk });
}

export function getMessagingKey(memberId) {
  return get(`/api/messaging/keys/${memberId}`);
}

export function createMessagingThread({ name, memberIds }) {
  return post("/api/messaging/threads", { name, memberIds });
}

export function storeWrappedKey({ threadId, memberId, wrappedKey, iv, ownerPublicKeyId }) {
  return post(`/api/messaging/threads/${threadId}/keys`, { memberId, wrappedKey, iv, ownerPublicKeyId });
}

export function sendMessage({ threadId, senderId, iv, ciphertext }) {
  return post(`/api/messaging/threads/${threadId}/messages`, { senderId, iv, ciphertext });
}

export function listThreads() {
  return get("/api/messaging/threads");
}

export function listMessages(threadId) {
  return get(`/api/messaging/threads/${threadId}/messages`);
}
