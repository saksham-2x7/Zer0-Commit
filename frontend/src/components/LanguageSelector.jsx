import { t, LANGUAGE_NAMES } from "../i18n/translations";

export default function LanguageSelector({ language, onChange, className }) {
  return (
    <select
      className={`btn-secondary cursor-pointer appearance-none bg-paper pr-8 max-w-[110px] ${className ?? ""}`}
      value={language}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t(language, "selectLanguageLabel")}
    >
      {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </select>
  );
}
