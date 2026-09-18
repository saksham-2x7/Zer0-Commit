import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import TextInput from "./TextInput";

const MAX_TEXT_CHARS = 8000;

let recognizerInstance;

function installSpeechRecognition() {
  function MockSpeechRecognition() {
    recognizerInstance = {
      start: vi.fn(),
      stop: vi.fn(),
      lang: undefined,
      interimResults: undefined,
      maxAlternatives: undefined,
    };
    return recognizerInstance;
  }
  window.SpeechRecognition = MockSpeechRecognition;
}

afterEach(() => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  vi.restoreAllMocks();
});

describe("TextInput", () => {
  test("shows a plain placeholder when speech recognition is unsupported", () => {
    render(<TextInput language="en" value="" onChange={vi.fn()} />);
    expect(screen.queryByText(/speak instead of typing/i)).not.toBeInTheDocument();
  });

  test("starts listening and appends the transcribed text to the current value", () => {
    installSpeechRecognition();
    const onChange = vi.fn();
    render(<TextInput language="en" value="hello" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /speak instead of typing/i }));
    expect(screen.getByRole("button", { name: /listening/i })).toBeInTheDocument();
    expect(recognizerInstance.start).toHaveBeenCalledTimes(1);

    act(() => {
      recognizerInstance.onresult({ results: [[{ transcript: "world" }]] });
      recognizerInstance.onend();
    });
    expect(onChange).toHaveBeenCalledWith("hello world");
    expect(screen.getByRole("button", { name: /speak instead of typing/i })).toBeInTheDocument();
  });

  test("clicking again while listening stops the recognizer", () => {
    installSpeechRecognition();
    render(<TextInput language="en" value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /speak instead of typing/i }));
    fireEvent.click(screen.getByRole("button", { name: /listening/i }));
    expect(recognizerInstance.stop).toHaveBeenCalled();
  });

  test("shows the denied-microphone message for a not-allowed error", () => {
    installSpeechRecognition();
    render(<TextInput language="en" value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /speak instead of typing/i }));
    act(() => {
      recognizerInstance.onerror({ error: "not-allowed" });
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/microphone access was denied/i);
  });

  test("shows the generic voice error for other recognizer errors", () => {
    installSpeechRecognition();
    render(<TextInput language="en" value="" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /speak instead of typing/i }));
    act(() => {
      recognizerInstance.onerror({ error: "no-speech" });
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/voice input failed/i);
  });

  test("shows the remaining-character counter near the limit", () => {
    const longValue = "x".repeat(MAX_TEXT_CHARS - 100);
    render(<TextInput language="en" value={longValue} onChange={vi.fn()} />);
    expect(screen.getByText(`100 / ${MAX_TEXT_CHARS}`)).toBeInTheDocument();
  });

  test("flips the counter red when the character limit is reached", () => {
    render(<TextInput language="en" value={"x".repeat(MAX_TEXT_CHARS)} onChange={vi.fn()} />);
    const counter = screen.getByText(`0 / ${MAX_TEXT_CHARS}`);
    expect(counter.className).toContain("text-red-600");
  });

  test("does not show the counter while well under the limit", () => {
    render(<TextInput language="en" value="short" onChange={vi.fn()} />);
    expect(screen.queryByText(/\/ 8000/)).not.toBeInTheDocument();
  });
});