import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

function mockFetchOnce(responseBody, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => responseBody,
  });
}

const SAMPLE_RESULT = {
  caseId: "case_1",
  riskLevel: "high",
  riskDisclaimer: "This is a risk signal, not an official fraud determination.",
  matchedPatterns: ["urgency", "otp_request"],
  evidence: [
    { pattern: "urgency", snippet: "URGENT: verify now" },
    { pattern: "otp_request", snippet: "share your OTP" },
  ],
  explanation: "This message shows urgency and asks for your OTP.",
  checklist: ["Never share your OTP, PIN, CVV, or password."],
  languageUsed: "en",
  inputSummary: { inputType: "text", ocrUsed: false, redactionApplied: true, charactersAnalyzed: 40 },
  reportingLinks: { helpline: "1930", portal: "https://cybercrime.gov.in/" },
  evidenceBundle: { available: false },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  // Prevent the first-visit help modal from popping up mid-test and
  // keep each test's localStorage state isolated.
  window.localStorage.clear();
  window.localStorage.setItem("scamsahayak-has-seen-help", "true");
  // The app opens on the home screen by default (see the "startup view"
  // tests below). The pre-existing tests interact with the input form, so
  // the harness mounts at #/check; the startup tests clear the hash to
  // exercise the real no-hash default.
  window.history.replaceState(null, "", "#/check");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App — text submission", () => {
  test("sends REDACTED text to the backend, not the raw text typed by the user", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    const textarea = screen.getByPlaceholderText(/paste your message/i);
    fireEvent.change(textarea, {
      target: { value: "URGENT: share your OTP, call 9876543210 immediately." },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.rawText).not.toContain("9876543210");
    expect(sentBody.rawText).toContain("OTP");
  });

  test("renders the risk result, evidence snippets, and human-readable pattern labels", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: share your OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));

    await screen.findByText(/high risk/i);
    expect(screen.getByText(/Creates urgency or threatens/i)).toBeInTheDocument();
    expect(screen.getByText(/Requests your OTP, PIN, or CVV/i)).toBeInTheDocument();
    expect(screen.getByText('"share your OTP"')).toBeInTheDocument();
    // Internal pattern keys should never be shown directly to the user.
    expect(screen.queryByText("otp_request")).not.toBeInTheDocument();
  });

  test("shows an error state and does not crash when the request fails", async () => {
    mockFetchOnce(
      { error: { code: "ANALYSIS_FAILED", message: "No readable text found." } },
      false
    );
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "hello there" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/readable text/i);
  });

  test("falls back to the generic error message for an untranslated error code", async () => {
    mockFetchOnce(
      { error: { code: "SOME_FUTURE_CODE", message: "opaque internal detail" } },
      false
    );
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "hello there" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Something went wrong/i);
    expect(alert).not.toHaveTextContent("errorCode_SOME_FUTURE_CODE");
    expect(alert).not.toHaveTextContent("opaque internal detail");
  });

  test("blocks submission with a friendly message when there is no input", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/please paste a message/i);
  });

  test("shows a friendly localized network error when the fetch throws a TypeError", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: share your OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't reach the server/i);
    expect(alert).not.toHaveTextContent("Failed to fetch");
  });

  test("cancel aborts the in-flight request, hides loading, and shows no error", async () => {
    global.fetch = vi.fn(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        })
    );
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: share your OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));

    fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /check for scam/i })).not.toBeDisabled()
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("App — language selector", () => {
  test("switches visible UI strings across all 6 supported languages", () => {
    render(<App />);
    expect(screen.getByText("ScamSahayak")).toBeInTheDocument();

    const selector = screen.getByRole("combobox", { name: /select language/i });

    fireEvent.change(selector, { target: { value: "hi" } });
    expect(screen.getByText("स्कैम सहायक")).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: "ta" } });
    expect(screen.getByText("ஸ்காம் சஹாயக்")).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: "te" } });
    expect(screen.getByText("స్కామ్ సహాయక్")).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: "bn" } });
    expect(screen.getByText("স্ক্যাম সহায়ক")).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: "mr" } });
    expect(screen.getByText("स्कॅम सहायक")).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: "en" } });
    expect(screen.getByText("ScamSahayak")).toBeInTheDocument();
  });

  test("persists the selected language and syncs <html lang> and <title>", () => {
    render(<App />);
    const selector = screen.getByRole("combobox", { name: /select language/i });

    fireEvent.change(selector, { target: { value: "hi" } });
    expect(window.localStorage.getItem("scamsahayak-language")).toBe("hi");
    expect(document.documentElement.lang).toBe("hi");
    expect(document.title).toBe("स्कैम सहायक — कार्रवाई से पहले संदिग्ध संदेश जांचें");

    fireEvent.change(selector, { target: { value: "en" } });
    expect(window.localStorage.getItem("scamsahayak-language")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("ScamSahayak — Check a suspicious message before you act");
  });

  test("restores a previously saved language on the next visit", () => {
    window.localStorage.setItem("scamsahayak-language", "ta");
    render(<App />);

    const selector = screen.getByRole("combobox");
    expect(selector.value).toBe("ta");
    expect(document.documentElement.lang).toBe("ta");
    expect(screen.getByText("ஸ்காம் சஹாயக்")).toBeInTheDocument();
  });
});

