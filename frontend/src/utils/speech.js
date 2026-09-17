/**
 * Thin wrappers around the browser's native Web Speech API. Every export
 * is feature-detected — callers must check the `is*Supported()` function
 * before showing UI for it, since support (especially SpeechRecognition)
 * varies a lot across browsers.
 */

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text, language) {
  if (!isSpeechSynthesisSupported() || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === "hi" ? "hi-IN" : "en-IN";
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
