import { useRef, useState } from "react";
import { t } from "../i18n/translations";
import { isSpeechRecognitionSupported, createSpeechRecognizer } from "../utils/speech";

// Keep in sync with backend/api/validation.js DEFAULT_MAX_TEXT_CHARS (see CONTRACT.md).
const MAX_TEXT_CHARS = 8000;

export default function TextInput({ language, value, onChange }) {
  const remaining = MAX_TEXT_CHARS - value.length;
  const nearLimit = remaining <= 200;
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [pasteError, setPasteError] = useState(null);
  const recognizerRef = useRef(null);
  const textareaRef = useRef(null);

  function handleVoiceInput() {
    if (listening) {
      recognizerRef.current?.stop();
      return;
    }

    const recognizer = createSpeechRecognizer(language);
    if (!recognizer) return;

    setVoiceError(null);
    recognizer.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        onChange(value ? `${value} ${transcript}` : transcript);
      }
    };
    recognizer.onerror = (event) => {
      setListening(false);
      const code = event && event.error;
      setVoiceError(
        code === "not-allowed" || code === "service-not-allowed"
          ? t(language, "voiceInputNotAllowed")
          : t(language, "voiceInputError")
      );
    };
    recognizer.onend = () => setListening(false);

    recognizerRef.current = recognizer;
    setListening(true);
    recognizer.start();
  }

  async function handlePaste() {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          onChange(text);
          setPasteError(null);
          return;
        }
      }
      throw new Error("clipboard-unavailable");
    } catch {
      const textarea = textareaRef.current;
      if (textarea && document.execCommand?.("paste")) {
        setPasteError(null);
        return;
      }
      setPasteError(t(language, "page.check.pasteError"));
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-black uppercase tracking-[0.2em]">
          {t(language, "page.check.pasteHeading")}
        </h3>
        <button
          type="button"
          className="btn-secondary h-14"
          onClick={handlePaste}
        >
          {t(language, "page.check.pasteButton")}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className="field h-80 resize-none p-6 text-xl md:text-2xl"
        placeholder={t(language, "page.check.placeholder")}
        value={value}
        maxLength={MAX_TEXT_CHARS}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t(language, "page.check.placeholder")}
      />
      <div className="mt-4 flex items-center justify-between gap-2">
        {isSpeechRecognitionSupported() ? (
          <button type="button" className="btn-secondary h-12 min-h-[56px]" onClick={handleVoiceInput}>
            {listening ? t(language, "voiceInputListening") : t(language, "voiceInputButton")}
          </button>
        ) : (
          <span />
        )}
        {nearLimit && (
          <p className={`text-right text-sm tabular-nums ${remaining <= 0 ? "text-red-600" : "text-muted"}`}>
            {remaining} / {MAX_TEXT_CHARS}
          </p>
        )}
      </div>
      {voiceError && (
        <p role="alert" className="alert-red mt-2 p-3 text-sm font-semibold">
          {voiceError}
        </p>
      )}
      {pasteError && (
        <p role="alert" className="alert-red mt-2 p-3 text-sm font-semibold">
          {pasteError}
        </p>
      )}
    </div>
  );
}