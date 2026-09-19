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
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3 md:gap-x-3 md:py-4">
        <button
          type="button"
          className="touch-target flex-none gap-3 text-left"
          onClick={() => onNavigate("home")}
        >
          <span className="flex items-center gap-2 md:gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center border border-strong md:h-11 md:w-11">
              <Icon icon="check" className="h-4 w-4 md:h-6 md:w-6" />
            </span>
            <span className="text-base font-black tracking-tight md:text-2xl">{t(language, "appTitle")}</span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-1 md:ml-auto md:gap-2">
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
        </div>

        <div className="flex flex-wrap items-center gap-1 md:gap-2">
          <TextSizeToggle language={language} textSize={textSize} onCycle={onCycleTextSize} />
          <LanguageSelector language={language} onChange={onLanguageChange} />
        </div>
      </div>

      <nav
        aria-label={t(language, "header.navLabel")}
        className="no-print hidden overflow-x-auto border-t border-ink md:block"
      >
        <ul className="mx-auto flex max-w-6xl items-stretch gap-1 px-4">
          {NAV_ITEMS.map(({ id, icon }) => {
            const active = id === activeView;
            return (
              <li key={id} className="flex">
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={`touch-target gap-2 whitespace-nowrap border-b border-transparent px-3 py-2 text-sm font-black uppercase tracking-widest transition-colors ${
                    active
                      ? "border-strong bg-ink text-on-ink"
                      : "hover:border-strong"
                  }`}
                  onClick={() => onNavigate(id)}
                >
                  <Icon icon={icon} className="hidden h-5 w-5 lg:inline-block" />
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