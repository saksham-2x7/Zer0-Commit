import { describe, test, expect, afterEach } from "vitest";
import { t, translations, detectNavigatorLanguage } from "./translations";

const LANGS = ["en", "hi", "ta", "te", "bn", "mr"];

describe("translations parity", () => {
  test("every language defines exactly the same keys as English", () => {
    const enKeys = Object.keys(translations.en);
    for (const lang of LANGS) {
      const keys = Object.keys(translations[lang]);
      const missing = enKeys.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !enKeys.includes(k));
      expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] });
    }
  });

  test("every value is a non-empty string, array, or non-empty-string object", () => {
    for (const lang of LANGS) {
      for (const key of Object.keys(translations[lang])) {
        const value = translations[lang][key];
        const valid =
          (typeof value === "string" && value.trim().length > 0) ||
          (Array.isArray(value) && value.length > 0) ||
          (value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            Object.values(value).every(
              (v) => typeof v === "string" && v.trim().length > 0
            ));
        expect(valid, `${lang}.${key} must be non-empty strings, arrays, or string objects`).toBe(true);
      }
    }
  });

  test("list- and map-valued keys exist in every language", () => {
    for (const lang of LANGS) {
      expect(Array.isArray(translations[lang].helpSteps)).toBe(true);
      expect(translations[lang].helpSteps.length).toBeGreaterThan(0);
      expect(
        translations[lang].patternNames &&
          typeof translations[lang].patternNames === "object" &&
          Object.keys(translations[lang].patternNames).length > 0
      ).toBe(true);
    }
  });
});

describe("t() fallback", () => {
  test("falls back to English then the raw key", () => {
    const allKeys = Object.keys(translations.en);
    const key = allKeys[allKeys.length - 1];
    expect(t("zz", key)).toBe(translations.en[key]);
    expect(t("zz", "no.such.key")).toBe("no.such.key");
  });
});

describe("detectNavigatorLanguage", () => {
  const originalLanguage = window.navigator.language;
  const originalLanguages = window.navigator.languages;

  afterEach(() => {
    Object.defineProperty(window.navigator, "language", {
      value: originalLanguage,
      configurable: true,
    });
    Object.defineProperty(window.navigator, "languages", {
      value: originalLanguages,
      configurable: true,
    });
  });

  function setNavigatorLanguage(tag) {
    Object.defineProperty(window.navigator, "language", {
      value: tag,
      configurable: true,
    });
    Object.defineProperty(window.navigator, "languages", {
      value: [tag],
      configurable: true,
    });
  }

  test("maps a supported locale to that language", () => {
    setNavigatorLanguage("hi-IN");
    expect(detectNavigatorLanguage()).toBe("hi");
  });

  test("maps an unsupported locale to English", () => {
    setNavigatorLanguage("de-DE");
    expect(detectNavigatorLanguage()).toBe("en");
  });

  test("handles a missing navigator.language", () => {
    setNavigatorLanguage("");
    expect(detectNavigatorLanguage()).toBe("en");
  });
});