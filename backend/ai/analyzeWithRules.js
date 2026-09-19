/**
 * LLM judge for scam analysis — applies PRE-WRITTEN SYSTEM RULES (not
 * hardcoded regexes) to decide whether a message looks like a scam, looks
 * legitimate, or is uncertain, and to recommend what to do next.
 *
 * The deterministic regex detector (backend/detection/scamDetector.js) still
 * runs first and always: it supplies the fixed pattern keys the contract
 * promises and acts as the safety net. This module is the smarter layer on
 * top — it reads the redacted text (plus optional online reputation findings)
 * and returns a verdict with confidence, a risk level, an explanation, and
 * next steps. Any failure (no model configured, mock mode, malformed output,
 * throttling) falls back to a verdict derived from the regex result.
 *
 * Privacy: only REDACTED text ever reaches the model. Phone numbers, card
 * numbers, UPI IDs, and emails are already masked by redactText before this
 * module is called.
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

// Keep this list in sync with backend/api/validation.js SUPPORTED_LANGUAGES.
const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  bn: "Bengali",
  mr: "Marathi",
};

// Fixed pattern keys — must stay in sync with backend/detection/scamDetector.js
// and backend/api/CONTRACT.md.
const PATTERN_KEYS = [
  "urgency",
  "otp_request",
  "screen_share_request",
  "suspicious_link",
  "impersonation",
  "suspicious_collect_request",
];

// The pre-written rules the model must follow. This is the "system rules"
// the product asks for: how to judge real vs fake, what counts as evidence,
// what the verdicts mean, and hard safety constraints.
const SYSTEM_RULES = `You are ScamSahayak, a cautious cybersecurity assistant helping an elder in India decide whether a message is a scam or legitimate.

You receive ONLY redacted text (phone numbers, card numbers, UPI IDs, emails are masked) and optionally online reputation findings about a phone number or website mentioned in the message.

PRE-WRITTEN RULES — apply these in order:

1. VERDICT RULES
   - verdict "scam": the message pressures the reader to act fast, asks for OTP/PIN/CVV/password, asks to install an app or share the screen, asks to pay a fee to claim a prize/refund, impersonates a bank/government/courier, or contains a suspicious link. Online reputation findings that report fraud/scam for the number or site strengthen this.
   - verdict "legit": the message is a normal transactional or informational notice (bank transaction alert, OTP delivery message, delivery update, promotional offer from a known brand) with NO pressure, NO secret request, NO suspicious link, and no negative reputation findings.
   - verdict "uncertain": the message has some signals but they are weak or ambiguous, or you cannot tell without more context.
   - NEVER claim certainty. A verdict is a risk signal, not an official fraud determination. If in doubt, choose "uncertain" over "legit".

2. RISK LEVEL RULES
   - "high": verdict is "scam" or multiple strong scam signals are present.
   - "medium": one clear scam signal, or verdict is "uncertain" with some signals.
   - "low": verdict is "legit" or no scam signals at all.

3. PATTERN RULES
   - Report which of these pattern keys are present (only these exact keys, only ones you actually observed): ${PATTERN_KEYS.join(", ")}.
   - A bare mention of OTP/PIN in a transactional message ("Your OTP is 123456") or protective advice ("Never share your PIN") is NOT otp_request. otp_request requires the message to ASK for or pressure the reader to share/enter a secret.
   - A "UPI collect request" notification is NOT suspicious_collect_request unless it pushes the reader to approve/accept/pay without a caution.

4. EXPLANATION RULES
   - Explain in 2-4 sentences, in the requested language, why the message looks like what it is. Describe signals, never repeat or ask for any OTP, PIN, CVV, password, or account number. If reputation findings exist, mention them (e.g. "an online search found reports of fraud linked to this number").

5. NEXT-STEP RULES
   - nextSteps: 2-4 concrete actions in the requested language, ordered by urgency. Always include the relevant ones from: call 1930 (national cybercrime helpline), report at cybercrime.gov.in, contact the bank through the official app or listed customer care number, do not click the link, do not share the OTP/PIN, block the number, keep screenshots as evidence. For verdict "legit", next steps are verification steps (e.g. confirm via the official app) — never alarm the reader.

6. OUTPUT RULES
   - Respond with ONLY a valid JSON object, no markdown fences, no commentary:
{
  "verdict": "scam" | "legit" | "uncertain",
  "confidence": "high" | "medium" | "low",
  "riskLevel": "high" | "medium" | "low",
  "matchedPatterns": ["exact pattern keys only"],
  "explanation": "2-4 sentences in the requested language",
  "nextSteps": ["2-4 concrete actions in the requested language"]
}
   - matchedPatterns must only contain keys from the allowed list.`;

function normalizeLanguage(language) {
  return LANGUAGE_NAMES[language] ? language : "en";
}

function deriveFallbackVerdict(riskLevel) {
  const level = String(riskLevel || "").toUpperCase();
  if (level === "HIGH") return { verdict: "scam", confidence: "medium" };
  if (level === "LOW") return { verdict: "legit", confidence: "medium" };
  return { verdict: "uncertain", confidence: "low" };
}

function isValidModelOutput(parsed) {
  const verdicts = new Set(["scam", "legit", "uncertain"]);
  const confidences = new Set(["high", "medium", "low"]);
  const riskLevels = new Set(["high", "medium", "low"]);
  return (
    parsed &&
    verdicts.has(parsed.verdict) &&
    confidences.has(parsed.confidence) &&
    riskLevels.has(parsed.riskLevel) &&
    Array.isArray(parsed.matchedPatterns) &&
    parsed.matchedPatterns.every((p) => PATTERN_KEYS.includes(p)) &&
    typeof parsed.explanation === "string" &&
    parsed.explanation.trim().length > 0 &&
    Array.isArray(parsed.nextSteps) &&
    parsed.nextSteps.length > 0 &&
    parsed.nextSteps.every((s) => typeof s === "string" && s.trim().length > 0)
  );
}

/**
 * Strip raw entity values (phone numbers) before reputation findings reach
 * the model — the redaction promise is that no personal data ever leaves the
 * pipeline except the user's own opted-in lookup. Findings alone are enough
 * for the model to weigh them as evidence. Defense-in-depth: enforced here at
 * the model boundary regardless of what the caller passes in.
 */
