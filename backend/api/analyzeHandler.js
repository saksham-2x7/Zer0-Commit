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
const { extractEntities } = require("../detection/entityExtractor");
const { scoreUrl } = require("../detection/urlLexicalScorer");
const { checkBlocklist } = require("../reputation/blocklistCheck");
const { generateExplanation } = require("../ai/explainRisk");
const { analyzeWithRules } = require("../ai/analyzeWithRules");
const { lookupReputation } = require("../reputation/lookup");
const { extractText } = require("../ocr/textractClient");
const { saveCase } = require("../persistence/caseStore");
const { buildEvidenceBundle, storeEvidenceBundle } = require("../evidence/evidenceBundle");
const { wrapHandler } = require("./handlerUtils");

const REPORTING_LINKS = { helpline: "1930", portal: "https://cybercrime.gov.in/" };
const RISK_DISCLAIMER = "This is a risk signal, not an official fraud determination.";

function generateCaseId() {
  return "case_" + randomUUID();
}

function unionPatterns(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (!seen.has(p)) {
        seen.add(p);
        out.push(p);
      }
    }
  }
  return out;
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

  // 1. Deterministic regex pass — always runs, supplies the fixed pattern
  //    keys the contract promises and acts as the safety net.
  const detection = detectScamPatterns(redactedText);
  let { riskLevel, matchedPatterns, evidence } = detection;

  // 1b. Entity extraction + URL lexical scoring + blocklist reputation —
  //     deterministic, fail-open, no paid APIs. Runs on the redacted text
  //     only (URL hosts survive redaction; phones/UPIs are masked by design,
  //     so phone/UPI blocklist hits only fire on unredacted paths).
  const entities = extractEntities(redactedText);
  const urlSignals = entities.urls.map((url) => ({ url, ...scoreUrl(url) }));
  const highRiskUrls = urlSignals.filter((s) => s.risk === "high");

  let blocklist = { checked: false, hits: [] };
  const hasLookupEntities =
    entities.urls.length > 0 || entities.upiIds.length > 0 || entities.phones.length > 0;
  if (hasLookupEntities) {
    try {
      blocklist = await checkBlocklist(
        entities,
        process.env.BLOCKLIST_TABLE_NAME || "BlocklistTable"
      );
    } catch (error) {
      console.error("Blocklist check threw, continuing without it:", error.name || "UnknownError");
      blocklist = { checked: false, hits: [] };
    }
  }

  // Merge the new deterministic signals into the verdict. A URLhaus/PhishTank
  // hit or a lexically high-risk URL is a strong signal: escalate to high.
  const extraPatterns = [];
  const extraEvidence = [];
  if (highRiskUrls.length > 0) {
    extraPatterns.push("url_lexical_high_risk");
    extraEvidence.push({ pattern: "url_lexical_high_risk", snippet: highRiskUrls[0].url });
  }
  if (blocklist.hits.length > 0) {
    extraPatterns.push("blocklist_hit");
    extraEvidence.push({ pattern: "blocklist_hit", snippet: blocklist.hits[0].value });
  }
  if (extraPatterns.length > 0) {
    matchedPatterns = unionPatterns(matchedPatterns, extraPatterns);
    evidence = [...evidence, ...extraEvidence];
    if (riskLevel !== "high") riskLevel = "high";
  }

  // 2. Optional online reputation lookup — strictly opt-in (frontend sends
  //    lookupPhones only with explicit user consent). Degrades gracefully.
  let reputation = null;
  if (request.onlineLookup) {
    try {
      reputation = await lookupReputation({
        redactedText,
        lookupPhones: request.lookupPhones,
      });
    } catch (error) {
      console.error("Reputation lookup threw, continuing without it:", error.name || "UnknownError");
      reputation = { available: false, reason: "error", checkedAt: new Date().toISOString(), entities: [], summary: "" };
    }
  }

  // 3. LLM judge with pre-written system rules — verdict (real vs fake),
  //    confidence, risk level, explanation, next steps. Falls back to a
  //    deterministic verdict derived from the regex result when Bedrock is
  //    unavailable (mock mode, no model, throttling, malformed output).
  const llm = await analyzeWithRules({
    redactedText,
    language,
    reputation,
    regexResult: { riskLevel, matchedPatterns },
    urlSignals,
    blocklist,
  });

  // 4. Explanation + evidence checklist (existing path; also the fallback
  //    explanation when the LLM judge could not run).
  const { explanation, checklist, languageUsed, generationMode } = await generateExplanation({
    riskLevel,
    matchedPatterns,
    language,
  });

  const verdict = llm.verdict;
  const verdictConfidence = llm.confidence;
  const nextSteps = llm.nextSteps ?? checklist;
  const finalRiskLevel = llm.generationMode === "bedrock" ? llm.riskLevel : riskLevel;
  const finalExplanation = llm.generationMode === "bedrock" ? llm.explanation : explanation;
  const finalPatterns = unionPatterns(matchedPatterns, llm.matchedPatterns);

  const caseId = generateCaseId();
  const createdAt = new Date().toISOString();

  const caseRecord = {
    caseId,
    createdAt,
    language,
    inputType,
    riskLevel: finalRiskLevel,
    matchedPatterns: finalPatterns,
    evidence,
    verdict,
    verdictConfidence,
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
    riskLevel: finalRiskLevel,
    matchedPatterns: finalPatterns,
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
    verdict,
    verdictConfidence,
    riskLevel: finalRiskLevel,
    riskDisclaimer: RISK_DISCLAIMER,
    matchedPatterns: finalPatterns,
    evidence,
    explanation: finalExplanation,
    checklist,
    nextSteps,
    languageUsed,
    inputSummary: {
      inputType,
      ocrUsed,
      redactionApplied: true,
      charactersAnalyzed: redactedText.length,
    },
    reportingLinks: REPORTING_LINKS,
    evidenceBundle: evidenceBundleResult,
    ...(reputation ? { reputation } : {}),
    ...(urlSignals.length
      ? { urlSignals: urlSignals.map(({ url, risk, score }) => ({ url, risk, score })) }
      : {}),
    ...(blocklist.hits.length ? { blocklist: { checked: true, hits: blocklist.hits } } : {}),
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