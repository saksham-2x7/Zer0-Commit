import { lazy, Suspense, useEffect, useState } from "react";
import { t } from "./i18n/translations";
import LanguageSelector from "./components/LanguageSelector";
import ThemeToggle from "./components/ThemeToggle";
import TextSizeToggle from "./components/TextSizeToggle";
import HelpModal from "./components/HelpModal";
import TextInput from "./components/TextInput";
import ImageUpload from "./components/ImageUpload";
import RedactionPreview from "./components/RedactionPreview";
import ResultsView from "./components/ResultsView";
import HistoryPanel from "./components/HistoryPanel";
import HealthProfile from "./components/HealthProfile";
import { analyzeMessage } from "./services/api";
import { redactText } from "./utils/redact";
import { useTheme } from "./utils/useTheme";
import { useTextSize } from "./utils/useTextSize";
import { loadHistory, saveHistoryEntry, clearHistory } from "./utils/history";

// The QR/barcode scanner pulls in @zxing (a large decoding library) — load
// it only when the user actually opens the Scan tab, not in the main bundle.
const Scanner = lazy(() => import("./components/Scanner"));

const HAS_SEEN_HELP_KEY = "scamsahayak-has-seen-help";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { textSize, cycleTextSize } = useTextSize();
  const [language, setLanguage] = useState("en");
  const [view, setView] = useState("main"); // "main" | "history" | "health"
  const [activeTab, setActiveTab] = useState("text"); // "text" | "image" | "scan"
  const [rawText, setRawText] = useState("");
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [resultRedactedText, setResultRedactedText] = useState("");
  const [history, setHistory] = useState(loadHistory);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(HAS_SEEN_HELP_KEY)) {
        setShowHelp(true);
        window.localStorage.setItem(HAS_SEEN_HELP_KEY, "true");
      }
    } catch {
      // localStorage unavailable — just skip the auto-show, help is still
      // reachable via the header button.
    }
  }, []);

  const canSubmit = activeTab === "text" ? rawText.trim().length > 0 : Boolean(imageBase64);
  const liveRedactedText = activeTab === "text" ? redactText(rawText) : "";

  function handleImageSelected(base64, mimeType) {
    setImageBase64(base64);
    setImageMimeType(mimeType);
  }

  function handleQrDecoded(decodedText) {
    setRawText(decodedText);
    setActiveTab("text");
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) {
      setError(t(language, "errorNeedInput"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Text is redacted client-side before it ever leaves the browser.
      // (The backend also redacts defense-in-depth, in case /api/analyze
      // is ever called directly — see backend/redaction/redact.js.)
      const response = await analyzeMessage({
        language,
        inputType: activeTab,
        rawText: activeTab === "text" ? liveRedactedText : undefined,
        imageBase64: activeTab === "image" ? imageBase64 : undefined,
        imageMimeType: activeTab === "image" ? imageMimeType : undefined,
      });
      setResult(response);
      setResultRedactedText(liveRedactedText);
      setHistory(saveHistoryEntry({ language, redactedText: liveRedactedText, result: response }));
    } catch (err) {
      const message = err.code ? t(language, `errorCode_${err.code}`) : null;
      setError(message || err.message || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  function handleStartOver() {
    setResult(null);
    setResultRedactedText("");
    setRawText("");
    setImageBase64(null);
    setImageMimeType(null);
    setError(null);
    setActiveTab("text");
  }

  function handleSelectHistoryEntry(entry) {
    setLanguage(entry.language);
    setResult(entry.result);
    setResultRedactedText(entry.redactedText);
    setView("main");
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
  }

  const loadingLabel =
    activeTab === "image" ? t(language, "analyzingImageButton") : t(language, "analyzingButton");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-900 dark:text-blue-300">
            {t(language, "appTitle")}
          </h1>
          <p className="mt-1 text-lg text-slate-600 dark:text-slate-300">{t(language, "appTagline")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!result && view === "main" && (
            <>
              <button type="button" className="btn-secondary" onClick={() => setView("history")}>
                {t(language, "historyButtonLabel")}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setView("health")}>
                {t(language, "healthProfileButtonLabel")}
              </button>
            </>
          )}
          <button type="button" className="btn-secondary" onClick={() => setShowHelp(true)}>
            {t(language, "helpButtonLabel")}
          </button>
          <TextSizeToggle language={language} textSize={textSize} onCycle={cycleTextSize} />
          <ThemeToggle language={language} theme={theme} onToggle={toggleTheme} />
          <LanguageSelector language={language} onChange={setLanguage} />
        </div>
      </header>

      {showHelp && <HelpModal language={language} onClose={() => setShowHelp(false)} />}

      {view === "history" ? (
        <HistoryPanel
          language={language}
          history={history}
          onSelect={handleSelectHistoryEntry}
          onClear={handleClearHistory}
          onBack={() => setView("main")}
        />
      ) : view === "health" ? (
        <HealthProfile language={language} onBack={() => setView("main")} />
      ) : result ? (
        <ResultsView
          language={language}
          result={result}
          redactedText={resultRedactedText}
          onStartOver={handleStartOver}
        />
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex gap-2" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "text"}
              className={activeTab === "text" ? "btn-primary flex-1" : "btn-secondary flex-1"}
              onClick={() => setActiveTab("text")}
            >
              {t(language, "tabText")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "image"}
              className={activeTab === "image" ? "btn-primary flex-1" : "btn-secondary flex-1"}
              onClick={() => setActiveTab("image")}
            >
              {t(language, "tabImage")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "scan"}
              className={activeTab === "scan" ? "btn-primary flex-1" : "btn-secondary flex-1"}
              onClick={() => setActiveTab("scan")}
            >
              {t(language, "tabScan")}
            </button>
          </div>

          {activeTab === "text" && (
            <>
              <TextInput language={language} value={rawText} onChange={setRawText} />
              <RedactionPreview language={language} text={rawText} />
            </>
          )}
          {activeTab === "image" && (
            <ImageUpload language={language} onImageSelected={handleImageSelected} onError={setError} />
          )}
          {activeTab === "scan" && (
            <Suspense fallback={<p className="text-slate-500 dark:text-slate-400">…</p>}>
              <Scanner
                language={language}
                onQrDecoded={handleQrDecoded}
                onSetupHealthProfile={() => setView("health")}
              />
            </Suspense>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          )}

          {activeTab !== "scan" && (
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? loadingLabel : t(language, "analyzeButton")}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