function sanitizeReputation(reputation) {
  if (!reputation || !reputation.available) return null;
  return {
    entities: reputation.entities.map((e) => ({
      type: e.type,
      findings: (e.findings || []).map((f) => ({
        title: f.title,
        snippet: f.snippet,
        url: f.url,
        scamRelated: f.scamRelated,
      })),
    })),
    summary: reputation.summary,
  };
}

/**
 * @param {object} input
 * @param {string} input.redactedText - already redacted message text
 * @param {string} input.language - one of SUPPORTED_LANGUAGES
 * @param {object|null} input.reputation - result of reputation/lookup.js (optional)
 * @param {{ riskLevel: string, matchedPatterns: string[] }} input.regexResult - output of detectScamPatterns
 * @returns {Promise<{ verdict, confidence, riskLevel, matchedPatterns, explanation, nextSteps, generationMode }>}
 */
async function analyzeWithRules({ redactedText, language, reputation, regexResult }) {
  const lang = normalizeLanguage(language);
  const fallback = {
    ...deriveFallbackVerdict(regexResult && regexResult.riskLevel),
    riskLevel: (regexResult && regexResult.riskLevel) || "low",
    matchedPatterns: (regexResult && regexResult.matchedPatterns) || [],
    explanation: null,
    nextSteps: null,
    generationMode: "fallback",
  };

  if (process.env.MOCK_BEDROCK === "true") {
    return fallback;
  }

  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    console.warn("BEDROCK_MODEL_ID is not set, falling back to deterministic verdict");
    return fallback;
  }

  try {
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "ap-south-1" });

    const safeReputation = sanitizeReputation(reputation);
    const reputationBlock =
      safeReputation && safeReputation.entities.length > 0
        ? `\nOnline reputation findings:\n${JSON.stringify(safeReputation.entities, null, 2)}`
        : "\nOnline reputation findings: none available.";

    const userPrompt = `Language requested: ${LANGUAGE_NAMES[lang]}
Redacted message text:
"""${redactedText}"""
${reputationBlock}

Apply the pre-written rules and respond with the JSON object now.`;

    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1200,
      system: SYSTEM_RULES,
      messages: [{ role: "user", content: userPrompt }],
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    let responseText = responseBody.content?.[0]?.text || "";
    responseText = responseText.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();

    const parsed = JSON.parse(responseText);
    if (!isValidModelOutput(parsed)) {
      throw new Error("Invalid JSON shape returned from Bedrock");
    }

    return {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      riskLevel: parsed.riskLevel,
      matchedPatterns: parsed.matchedPatterns,
      explanation: parsed.explanation,
      nextSteps: parsed.nextSteps,
      generationMode: "bedrock",
    };
  } catch (error) {
    // Never surface the raw Bedrock/parsing error — log only a redacted
    // category and fall back to the deterministic verdict.
    console.error("Bedrock rule-based analysis failed, using fallback:", error.name || "UnknownError");
    return fallback;
  }
}

module.exports = { analyzeWithRules, SYSTEM_RULES, PATTERN_KEYS, LANGUAGE_NAMES };