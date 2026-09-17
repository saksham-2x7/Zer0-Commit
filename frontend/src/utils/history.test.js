import { describe, test, expect, beforeEach } from "vitest";
import { loadHistory, saveHistoryEntry, clearHistory } from "./history";

beforeEach(() => {
  window.localStorage.clear();
});

describe("history", () => {
  test("loadHistory returns an empty array when nothing is stored", () => {
    expect(loadHistory()).toEqual([]);
  });

  test("saveHistoryEntry persists an entry with a timestamp", () => {
    const result = { caseId: "case_1", riskLevel: "high" };
    saveHistoryEntry({ language: "en", redactedText: "URGENT: share OTP", result });

    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].result).toEqual(result);
    expect(history[0].redactedText).toBe("URGENT: share OTP");
    expect(history[0].savedAt).toBeTruthy();
  });

  test("newest entries are added to the front", () => {
    saveHistoryEntry({ language: "en", redactedText: "first", result: { caseId: "case_1" } });
    saveHistoryEntry({ language: "en", redactedText: "second", result: { caseId: "case_2" } });

    const history = loadHistory();
    expect(history[0].result.caseId).toBe("case_2");
    expect(history[1].result.caseId).toBe("case_1");
  });

  test("caps history at 20 entries", () => {
    for (let i = 0; i < 25; i++) {
      saveHistoryEntry({ language: "en", redactedText: `msg ${i}`, result: { caseId: `case_${i}` } });
    }
    expect(loadHistory()).toHaveLength(20);
    // Most recent (case_24) should be first, oldest 5 dropped.
    expect(loadHistory()[0].result.caseId).toBe("case_24");
  });

  test("clearHistory empties the store", () => {
    saveHistoryEntry({ language: "en", redactedText: "x", result: { caseId: "case_1" } });
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});
