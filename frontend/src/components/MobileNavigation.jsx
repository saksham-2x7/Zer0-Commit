import { t } from "../i18n/translations";
import Icon from "./icons";

const NAV_ITEMS = ["home", "check", "history", "health", "settings"];

// Fixed bottom bar for phones (hidden md+ where the Header nav takes over).
export default function MobileNavigation({ language, activeView, onNavigate }) {
  return (
    <nav
      aria-label={t(language, "navmobile.navLabel")}
      className="mobile-nav no-print fixed inset-x-0 bottom-0 z-40 border-t border-ink bg-paper text-ink md:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {NAV_ITEMS.map((id) => {
          const active = id === activeView;
          return (
            <li key={id} className="flex flex-1">
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                className={`touch-target flex-1 flex-col gap-1 text-[11px] font-black uppercase tracking-widest transition-colors ${
                  active ? "bg-ink text-on-ink" : ""
                }`}
                onClick={() => onNavigate(id)}
              >
                <Icon icon={id} className="h-6 w-6" />
                {t(language, `navmobile.${id}`)}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}