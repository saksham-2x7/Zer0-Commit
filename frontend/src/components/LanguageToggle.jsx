import { t } from "../i18n/translations";

export default function LanguageToggle({ language, onChange }) {
  const nextLanguage = language === "hi" ? "en" : "hi";

  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => onChange(nextLanguage)}
      aria-label="Toggle language"
    >
      {t(language, "languageToggleLabel")}
    </button>
  );
}
