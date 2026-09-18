import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t, errorCodeMessage, detectNavigatorLanguage } from "./i18n/translations";
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
import { useLanguage } from "./utils/useLanguage";
import { loadHistory, saveHistoryEntry, clearHistory } from "./utils/history";

// The QR/barcode scanner pulls in @zxing (a large decoding library) — load
// it only when the user actually opens the Scan tab, not in the main bundle.
const Scanner = lazy(() => import("./components/Scanner"));

const HAS_SEEN_HELP_KEY = "scamsahayak-has-seen-help";
const TABS = ["text", "image", "scan"];

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { textSize, cycleTextSize } = useTextSize();
  const { language, setLanguage } = useLanguage();
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
  const [restoreFocusFlag, setRestoreFocusFlag] = useState(0);
  const abortControllerRef = useRef(null);
  const tabRefs = useRef({});
  const textTabRef = useRef(null);

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

  useEffect(() => {
    if (restoreFocusFlag > 0) textTabRef.current?.focus();
  }, [restoreFocusFlag]);

  const canSubmit = activeTab === "text" ? rawText.trim().length > 0 : Boolean(imageBase64);
  // Recomputing the client-side redaction on every keystroke is fine for short
  // input but gets expensive on pasted walls of text — memoize on the raw text.
  const liveRedactedText = useMemo(
    () => (activeTab === "text" ? redactText(rawText) : ""),
    [activeTab, rawText]
  );

  // Help content should match the reader's own language when they haven't
  // picked one, and follow the selector once they have.
  const helpLanguage = language === "en" ? detectNavigatorLanguage() : language;

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
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Text is redacted client-side before it ever leaves the browser.
      // (The backend also redacts defense-in-depth, in case /api/analyze
      // is ever called directly — see backend/redaction/redact.js.)
      const response = await analyzeMessage(
        {
          language,
          inputType: activeTab,
          rawText: activeTab === "text" ? liveRedactedText : undefined,
          imageBase64: activeTab === "image" ? imageBase64 : undefined,
          imageMimeType: activeTab === "image" ? imageMimeType : undefined,
        },
        controller.signal
      );
      setResult(response);
      setResultRedactedText(liveRedactedText);
      setHistory(saveHistoryEntry({ language, redactedText: liveRedactedText, result: response }));
    } catch (err) {
      if (err?.name === "AbortError") return;
      // "Failed to fetch" / TypeError covers offline, DNS failure, server
      // went away mid-request — surface a friendly, localizable message.
      const networkFailure =
        err?.name === "TypeError" || /Failed to fetch|NetworkError|ENOTFOUND/i.test(err?.message || "");
      setError(networkFailure ? t(language, "errorNetwork") : errorCodeMessage(language, err?.code) || err?.message || t(language, "errorGeneric"));
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setLoading(false);
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
  }

  function handleTablistKey(e) {
    const idx = TABS.indexOf(activeTab);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    if (e.key === "ArrowLeft") next = (idx + TABS.length - 1) % TABS.length;
    if (next < 0) return;
    e.preventDefault();
    setActiveTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  }

  function handleStartOver() {
    setResult(null);
    setResultRedactedText("");
    setRawText("");
    setImageBase64(null);
    setImageMimeType(null);
    setError(null);
    setActiveTab("text");
    setRestoreFocusFlag((n) => n + 1);
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
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-blue-900 dark:focus:bg-slate-800 dark:focus:text-blue-200"
      >
        {t(language, "skipToContent")}
      </a>
      <main id="main" className="mx-auto max-w-2xl px-4 py-8">
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

      {showHelp && <HelpModal language={helpLanguage} onClose={() => setShowHelp(false)} />}

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
          <div
            className="flex gap-2"
            role="tablist"
            aria-label={t(language, "inputTabsLabel")}
            onKeyDown={handleTablistKey}
          >
            <button
              type="button"
              role="tab"
              id="tab-text"
              ref={textTabRef}
              aria-selected={activeTab === "text"}
              aria-controls="panel-text"
              className={activeTab === "text" ? "btn-primary flex-1" : "btn-secondary flex-1"}
              onClick={() => {
                setActiveTab("text");
                tabRefs.current.text?.focus();
              }}
            >
              {t(language, "tabText")}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-image"
              ref={(el) => (tabRefs.current.image = el)}
              aria-selected={activeTab === "image"}
              aria-controls="panel-image"
              className={activeTab === "image" ? "btn-primary flex-1" : "btn-secondary flex-1"}
              onClick={() => setActiveTab("image")}
            >
              {t(language, "tabImage")}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-scan"
              ref={(el) => (tabRefs.current.scan = el)}
              aria-selected={activeTab === "scan"}
              aria-controls="panel-scan"
              className={activeTab === "scan" ? "btn-primary flex-1" : "btn-secondary flex-1"}
              onClick={() => setActiveTab("scan")}
            >
              {t(language, "tabScan")}
            </button>
          </div>

          <div
            role="tabpanel"
            id="panel-text"
            aria-labelledby="tab-text"
            hidden={activeTab !== "text"}
            tabIndex={activeTab === "text" ? 0 : undefined}
          >
            {activeTab === "text" && (
              <>
                <TextInput language={language} value={rawText} onChange={setRawText} />
                <RedactionPreview language={language} text={liveRedactedText} />
              </>
            )}
          </div>
          <div
            role="tabpanel"
            id="panel-image"
            aria-labelledby="tab-image"
            hidden={activeTab !== "image"}
            tabIndex={activeTab === "image" ? 0 : undefined}
          >
            {activeTab === "image" && (
              <ImageUpload language={language} onImageSelected={handleImageSelected} onError={setError} />
            )}
          </div>
          <div
            role="tabpanel"
            id="panel-scan"
            aria-labelledby="tab-scan"
            hidden={activeTab !== "scan"}
            tabIndex={activeTab === "scan" ? 0 : undefined}
          >
            {activeTab === "scan" && (
              <Suspense fallback={<p className="text-slate-500 dark:text-slate-400">{t(language, "loadingScanner")}</p>}>
                <Scanner
                  language={language}
                  onQrDecoded={handleQrDecoded}
                  onSetupHealthProfile={() => setView("health")}
                />
              </Suspense>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg border-2 border-red-300 bg-red-50 p-3 font-semibold text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </p>
          )}

          <p role="status" className="sr-only" aria-live="polite">
            {loading ? loadingLabel : ""}
          </p>

          {activeTab !== "scan" &&
            (loading ? (
              <div className="flex gap-2">
                <button type="button" className="btn-secondary flex-1" onClick={handleCancel}>
                  {t(language, "cancelButton")}
                </button>
                <button type="submit" className="btn-primary flex-1" disabled>
                  {loadingLabel}
                </button>
              </div>
            ) : (
              <button type="submit" className="btn-primary w-full">
                {t(language, "analyzeButton")}
              </button>
            ))}
        </form>
      )}
      </main>
    </>
  );
}
