import { useState } from "react";
import { t } from "../i18n/translations";
import ThemeToggle from "./ThemeToggle";
import TextSizeToggle from "./TextSizeToggle";
import LanguageSelector from "./LanguageSelector";

export default function SettingsView({
  language,
  theme,
  onToggleTheme,
  textSize,
  onCycleTextSize,
  onLanguageChange,
}) {
  const [savedStatus, setSavedStatus] = useState(false);

  function requestLight() {
    if (theme === "dark") onToggleTheme();
  }

  function requestDark() {
    if (theme === "light") onToggleTheme();
  }

  function handleSave() {
    setSavedStatus(true);
    window.alert(t(language, "dialog.saved"));
  }

  function handleReset() {
    if (window.confirm(t(language, "dialog.resetConfirm"))) {
      window.location.reload();
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-black uppercase tracking-wide">{t(language, "page.settings.title")}</h1>
        <p className="mt-2 max-w-2xl text-lg">{t(language, "page.settings.sub")}</p>
      </section>

      <section className="card space-y-6">
        <h2 className="text-xl font-black uppercase tracking-wide">
          {t(language, "page.settings.language")}
        </h2>
        <LanguageSelector language={language} onChange={onLanguageChange} />
      </section>

      <section className="card space-y-6">
        <h2 className="text-xl font-black uppercase tracking-wide">
          {t(language, "page.settings.display")}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            id="btn-light-mode"
            aria-pressed={theme === "light"}
            className={`touch-target border border-ink px-6 text-lg font-bold ${
              theme === "light" ? "bg-ink text-on-ink" : "hover:bg-ink hover:text-on-ink"
            }`}
            onClick={requestLight}
          >
            {t(language, "common.theme.light")}
          </button>
          <button
            type="button"
            id="btn-dark-mode"
            aria-pressed={theme === "dark"}
            className={`touch-target border border-ink px-6 text-lg font-bold ${
              theme === "dark" ? "bg-ink text-on-ink" : "hover:bg-ink hover:text-on-ink"
            }`}
            onClick={requestDark}
          >
            {t(language, "common.theme.dark")}
          </button>
          <ThemeToggle language={language} theme={theme} onToggle={onToggleTheme} />
          <TextSizeToggle language={language} textSize={textSize} onCycle={onCycleTextSize} />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-black uppercase tracking-wide">
          {t(language, "page.settings.howWeProtect")}
        </h2>
        <p>{t(language, "page.settings.howWeProtectBody")}</p>
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl font-black uppercase tracking-wide">
          {t(language, "page.settings.quickActions")}
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn-secondary flex-1">
            {t(language, "page.settings.manageBlockList")}
          </button>
          <button type="button" className="btn-secondary flex-1">
            {t(language, "page.settings.editFamily")}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          id="btn-save"
          className="btn-primary flex-1"
          onClick={handleSave}
        >
          {t(language, "page.settings.save")}
        </button>
        <button type="button" id="btn-reset" className="btn-secondary flex-1" onClick={handleReset}>
          {t(language, "page.settings.reset")}
        </button>
      </section>

      <p role="status" aria-live="polite" className="sr-only">
        {savedStatus ? t(language, "dialog.saved") : ""}
      </p>
    </div>
  );
}