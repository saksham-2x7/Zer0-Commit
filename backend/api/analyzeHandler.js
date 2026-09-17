/**
 * SUTRADHAR'S FILE — the orchestrator. Wires validation, OCR, redaction,
 * detection, explanation, persistence, and the evidence bundle together
 * per backend/api/CONTRACT.md.
 *
 * Order: validate -> (OCR if image) -> redact -> detect -> explain
 *        -> persist case (redacted only) -> store evidence bundle -> respond.
 */

const { validateAnalyzeRequest } = require("./validation");
const { ApiError } = require("./errors");
const { redactText } = require("../redaction/redact");
const { detectScamPatterns } = require("../detection/scamDetector");
const { generateExplanation } = require("../ai/explainRisk");
const { extractText } = require("../ocr/textractClient");
const { saveCase } = require("../persistence/caseStore");
const { buildEvidenceBundle, storeEvidenceBundle } = require("../evidence/evidenceBundle");

const REPORTING_LINKS = { helpline: "1930", portal: "https://cybercrime.gov.in/" };
const RISK_DISCLAIMER = "This is a risk signal, not an official fraud determination.";

function generateCaseId() {
  return "case_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function getAllowedOrigin() {
  return process.env.ALLOWED_ORIGIN || "*";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
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
    const { text: ocrText } = await extractText({
      imageBase64: request.imageBase64,
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

function errorBody(code, message, requestId) {
  return JSON.stringify({ error: { code, message, requestId } });
}

// Lambda entry point (API Gateway proxy integration shape)
exports.handler = async (event) => {
  const headers = corsHeaders();
  const requestId = event.requestContext?.requestId || generateCaseId();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch (parseErr) {
    return {
      statusCode: 400,
      headers: { ...headers, "Content-Type": "application/json" },
      body: errorBody("INVALID_REQUEST", "Request body must be valid JSON.", requestId),
    };
  }

  try {
    const result = await analyze(body);
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        statusCode: err.statusCode,
        headers: { ...headers, "Content-Type": "application/json" },
        body: errorBody(err.code, err.message, requestId),
      };
    }
    // Never leak a raw stack trace or internal error message to the caller.
    console.error("Unhandled error in analyzeHandler:", err.name || "UnknownError");
    return {
      statusCode: 500,
      headers: { ...headers, "Content-Type": "application/json" },
      body: errorBody("INTERNAL_ERROR", "Something went wrong. Please try again.", requestId),
    };
  }
};

exports.analyze = analyze;
exports.corsHeaders = corsHeaders;

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
