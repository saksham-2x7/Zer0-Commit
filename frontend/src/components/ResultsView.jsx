import { t } from "../i18n/translations";
import ReportingBlock from "./ReportingBlock";
import { buildEvidenceBundle, downloadEvidenceBundle } from "../utils/evidenceBundle";

const RISK_STYLES = {
  high: "bg-risk-high text-white",
  medium: "bg-risk-medium text-white",
  low: "bg-risk-low text-white",
};

const RISK_LABEL_KEYS = {
  high: "riskHigh",
  medium: "riskMedium",
  low: "riskLow",
};

export default function ResultsView({ language, result, redactedText, onStartOver }) {
  const patternNames = t(language, "patternNames");

  function handleDownload() {
    const bundle = buildEvidenceBundle({ result, redactedText, language });
    downloadEvidenceBundle(bundle);
  }

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{t(language, "resultsHeading")}</h2>
          <span
            className={`rounded-full px-4 py-1 text-sm font-semibold ${RISK_STYLES[result.riskLevel] || RISK_STYLES.low}`}
          >
            {t(language, RISK_LABEL_KEYS[result.riskLevel] || "riskLow")}
          </span>
        </div>

        {result.matchedPatterns?.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold text-slate-700">{t(language, "matchedPatternsHeading")}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
              {result.matchedPatterns.map((pattern) => (
                <li key={pattern}>{patternNames[pattern] || pattern}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <h3 className="font-semibold text-slate-700">{t(language, "explanationHeading")}</h3>
          <p className="mt-1 text-slate-700">{result.explanation}</p>
        </div>

        <div className="mt-4">
          <h3 className="font-semibold text-slate-700">{t(language, "checklistHeading")}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
            {result.checklist?.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <ReportingBlock language={language} reportingLinks={result.reportingLinks} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" className="btn-secondary flex-1" onClick={handleDownload}>
          {t(language, "downloadEvidenceButton")}
        </button>
        <button type="button" className="btn-primary flex-1" onClick={onStartOver}>
          {t(language, "startOverButton")}
        </button>
      </div>

      <p className="text-center text-sm text-slate-500">{t(language, "disclaimer")}</p>
    </div>
  );
}
