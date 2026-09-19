import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/translations";
import ReportingBlock from "./ReportingBlock";
import { buildEvidenceBundle, downloadEvidenceBundle } from "../utils/evidenceBundle";
import { isSpeechSynthesisSupported, speak, stopSpeaking } from "../utils/speech";
import Icon from "./icons";

// Design-spec §3.4 — redesigned results sub-page: risk-score banner, stat
// cards, numbered "Why is this a scam?" rows, safety/redaction section, and
// sticky sidebar with Next Steps + Check Progress.

const RISK_BORDER = {
  high: "border-l-[var(--color-risk-high)]",
  medium: "border-l-[var(--color-risk-medium)]",
  low: "border-l-[var(--color-risk-low)]",
};

const RISK_SCORE_KEY = {
  high: "page.results.score.high",
  medium: "page.results.score.medium",
  low: "page.results.score.low",
};

const RISK_BADGE_KEY = {
  high: "page.results.badge",
  medium: "vocab.mediumRisk",
  low: "vocab.lowRisk",
};

const RISK_LABEL_KEYS = {
  high: "riskHigh",
  medium: "riskMedium",
  low: "riskLow",
};

const PATTERN_REASON_KEY = {
  urgency: "page.results.reason.urgency",
  otp_request: "page.results.reason.otp_request",
  screen_share_request: "page.results.reason.screen_share_request",
  suspicious_link: "page.results.reason.suspicious_link",
  impersonation: "page.results.reason.impersonation",
  suspicious_collect_request: "page.results.reason.suspicious_collect_request",
};

const VERDICT_KEY = {
  scam: "results.verdictScam",
  legit: "results.verdictLegit",
  uncertain: "results.verdictUncertain",
};

