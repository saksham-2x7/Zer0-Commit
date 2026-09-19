import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t, errorCodeMessage, detectNavigatorLanguage } from "./i18n/translations";
import Header from "./components/Header";
import MobileNavigation from "./components/MobileNavigation";
import HomeView from "./components/HomeView";
import SettingsView from "./components/SettingsView";
import EvidenceView from "./components/EvidenceView";
import HelpModal from "./components/HelpModal";
import TextInput from "./components/TextInput";
import ImageUpload from "./components/ImageUpload";
import RedactionPreview from "./components/RedactionPreview";
import ResultsView from "./components/ResultsView";
import HistoryPanel from "./components/HistoryPanel";
import HealthProfile from "./components/HealthProfile";
import ReportFlow from "./components/ReportFlow";
import FamilyView from "./components/FamilyView";
import FoodScanView from "./components/FoodScanView";
import LocationView from "./components/LocationView";
import { analyzeMessage } from "./services/api";
import { redactText } from "./utils/redact";
import { useTheme } from "./utils/useTheme";
import { useTextSize } from "./utils/useTextSize";
import { useLanguage } from "./utils/useLanguage";
import { loadHistory, saveHistoryEntry, clearHistory } from "./utils/history";

// The QR/barcode scanner pulls in @zxing (a large decoding library) — load
// it only when the user actually opens the Scan tab, not in the main bundle.
const Scanner = lazy(() => import("./components/Scanner"));

// View-state shell (design-spec §6). Each view maps to one screen; the
// pre-existing components keep their props and internal logic — only the
// routing between them is new here.
//
//   view     screen                                          active nav
//   -------  ----------------------------------------------  ----------
//   home     HomeView (design home.html)                     home
//   check    Check form (TextInput / ImageUpload / Scanner)  check
//   results  ResultsView + ReportingBlock                    history
//   history  HistoryPanel                                    history
//   health   HealthProfile                                    health
//   settings SettingsView (design settings.html)             settings
//   help     HelpModal (overlay; closes back to home)        help
//   evidence EvidenceView (design evidence.html)             history
//   report   ReportFlow (guided scam reporting, 3 steps)     home
//
// The default view is "home" — the app opens on the landing screen; the
// check form is one tap away in the header/bottom nav.
//
// Multi-page feel: the current view is mirrored into location.hash
// (#/home, #/check, #/report, ...) so the URL changes with every screen,
// the browser back/forward buttons move between screens, and a view can be
// deep-linked. Unknown hashes fall back to the default view.

const HAS_SEEN_HELP_KEY = "scamsahayak-has-seen-help";
const TABS = ["text", "image", "scan"];
const VALID_VIEWS = new Set(["home", "check", "results", "history", "health", "settings", "help", "evidence", "report", "family", "food", "locations"]);

