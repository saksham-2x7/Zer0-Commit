/**
 * Thin wrappers around the browser's native Web Speech API. Every export
 * is feature-detected — callers must check the `is*Supported()` function
 * before showing UI for it, since support (especially SpeechRecognition)
 * varies a lot across browsers.
 */

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const LANGUAGE_TAGS = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
  te: "te-IN",
  bn: "bn-IN",
  mr: "mr-IN",
};

/** Indian-English fallback covers any language the voice list cannot match. */
export function languageSpeechTag(language) {
  return LANGUAGE_TAGS[language] || "en-IN";
}

/**
 * Picks the best available system voice for a language. Prefers an exact
 * locale match (e.g. `ta-IN` for Tamil), then any voice whose language shares
 * the same language prefix, and falls back to the browser default otherwise.
 */
export function getMatchingVoice(language) {
  if (!isSpeechSynthesisSupported()) return null;
  let voices = [];
  try {
    voices = window.speechSynthesis.getVoices?.() || [];
  } catch {
    voices = [];
  }
  if (voices.length === 0) return null;

  const target = languageSpeechTag(language).toLowerCase();
  const langPrefix = target.split("-")[0];
  const exact = voices.find((voice) => voice.lang && voice.lang.toLowerCase() === target);
  if (exact) return exact;
  return (
    voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith(langPrefix)) || null
  );
}

export function speak(text, language, onEnd) {
  if (!isSpeechSynthesisSupported() || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = languageSpeechTag(language);
  const voice = getMatchingVoice(language);
  if (voice) utterance.voice = voice;
  if (typeof onEnd === "function") {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

function getSpeechRecognitionImpl() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionImpl());
}

/** @returns a configured recognizer instance, or null if unsupported. */
export function createSpeechRecognizer(language) {
  const Impl = getSpeechRecognitionImpl();
  if (!Impl) return null;
  const recognizer = new Impl();
  recognizer.lang = language === "hi" ? "hi-IN" : "en-IN";
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  return recognizer;
}