describe("App — help guide", () => {
  test("shows the help modal automatically on first visit, and it can be closed", () => {
    window.localStorage.removeItem("scamsahayak-has-seen-help");
    render(<App />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /got it, close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("does not show the help modal again on a later visit", () => {
    render(<App />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("can be reopened anytime via the help button", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByRole("heading", { name: /how can we help you today/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("App — text size", () => {
  test("cycles through normal -> large -> extra large -> normal", () => {
    render(<App />);
    const button = screen.getByRole("button", { name: /text size: normal/i });

    fireEvent.click(button);
    expect(screen.getByRole("button", { name: /text size: large/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /text size: large/i }));
    expect(screen.getByRole("button", { name: /text size: extra large/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /text size: extra large/i }));
    expect(screen.getByRole("button", { name: /text size: normal/i })).toBeInTheDocument();
  });
});

describe("App — evidence download", () => {
  test("opens the backend's signed URL directly when the evidence bundle is available", async () => {
    mockFetchOnce({
      ...SAMPLE_RESULT,
      evidenceBundle: { available: true, downloadUrl: "https://example-bucket.s3.amazonaws.com/evidence/case_1.json" },
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: share your OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));
    await screen.findByText(/high risk/i);

    fireEvent.click(screen.getByRole("button", { name: /save a copy of this result/i }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://example-bucket.s3.amazonaws.com/evidence/case_1.json",
      "_blank",
      "noopener,noreferrer"
    );
  });
});

describe("App — history", () => {
  function seedHistory() {
    window.localStorage.setItem(
      "scamsahayak-history",
      JSON.stringify([
        {
          savedAt: "2026-09-01T10:00:00.000Z",
          language: "en",
          redactedText: "URGENT: share your OTP",
          result: SAMPLE_RESULT,
        },
        {
          savedAt: "2026-09-02T10:00:00.000Z",
          language: "en",
          redactedText: "hello",
          result: { ...SAMPLE_RESULT, caseId: "case_2", riskLevel: "low" },
        },
      ])
    );
  }

  // History is reachable both from the header nav and the fixed bottom nav,
  // so it renders twice (with and without the header wrapper) — clicking the
  // first one is enough; the test asserts the panel either way.
  function openHistory() {
    fireEvent.click(screen.getAllByRole("button", { name: "History" })[0]);
  }

  test("opens the history panel and renders saved entries", () => {
    seedHistory();
    render(<App />);

    openHistory();
    expect(screen.getByText("URGENT: share your OTP")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /view this past result/i })).toHaveLength(2);
  });

  test("selecting a saved entry restores its language and result", async () => {
    seedHistory();
    render(<App />);

    openHistory();
    fireEvent.click(screen.getAllByRole("button", { name: /view this past result/i })[0]);

    await screen.findByText(/high risk/i);
    expect(screen.getByText(/this message shows urgency and asks for your OTP/i)).toBeInTheDocument();
  });

  test("clears all history and returns to the main view", () => {
    seedHistory();
    render(<App />);

    openHistory();
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));

    expect(screen.getByText(/no checks yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByPlaceholderText(/paste your message/i)).toBeInTheDocument();
    expect(window.localStorage.getItem("scamsahayak-history")).toBeNull();
  });

  test("shows the empty state when history is empty", () => {
    render(<App />);
    openHistory();
    expect(screen.getByText(/no checks yet/i)).toBeInTheDocument();
  });
});

describe("App — start over", () => {
  test("resets back to the input form after a completed analysis", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: share your OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));
    await screen.findByText(/high risk/i);

    fireEvent.click(screen.getByRole("button", { name: /check another message/i }));

    expect(screen.getByPlaceholderText(/paste your message/i)).toBeInTheDocument();
    expect(screen.queryByText(/high risk/i)).not.toBeInTheDocument();
  });
});

describe("App — keyboard tab navigation", () => {
  test("arrow keys move between tabs and Home/End jump to first/last", () => {
    render(<App />);
    const tablist = screen.getByRole("tablist", { name: /input tabs/i });

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /image upload/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /qr scanner/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /image upload/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(screen.getByRole("tab", { name: /text message/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.keyDown(tablist, { key: "End" });
    expect(screen.getByRole("tab", { name: /qr scanner/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("tabs use roving tabindex and the main landmark is a focusable skip target", () => {
    render(<App />);

    expect(screen.getByRole("tab", { name: /text message/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /image upload/i })).toHaveAttribute(
      "tabindex",
      "-1"
    );
    expect(screen.getByRole("tab", { name: /qr scanner/i })).toHaveAttribute("tabindex", "-1");

    const main = document.querySelector("#main-content");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(document.querySelector("header")).not.toBeNull();
    // Header (banner landmark) must sit outside <main>, not inside it.
    expect(main.contains(document.querySelector("header"))).toBe(false);
  });
});

describe("App — theme", () => {
  test("is light-only: the dark class is never applied to <html>, even with a stored dark preference", () => {
    window.localStorage.setItem("scamsahayak-theme", "dark");
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("does not render a light/dark toggle button", () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "Toggle dark mode" })).not.toBeInTheDocument();
  });
});

describe("App — read aloud", () => {
  test("reads the result aloud and stops on the second click", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    window.speechSynthesis = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] };
    global.SpeechSynthesisUtterance = vi.fn(function SpeechSynthesisUtterance(text) {
      this.text = text;
    });
    try {
      render(<App />);
      fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
        target: { value: "URGENT: share your OTP" },
      });
      fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));
      await screen.findByText(/high risk/i);

      fireEvent.click(screen.getByRole("button", { name: /read result aloud/i }));
      expect(screen.getByText(/reading the result aloud/i)).toBeInTheDocument();
      expect(window.speechSynthesis.speak).toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: /stop reading/i }));
      expect(screen.getByText(/stopped reading/i)).toBeInTheDocument();
    } finally {
      delete window.speechSynthesis;
      delete global.SpeechSynthesisUtterance;
    }
  });
});

describe("App — evidence download fallback", () => {
  test("builds and downloads the bundle client-side when there is no signed URL", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    const createUrl = vi.fn(() => "blob:evidence");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const clickSpy = vi.spyOn(window.HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: share your OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));
    await screen.findByText(/high risk/i);

    fireEvent.click(screen.getByRole("button", { name: /save a copy of this result/i }));

    expect(createUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledWith("blob:evidence");
  }, 15000);
});

describe("App — empty result sections", () => {
  test("shows the no-patterns and no-checklist fallbacks when arrays are empty", async () => {
    mockFetchOnce({ ...SAMPLE_RESULT, matchedPatterns: [], evidence: [], checklist: [] });
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "hello there" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));

    await screen.findByText(/no specific warning signs were matched/i);
    expect(screen.getByText(/no recommended steps/i)).toBeInTheDocument();
  });
});

