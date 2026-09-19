import { t } from "../i18n/translations";
import LanguageSelector from "./LanguageSelector";
import TextSizeToggle from "./TextSizeToggle";
import Icon from "./icons";

const NAV_ITEMS = [
  { id: "home", icon: "home" },
  { id: "check", icon: "check" },
  { id: "family", icon: "family" },
  { id: "food", icon: "shoppingBag" },
  { id: "chat", icon: "chat" },
  { id: "history", icon: "history" },
  { id: "health", icon: "health" },
  { id: "settings", icon: "settings" },
];

export default function Header({
  language,
  activeView,
  onNavigate,
  theme,
  onToggleTheme,
  textSize,
  onCycleTextSize,
  onLanguageChange,
}) {
  return (
    <header className="border-b border-ink bg-paper text-ink">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5">
        <button
          type="button"
          className="touch-target gap-3 text-left"
          onClick={() => onNavigate("home")}
        >
          <span className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center border border-strong">
              <Icon icon="check" className="h-6 w-6" />
            </span>
            <span className="text-2xl font-black tracking-tight">{t(language, "appTitle")}</span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={t(language, "header.help")}
            className="touch-target border border-ink px-3"
            onClick={() => onNavigate("help")}
          >
            <Icon icon="help" className="h-6 w-6" />
          </button>
          <button
            type="button"
            id="theme-toggle"
            aria-label={t(language, "themeToggleAria")}
            className="touch-target border border-ink px-3"
            onClick={onToggleTheme}
          >
            <Icon icon={theme === "dark" ? "moon" : "sun"} className="h-6 w-6" />
          </button>
          <TextSizeToggle language={language} textSize={textSize} onCycle={onCycleTextSize} />
          <LanguageSelector language={language} onChange={onLanguageChange} />
        </div>
      </div>

      <nav
        aria-label={t(language, "header.navLabel")}
        className="no-print hidden border-t border-ink md:block"
      >
        <ul className="mx-auto flex max-w-5xl items-stretch gap-1 px-4">
          {NAV_ITEMS.map(({ id, icon }) => {
            const active = id === activeView;
            return (
              <li key={id} className="flex">
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={`touch-target gap-2 border-b border-transparent px-4 py-2 text-sm font-black uppercase tracking-widest transition-colors ${
                    active
                      ? "border-strong bg-ink text-on-ink"
                      : "hover:border-strong"
                  }`}
                  onClick={() => onNavigate(id)}
                >
                  <Icon icon={icon} className="h-5 w-5" />
                  {t(language, `header.${id}`)}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}