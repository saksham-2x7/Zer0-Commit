import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReportFlow from "./ReportFlow";

vi.mock("../services/api", () => ({
  submitReport: vi.fn(),
}));

import { submitReport } from "../services/api";

const BASE_REPORT = {
  reportId: "report_1",
  language: "en",
  scamType: "electricity_bill",
  riskLevel: "HIGH",
  riskDisclaimer: "Not an official fraud determination.",
  analysis: {
    summaryKey: "report.summary.electricity_bill",
    indicators: ["report.indicator.urgency", "report.indicator.suspicious_link"],
  },
  followUpQuestions: [
    { id: "platform", type: "select", optional: true },
    { id: "senderNumber", type: "text", optional: true },
    { id: "sharedOtp", type: "yesno", optional: true },
  ],
  reportingGuide: {
    steps: [
      { key: "report.step.helpline", link: "tel:1930" },
      { key: "report.step.portal", link: "https://cybercrime.gov.in/" },
      { key: "report.step.file" },
    ],
    evidenceChecklist: ["report.evidence.ack", "report.evidence.screenshots"],
  },
  reportingLinks: { helpline: "1930", portal: "https://cybercrime.gov.in/" },
  inputSummary: { descriptionChars: 40, screenshots: 0 },
};

function makeFile() {
  return new File([new Uint8Array(10)], "shot.png", { type: "image/png" });
}

beforeEach(() => {
  submitReport.mockReset();
});

describe("ReportFlow", () => {
  test("requires a description of at least 10 characters before analyzing", async () => {
    render(<ReportFlow language="en" onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/describe the scam/i), {
      target: { value: "short" },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/at least 10 characters/i);
    expect(submitReport).not.toHaveBeenCalled();
  });

  test("walks describe -> questions -> guide, sending answers on the second call", async () => {
    submitReport.mockResolvedValue(BASE_REPORT);
    render(<ReportFlow language="en" onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/describe the scam/i), {
      target: { value: "Electricity bill payment link arrived by SMS asking for OTP." },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));

    await screen.findByText(/what we found/i);
    expect(submitReport).toHaveBeenCalledWith({
      language: "en",
      description: "Electricity bill payment link arrived by SMS asking for OTP.",
      messages: undefined,
      screenshots: undefined,
    });

    // Answer the three follow-up questions: select, text, yes/no.
    fireEvent.click(screen.getByRole("button", { name: "SMS" }));
    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), {
      target: { value: "+91 98765 43210" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));

    submitReport.mockResolvedValue({ ...BASE_REPORT, followUpQuestions: [] });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText(/step-by-step reporting plan/i);
    expect(submitReport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        answers: { platform: "SMS", senderNumber: "+91 98765 43210", sharedOtp: "yes" },
      })
    );
  });

  test("skipping a question sends an empty answer", async () => {
    submitReport.mockResolvedValue(BASE_REPORT);
    render(<ReportFlow language="en" onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/describe the scam/i), {
      target: { value: "A fake bank alert asked me to verify my account." },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
    await screen.findByText(/what we found/i);

    fireEvent.click(screen.getAllByRole("button", { name: /skip/i })[0]);

    submitReport.mockResolvedValue({ ...BASE_REPORT, followUpQuestions: [] });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText(/step-by-step reporting plan/i);
    expect(submitReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ answers: expect.objectContaining({ platform: "" }) })
    );
  });

  test("goes straight to the guide when there are no follow-up questions", async () => {
    submitReport.mockResolvedValue({ ...BASE_REPORT, followUpQuestions: [] });
    render(<ReportFlow language="en" onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/describe the scam/i), {
      target: { value: "Someone called pretending to be from my bank." },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));

    await screen.findByText(/step-by-step reporting plan/i);
    expect(screen.queryByText(/what we found/i)).not.toBeInTheDocument();
  });

  test("guide renders numbered steps with working helpline and portal links", async () => {
    submitReport.mockResolvedValue({ ...BASE_REPORT, followUpQuestions: [] });
    render(<ReportFlow language="en" onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/describe the scam/i), {
      target: { value: "A lottery prize message asked me to pay a fee first." },
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));

    await screen.findByText(/step-by-step reporting plan/i);
    expect(screen.getByRole("link", { name: /call 1930/i })).toHaveAttribute("href", "tel:1930");
    expect(screen.getByRole("link", { name: /cybercrime\.gov\.in/i })).toHaveAttribute(
      "href",
      "https://cybercrime.gov.in/"
    );
    expect(screen.getByText(/acknowledgment number/i)).toBeInTheDocument();
  });

  test("back button returns to the previous screen", () => {
    const onBack = vi.fn();
    render(<ReportFlow language="en" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /back to home/i }));
    expect(onBack).toHaveBeenCalled();
  });

  test("screenshots can be added and removed before analysis", async () => {
    submitReport.mockResolvedValue({ ...BASE_REPORT, followUpQuestions: [] });
    const { container } = render(<ReportFlow language="en" onBack={vi.fn()} />);
    const fileInput = container.querySelector('input[type="file"]');

    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    await waitFor(() =>
      expect(screen.getByRole("img", { name: /\(optional, up to 3\) 1/i })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(screen.queryByRole("img", { name: /\(optional, up to 3\) 1/i })).not.toBeInTheDocument();
  });
});