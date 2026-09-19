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
        <p className="text-muted">{t(language, "historyEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li key={`${entry.result.caseId}-${entry.savedAt}`}>
              <button
                type="button"
                aria-label={t(language, "historyItemAria")}
                className="w-full border border-ink p-3 text-left transition hover:bg-soft"
                onClick={() => onSelect(entry)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className={`inline-block h-3 w-3 ${RISK_DOT[entry.result.riskLevel] || RISK_DOT.low}`}
                      aria-hidden="true"
                    />
                    {t(language, RISK_LABEL_KEYS[entry.result.riskLevel] || "riskLow")}
                  </span>
                  <span className="text-sm tabular-nums text-muted">
                    {new Date(entry.savedAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-muted">
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
