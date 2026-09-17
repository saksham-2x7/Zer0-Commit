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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App — text submission", () => {
  test("sends REDACTED text to the backend, not the raw text typed by the user", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    const textarea = screen.getByPlaceholderText(/paste the sms/i);
    fireEvent.change(textarea, {
      target: { value: "URGENT: share your OTP, call 9876543210 immediately." },
    });
    fireEvent.click(screen.getByRole("button", { name: /check message/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const [, options] = global.fetch.mock.calls[0];
    const sentBody = JSON.parse(options.body);
    expect(sentBody.rawText).not.toContain("9876543210");
    expect(sentBody.rawText).toContain("OTP");
  });

  test("renders the risk result, evidence snippets, and human-readable pattern labels", async () => {
    mockFetchOnce(SAMPLE_RESULT);
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/paste the sms/i), {
      target: { value: "URGENT: share your OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check message/i }));

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

    fireEvent.change(screen.getByPlaceholderText(/paste the sms/i), {
      target: { value: "hello there" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check message/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/readable text/i);
  });

  test("blocks submission with a friendly message when there is no input", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /check message/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/please paste a message/i);
  });
});

describe("App — language toggle", () => {
  test("switches visible UI strings to Hindi and back", () => {
    render(<App />);
    expect(screen.getByText("ScamSahayak")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle language/i }));
    expect(screen.getByText("स्कैम सहायक")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle language/i }));
    expect(screen.getByText("ScamSahayak")).toBeInTheDocument();
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

    fireEvent.change(screen.getByPlaceholderText(/paste the sms/i), {
      target: { value: "URGENT: share your OTP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check message/i }));
    await screen.findByText(/high risk/i);

    fireEvent.click(screen.getByRole("button", { name: /save a copy of this result/i }));

    expect(openSpy).toHaveBeenCalledWith(
      "https://example-bucket.s3.amazonaws.com/evidence/case_1.json",
      "_blank",
      "noopener,noreferrer"
    );
  });
});