describe("App — help modal keyboard", () => {
  test("pressing Escape closes the help modal", () => {
    window.localStorage.removeItem("scamsahayak-has-seen-help");
    render(<App />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("App — shell navigation", () => {
  test("moves between the home, settings, and check views", () => {
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: "Home" })[0]);
    expect(screen.getByText(/check if a message is a scam/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1930/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    expect(screen.getByRole("button", { name: /save all changes/i })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Check" })[0]);
    expect(screen.getByPlaceholderText(/paste your message/i)).toBeInTheDocument();
  });

  test("results view links to the evidence view and back to home", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: share your OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));
    await screen.findByText(/high risk/i);

    fireEvent.click(screen.getByRole("button", { name: /view scam proof/i }));
    expect(screen.getByRole("heading", { name: /scam proof certificate/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back to home/i }));
    expect(screen.getByText(/check if a message is a scam/i)).toBeInTheDocument();
  });

  test("home recent checks show real history and selecting one opens the result", async () => {
    window.localStorage.setItem(
      "scamsahayak-history",
      JSON.stringify([
        {
          savedAt: "2026-09-01T10:00:00.000Z",
          language: "en",
          redactedText: "URGENT: share your OTP",
          result: SAMPLE_RESULT,
        },
      ])
    );
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: "Home" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /save evidence/i }));

    await screen.findByText(/high risk/i);
    expect(screen.getByText(/this message shows urgency and asks for your OTP/i)).toBeInTheDocument();
  });
});

