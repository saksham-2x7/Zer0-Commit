import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EvidenceView from "./EvidenceView";

const RESULT = {
  caseId: "case_1",
  riskLevel: "high",
  matchedPatterns: ["urgency", "otp_request"],
  evidence: [
    { pattern: "urgency", snippet: "URGENT: verify now" },
    { pattern: "otp_request", snippet: "share your OTP" },
  ],
  explanation: "This message shows urgency and asks for your OTP.",
  checklist: ["Never share your OTP, PIN, CVV, or password."],
  riskDisclaimer: "This is a risk signal, not an official fraud determination.",
  reportingLinks: { helpline: "1930", portal: "https://cybercrime.gov.in/" },
  evidenceBundle: { available: false },
};

const REDACTED_TEXT = "URGENT: share your OTP, call ******** immediately.";

function renderEvidence(overrides = {}) {
  const props = {
    language: "en",
    result: RESULT,
    redactedText: REDACTED_TEXT,
    ...overrides,
  };
  return render(<EvidenceView {...props} />);
}

describe("EvidenceView", () => {
  test("renders the certificate header with badge, threat label, and privacy note", () => {
    renderEvidence();

    expect(screen.getByRole("heading", { name: /scam proof certificate/i })).toBeInTheDocument();
    expect(screen.getByText(/high risk - danger/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Creates urgency or threatens account\/KYC closure/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/your privacy is safe/i)).toBeInTheDocument();
  });

  test("moves keyboard focus onto the certificate title on mount", () => {
    renderEvidence();
    expect(screen.getByRole("heading", { name: /scam proof certificate/i })).toHaveFocus();
  });

  test("disables Save to Phone until there is redacted content", () => {
    const { unmount } = renderEvidence({ redactedText: null });
    expect(screen.getByRole("button", { name: /save to phone/i })).toBeDisabled();

    unmount();
    renderEvidence();
    expect(screen.getByRole("button", { name: /save to phone/i })).toBeEnabled();
  });

  test("the back button calls onBack when provided", () => {
    const onBack = vi.fn();
    renderEvidence({ onBack });

    fireEvent.click(screen.getByRole("button", { name: /back to home/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("the back button falls back to history.back when onBack is not provided", () => {
    const back = vi.fn();
    vi.spyOn(window.history, "back").mockImplementation(back);

    renderEvidence();
    fireEvent.click(screen.getByRole("button", { name: /back to home/i }));

    expect(back).toHaveBeenCalledTimes(1);
    window.history.back.mockRestore();
  });

  test("the print button calls window.print", () => {
    const print = vi.fn();
    vi.spyOn(window, "print").mockImplementation(print);

    renderEvidence();
    fireEvent.click(screen.getByRole("button", { name: /print paper copy/i }));

    expect(print).toHaveBeenCalledTimes(1);
    window.print.mockRestore();
  });

  test("shows the on-device note when no raw text is provided", () => {
    renderEvidence();

    expect(screen.getByText(/stays only on this device/i)).toBeInTheDocument();
    expect(screen.getByText(REDACTED_TEXT)).toBeInTheDocument();
  });

  test("shows the raw text when it is provided", () => {
    renderEvidence({ rawText: "URGENT: please send OTP now" });

    expect(screen.getByText(/URGENT: please send OTP now/)).toBeInTheDocument();
  });

  test("shows the no-content fallback in the AI-saw panel when redactedText is empty", () => {
    renderEvidence({ redactedText: "" });

    expect(screen.getByText(/no message content to show/i)).toBeInTheDocument();
  });

  test("lists the proof rows with their privacy-key captions", () => {
    renderEvidence();

    expect(screen.getByText(/your name and number were hidden/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no personal data left your phone/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/This was your name or a private ID number/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/This was your private mobile phone number/i).length).toBeGreaterThanOrEqual(1);
  });

  test("renders one threat card per matched pattern with a danger meter", () => {
    renderEvidence();

    expect(screen.getByText(/Requests your OTP, PIN, or CVV/i)).toBeInTheDocument();
    expect(screen.getAllByText(/very dangerous/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/danger level/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("98%")).toHaveLength(2);
  });

  test("shows the no-patterns fallback when matchedPatterns is empty", () => {
    renderEvidence({ result: { ...RESULT, matchedPatterns: [], evidence: [] } });

    expect(screen.getByText(/no specific warning signs were matched/i)).toBeInTheDocument();
  });

  test("renders the report-online link and the share button", () => {
    renderEvidence();

    expect(screen.getByRole("link", { name: /report online now/i })).toHaveAttribute(
      "href",
      "https://cybercrime.gov.in/"
    );
    expect(screen.getByRole("button", { name: /send to my family/i })).toBeInTheDocument();
  });

  test("the share button does not crash when the Web Share API is unavailable", () => {
    renderEvidence();

    fireEvent.click(screen.getByRole("button", { name: /send to my family/i }));

    expect(screen.getByRole("button", { name: /send to my family/i })).toBeInTheDocument();
  });
});