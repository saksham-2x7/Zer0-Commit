import { useState } from "react";
import { t } from "./i18n/translations";
import LanguageToggle from "./components/LanguageToggle";
import TextInput from "./components/TextInput";
import ImageUpload from "./components/ImageUpload";
import RedactionPreview from "./components/RedactionPreview";
import ResultsView from "./components/ResultsView";
import { analyzeMessage } from "./services/api";
import { redactText } from "./utils/redact";

export default function App() {
  const [language, setLanguage] = useState("en");
  const [inputType, setInputType] = useState("text");
  const [rawText, setRawText] = useState("");
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const canSubmit = inputType === "text" ? rawText.trim().length > 0 : Boolean(imageBase64);
  const redactedText = inputType === "text" ? redactText(rawText) : "";

  function handleImageSelected(base64, mimeType) {
    setImageBase64(base64);
    setImageMimeType(mimeType);
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
        inputType,
        rawText: inputType === "text" ? redactedText : undefined,
        imageBase64: inputType === "image" ? imageBase64 : undefined,
        imageMimeType: inputType === "image" ? imageMimeType : undefined,
      });
      setResult(response);
    } catch (err) {
      const message = err.code ? t(language, `errorCode_${err.code}`) : null;
      setError(message || err.message || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  function handleStartOver() {
    setResult(null);
    setRawText("");
    setImageBase64(null);
    setImageMimeType(null);
    setError(null);
  }

  const loadingLabel =
    inputType === "image" ? t(language, "analyzingImageButton") : t(language, "analyzingButton");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-900">{t(language, "appTitle")}</h1>
          <p className="mt-1 text-lg text-slate-600">{t(language, "appTagline")}</p>
        </div>
        <LanguageToggle language={language} onChange={setLanguage} />
      </header>

      {result ? (
        <ResultsView
          language={language}
          result={result}
          redactedText={redactedText}
          onStartOver={handleStartOver}
        />
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex gap-2" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={inputType === "text"}
              className={inputType === "text" ? "btn-primary flex-1" : "btn-secondary flex-1"}
              onClick={() => setInputType("text")}
            >
              {t(language, "tabText")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputType === "image"}
              className={inputType === "image" ? "btn-primary flex-1" : "btn-secondary flex-1"}
              onClick={() => setInputType("image")}
            >
              {t(language, "tabImage")}
            </button>
          </div>

          {inputType === "text" ? (
            <>
              <TextInput language={language} value={rawText} onChange={setRawText} />
              <RedactionPreview language={language} text={rawText} />
            </>
          ) : (
            <ImageUpload
              language={language}
              onImageSelected={handleImageSelected}
              onError={setError}
            />
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? loadingLabel : t(language, "analyzeButton")}
          </button>
        </form>
      )}
    </div>
  );
}