export default function ResultsView({ language, result, redactedText, onStartOver, onViewEvidence }) {
  const [preparingDownload, setPreparingDownload] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hasSpoken, setHasSpoken] = useState(false);
  const headingRef = useRef(null);
  const patternNames = t(language, "patternNames");
  const evidenceByPattern = new Map((result.evidence || []).map((e) => [e.pattern, e.snippet]));
  const matchedPatterns = result.matchedPatterns || [];
  const reputation = result.reputation;
  const scamFindingCount =
    reputation?.entities?.reduce(
      (n, e) => n + (e.findings || []).filter((f) => f.scamRelated).length,
      0
    ) || 0;
  // In fallback mode nextSteps mirrors the checklist — only surface the
  // dedicated "what to do next" list when the AI produced its own steps.
  const hasDistinctNextSteps =
    Array.isArray(result.nextSteps) &&
    result.nextSteps.length > 0 &&
    JSON.stringify(result.nextSteps) !== JSON.stringify(result.checklist || []);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => stopSpeaking();
  }, [result]);

  async function handleDownload() {
    if (result.evidenceBundle?.available && result.evidenceBundle?.downloadUrl) {
      setPreparingDownload(true);
      window.open(result.evidenceBundle.downloadUrl, "_blank", "noopener,noreferrer");
      setPreparingDownload(false);
      return;
    }
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
    speak(spokenText, language, () => setSpeaking(false));
    setSpeaking(true);
    setHasSpoken(true);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12" aria-live="polite">
      {/* ─── Main column ──────────────────────────────────── */}
      <div className="lg:col-span-8">
        {/* Verdict banner */}
        <div className={`border-l ${RISK_BORDER[result.riskLevel] || RISK_BORDER.low} bg-soft p-6 mb-8`}>
          <div className="mb-6 flex flex-wrap gap-3">
            {result.verdict && (
              <span className="chip">
                {t(language, VERDICT_KEY[result.verdict] || "results.verdictUncertain")}
              </span>
            )}
            <span className={`risk-badge ${
              result.riskLevel === "high" ? "risk-badge-high" : result.riskLevel === "medium" ? "risk-badge-medium" : "risk-badge-low"
            }`}>
              {t(language, RISK_BADGE_KEY[result.riskLevel] || "page.results.badge")}
            </span>
          </div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-bold mb-4 outline-none"
          >
            {t(language, "page.results.title")}
          </h2>
          <p className="text-lg leading-relaxed">
            {result.explanation || t(language, "page.results.verdict")}
          </p>
          <p className="mt-6 text-sm italic text-muted">
            {result.riskDisclaimer || t(language, "riskDisclaimer")}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-8 mb-10 text-center text-sm text-muted">
          <div>
            <p className="text-xs uppercase tracking-wide mb-4 font-semibold">{t(language, "page.results.riskScore")}</p>
            <p className="text-xl font-bold">
              {t(language, RISK_SCORE_KEY[result.riskLevel] || "page.results.score.low")}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide mb-4 font-semibold">{t(language, "page.results.redactedItems")}</p>
            <p className="text-xl font-bold">
              {result.inputSummary?.redactionApplied
                ? t(language, "page.results.redactedYes")
                : t(language, "page.results.redactedNo")}
            </p>
          </div>
        </div>

        {/* Why is this a scam? */}
        <div className="mb-10">
          <h2 className="text-xl font-bold mb-10 border-b-4 border-b-[var(--color-accent-scam)] pb-2">
            {t(language, "page.results.why")}
          </h2>
          {matchedPatterns.length > 0 ? (
            <div className="space-y-12">
              {matchedPatterns.map((pattern, i) => (
                <div key={pattern} className="flex gap-10 items-start">
                  <span className="bg-ink text-on-ink flex-none w-12 h-12 flex items-center justify-center text-lg font-black">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold mb-4">
                      {patternNames[pattern] || pattern}
                    </h3>
                    <p className="text-base leading-relaxed mb-6">
                      {t(language, PATTERN_REASON_KEY[pattern]) || t(language, "noPatternsFound")}
                    </p>
                    {evidenceByPattern.get(pattern) && (
                      <p className="text-sm text-muted font-mono leading-relaxed">
                        "{evidenceByPattern.get(pattern)}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">{t(language, "noPatternsFound")}</p>
          )}
        </div>

        {/* Safety: Your Hidden Data */}
        <div className="mb-10">
          <div className="flex items-center gap-6 mb-10">
            <Icon icon="shieldCheck" className="h-6 w-6 text-green-600" />
            <h2 className="text-xl font-bold border-b-4 border-b-[var(--color-accent-scam)] pb-2">
              {t(language, "page.results.safety")}
            </h2>
          </div>
          <div className="border border-ink bg-soft p-6 font-mono text-lg leading-relaxed mb-8">
            {redactedText || t(language, "page.results.sample")}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted mb-10">
            <Icon icon="shieldCheck" className="h-5 w-5 text-green-600 flex-none" />
            <p>{t(language, "page.results.safetyNote")}</p>
          </div>

          <h3 className="text-lg font-bold mb-8">
            {t(language, "checklistHeading")}
          </h3>
          {result.checklist?.length > 0 ? (
            <ul className="space-y-4 text-base">
              {result.checklist.map((item, idx) => (
                <li key={idx} className="flex gap-6 items-start">
                  <Icon icon="check" className="h-5 w-5 mt-1 text-green-600 flex-none" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{t(language, "noChecklistItems")}</p>
          )}
        </div>

        {/* AI next steps — only when the AI produced its own, distinct list */}
        {hasDistinctNextSteps && (
          <div className="mb-10">
<h2 className="text-xl font-bold mb-6">
              {t(language, "results.nextStepsHeading")}
            </h2>
            <ol className="space-y-4 text-base">
              {result.nextSteps.map((step, idx) => (
                <li key={idx} className="flex gap-6 items-start">
                  <span className="bg-ink text-on-ink flex-none w-10 h-10 flex items-center justify-center text-sm font-black">
                    {idx + 1}
                  </span>
                  <span className="pt-2">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Online reputation check — only present when the user opted in */}
        {reputation && (
          <div className="mb-10">
            <div className="flex items-center gap-6 mb-10">
              <Icon icon="search" className="h-6 w-6 text-cobalt" />
              <h2 className="text-xl font-bold">
                {t(language, "results.reputationHeading")}
              </h2>
            </div>
            {reputation.available ? (
              <div className="space-y-6">
                <p
                  className={`text-base font-bold ${
                    scamFindingCount > 0
                      ? "text-signal"
                      : "text-green-600"
                  }`}
                >
                  {scamFindingCount > 0
                    ? t(language, "results.reputationScamFound")
                    : t(language, "results.reputationClean")}
                </p>
                {reputation.entities?.map((entity, ei) => (
                  <div key={ei} className="border border-ink bg-soft p-6">
                    <p className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">
                      {entity.type === "phone"
                        ? t(language, "results.reputationPhone")
                        : t(language, "results.reputationWebsite")}
                    </p>
                    {entity.findings?.length > 0 ? (
                      <ul className="space-y-3 text-sm">
                          {entity.findings.slice(0, 3).map((f, fi) => (
                            <li key={fi}>
                              {f.url ? (
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-cobalt underline underline-offset-4 hover:text-ink"
                                >
                                  {f.title || f.url}
                                </a>
                              ) : (
                                <span className="font-semibold">{f.title}</span>
                              )}
                              {f.snippet && (
                                <p className="mt-1 text-muted">{f.snippet}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted">
                          {t(language, "results.reputationNoFindings")}
                        </p>
                      )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted">
                {t(language, "results.reputationUnavailable")}
              </p>
            )}
          </div>
        )}

        <ReportingBlock language={language} reportingLinks={result.reportingLinks} />

        {/* Bottom actions — preserved for App.test.jsx compatibility */}
        <div className="mt-12 flex flex-col gap-4 sm:flex-row no-print">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={handleDownload}
            disabled={preparingDownload}
          >
            {preparingDownload
              ? t(language, "downloadingEvidenceButton")
              : t(language, "downloadEvidenceButton")}
          </button>
          <button type="button" className="btn-primary flex-1" onClick={onStartOver}>
            {t(language, "startOverButton")}
          </button>
        </div>

        {isSpeechSynthesisSupported() && (
          <div className="mt-12 text-center no-print">
            <button type="button" className="btn-secondary" onClick={handleToggleReadAloud}>
              {speaking ? t(language, "stopReadingButton") : t(language, "readAloudButton")}
            </button>
            <p className="sr-only" aria-live="polite" data-testid="speech-status">
              {speaking
                ? t(language, "speechStatusReading")
                : hasSpoken
                  ? t(language, "speechStatusStopped")
                  : ""}
            </p>
          </div>
        )}

        <p className="mt-12 text-center text-sm text-muted">
          {t(language, "disclaimer")}
        </p>
      </div>

      {/* ─── Sidebar ──────────────────────────────────────── */}
      <aside className="lg:col-span-4 sticky top-32 space-y-10">
        <div>
          <h3 className="text-lg font-bold mb-8">
            {t(language, "page.results.nextSteps")}
          </h3>
          <ul className="space-y-6">
            <li>
              <button
                type="button"
                className="w-full text-left flex gap-6 items-center p-6 border border-ink bg-soft hover:bg-paper transition"
                onClick={handleDownload}
              >
                <Icon icon="download" className="h-5 w-5 text-muted" />
                <span className="text-sm font-semibold">
                  {t(language, "page.results.download")}
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="w-full text-left flex gap-6 items-center p-6 border border-ink bg-soft hover:bg-paper transition"
                onClick={() => window.print()}
              >
                <Icon icon="print" className="h-5 w-5 text-muted" />
                <span className="text-sm font-semibold">
                  {t(language, "page.results.print")}
                </span>
              </button>
            </li>
            {onViewEvidence && (
              <li>
                <button
                  type="button"
                  className="w-full text-left flex gap-6 items-center p-6 border border-ink bg-soft hover:bg-paper transition"
                  onClick={onViewEvidence}
                >
                  <Icon icon="playCircle" className="h-5 w-5 text-muted" />
                  <span className="text-sm font-semibold">
                    {t(language, "page.results.viewProof")}
                  </span>
                </button>
              </li>
            )}
            <li>
              <a
                href="https://cybercrime.gov.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-left flex gap-6 items-center p-6 border border-ink bg-soft hover:bg-paper transition"
              >
<Icon icon="alertTriangle" className="h-5 w-5 text-muted" />
                  <span className="text-sm font-semibold">
                  {t(language, "page.results.fileComplaint")}
                </span>
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-bold mb-8">
            {t(language, "page.results.progress")}
          </h3>
          <div className="space-y-10 relative">
            <div className="absolute left-6 top-6 bottom-6 w-px bg-ash" />
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex gap-10 items-center relative">
                <span className="bg-green-600 text-white flex-none w-12 h-12 flex items-center justify-center text-sm font-bold z-10">
                  {step}
                </span>
                <span className="text-sm font-medium text-muted">
                  {t(language, `page.results.step${step}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
