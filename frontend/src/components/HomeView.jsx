import { t } from "../i18n/translations";
import Icon from "./icons";

const ACTIONS = [
  { key: "actionText", icon: "check", target: "check" },
  { key: "actionPhoto", icon: "download", target: "check" },
  { key: "actionQr", icon: "history", target: "check" },
];

const FAMILY_ACTIONS = [
  { key: "familyAction", icon: "family", target: "family" },
  { key: "foodAction", icon: "shoppingBag", target: "food" },
  { key: "chatAction", icon: "chat", target: "chat" },
];

const GUARANTEED_DATA = ["id", "phone", "otp"];

export default function HomeView({ language, onNavigate, history = [], onSelectHistory }) {
  return (
    <div className="space-y-10">
      <section className="panel-inverse p-8">
        <p className="text-sm font-black uppercase tracking-widest">
          {t(language, "page.home.systemHealth")}
        </p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-tight tracking-tight">
          {t(language, "page.home.heroTitle")}
        </h1>
        <p className="mt-3 max-w-xl text-lg">{t(language, "page.home.heroSub")}</p>
        <p className="mt-3 text-sm opacity-80">{t(language, "page.home.systemHealthBody")}</p>
        <button
          type="button"
          className="btn-inverse touch-target mt-6"
          onClick={() => onNavigate("check")}
        >
          <Icon icon="check" className="h-6 w-6" />
          {t(language, "common.openChecker")}
        </button>
      </section>

      <section aria-label={t(language, "page.home.safetyGuarantee")} className="space-y-4">
        <h2 className="text-2xl font-black uppercase tracking-wide">
          {t(language, "page.home.safetyGuarantee")}
        </h2>
        <div className="card space-y-4">
          <p className="text-lg font-black uppercase tracking-widest">
            {t(language, "page.home.dataPrivate")}
          </p>
          <ul className="flex flex-wrap gap-3">
            {GUARANTEED_DATA.map((item) => (
              <li
                key={item}
                className="touch-target gap-2 border border-ink px-4 py-2 font-bold"
              >
                <span className="font-mono font-black uppercase text-cobalt">
                  {t(language, "common.hidden")}
                </span>
                <span>{t(language, `page.home.data.${item}`)}</span>
              </li>
            ))}
          </ul>
          <p>{t(language, "page.home.dataClosing")}</p>
        </div>
      </section>

      <section aria-label={t(language, "page.home.actionText.title")} className="grid gap-4 sm:grid-cols-3">
        {ACTIONS.map(({ key, icon }) => (
          <button
            type="button"
            key={key}
            className="card touch-target flex-col items-start gap-3 text-left hover:bg-ink hover:text-on-ink"
            onClick={() => onNavigate("check")}
          >
            <Icon icon={icon} className="h-7 w-7" />
            <span className="text-lg font-black uppercase tracking-wide">
              {t(language, `page.home.${key}.title`)}
            </span>
            <span className="text-sm">{t(language, `page.home.${key}.desc`)}</span>
          </button>
        ))}
      </section>

      <section aria-label={t(language, "page.home.familyFeatures")} className="space-y-4">
        <h2 className="text-2xl font-black uppercase tracking-wide">
          {t(language, "page.home.familyFeatures")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {FAMILY_ACTIONS.map(({ key, icon, target }) => (
            <button
              type="button"
              key={key}
              className="card touch-target flex-col items-start gap-3 text-left hover:bg-ink hover:text-on-ink"
              onClick={() => onNavigate(target)}
            >
              <Icon icon={icon} className="h-7 w-7" />
              <span className="text-lg font-black uppercase tracking-wide">
                {t(language, `page.home.${key}.title`)}
              </span>
              <span className="text-sm">{t(language, `page.home.${key}.desc`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-black uppercase tracking-wide">
          {t(language, "page.home.recentChecks")}
        </h2>
        <ul className="space-y-3">
          {(history.length > 0
            ? history.slice(0, 3).map((entry) => {
                const verdict = String(
                  entry.result?.verdict || entry.result?.riskLevel || ""
                ).toUpperCase();
                return {
                  text: entry.redactedText || entry.result?.rawText || "",
                  ago: entry.savedAt ? new Date(entry.savedAt).toLocaleString(language) : "",
                  badge:
                    verdict === "HIGH"
                      ? t(language, "vocab.highRisk")
                      : verdict === "MEDIUM"
                        ? t(language, "vocab.mediumRisk")
                        : t(language, "vocab.safe"),
                  tone:
                    verdict === "HIGH"
                      ? "bg-risk-high"
                      : verdict === "MEDIUM"
                        ? "bg-risk-medium"
                        : "bg-risk-low",
                  entry,
                };
              })
            : [
                {
                  text: t(language, "page.home.historyItem1"),
                  ago: t(language, "page.home.checkedAgo1"),
                  badge: t(language, "vocab.highRisk"),
                  tone: "bg-risk-high",
                },
                {
                  text: t(language, "page.home.historyItem2"),
                  ago: t(language, "page.home.checkedAgo2"),
                  badge: t(language, "vocab.safe"),
                  tone: "bg-risk-low",
                },
              ]
          ).map((entry, index) => (
            <li key={index} className="card flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">{entry.text}</p>
                <p className="text-sm text-muted">{entry.ago}</p>
              </div>
              <div className="flex flex-none items-center gap-3">
                <span className={`risk-chip ${entry.tone}`}>
                  {entry.badge}
                </span>
                {entry.entry && onSelectHistory && (
                  <button
                    type="button"
                    className="touch-target gap-2 border border-ink px-4 text-xs font-black uppercase tracking-widest hover:bg-ink hover:text-on-ink"
                    onClick={() => onSelectHistory(entry.entry)}
                  >
                    {t(language, "common.saveEvidence")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="border border-ink p-8">
        <h2 className="text-2xl font-black uppercase tracking-wide">
          {t(language, "page.home.report")}
        </h2>
        <p className="mt-2">{t(language, "page.home.reportBody")}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => onNavigate("report")}
            className="btn-primary touch-target"
          >
            <Icon icon="shieldCheck" className="h-6 w-6" />
            {t(language, "page.home.startReport")}
          </button>
          <a
            href="tel:1930"
            className="btn-secondary touch-target"
          >
            <Icon icon="phone" className="h-6 w-6" />
            {t(language, "page.home.call1930")}
          </a>
          <a
            href="https://cybercrime.gov.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary touch-target"
          >
            <Icon icon="share" className="h-6 w-6" />
            {t(language, "page.home.govtPortal")}
          </a>
        </div>
      </section>
    </div>
  );
}