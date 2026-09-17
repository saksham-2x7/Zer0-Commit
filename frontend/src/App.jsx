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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const canSubmit = inputType === "text" ? rawText.trim().length > 0 : Boolean(imageBase64);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) {
      setError(t(language, "errorNeedInput"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await analyzeMessage({
        language,
        inputType,
        rawText: inputType === "text" ? rawText : undefined,
        imageBase64: inputType === "image" ? imageBase64 : undefined,
      });
      setResult(response);
    } catch (err) {
      setError(err.message || t(language, "errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  function handleStartOver() {
    setResult(null);
    setRawText("");
    setImageBase64(null);
    setError(null);
  }

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
          redactedText={inputType === "text" ? redactText(rawText) : ""}
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
            <ImageUpload language={language} onImageSelected={setImageBase64} />
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? t(language, "analyzingButton") : t(language, "analyzeButton")}
          </button>
        </form>
      )}
    </div>
  );
}
