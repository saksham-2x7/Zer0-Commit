/**
 * SUTRADHAR'S FILE — the orchestrator. Wires validation, OCR, redaction,
 * detection, explanation, persistence, and the evidence bundle together
 * per backend/api/CONTRACT.md.
 *
 * Order: validate -> (OCR if image) -> redact -> detect -> explain
 *        -> persist case (redacted only) -> store evidence bundle -> respond.
 */

const { randomUUID } = require("crypto");
const { validateAnalyzeRequest } = require("./validation");
const { ApiError } = require("./errors");
const { redactText } = require("../redaction/redact");
const { detectScamPatterns } = require("../detection/scamDetector");
const { generateExplanation } = require("../ai/explainRisk");
const { extractText } = require("../ocr/textractClient");
const { saveCase } = require("../persistence/caseStore");
const { buildEvidenceBundle, storeEvidenceBundle } = require("../evidence/evidenceBundle");
const { wrapHandler } = require("./handlerUtils");

const REPORTING_LINKS = { helpline: "1930", portal: "https://cybercrime.gov.in/" };
const RISK_DISCLAIMER = "This is a risk signal, not an official fraud determination.";

function generateCaseId() {
  return "case_" + randomUUID();
}

/**
 * @param {object} rawRequest - unvalidated request body matching CONTRACT.md
 * @returns {Promise<object>} response body matching CONTRACT.md
 */
async function analyze(rawRequest) {
  const request = validateAnalyzeRequest(rawRequest);
  const { language, inputType } = request;

  let text;
  let ocrUsed = false;

  if (inputType === "image") {
    // bytes come pre-decoded from validateAnalyzeRequest — no second decode.
    const { text: ocrText } = await extractText({
      bytes: request.bytes,
      imageMimeType: request.imageMimeType,
    });
    ocrUsed = true;
    if (!ocrText || ocrText.trim().length === 0) {
      throw new ApiError(
        "ANALYSIS_FAILED",
        "No text could be read from this screenshot. Please try pasting the message text instead."
      );
    }
    text = ocrText;
  } else {
    text = request.rawText;
  }

  // Defense-in-depth: the frontend redacts before sending, but the API may
  // be called directly. Redacted text is the only thing that ever reaches
  // the detector, Bedrock, logs, or storage from here on.
  const redactedText = redactText(text);

  const { riskLevel, matchedPatterns, evidence } = detectScamPatterns(redactedText);
  const { explanation, checklist, languageUsed, generationMode } = await generateExplanation({
    riskLevel,
    matchedPatterns,
    language,
  });

  const caseId = generateCaseId();
  const createdAt = new Date().toISOString();

  const caseRecord = {
    caseId,
    createdAt,
    language,
    inputType,
    riskLevel,
    matchedPatterns,
    evidence,
    ocrUsed,
    redactionApplied: true,
    generationMode,
    schemaVersion: "1.0",
  };

  const bundle = buildEvidenceBundle({
    caseId,
    language,
    inputType,
    redactedText,
    riskLevel,
    matchedPatterns,
    evidence,
    checklist,
    reportingLinks: REPORTING_LINKS,
  });

  const [, evidenceBundleResult] = await Promise.all([
    saveCase(caseRecord),
    storeEvidenceBundle(bundle),
  ]);

  return {
    caseId,
    riskLevel,
    riskDisclaimer: RISK_DISCLAIMER,
    matchedPatterns,
    evidence,
    explanation,
    checklist,
    languageUsed,
    inputSummary: {
      inputType,
      ocrUsed,
      redactionApplied: true,
      charactersAnalyzed: redactedText.length,
    },
    reportingLinks: REPORTING_LINKS,
    evidenceBundle: evidenceBundleResult,
  };
}

// Lambda entry point (API Gateway proxy integration shape)
exports.handler = wrapHandler(analyze, "analyzeHandler");

exports.analyze = analyze;

// Quick manual smoke test: `MOCK_BEDROCK=true node backend/api/analyzeHandler.js`
if (require.main === module) {
  analyze({
    language: "en",
    inputType: "text",
    rawText: "URGENT: Your account will be blocked. Share your OTP immediately to verify.",
  }).then((result) => {
    console.log("Smoke test result:\n", JSON.stringify(result, null, 2));
  });
}