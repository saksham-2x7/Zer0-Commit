import { useEffect, useState } from "react";
import { t, translations, detectNavigatorLanguage } from "../i18n/translations";

const STORAGE_KEY = "scamsahayak-language";

function getInitialLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && translations[stored]) return stored;
  } catch {
    // localStorage unavailable — fall through to the navigator default.
  }
  // Match the main UI on first run: pick up the browser's language instead of
  // unconditionally starting in English.
  return detectNavigatorLanguage();
}

/** Manages the UI language: persists the choice and keeps <html lang> + <title> in sync. */
export function useLanguage() {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t(language, "docTitle");
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Ignore — language still applies for this session, just won't persist.
    }
  }, [language]);

  return { language, setLanguage };
}