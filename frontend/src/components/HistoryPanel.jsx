import { t } from "../i18n/translations";

const RISK_LABEL_KEYS = { high: "riskHigh", medium: "riskMedium", low: "riskLow" };
const RISK_DOT = { high: "bg-risk-high", medium: "bg-risk-medium", low: "bg-risk-low" };

export default function HistoryPanel({ language, history, onSelect, onClear, onBack }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t(language, "historyHeading")}</h2>
        <button type="button" className="btn-secondary" onClick={onBack}>
          {t(language, "historyBackButton")}
        </button>
      </div>

      {history.length === 0 ? (
        <p className="text-slate-600 dark:text-slate-300">{t(language, "historyEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li key={`${entry.result.caseId}-${entry.savedAt}`}>
              <button
                type="button"
                aria-label={t(language, "historyItemAria")}
                className="w-full rounded-lg border border-slate-200 p-3 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
                onClick={() => onSelect(entry)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full ${RISK_DOT[entry.result.riskLevel] || RISK_DOT.low}`}
                      aria-hidden="true"
                    />
                    {t(language, RISK_LABEL_KEYS[entry.result.riskLevel] || "riskLow")}
                  </span>
                  <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {new Date(entry.savedAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">
                  {entry.redactedText || "—"}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <button type="button" className="btn-secondary w-full" onClick={onClear}>
          {t(language, "historyClearButton")}
        </button>
      )}
    </div>
  );
}
