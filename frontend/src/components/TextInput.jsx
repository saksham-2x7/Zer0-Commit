import { useRef, useState } from "react";
import { t } from "../i18n/translations";
import { isSpeechRecognitionSupported, createSpeechRecognizer } from "../utils/speech";

// Keep in sync with backend/api/validation.js DEFAULT_MAX_TEXT_CHARS (see CONTRACT.md).
const MAX_TEXT_CHARS = 8000;

export default function TextInput({ language, value, onChange }) {
  const remaining = MAX_TEXT_CHARS - value.length;
  const nearLimit = remaining <= 200;
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef(null);

  function handleVoiceInput() {
    if (listening) {
      recognizerRef.current?.stop();
      return;
    }

    const recognizer = createSpeechRecognizer(language);
    if (!recognizer) return;

    recognizer.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        onChange(value ? `${value} ${transcript}` : transcript);
      }
    };
    recognizer.onerror = () => setListening(false);
    recognizer.onend = () => setListening(false);

    recognizerRef.current = recognizer;
    setListening(true);
    recognizer.start();
  }

  return (
    <div>
      <textarea
        className="w-full min-h-[160px] rounded-lg border border-slate-300 p-4 text-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
        placeholder={t(language, "textPlaceholder")}
        value={value}
        maxLength={MAX_TEXT_CHARS}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t(language, "textPlaceholder")}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        {isSpeechRecognitionSupported() ? (
          <button type="button" className="btn-secondary text-sm" onClick={handleVoiceInput}>
            {listening ? t(language, "voiceInputListening") : t(language, "voiceInputButton")}
          </button>
        ) : (
          <span />
        )}
        {nearLimit && (
          <p className={`text-right text-sm ${remaining <= 0 ? "text-red-600" : "text-slate-500 dark:text-slate-400"}`}>
            {remaining} / {MAX_TEXT_CHARS}
          </p>
        )}
      </div>
    </div>
  );
}
