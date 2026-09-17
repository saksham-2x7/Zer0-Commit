import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isSpeechSynthesisSupported,
  speak,
  stopSpeaking,
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
