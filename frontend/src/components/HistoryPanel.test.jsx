import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HistoryPanel from "./HistoryPanel";

function makeEntry(overrides = {}) {
  return {
    savedAt: "2026-09-01T10:00:00.000Z",
    redactedText: "URGENT: share your OTP",
    result: { caseId: "case_1", riskLevel: "high" },
    ...overrides,
  };
}

describe("HistoryPanel", () => {
  test("shows the empty state when there is no history", () => {
    render(<HistoryPanel language="en" history={[]} onSelect={vi.fn()} onClear={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/no checks yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Clear history")).not.toBeInTheDocument();
  });

  test("lists saved entries and calls onSelect with the clicked entry", () => {
    const onSelect = vi.fn();
    const entries = [
      makeEntry(),
      makeEntry({ redactedText: "curious offer", result: { caseId: "case_2", riskLevel: "low" } }),
    ];
    render(<HistoryPanel language="en" history={entries} onSelect={onSelect} onClear={vi.fn()} onBack={vi.fn()} />);

    const buttons = screen.getAllByRole("button", { name: /view this past result/i });
    expect(buttons).toHaveLength(2);
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("No strong warning signs detected")).toBeInTheDocument();
    expect(screen.getByText("URGENT: share your OTP")).toBeInTheDocument();
    expect(screen.getByText("curious offer")).toBeInTheDocument();

    fireEvent.click(buttons[1]);
    expect(onSelect).toHaveBeenCalledWith(entries[1]);
  });

  test("falls back to low-risk dot/label and a dash for unknown or missing values", () => {
    const entries = [
      makeEntry({ result: { caseId: "case_x", riskLevel: "boujee" }, redactedText: "" }),
      makeEntry({ result: { caseId: "case_y", riskLevel: "low" }, redactedText: undefined }),
    ];
    render(<HistoryPanel language="en" history={entries} onSelect={vi.fn()} onClear={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getAllByText("No strong warning signs detected")).toHaveLength(2);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  test("clears history and goes back via the buttons", () => {
    const onClear = vi.fn();
    const onBack = vi.fn();
    render(
      <HistoryPanel
        language="en"
        history={[makeEntry()]}
        onSelect={vi.fn()}
        onClear={onClear}
        onBack={onBack}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    expect(onClear).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalled();
  });
});