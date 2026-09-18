import { describe, test, expect, vi, afterEach } from "vitest";
import { buildEvidenceBundle, downloadEvidenceBundle } from "./evidenceBundle";

const RESULT = {
  caseId: "case_1",
  riskLevel: "high",
  matchedPatterns: ["urgency"],
  explanation: "This message creates urgency.",
  checklist: ["Never share your OTP."],
  reportingLinks: { helpline: "1930", portal: "https://cybercrime.gov.in/" },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildEvidenceBundle", () => {
  test("records the redacted message and result fields, never the raw text", () => {
    const bundle = buildEvidenceBundle({ result: RESULT, redactedText: "URGENT: share your OTP", language: "en" });

    expect(bundle.caseId).toBe("case_1");
    expect(bundle.redactedMessage).toBe("URGENT: share your OTP");
    expect(bundle.riskLevel).toBe("high");
    expect(bundle.matchedPatterns).toEqual(["urgency"]);
    expect(bundle.reportingLinks).toEqual(RESULT.reportingLinks);
    expect(bundle.language).toBe("en");
    expect(typeof bundle.checkedAt).toBe("string");
  });
});

describe("downloadEvidenceBundle", () => {
  test("builds a JSON download link, clicks it, and cleans up", () => {
    const createUrl = vi.fn(() => "blob:fake-url");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createUrl,
      revokeObjectURL: revokeUrl,
    });

    const clickSpy = vi.spyOn(window.HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);

    const bundle = buildEvidenceBundle({ result: RESULT, redactedText: "URGENT", language: "en" });
    downloadEvidenceBundle(bundle);

    expect(createUrl).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith("blob:fake-url");
  });
});