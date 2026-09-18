import { t } from "../i18n/translations";

export default function ThemeToggle({ language, theme, onToggle }) {
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={onToggle}
      aria-label={t(language, "themeToggleAria")}
    >
      {theme === "dark" ? t(language, "themeToggleToLight") : t(language, "themeToggleToDark")}
    </button>
  );
}
