import { useState } from "react";
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
  const [preparingDownload, setPreparingDownload] = useState(false);
  const patternNames = t(language, "patternNames");
  const evidenceByPattern = new Map((result.evidence || []).map((e) => [e.pattern, e.snippet]));

  async function handleDownload() {
    // Ship It mode: the backend already stored a redacted bundle in S3 and
    // returned a short-lived signed URL — use that instead of rebuilding
    // locally, so the downloaded copy matches what's actually on record.
    if (result.evidenceBundle?.available && result.evidenceBundle?.downloadUrl) {
      setPreparingDownload(true);
      window.open(result.evidenceBundle.downloadUrl, "_blank", "noopener,noreferrer");
      setPreparingDownload(false);
      return;
    }

    // Build It fallback: build and download the same redacted bundle
    // client-side (documented in CONTRACT.md).
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
        <p className="mt-2 text-sm italic text-slate-500">
          {result.riskDisclaimer || t(language, "riskDisclaimer")}
        </p>

        <div className="mt-4">
          <h3 className="font-semibold text-slate-700">{t(language, "matchedPatternsHeading")}</h3>
          {result.matchedPatterns?.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {result.matchedPatterns.map((pattern) => (
                <li key={pattern} className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium text-slate-800">{patternNames[pattern] || pattern}</p>
                  {evidenceByPattern.get(pattern) && (
                    <p className="mt-1 whitespace-pre-wrap break-words font-mono text-sm text-slate-600">
                      "{evidenceByPattern.get(pattern)}"
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate-600">{t(language, "noPatternsFound")}</p>
          )}
        </div>

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
        <button
          type="button"
          className="btn-secondary flex-1"
          onClick={handleDownload}
          disabled={preparingDownload}
        >
          {preparingDownload ? t(language, "downloadingEvidenceButton") : t(language, "downloadEvidenceButton")}
        </button>
        <button type="button" className="btn-primary flex-1" onClick={onStartOver}>
          {t(language, "startOverButton")}
        </button>
      </div>

      <p className="text-center text-sm text-slate-500">{t(language, "disclaimer")}</p>
    </div>
  );
}