describe("App — online reputation lookup opt-in", () => {
  test("offers the online-lookup checkbox only when the raw text contains a phone number", () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    const textarea = screen.getByPlaceholderText(/paste your message/i);
    fireEvent.change(textarea, { target: { value: "URGENT: verify now" } });
    expect(screen.queryByRole("checkbox", { name: /check this number online/i })).not.toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "URGENT: call 9876543210 now" } });
    expect(screen.getByRole("checkbox", { name: /check this number online/i })).toBeInTheDocument();
  });

  test("sends NO phone numbers when the checkbox is left unticked", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: call 9876543210 now" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.onlineLookup).toBeFalsy();
    expect(sentBody.lookupPhones).toBeUndefined();
  });

  test("sends the phone number for lookup ONLY after the user ticks the box", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: call 9876543210 now" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /check this number online/i }));
    fireEvent.click(screen.getByRole("button", { name: /check for scam/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.onlineLookup).toBe(true);
    expect(sentBody.lookupPhones).toEqual(["9876543210"]);
    // The redacted text still never carries the raw number.
    expect(sentBody.rawText).not.toContain("9876543210");
  });

  test("clearing the input also resets the online-lookup consent", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste your message/i), {
      target: { value: "URGENT: call 9876543210 now" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /check this number online/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));

    expect(screen.queryByRole("checkbox", { name: /check this number online/i })).not.toBeInTheDocument();
  });
});

describe("App — startup view", () => {
  // The app must open on the home screen, not the check form, and the home
  // screen must not leak the check form's "Back to Home" button or input.
  test("opens on the home screen, not the check form, when there is no hash", () => {
    window.history.replaceState(null, "", window.location.pathname);
    render(<App />);

    expect(screen.getByText(/check if a message is a scam/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/paste your message/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back to home/i })).not.toBeInTheDocument();
  });

  test("the check form is one tap away from home via the Check nav", () => {
    window.history.replaceState(null, "", window.location.pathname);
    render(<App />);

    fireEvent.click(screen.getAllByRole("button", { name: "Check" })[0]);
    expect(screen.getByPlaceholderText(/paste your message/i)).toBeInTheDocument();
  });
});
