import { useEffect, useState } from "react";
import { t } from "../i18n/translations";
import ReportingBlock from "./ReportingBlock";
import { buildEvidenceBundle, downloadEvidenceBundle } from "../utils/evidenceBundle";
import { isSpeechSynthesisSupported, speak, stopSpeaking } from "../utils/speech";

const RISK_STYLES = {
  high: "risk-badge risk-badge-high",
  medium: "risk-badge risk-badge-medium",
  low: "risk-badge risk-badge-low",
};

const RISK_ICONS = {
  high: "!",
  medium: "!",
  low: "✓",
};

const RISK_LABEL_KEYS = {
  high: "riskHigh",
  medium: "riskMedium",
  low: "riskLow",
};

export default function ResultsView({ language, result, redactedText, onStartOver }) {
  const [preparingDownload, setPreparingDownload] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hasSpoken, setHasSpoken] = useState(false);
  const patternNames = t(language, "patternNames");
  const evidenceByPattern = new Map((result.evidence || []).map((e) => [e.pattern, e.snippet]));

  useEffect(() => {
    // Stop any in-progress read-aloud when the result changes or unmounts.
    return () => stopSpeaking();
  }, [result]);

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

  function handleToggleReadAloud() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const riskLabel = t(language, RISK_LABEL_KEYS[result.riskLevel] || "riskLow");
    const spokenText = [riskLabel, result.explanation, ...(result.checklist || [])].join(". ");
    // Reset the button state as soon as speech actually ends (or fails).
    speak(spokenText, language, () => setSpeaking(false));
    setSpeaking(true);
    setHasSpoken(true);
  }

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{t(language, "resultsHeading")}</h2>
          <span
            role="status"
            className={`inline-flex items-center gap-2 ${RISK_STYLES[result.riskLevel] || RISK_STYLES.low}`}
          >
            <span aria-hidden="true" className="text-lg font-black leading-none">
              {RISK_ICONS[result.riskLevel] || RISK_ICONS.low}
            </span>
            {t(language, RISK_LABEL_KEYS[result.riskLevel] || "riskLow")}
          </span>
        </div>
        <p className="mt-2 text-sm italic text-slate-500 dark:text-slate-400">
          {result.riskDisclaimer || t(language, "riskDisclaimer")}
        </p>

        {isSpeechSynthesisSupported() && (
          <>
            <button type="button" className="btn-secondary mt-3" onClick={handleToggleReadAloud}>
              {speaking ? t(language, "stopReadingButton") : t(language, "readAloudButton")}
            </button>
            <p className="sr-only" aria-live="polite" data-testid="speech-status">
              {speaking
                ? t(language, "speechStatusReading")
                : hasSpoken
                  ? t(language, "speechStatusStopped")
                  : ""}
            </p>
          </>
        )}

        <div className="mt-4">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">
            {t(language, "matchedPatternsHeading")}
          </h3>
          {result.matchedPatterns?.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {result.matchedPatterns.map((pattern) => (
                <li key={pattern} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {patternNames[pattern] || pattern}
                  </p>
                  {evidenceByPattern.get(pattern) && (
                    <p className="mt-1 whitespace-pre-wrap break-words font-mono text-sm text-slate-600 dark:text-slate-400">
                      "{evidenceByPattern.get(pattern)}"
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate-600 dark:text-slate-300">{t(language, "noPatternsFound")}</p>
          )}
        </div>

        <div className="mt-4">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">
            {t(language, "explanationHeading")}
          </h3>
          <p className="mt-1 text-slate-700 dark:text-slate-300">{result.explanation}</p>
        </div>

        <div className="mt-4">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">
            {t(language, "checklistHeading")}
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
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

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">{t(language, "disclaimer")}</p>
    </div>
  );
}
