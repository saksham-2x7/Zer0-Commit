import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/translations";
import { buildEvidenceBundle, downloadEvidenceBundle } from "../utils/evidenceBundle";
import Icon from "./icons";

// Design-spec §3.8 — redesigned evidence view: a printable "Scam Proof
// Certificate" with a privacy grid, proof rows, per-pattern threat cards
// (with danger meter), and a "What to do Now" action list. Entry point wired
// from the redesigned results page (View Scam Proof / history active nav).

const RISK_BADGE_KEY = {
  high: "page.evidence.badge",
  medium: "vocab.mediumRisk",
  low: "vocab.lowRisk",
};

const RISK_CARD_BORDER = {
  high: "border-l-[var(--color-risk-high)]",
  medium: "border-l-[var(--color-risk-medium)]",
  low: "border-l-[var(--color-risk-low)]",
};

const RISK_METER_FILL = {
  high: "bg-[var(--color-risk-high)]",
  medium: "bg-[var(--color-risk-medium)]",
  low: "bg-[var(--color-risk-low)]",
};

const DANGER_LEVEL_KEY = {
  high: "page.evidence.danger.high",
  medium: "page.evidence.danger.medium",
  low: "page.evidence.danger.low",
};

const PATTERN_REASON_KEY = {
  urgency: "page.results.reason.urgency",
  otp_request: "page.results.reason.otp_request",
  screen_share_request: "page.results.reason.screen_share_request",
  suspicious_link: "page.results.reason.suspicious_link",
  impersonation: "page.results.reason.impersonation",
  suspicious_collect_request: "page.results.reason.suspicious_collect_request",
};

