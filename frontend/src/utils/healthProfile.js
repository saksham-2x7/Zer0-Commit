/**
 * Local-only health profile (self-reported condition/allergy tags,
 * confirmed by the user — never auto-saved from OCR/AI suggestions).
 * Stored only in this browser; never sent to our backend except as short
 * tags in a one-off /api/food-feedback request.
 */

const STORAGE_KEY = "scamsahayak-health-profile";

export function loadHealthProfile() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHealthProfile(tags) {
  const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  } catch {
    // Ignore — profile still applies for this session, just won't persist.
  }
  return unique;
}

export function clearHealthProfile() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage isn't available.
  }
}
