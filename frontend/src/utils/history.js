/**
 * Local-only history of past checks — never sent anywhere. Stores only
 * data that was already redacted/returned by the backend (the response
 * object and the redacted text that was submitted), consistent with the
 * app's privacy model: nothing here is more sensitive than what was
 * already shown on screen.
 */

const STORAGE_KEY = "scamsahayak-history";
const MAX_ENTRIES = 20;

export function loadHistory() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry({ language, redactedText, result }) {
  const entry = {
    savedAt: new Date().toISOString(),
    language,
    redactedText: redactedText || "",
    result,
  };
  try {
    const next = [entry, ...loadHistory()].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadHistory();
  }
}

export function clearHistory() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — nothing to clean up if storage isn't available.
  }
}
