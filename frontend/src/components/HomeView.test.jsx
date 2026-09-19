import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HomeView from "./HomeView";

function makeEntry(overrides = {}) {
  return {
    savedAt: "2026-09-01T10:00:00.000Z",
    redactedText: "URGENT: share your OTP",
    result: { caseId: "case_1", verdict: "HIGH" },
    ...overrides,
  };
}

describe("HomeView", () => {
  test("shows sample recent checks when there is no history", () => {
    render(<HomeView language="en" onNavigate={vi.fn()} />);
    expect(screen.getByText(/recent checks/i)).toBeInTheDocument();
    expect(screen.getByText(/High risk/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save evidence/i })).not.toBeInTheDocument();
  });

  test("renders real history entries with risk badges and save-evidence buttons", () => {
    const onSelectHistory = vi.fn();
    const entries = [
      makeEntry(),
      makeEntry({ redactedText: "curious offer", result: { caseId: "case_2", verdict: "LOW" } }),
      makeEntry({ redactedText: "bank alert", result: { caseId: "case_3", riskLevel: "medium" } }),
    ];
    render(
      <HomeView
        language="en"
        onNavigate={vi.fn()}
        history={entries}
        onSelectHistory={onSelectHistory}
      />
    );

    expect(screen.getByText("URGENT: share your OTP")).toBeInTheDocument();
    expect(screen.getByText("curious offer")).toBeInTheDocument();
    expect(screen.getByText("bank alert")).toBeInTheDocument();
    expect(screen.getByText(/High risk/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Safe/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /save evidence/i })).toHaveLength(3);
  });

  test("save-evidence button calls onSelectHistory with the entry", () => {
    const onSelectHistory = vi.fn();
    const entries = [makeEntry()];
    render(
      <HomeView
        language="en"
        onNavigate={vi.fn()}
        history={entries}
        onSelectHistory={onSelectHistory}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /save evidence/i }));
    expect(onSelectHistory).toHaveBeenCalledWith(entries[0]);
  });

  test("action cards navigate to the check view", () => {
    const onNavigate = vi.fn();
    render(<HomeView language="en" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /check a text/i }));
    expect(onNavigate).toHaveBeenCalledWith("check");
  });

  test("report section links to helpline and government portal", () => {
    render(<HomeView language="en" onNavigate={vi.fn()} />);
    expect(screen.getByRole("link", { name: /1930/i })).toHaveAttribute("href", "tel:1930");
    expect(screen.getByRole("link", { name: /government portal/i })).toHaveAttribute(
      "href",
      "https://cybercrime.gov.in/"
    );
  });

  test("start guided report button navigates to the report view", () => {
    const onNavigate = vi.fn();
    render(<HomeView language="en" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /start guided report/i }));
    expect(onNavigate).toHaveBeenCalledWith("report");
  });
});