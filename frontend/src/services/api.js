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

export function analyzeMessage({ language, inputType, rawText, imageBase64, imageMimeType }, signal) {
  return post("/api/analyze", { language, inputType, rawText, imageBase64, imageMimeType }, signal);
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
