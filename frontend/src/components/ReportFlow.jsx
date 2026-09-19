import { useRef, useState } from "react";
import { t } from "../i18n/translations";
import { submitReport } from "../services/api";
import Icon from "./icons";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
// Keep in sync with the backend's default MAX_INPUT_BYTES (see CONTRACT.md).
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_SCREENSHOTS = 3;
const MIN_DESCRIPTION_CHARS = 10;

const STEPS = ["step1", "step2", "step3"];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function riskTone(riskLevel) {
  const level = String(riskLevel || "").toUpperCase();
  if (level === "HIGH") return "bg-risk-high";
  if (level === "MEDIUM") return "bg-risk-medium";
  return "bg-risk-low";
}

function riskLabel(language, riskLevel) {
  const level = String(riskLevel || "").toUpperCase();
  if (level === "HIGH") return t(language, "vocab.highRisk");
  if (level === "MEDIUM") return t(language, "vocab.mediumRisk");
  return t(language, "vocab.lowRisk");
}

export default function ReportFlow({ language, onBack }) {
  const [step, setStep] = useState("describe");
  const [description, setDescription] = useState("");
  const [messages, setMessages] = useState("");
  const [screenshots, setScreenshots] = useState([]);
  const [answers, setAnswers] = useState({});
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const stepIndex = STEPS.indexOf(step === "guide" ? "step3" : step === "questions" ? "step2" : "step1");

  function reset() {
    setStep("describe");
    setDescription("");
    setMessages("");
    setScreenshots([]);
    setAnswers({});
    setReport(null);
    setError(null);
  }

  async function handleAnalyze() {
    if (description.trim().length < MIN_DESCRIPTION_CHARS) {
      setError(t(language, "report.describeRequired"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await submitReport({
        language,
        description,
        messages: messages.trim() || undefined,
        screenshots: screenshots.length > 0 ? screenshots : undefined,
      });
      setReport(result);
      setStep(result.followUpQuestions.length > 0 ? "questions" : "guide");
    } catch {
      setError(t(language, "report.error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleContinue() {
    setError(null);
    setLoading(true);
    try {
      const result = await submitReport({
        language,
        description,
        messages: messages.trim() || undefined,
        screenshots: screenshots.length > 0 ? screenshots : undefined,
        answers,
      });
      setReport(result);
      setStep("guide");
    } catch {
      setError(t(language, "report.error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleScreenshots(files) {
    if (!files || files.length === 0) return;
    const remaining = MAX_SCREENSHOTS - screenshots.length;
    const picked = Array.from(files).slice(0, remaining);
    const next = [...screenshots];
    for (const file of picked) {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        setError(t(language, "errorCode_INVALID_IMAGE"));
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`${t(language, "errorCode_INPUT_TOO_LARGE")} ${t(language, "imageUploadSizeHint")}`);
        continue;
      }
      setError(null);
      const imageBase64 = await fileToBase64(file);
      next.push({ imageBase64, imageMimeType: file.type, name: file.name, previewUrl: URL.createObjectURL(file) });
    }
    setScreenshots(next);
  }

  function removeScreenshot(index) {
    setScreenshots((current) => current.filter((_, i) => i !== index));
  }

  function setAnswer(id, value) {
    setAnswers((current) => ({ ...current, [id]: value }));
  }

  function renderQuestion(question) {
    const value = answers[question.id] || "";
    if (question.type === "yesno") {
      return (
        <div className="flex gap-3">
          {["yes", "no"].map((option) => (
            <button
              key={option}
              type="button"
              className={`touch-target flex-1 border-2 px-4 py-2 font-black uppercase tracking-widest ${
                value === option
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black hover:bg-black hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
              }`}
              onClick={() => setAnswer(question.id, option)}
            >
              {option === "yes" ? t(language, "common.yes") : t(language, "common.no")}
            </button>
          ))}
        </div>
      );
    }
    if (question.type === "select") {
      const options = t(language, "report.q.platform.options");
      return (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={`touch-target border-2 px-4 py-2 font-bold ${
                value === option
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-black hover:bg-black hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
              }`}
              onClick={() => setAnswer(question.id, option)}
            >
              {option}
            </button>
          ))}
        </div>
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => setAnswer(question.id, e.target.value)}
        className="w-full border-2 border-black bg-transparent px-4 py-3 font-bold outline-none focus:border-blue-600 dark:border-white"
        placeholder={t(language, "report.q.placeholder")}
      />
    );
  }

  return (
    <div className="space-y-10">
      <section className="border-2 border-black bg-black p-8 text-white dark:border-white dark:bg-white dark:text-black">
        <p className="text-sm font-black uppercase tracking-widest">{t(language, "report.title")}</p>
        <h1 className="mt-2 text-4xl font-black uppercase leading-tight tracking-tight md:text-5xl">
          {t(language, "report.title")}
        </h1>
        <p className="mt-3 max-w-xl text-lg">{t(language, "report.subtitle")}</p>
        <ol className="mt-6 flex flex-wrap gap-2" aria-label={t(language, "report.guideSteps")}>
          {STEPS.map((key, index) => (
            <li
              key={key}
              className={`touch-target gap-2 border-2 px-4 py-2 text-sm font-black uppercase tracking-widest ${
                index === stepIndex
                  ? "border-white bg-white text-black dark:border-black dark:bg-black dark:text-white"
                  : "border-white/40 text-white/70 dark:border-black/40 dark:text-black/70"
              }`}
            >
              {index + 1}. {t(language, `report.${key}`)}
            </li>
          ))}
        </ol>
      </section>

      {error && (
        <p role="alert" className="border-2 border-red-600 bg-red-50 p-4 font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {step === "describe" && (
        <section className="card space-y-6 p-8">
          <div className="space-y-2">
            <label htmlFor="report-description" className="text-lg font-black uppercase tracking-wide">
              {t(language, "report.describeLabel")}
            </label>
            <textarea
              id="report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(language, "report.describePlaceholder")}
              className="h-40 w-full border-2 border-black bg-transparent px-4 py-3 font-bold outline-none focus:border-blue-600 dark:border-white"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="report-messages" className="text-lg font-black uppercase tracking-wide">
              {t(language, "report.messagesLabel")}
            </label>
            <textarea
              id="report-messages"
              value={messages}
              onChange={(e) => setMessages(e.target.value)}
              placeholder={t(language, "report.messagesPlaceholder")}
              className="h-32 w-full border-2 border-black bg-transparent px-4 py-3 font-bold outline-none focus:border-blue-600 dark:border-white"
            />
          </div>

          <div className="space-y-3">
            <p className="text-lg font-black uppercase tracking-wide">{t(language, "report.screenshotsLabel")}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t(language, "report.screenshotsHint")}</p>
            {screenshots.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-3">
                {screenshots.map((shot, index) => (
                  <li key={shot.name + index} className="space-y-2 border-2 border-black p-2 dark:border-white">
                    <img
                      src={shot.previewUrl}
                      alt={`${t(language, "report.screenshotsLabel")} ${index + 1}`}
                      className="max-h-40 w-full object-contain"
                    />
                    <button
                      type="button"
                      className="touch-target w-full border-2 border-black px-3 py-1 text-xs font-black uppercase tracking-widest hover:bg-black hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
                      onClick={() => removeScreenshot(index)}
                    >
                      {t(language, "report.removeScreenshot")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {screenshots.length < MAX_SCREENSHOTS && (
              <button
                type="button"
                className="btn-secondary touch-target w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon icon="download" className="h-5 w-5" />
                {t(language, "report.addScreenshots")}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              className="hidden"
              onChange={(e) => handleScreenshots(e.target.files)}
            />
          </div>

          <p className="flex items-start gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Icon icon="shieldCheck" className="mt-0.5 h-5 w-5 flex-none" />
            {t(language, "report.privacyNote")}
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="touch-target gap-2 bg-black px-6 text-lg font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-black"
              onClick={handleAnalyze}
              disabled={loading}
            >
              <Icon icon="check" className="h-6 w-6" />
              {loading ? t(language, "report.analyzing") : t(language, "report.analyze")}
            </button>
            <button
              type="button"
              className="touch-target gap-2 border-2 border-black px-6 text-lg font-black uppercase tracking-widest hover:bg-black hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
              onClick={onBack}
            >
              <Icon icon="arrowLeft" className="h-6 w-6" />
              {t(language, "report.backHome")}
            </button>
          </div>
        </section>
      )}

      {step === "questions" && report && (
        <section className="space-y-6">
          <div className="card space-y-4 p-8">
            <h2 className="text-2xl font-black uppercase tracking-wide">{t(language, "report.analysisTitle")}</h2>
            <p className="text-lg font-bold">{t(language, report.analysis.summaryKey)}</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                {t(language, "report.riskLevel")}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-black text-white ${riskTone(report.riskLevel)}`}>
                {riskLabel(language, report.riskLevel)}
              </span>
            </div>
            {report.analysis.indicators.length > 0 && (
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {t(language, "report.indicators")}
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {report.analysis.indicators.map((key) => (
                    <li key={key} className="border-2 border-black px-3 py-1 text-sm font-bold dark:border-white">
                      {t(language, key)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="card space-y-6 p-8">
            <h2 className="text-2xl font-black uppercase tracking-wide">{t(language, "report.questionsTitle")}</h2>
            <p>{t(language, "report.questionsHint")}</p>
            {report.followUpQuestions.map((question) => (
              <div key={question.id} className="space-y-3 border-t-2 border-black pt-5 dark:border-white">
                <p className="font-black uppercase tracking-wide">{t(language, `report.q.${question.id}`)}</p>
                {renderQuestion(question)}
                <button
                  type="button"
                  className="touch-target text-sm font-black uppercase tracking-widest text-slate-500 underline underline-offset-4 hover:text-black dark:text-slate-400 dark:hover:text-white"
                  onClick={() => setAnswer(question.id, "")}
                >
                  {t(language, "report.skip")}
                </button>
              </div>
            ))}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className="touch-target gap-2 bg-black px-6 text-lg font-black uppercase tracking-widest text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-black"
                onClick={handleContinue}
                disabled={loading}
              >
                <Icon icon="check" className="h-6 w-6" />
                {loading ? t(language, "report.continueLoading") : t(language, "report.continue")}
              </button>
              <button
                type="button"
                className="touch-target gap-2 border-2 border-black px-6 text-lg font-black uppercase tracking-widest hover:bg-black hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
                onClick={() => setStep("describe")}
              >
                <Icon icon="arrowLeft" className="h-6 w-6" />
                {t(language, "report.back")}
              </button>
            </div>
          </div>
        </section>
      )}

      {step === "guide" && report && (
        <section className="space-y-6">
          <div className="card space-y-4 p-8">
            <h2 className="text-2xl font-black uppercase tracking-wide">{t(language, "report.guideTitle")}</h2>
            <p>{t(language, "report.guideIntro")}</p>
            <ol className="space-y-4">
              {report.reportingGuide.steps.map((stepItem, index) => {
                const title = t(language, stepItem.key);
                const detail = t(language, `${stepItem.key}.detail`);
                const content = (
                  <>
                    <span className="flex h-8 w-8 flex-none items-center justify-center bg-black font-black text-white dark:bg-white dark:text-black">
                      {index + 1}
                    </span>
                    <span className="space-y-1">
                      <span className="block font-black uppercase tracking-wide">{title}</span>
                      <span className="block text-sm text-slate-500 dark:text-slate-400">{detail}</span>
                    </span>
                  </>
                );
                return (
                  <li key={stepItem.key} className="flex items-start gap-3 border-2 border-black p-4 dark:border-white">
                    {stepItem.link ? (
                      <a
                        href={stepItem.link}
                        target={stepItem.link.startsWith("http") ? "_blank" : undefined}
                        rel={stepItem.link.startsWith("http") ? "noopener noreferrer" : undefined}
                        className="flex flex-1 items-start gap-3 hover:underline"
                      >
                        {content}
                      </a>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="card space-y-4 p-8">
            <h2 className="text-2xl font-black uppercase tracking-wide">{t(language, "report.evidenceChecklist")}</h2>
            <ul className="space-y-2">
              {report.reportingGuide.evidenceChecklist.map((key) => (
                <li key={key} className="flex items-start gap-2 font-bold">
                  <Icon icon="check" className="mt-0.5 h-5 w-5 flex-none" />
                  {t(language, key)}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="touch-target gap-2 bg-black px-6 text-lg font-black uppercase tracking-widest text-white hover:bg-slate-800 dark:bg-white dark:text-black"
              onClick={reset}
            >
              <Icon icon="fileText" className="h-6 w-6" />
              {t(language, "report.startNew")}
            </button>
            <button
              type="button"
              className="touch-target gap-2 border-2 border-black px-6 text-lg font-black uppercase tracking-widest hover:bg-black hover:text-white dark:border-white dark:hover:bg-white dark:hover:text-black"
              onClick={onBack}
            >
              <Icon icon="home" className="h-6 w-6" />
              {t(language, "report.backHome")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}