export default function EvidenceView({ language, result, redactedText, rawText, onBack }) {
  const [preparingSave, setPreparingSave] = useState(false);
  const [copied, setCopied] = useState(false);
  const headingRef = useRef(null);
  const canSave = Boolean(result) && Boolean(redactedText);
  const patternNames = t(language, "patternNames");
  const riskLevel = result?.riskLevel || "low";
  const matchedPatterns = result?.matchedPatterns || [];
  const threatLabel =
    (matchedPatterns.length > 0 ? patternNames[matchedPatterns[0]] : null) ||
    t(language, "page.evidence.threatLabelFallback");
  const dangerPercent = t(language, DANGER_LEVEL_KEY[riskLevel] || "page.evidence.danger.low");
  const portalUrl = result?.reportingLinks?.portal || "https://cybercrime.gov.in/";

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleSave() {
    if (!canSave) return;
    if (result.evidenceBundle?.available && result.evidenceBundle?.downloadUrl) {
      setPreparingSave(true);
      window.open(result.evidenceBundle.downloadUrl, "_blank", "noopener,noreferrer");
      setPreparingSave(false);
      return;
    }
    const bundle = buildEvidenceBundle({ result, redactedText, language });
    downloadEvidenceBundle(bundle);
  }

  async function handleShare() {
    const shareText = `${t(language, "page.results.title")}: ${result?.explanation || ""}\n${t(language, "portalLabel")} — ${portalUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
      } catch {
        // The user canceled the native share sheet or it failed — no error UI.
      }
      return;
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
      } catch {
        // Clipboard unavailable — leave the button idle.
      }
    }
  }

  return (
    <div className="evidence-view space-y-8">
      {/* ─── Security reminder strip ─────────────────────── */}
      <p
        aria-label={t(language, "page.evidence.whatAISaw")}
        className="bg-green-600 py-4 text-center text-sm font-bold text-white"
      >
        {t(language, "page.evidence.proof2")}
      </p>

      <button
        type="button"
        className="btn-secondary no-print"
        onClick={() => (onBack ? onBack() : window.history.back())}
      >
        <span className="flex items-center gap-2">
          <Icon icon="arrowLeft" className="h-5 w-5" />
          {t(language, "page.evidence.backHome")}
        </span>
      </button>

      {/* ─── Certificate header ──────────────────────────── */}
      <header className="border-b border-strong pb-6 mb-10">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-black uppercase tracking-wide outline-none"
        >
          {t(language, "page.evidence.title")}
        </h1>
        <span className={`risk-badge mt-6 ${
            riskLevel === "high" ? "risk-badge-high" : riskLevel === "medium" ? "risk-badge-medium" : "risk-badge-low"
          }`}>
          {t(language, RISK_BADGE_KEY[riskLevel] || "page.evidence.badge")}
        </span>
        <p className="mt-4 text-xl font-bold">{threatLabel}</p>
        <p className="mt-4">{t(language, "page.evidence.privacy")}</p>
        <p className="text-sm italic font-black">{t(language, "page.evidence.footnote")}</p>

        <div className="no-print mt-8 flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn-secondary flex-1" onClick={() => window.print()}>
            <span className="flex items-center justify-center gap-2">
              <Icon icon="print" className="h-5 w-5" />
              {t(language, "page.evidence.print")}
            </span>
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={handleSave}
            disabled={!canSave || preparingSave}
          >
            <span className="flex items-center justify-center gap-2">
              <Icon icon="download" className="h-5 w-5" />
              {preparingSave ? t(language, "downloadingEvidenceButton") : t(language, "page.evidence.save")}
            </span>
          </button>
        </div>
      </header>

      {/* ─── Privacy section ─────────────────────────────── */}
      <section className="evidence-card card">
        <div className="space-y-10">
          <div className="grid grid-cols-1 gap-10 md:col-span-2 md:grid-cols-2">
            <div className="md:col-start-1">
              <h2 className="text-xl font-bold uppercase tracking-wide mb-8">
                {t(language, "page.evidence.whatTyped")}
              </h2>
              {rawText ? (
                <p className="whitespace-pre-wrap break-words font-mono text-lg leading-relaxed">
                  {rawText}
                </p>
              ) : (
                <p className="text-lg italic text-muted">
                  {t(language, "page.evidence.originalOnDevice")}
                </p>
              )}
            </div>
            <div className="panel-inverse p-6 md:col-start-2">
              <p className="text-sm font-semibold uppercase tracking-wide mb-4 opacity-70">
                {t(language, "page.evidence.whatAISaw")}
              </p>
              <p className="whitespace-pre-wrap break-words font-mono text-lg leading-relaxed">
                {redactedText || t(language, "page.evidence.noText")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="flex items-start gap-6">
              <Icon icon="lock" className="h-6 w-6 flex-none text-green-600" />
              <div>
                <p className="font-black">{t(language, "page.evidence.proof1")}</p>
                <p className="text-sm text-muted">
                  {t(language, "page.evidence.legend.hidden")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-6">
              <Icon icon="shieldCheck" className="h-6 w-6 flex-none text-green-600" />
              <div>
                <p className="font-black">{t(language, "page.evidence.proof2")}</p>
                <p className="text-sm text-muted">
                  {t(language, "page.evidence.legend.phone")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Threat cards ────────────────────────────────── */}
      <section>
        <h2 className="text-2xl font-black uppercase tracking-wide mb-8 border-b-4 border-b-[var(--color-accent-scam)] pb-2">
          {t(language, "page.evidence.why")}
        </h2>
        {matchedPatterns.length > 0 ? (
          <div className="space-y-8">
            {matchedPatterns.map((pattern) => (
              <div
                key={pattern}
                className={`evidence-card border-l ${RISK_CARD_BORDER[riskLevel] || RISK_CARD_BORDER.low} bg-soft p-6 space-y-5`}
              >
                <div className="flex flex-wrap items-center gap-4">
                  <h3 className="text-lg font-bold">{patternNames[pattern] || pattern}</h3>
                  {riskLevel === "high" && (
                    <span className="risk-chip risk-chip-high">
                      {t(language, "page.evidence.veryDangerous")}
                    </span>
                  )}
                </div>
                <p>
                  {t(language, PATTERN_REASON_KEY[pattern]) || t(language, "noPatternsFound")}
                </p>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                    <span>{t(language, "page.evidence.dangerLevel")}</span>
                    <span>{dangerPercent}</span>
                  </div>
                  <div className="h-4 w-full bg-ash">
                    <div
                      className={`h-full ${RISK_METER_FILL[riskLevel] || RISK_METER_FILL.low}`}
                      style={{ width: dangerPercent }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">{t(language, "noPatternsFound")}</p>
        )}
      </section>

      {/* ─── What to do Now ──────────────────────────────── */}
      <section>
        <h2 className="text-2xl font-black uppercase tracking-wide mb-8 border-b-4 border-b-[var(--color-accent-scam)] pb-2">
          {t(language, "page.evidence.nextSteps")}
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div className="flex flex-col justify-between gap-6 bg-soft p-6">
            <p className="font-bold">
              {t(language, "page.evidence.step1")} — 1930
            </p>
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              {t(language, "page.evidence.step1link")}
            </a>
          </div>
          <div className="bg-soft p-6">
            <p className="font-bold">{t(language, "page.evidence.step2")}</p>
          </div>
          <div className="bg-soft p-6">
            <p className="font-bold">{t(language, "page.evidence.step3")}</p>
          </div>
        </div>

        <button type="button" className="btn-secondary touch-target no-print mt-8" onClick={handleShare}>
          <span className="flex items-center gap-2">
            <Icon icon="share" className="h-5 w-5" />
            {copied ? t(language, "page.evidence.copied") : t(language, "page.evidence.share")}
          </span>
        </button>

        <div className="mt-10 border-t border-strong pt-8">
          <h3 className="text-sm font-black uppercase tracking-wide mb-4">
            {t(language, "page.evidence.legend")}
          </h3>
          <ul className="space-y-3 text-sm text-muted">
            <li>
              <span className="font-mono font-bold text-[#d32f2f]">████</span> —{" "}
              {t(language, "page.evidence.legend.hidden")}
            </li>
            <li>
              <span className="font-mono font-bold text-[#0a7d2f]">████</span> —{" "}
              {t(language, "page.evidence.legend.phone")}
            </li>
          </ul>
          <p className="mt-6 text-sm italic font-black">{t(language, "page.evidence.footnote")}</p>
        </div>
      </section>
    </div>
  );
}