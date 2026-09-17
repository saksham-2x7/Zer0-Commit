/**
 * Builds a redacted evidence bundle the user can save locally — a plain
 * JSON record of the case (never the original, unredacted message) that
 * they can attach when filing a report at cybercrime.gov.in.
 */

export function buildEvidenceBundle({ result, redactedText, language }) {
  return {
    caseId: result.caseId,
    checkedAt: new Date().toISOString(),
    language,
    riskLevel: result.riskLevel,
    matchedPatterns: result.matchedPatterns,
    explanation: result.explanation,
    checklist: result.checklist,
    reportingLinks: result.reportingLinks,
    redactedMessage: redactedText,
  };
}

export function downloadEvidenceBundle(bundle) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `scamsahayak-${bundle.caseId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