// Indian phone numbers in the user's RAW input (the redacted copy masks them).
// Used only to decide whether the opt-in "check this number online" checkbox
// is offered, and to collect the numbers the user consents to look up.
function extractPhones(text) {
  if (typeof text !== "string") return [];
  const seen = new Set();
  const out = [];
  const re = /(?:\+?91[\s-]?)?[6-9]\d{9}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const digits = m[0].replace(/[^\d]/g, "");
    const key = digits.slice(-10);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(digits);
    }
    if (out.length >= 3) break;
  }
  return out;
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { textSize, cycleTextSize } = useTextSize();
  const { language, setLanguage } = useLanguage();
  const [view, setView] = useState("home");
  const [activeTab, setActiveTab] = useState("text"); // "text" | "image" | "scan"
  const [rawText, setRawText] = useState("");
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [onlineLookup, setOnlineLookup] = useState(false);
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
  const mainRef = useRef(null);
  const firstRenderRef = useRef(true);

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

  // Hash routing: read the initial view from the URL, then keep the URL in
  // sync with the view and react to back/forward navigation.
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#\/?/, "");
    if (VALID_VIEWS.has(fromHash)) setView(fromHash);
    function onHashChange() {
      const v = window.location.hash.replace(/^#\/?/, "");
      if (VALID_VIEWS.has(v)) setView(v);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const target = `#/${view}`;
    if (window.location.hash !== target) {
      window.location.hash = target;
    }
  }, [view]);

  // Router focus management: when the view changes, move focus into the new
  // screen. First render (already focused by load), results (ResultsView
  // focuses its own heading) and help (HelpModal focuses the dialog) are
  // exempt because their screens manage focus themselves.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (view === "results" || view === "help") return;
    mainRef.current?.focus({ preventScroll: true });
  }, [view]);

  const canSubmit = activeTab === "text" ? rawText.trim().length > 0 : Boolean(imageBase64);
  // Recomputing the client-side redaction on every keystroke is fine for short
  // input but gets expensive on pasted walls of text — memoize on the raw text.
  const liveRedactedText = useMemo(
    () => (activeTab === "text" ? redactText(rawText) : ""),
    [activeTab, rawText]
  );
  // Phone numbers present in the raw input — gates the online-lookup checkbox.
  const phonesInText = useMemo(() => extractPhones(rawText), [rawText]);

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
      // The online reputation lookup is strictly opt-in: the raw phone
      // numbers are sent ONLY when the user ticked the checkbox.
      const lookupConsented = activeTab === "text" && onlineLookup && phonesInText.length > 0;
      const response = await analyzeMessage(
        {
          language,
          inputType: activeTab,
          rawText: activeTab === "text" ? liveRedactedText : undefined,
          imageBase64: activeTab === "image" ? imageBase64 : undefined,
          imageMimeType: activeTab === "image" ? imageMimeType : undefined,
          onlineLookup: lookupConsented,
          lookupPhones: lookupConsented ? phonesInText : undefined,
        },
        controller.signal
      );
      setResult(response);
      setResultRedactedText(liveRedactedText);
      setHistory(saveHistoryEntry({ language, redactedText: liveRedactedText, result: response }));
      setView("results");
    } catch (err) {
      if (err?.name === "AbortError") return;
      // "Failed to fetch" / TypeError covers offline, DNS failure, server
      // went away mid-request — surface a friendly, localizable message.
      const networkFailure =
        err?.name === "TypeError" || /Failed to fetch|NetworkError|ENOTFOUND/i.test(err?.message || "");
      setError(networkFailure ? t(language, "errorNetwork") : errorCodeMessage(language, err?.code) || t(language, "errorGeneric"));
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
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = TABS.length - 1;
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
    setOnlineLookup(false);
    setError(null);
    setActiveTab("text");
    setView("check");
    setRestoreFocusFlag((n) => n + 1);
  }

  function handleSelectHistoryEntry(entry) {
    setLanguage(entry.language);
    setResult(entry.result);
    setResultRedactedText(entry.redactedText);
    setView("results");
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
  }

  function handleBackToCheck() {
    setView("check");
  }

  const loadingLabel =
    activeTab === "image" ? t(language, "analyzingImageButton") : t(language, "analyzingButton");

  const checkForm = (
    <form onSubmit={handleSubmit}>
      <div className="mb-8 md:mb-12">
        <button
          type="button"
          className="btn-primary touch-target px-6"
          onClick={() => setView("home")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          {t(language, "page.check.backHome")}
        </button>
        <h2 className="mt-6 text-4xl font-black uppercase leading-[0.95] tracking-tighter md:mt-10 md:text-6xl">
          {t(language, "page.check.hero")}
        </h2>
        <p className="mt-4 max-w-2xl text-lg font-semibold leading-relaxed md:text-xl">
          {t(language, "page.check.subtitle")}
        </p>
      </div>

      <div
        className="grid grid-cols-1 gap-0 border border-ink md:grid-cols-3"
        role="tablist"
        aria-label={t(language, "inputTabsLabel")}
        onKeyDown={handleTablistKey}
      >
        <button
          type="button"
          role="tab"
          id="tab-text"
          ref={textTabRef}
          tabIndex={activeTab === "text" ? 0 : -1}
          aria-selected={activeTab === "text"}
          aria-controls="panel-text"
          className={`w-full min-h-[104px] border-strong p-6 text-left transition-colors md:min-h-[132px] md:p-8 border-b md:border-b-0 md:border-r ${
            activeTab === "text"
              ? "bg-ink text-on-ink"
              : "hover:bg-ink hover:text-on-ink"
          }`}
          onClick={() => {
            setActiveTab("text");
            tabRefs.current.text?.focus();
          }}
        >
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">
            Method 01
          </span>
          <span className="block text-xl font-bold tracking-tighter md:text-2xl">{t(language, "page.check.methodText")}</span>
          <span className="mt-2 block text-sm font-bold opacity-70 md:text-base">{t(language, "page.check.methodTextSub")}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-image"
          ref={(el) => (tabRefs.current.image = el)}
          tabIndex={activeTab === "image" ? 0 : -1}
          aria-selected={activeTab === "image"}
          aria-controls="panel-image"
          className={`w-full min-h-[104px] border-strong p-6 text-left transition-colors md:min-h-[132px] md:p-8 border-b md:border-b-0 md:border-r ${
            activeTab === "image"
              ? "bg-ink text-on-ink"
              : "hover:bg-ink hover:text-on-ink"
          }`}
          onClick={() => setActiveTab("image")}
        >
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">
            Method 02
          </span>
          <span className="block text-xl font-bold tracking-tighter md:text-2xl">{t(language, "page.check.methodImage")}</span>
          <span className="mt-2 block text-sm font-bold opacity-70 md:text-base">{t(language, "page.check.methodImageSub")}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-scan"
          ref={(el) => (tabRefs.current.scan = el)}
          tabIndex={activeTab === "scan" ? 0 : -1}
          aria-selected={activeTab === "scan"}
          aria-controls="panel-scan"
          className={`w-full min-h-[104px] border-strong p-6 text-left transition-colors md:min-h-[132px] md:p-8 border-b md:border-b-0 ${
            activeTab === "scan"
              ? "bg-ink text-on-ink"
              : "hover:bg-ink hover:text-on-ink"
          }`}
          onClick={() => setActiveTab("scan")}
        >
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">
            Method 03
          </span>
          <span className="block text-xl font-bold tracking-tighter md:text-2xl">{t(language, "page.check.methodQr")}</span>
          <span className="mt-2 block text-sm font-bold opacity-70 md:text-base">{t(language, "page.check.methodQrSub")}</span>
        </button>
      </div>

      <div
        role="tabpanel"
        id="panel-text"
        aria-labelledby="tab-text"
        hidden={activeTab !== "text"}
        tabIndex={activeTab === "text" ? 0 : undefined}
        className="border border-ink bg-paper p-6 md:p-10"
      >
        {activeTab === "text" && (
          <>
            <TextInput language={language} value={rawText} onChange={setRawText} />
            <RedactionPreview language={language} text={liveRedactedText} />
            {phonesInText.length > 0 && (
              <label className="mt-6 flex cursor-pointer items-start gap-4 border border-ink bg-soft p-5 md:p-6">
                <input
                  type="checkbox"
                  checked={onlineLookup}
                  onChange={(e) => setOnlineLookup(e.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0"
                />
                <span>
                  <span className="block font-bold">{t(language, "check.onlineLookupLabel")}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {t(language, "check.onlineLookupHint")}
                  </span>
                </span>
              </label>
            )}
            <div className="mt-6 flex items-start gap-5 border border-green-600 bg-green-50 p-5 md:p-6 dark:bg-green-950">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-10 w-10 shrink-0 text-green-600" aria-hidden="true">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <ul className="list-disc space-y-2 pl-5 text-base font-bold">
                <li>{t(language, "page.check.shieldPhone")}</li>
                <li>{t(language, "page.check.shieldCard")}</li>
                <li>{t(language, "page.check.shieldSecrets")}</li>
              </ul>
            </div>
          </>
        )}
      </div>
      <div
        role="tabpanel"
        id="panel-image"
        aria-labelledby="tab-image"
        hidden={activeTab !== "image"}
        tabIndex={activeTab === "image" ? 0 : undefined}
        className="mt-8 border border-ink bg-paper p-6 md:p-10"
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
        className="mt-8 border border-ink bg-paper p-6 md:p-10"
      >
        {activeTab === "scan" && (
          <Suspense fallback={<p className="text-muted">{t(language, "loadingScanner")}</p>}>
            <Scanner
              language={language}
              onQrDecoded={handleQrDecoded}
              onSetupHealthProfile={() => setView("health")}
            />
          </Suspense>
        )}
      </div>

      {error && (
        <p role="alert" className="alert-red p-3 font-semibold">
          {error}
        </p>
      )}

      <p role="status" className="sr-only" aria-live="polite">
        {loading ? loadingLabel : ""}
      </p>

      {activeTab !== "scan" && (
<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {loading ? (
            <>
              <button
                type="button"
                className="btn-secondary touch-target px-8"
                onClick={handleCancel}
              >
                {t(language, "cancelButton")}
              </button>
              <button
                type="submit"
                className="btn-primary touch-target px-10"
                disabled
              >
                {loadingLabel}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary touch-target px-8"
                onClick={() => {
                  setRawText("");
                  setImageBase64(null);
                  setImageMimeType(null);
                  setOnlineLookup(false);
                  setError(null);
                }}
              >
                {t(language, "page.check.clearButton")}
              </button>
              <button
                type="submit"
                className="btn-primary touch-target px-10"
              >
                {t(language, "page.check.analyzeButton")}
              </button>
            </>
          )}
</div>
      )}

      <div className="mt-12 grid grid-cols-1 gap-10 border-t border-strong pt-10 md:grid-cols-2 md:gap-16">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em]">{t(language, "page.check.privacyTitle1")}</h3>
          <p className="mt-6 text-xl font-semibold leading-relaxed">{t(language, "page.check.privacyBody1")}</p>
        </div>
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em]">{t(language, "page.check.privacyTitle2")}</h3>
          <p className="mt-6 text-xl font-semibold leading-relaxed">{t(language, "page.check.privacyBody2")}</p>
        </div>
      </div>
    </form>
  );

  // results without a stored result (e.g. a future direct route) simply falls
  // back to the input form rather than rendering an empty screen.
  const showResultsScreen = view === "results" && result;
  const activeView = view === "results" || view === "evidence" ? "history" : view;

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-strong focus:bg-paper focus:px-4 focus:py-2 focus:font-black focus:text-ink"
      >
        {t(language, "common.skip")}
      </a>
      <Header
        language={language}
        activeView={activeView}
        onNavigate={setView}
        theme={theme}
        onToggleTheme={toggleTheme}
        textSize={textSize}
        onCycleTextSize={cycleTextSize}
        onLanguageChange={setLanguage}
      />

      <main id="main-content" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-8 md:pb-16">
        {view === "home" && (
          <HomeView
            language={language}
            onNavigate={setView}
            history={history}
            onSelectHistory={handleSelectHistoryEntry}
          />
        )}
        {showResultsScreen ? (
          <ResultsView
            language={language}
            result={result}
            redactedText={resultRedactedText}
            onStartOver={handleStartOver}
            onViewEvidence={() => setView("evidence")}
          />
        ) : view === "results" ? (
          checkForm
        ) : view === "history" ? (
          <HistoryPanel
            language={language}
            history={history}
            onSelect={handleSelectHistoryEntry}
            onClear={handleClearHistory}
            onBack={handleBackToCheck}
          />
        ) : view === "health" ? (
          <HealthProfile language={language} onBack={handleBackToCheck} />
        ) : view === "settings" ? (
          <SettingsView
            language={language}
            theme={theme}
            onToggleTheme={toggleTheme}
            textSize={textSize}
            onCycleTextSize={cycleTextSize}
            onLanguageChange={setLanguage}
          />
        ) : view === "evidence" ? (
          <EvidenceView
            language={language}
            result={result}
            redactedText={resultRedactedText}
            onBack={() => setView("home")}
          />
        ) : view === "report" ? (
          <ReportFlow language={language} onBack={() => setView("home")} />
        ) : view === "family" ? (
          <FamilyView language={language} onNavigate={setView} />
        ) : view === "food" ? (
          <FoodScanView language={language} onNavigate={setView} />
        ) : view === "locations" ? (
          <LocationView language={language} />
        ) : view === "help" ? (
          <HelpModal language={helpLanguage} onClose={() => setView("home")} asView />
        ) : view === "check" ? (
          checkForm
        ) : null}

        {showHelp && !(view === "help") && (
          <HelpModal language={helpLanguage} onClose={() => setShowHelp(false)} />
        )}
      </main>

      <MobileNavigation language={language} activeView={activeView} onNavigate={setView} />
    </div>
  );
}