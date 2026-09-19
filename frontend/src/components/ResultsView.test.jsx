import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ResultsView from "./ResultsView";

const SAMPLE_RESULT = {
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
  inputSummary: { inputType: "text", ocrUsed: false, redactionApplied: true, charactersAnalyzed: 40 },
  reportingLinks: { helpline: "1930", portal: "https://cybercrime.gov.in/" },
  evidenceBundle: { available: false },
};

const REDACTED_TEXT = "URGENT: share your OTP, call ******** immediately.";

function renderResults(overrides = {}) {
  const props = {
    language: "en",
    result: SAMPLE_RESULT,
    redactedText: REDACTED_TEXT,
    onStartOver: vi.fn(),
    ...overrides,
  };
  return render(<ResultsView {...props} />);
}

describe("ResultsView", () => {
  test("renders the verdict banner with the danger badge and the explanation", () => {
    renderResults();

    expect(screen.getByRole("heading", { name: /scam check result/i })).toBeInTheDocument();
    expect(screen.getByText(/danger: likely a scam/i)).toBeInTheDocument();
    expect(screen.getByText(/This message shows urgency and asks for your OTP\./i)).toBeInTheDocument();
    expect(screen.getByText(/risk signal, not an official fraud determination/i)).toBeInTheDocument();
  });

  test("shows High Risk in the Risk Score stat for high-risk results", () => {
    renderResults();
    expect(screen.getByText(/high risk/i)).toBeInTheDocument();
  });

  test("lists each matched pattern with its label and reason, never the raw key", () => {
    renderResults();

    expect(screen.getByText(/Creates urgency or threatens account\/KYC closure/i)).toBeInTheDocument();
    expect(screen.getByText(/Requests your OTP, PIN, or CVV/i)).toBeInTheDocument();
    expect(screen.getByText(/The sender is trying to rush you/i)).toBeInTheDocument();
    expect(screen.getByText(/The sender asks for your one-time password/i)).toBeInTheDocument();

    expect(screen.queryByText("otp_request")).not.toBeInTheDocument();
    expect(screen.queryByText("urgency")).not.toBeInTheDocument();
  });

  test("shows the quoted evidence snippet for a matched pattern", () => {
    renderResults();
    expect(screen.getByText('"share your OTP"')).toBeInTheDocument();
  });

  test("shows the redacted text and the automatic-redaction status", () => {
    renderResults();

    expect(screen.getByText(/URGENT: share your OTP/i)).toBeInTheDocument();
    expect(screen.getByText(/hidden automatically/i)).toBeInTheDocument();
  });

  test("renders every checklist item under What to do now", () => {
    renderResults();
    expect(screen.getByText(/Never share your OTP, PIN, CVV, or password\./)).toBeInTheDocument();
  });

  test("calls onStartOver when the user starts over", () => {
    const onStartOver = vi.fn();
    renderResults({ onStartOver });

    fireEvent.click(screen.getByRole("button", { name: /check another message/i }));

    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  test("always offers a way to save a copy of the result", () => {
    renderResults();
    expect(screen.getByRole("button", { name: /save a copy of this result/i })).toBeInTheDocument();
  });

  test("shows the View Scam Proof action only when onViewEvidence is provided", () => {
    const onViewEvidence = vi.fn();
    const { unmount } = renderResults({ onViewEvidence });

    const proofButton = screen.getByRole("button", { name: /view scam proof/i });
    expect(proofButton).toBeInTheDocument();

    fireEvent.click(proofButton);
    expect(onViewEvidence).toHaveBeenCalledTimes(1);

    unmount();
    renderResults();
    expect(screen.queryByRole("button", { name: /view scam proof/i })).not.toBeInTheDocument();
  });

  test("falls back to no-patterns and no-checklist messages when arrays are empty", () => {
    renderResults({
      result: { ...SAMPLE_RESULT, matchedPatterns: [], evidence: [], checklist: [] },
    });

    expect(screen.getByText(/no specific warning signs were matched/i)).toBeInTheDocument();
    expect(screen.getByText(/no recommended steps/i)).toBeInTheDocument();
  });

  test("moves keyboard focus onto the result heading on mount", () => {
    renderResults();
    expect(screen.getByRole("heading", { name: /scam check result/i })).toHaveFocus();
  });
});

describe("ResultsView — AI verdict, next steps, reputation", () => {
  test("renders the AI verdict badge next to the risk badge", () => {
    renderResults({ result: { ...SAMPLE_RESULT, verdict: "scam", verdictConfidence: "high" } });
    expect(screen.getByText("Likely a scam")).toBeInTheDocument();
  });

  test("renders the AI next-steps list only when it differs from the checklist", () => {
    const distinct = ["Block the sender.", "Report to 1930."];
    const { unmount } = renderResults({
      result: { ...SAMPLE_RESULT, verdict: "scam", nextSteps: distinct },
    });

    expect(screen.getByRole("heading", { name: /what to do next/i })).toBeInTheDocument();
    expect(screen.getByText(/block the sender/i)).toBeInTheDocument();
    expect(screen.getByText(/report to 1930/i)).toBeInTheDocument();

    unmount();
    // Fallback mode: nextSteps mirrors the checklist → no duplicate section.
    renderResults({ result: { ...SAMPLE_RESULT, nextSteps: SAMPLE_RESULT.checklist } });
    expect(screen.queryByRole("heading", { name: /what to do next/i })).not.toBeInTheDocument();
  });

  test("shows scam findings when the online lookup found fraud reports", () => {
    renderResults({
      result: {
        ...SAMPLE_RESULT,
        reputation: {
          available: true,
          entities: [
            {
              type: "phone",
              value: "9876543210",
              findings: [
                { title: "Reported as fraud", url: "https://example.com/report", scamRelated: true },
              ],
            },
          ],
        },
      },
    });

    expect(screen.getByRole("heading", { name: /online reputation check/i })).toBeInTheDocument();
    expect(screen.getByText(/found reports of fraud or scam/i)).toBeInTheDocument();
    expect(screen.getByText(/reported as fraud/i)).toBeInTheDocument();
  });

  test("shows a clean verdict when the lookup found nothing", () => {
    renderResults({
      result: {
        ...SAMPLE_RESULT,
        reputation: {
          available: true,
          entities: [{ type: "phone", value: "9876543210", findings: [] }],
        },
      },
    });

    expect(screen.getByText(/found no fraud or scam reports/i)).toBeInTheDocument();
  });

  test("shows the unavailable message when the lookup could not run", () => {
    renderResults({
      result: { ...SAMPLE_RESULT, reputation: { available: false, reason: "error" } },
    });

    expect(screen.getByText(/could not be completed right now/i)).toBeInTheDocument();
  });

  test("renders nothing for reputation when the user never opted in", () => {
    renderResults();
    expect(screen.queryByRole("heading", { name: /online reputation check/i })).not.toBeInTheDocument();
  });
});