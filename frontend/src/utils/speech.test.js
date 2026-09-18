import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isSpeechSynthesisSupported,
  speak,
  stopSpeaking,
  getMatchingVoice,
  isSpeechRecognitionSupported,
  createSpeechRecognizer,
} from "./speech";

describe("speech synthesis (read-aloud)", () => {
  let cancelSpy;
  let speakSpy;

  beforeEach(() => {
    cancelSpy = vi.fn();
    speakSpy = vi.fn();
    vi.stubGlobal("speechSynthesis", { cancel: cancelSpy, speak: speakSpy });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        constructor(text) {
          this.text = text;
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("isSpeechSynthesisSupported reflects window support", () => {
    expect(isSpeechSynthesisSupported()).toBe(true);
  });

  test("speak() cancels any current speech, then speaks with the right language", () => {
    speak("hello there", "hi");
    expect(cancelSpy).toHaveBeenCalled();
    expect(speakSpy).toHaveBeenCalled();
    const utterance = speakSpy.mock.calls[0][0];
    expect(utterance.text).toBe("hello there");
    expect(utterance.lang).toBe("hi-IN");
  });

  test("speak() uses en-IN for English", () => {
    speak("hello", "en");
    expect(speakSpy.mock.calls[0][0].lang).toBe("en-IN");
  });

  test("speak() does nothing for empty text", () => {
    speak("", "en");
    expect(speakSpy).not.toHaveBeenCalled();
  });

  test("stopSpeaking() cancels speech", () => {
    stopSpeaking();
    expect(cancelSpy).toHaveBeenCalled();
  });

  test("speak() maps every supported language to its own Indian locale", () => {
    const expectations = {
      en: "en-IN",
      hi: "hi-IN",
      ta: "ta-IN",
      te: "te-IN",
      bn: "bn-IN",
      mr: "mr-IN",
    };
    for (const [language, expectedTag] of Object.entries(expectations)) {
      speak("hello", language);
      expect(speakSpy.mock.calls.at(-1)[0].lang).toBe(expectedTag);
    }
  });

  test("speak() prefers the system voice matching the language exactly", () => {
    vi.stubGlobal("speechSynthesis", {
      cancel: cancelSpy,
      speak: speakSpy,
      getVoices: () => [
        { lang: "en-IN", name: "English (India)" },
        { lang: "ta-IN", name: "Tamil (India)" },
        { lang: "te-IN", name: "Telugu (India)" },
      ],
    });

    speak("vanakkam", "ta");
    expect(speakSpy.mock.calls[0][0].voice.name).toBe("Tamil (India)");
  });

  test("speak() falls back to a voice with the same language prefix", () => {
    vi.stubGlobal("speechSynthesis", {
      cancel: cancelSpy,
      speak: speakSpy,
      getVoices: () => [{ lang: "en-US", name: "English (US)" }],
    });

    speak("hello", "en");
    expect(speakSpy.mock.calls[0][0].voice.name).toBe("English (US)");
  });

  test("getMatchingVoice returns null when no voice matches the language", () => {
    vi.stubGlobal("speechSynthesis", {
      cancel: cancelSpy,
      speak: speakSpy,
      getVoices: () => [{ lang: "en-US", name: "English (US)" }],
    });

    expect(getMatchingVoice("ta")).toBeNull();
  });

  test("speak() wires the onend callback so callers can reset state", () => {
    const onEnd = vi.fn();
    speak("hello", "en", onEnd);
    expect(typeof speakSpy.mock.calls[0][0].onend).toBe("function");
    speakSpy.mock.calls[0][0].onend();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("speech recognition (voice input)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("isSpeechRecognitionSupported is false when neither global exists", () => {
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  test("createSpeechRecognizer returns null when unsupported", () => {
    expect(createSpeechRecognizer("en")).toBeNull();
  });

  test("createSpeechRecognizer configures language when supported", () => {
    class FakeRecognition {}
    vi.stubGlobal("SpeechRecognition", FakeRecognition);

    const recognizer = createSpeechRecognizer("hi");
    expect(recognizer).toBeInstanceOf(FakeRecognition);
    expect(recognizer.lang).toBe("hi-IN");
    expect(recognizer.interimResults).toBe(false);
  });
});
