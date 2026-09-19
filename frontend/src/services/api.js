/**
 * Talks to the backend per backend/api/CONTRACT.md. Never hardcode the API
 * URL — always read VITE_API_BASE_URL.
 *
 * Every exported call is wrapped in an offline-safe fallback: when the real
 * request fails (network error, non-OK status, or a non-JSON response) the
 * client flips into DEMO mode and returns realistic sample data instead of
 * throwing, so the whole app keeps working while the backend is down. A later
 * successful call clears the flag and returns to the live API.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

let demoMode = false;

/** True once any API call fell back to demo data (until a later call succeeds). */
export function isDemoMode() {
  return demoMode;
}

/** Clear the demo flag so the next call runs against the live API again. */
export function resetDemoMode() {
  demoMode = false;
}

async function post(path, body, signal) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  return handleResponse(response);
}

async function get(path, signal) {
  const response = await fetch(`${BASE_URL}${path}`, { signal });
  return handleResponse(response);
}

async function handleResponse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    // non-JSON body — handled below as a failure so the demo fallback fires
  }

  if (!response.ok) {
    const apiError = data && data.error;
    const error = new Error((apiError && apiError.message) || `Request failed with status ${response.status}`);
    if (apiError && apiError.code) {
      error.code = apiError.code;
    }
    throw error;
  }

  if (data === null) {
    const error = new Error(`API returned no JSON body (status ${response.status})`);
    error.code = "NOT_JSON";
    throw error;
  }

  return data;
}

/**
 * Wraps a real API call with the demo fallback. `run` is the fetch-based
 * call; `makeDemo(requestArg)` builds the fallback response from the first
 * argument (the request body, or the id for GET-by-id endpoints).
 */
function withDemoFallback(run, makeDemo) {
  return async (...args) => {
    try {
      const data = await run(...args);
      demoMode = false;
      return data;
    } catch (err) {
      // A user-initiated cancel must never fall back to demo data — the
      // caller handles AbortError itself (hides loading, shows nothing).
      if (err && err.name === "AbortError") throw err;
      demoMode = true;
      return makeDemo(args[0]);
    }
  };
}

// ---------------------------------------------------------------------------
// DEMO fallback data — mirrors each endpoint's real CONTRACT.md response
// shape so every view keeps rendering its result when the backend is down.
// ---------------------------------------------------------------------------

const REPORTING_LINKS = { helpline: "1930", portal: "https://cybercrime.gov.in/" };
const RISK_DISCLAIMER = "This is a risk signal, not an official fraud determination.";

function demoAnalyze({ language = "en", inputType = "text" } = {}) {
  return {
    caseId: "case_demo_fallback",
    verdict: "scam",
    verdictConfidence: 0.85,
    riskLevel: "high",
    riskDisclaimer: RISK_DISCLAIMER,
    matchedPatterns: ["urgency", "otp_request"],
    evidence: [
      { pattern: "otp_request", snippet: "Share your OTP immediately to verify your account." },
      { pattern: "urgency", snippet: "URGENT: Act now or your account will be blocked." },
    ],
    explanation:
      "This message pressures you to act immediately and asks you to share a one-time password. Both are common scam tactics — treat it as a risk signal only.",
    checklist: [
      "Do not share the OTP with anyone.",
      "Verify by calling the official helpline 1930.",
      "Report the message on the cybercrime portal.",
    ],
    nextSteps: [
      "Do not share the OTP with anyone.",
      "Call 1930 and report it.",
      "Block the number and keep the message as evidence.",
    ],
    languageUsed: language,
    inputSummary: {
      inputType,
      ocrUsed: inputType === "image",
      redactionApplied: true,
      charactersAnalyzed: 143,
    },
    reportingLinks: REPORTING_LINKS,
    evidenceBundle: { available: false },
  };
}

function demoOcr() {
  return {
    text: "Medical report. Diagnosis: Type 2 Diabetes. Blood pressure slightly high. Continue prescribed medication daily.",
  };
}

function demoHealthTags() {
  return { suggestedTags: ["Type 2 Diabetes", "High blood pressure"] };
}

function demoFoodFeedback({ healthTags, product } = {}) {
  const tags = Array.isArray(healthTags) && healthTags.length > 0 ? healthTags.join(", ") : "no specific health tags";
  const name = product && product.name ? product.name : "this product";
  return {
    feedback: `Demo review of ${name}: your profile lists ${tags}, and the product data shows no obvious direct match — but product data can be incomplete, so always check the label yourself. This is general information, not medical advice.`,
  };
}

function demoReport({ language = "en" } = {}) {
  return {
    reportId: "report_demo_fallback",
    language,
    scamType: "other",
    riskLevel: "high",
    riskDisclaimer: RISK_DISCLAIMER,
    analysis: {
      summaryKey: "report.summary.other",
      indicators: ["report.indicator.urgency", "report.indicator.otp_request"],
    },
    followUpQuestions: [
      { id: "platform", type: "select", optional: true },
      { id: "senderNumber", type: "text", optional: true },
      { id: "sharedOtp", type: "yesno", optional: true },
      { id: "amountLost", type: "text", optional: true },
      { id: "transactionRef", type: "text", optional: true },
      { id: "screenshots", type: "yesno", optional: true },
    ],
    reportingGuide: {
      steps: [
        { key: "report.step.helpline", link: "tel:1930" },
        { key: "report.step.portal", link: REPORTING_LINKS.portal },
        { key: "report.step.file" },
        { key: "report.step.form" },
        { key: "report.step.submit" },
      ],
      evidenceChecklist: ["report.evidence.ack"],
    },
    reportingLinks: REPORTING_LINKS,
    inputSummary: {
      descriptionCharacters: 120,
      messagesCharacters: 0,
      screenshots: 0,
      redactionApplied: true,
    },
  };
}

function demoFamily(familyId, { name, adminName } = {}) {
  const now = new Date().toISOString();
  return {
    familyId,
    name: name || "Demo Family Circle",
    createdAt: now,
    members: [
      { memberId: "demo-admin", name: adminName || "Anjali", role: "admin", allergies: [], createdAt: now },
      { memberId: "demo-member-1", name: "Ravi", role: "elder", allergies: ["peanut", "milk"], createdAt: now },
      { memberId: "demo-member-2", name: "Suresh", role: "member", allergies: [], createdAt: now },
    ],
    contacts: [
      {
        contactId: "demo-contact-1",
        name: "Unknown caller",
        phone: "+91 98765 43210",
        note: "Wanted my OTP",
        flaggedBy: "demo-admin",
        status: "flagged",
        createdAt: now,
      },
    ],
    alerts: [
      {
        alertId: "demo-alert-1",
        title: "OTP scam going around",
        detail: "Fake bank calls asking for OTP",
        riskLevel: "high",
        createdAt: now,
        confirmedBy: [],
      },
    ],
  };
}

function demoProduct() {
  return {
    product: {
      name: "Demo Whole Wheat Cereal",
      brand: "DemoBrand",
      nutriScore: "B",
      imageUrl: "",
      ingredientsText: "Whole wheat flour, sugar, salt, minerals.",
      allergens: ["gluten"],
      traces: ["milk"],
      additives: [],
    },
    memberFlags: [],
  };
}

function demoLocations(familyId) {
  const updatedAt = new Date().toISOString();
  const members = [
    { familyId, memberId: "demo-admin", name: "Anjali", lat: 28.6139, lng: 77.209, accuracy: 12, updatedAt, lastSeen: updatedAt },
    { familyId, memberId: "demo-member-1", name: "Ravi", lat: 28.6311, lng: 77.2186, accuracy: 25, updatedAt, lastSeen: updatedAt },
    { familyId, memberId: "demo-member-2", name: "Suresh", lat: 28.5889, lng: 77.2227, accuracy: 30, updatedAt, lastSeen: updatedAt },
  ];
  return { members };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export const analyzeMessage = withDemoFallback(
  ({ language, inputType, rawText, imageBase64, imageMimeType, onlineLookup, lookupPhones }, signal) =>
    post(
      "/api/analyze",
      { language, inputType, rawText, imageBase64, imageMimeType, onlineLookup, lookupPhones },
      signal
    ),
  demoAnalyze
);

/** OCR-only — used by the health-profile feature. No scam analysis, nothing persisted. */
export const ocrImage = withDemoFallback(
  ({ imageBase64, imageMimeType }) => post("/api/ocr", { imageBase64, imageMimeType }),
  demoOcr
);

/** Suggests candidate health tags from OCR'd/typed text — never auto-saved, always reviewed by the user first. */
export const extractHealthTags = withDemoFallback(
  ({ text, language }) => post("/api/health-tags", { text, language }),
  demoHealthTags
);

/** Conversational feedback on a scanned product against confirmed health tags. Not medical advice. */
export const getFoodFeedback = withDemoFallback(
  ({ language, healthTags, product }) => post("/api/food-feedback", { language, healthTags, product }),
  demoFoodFeedback
);

/**
 * Guided scam-reporting flow. Call once with the description (+ optional
 * messages/screenshots) to get the analysis and follow-up questions, then
 * again with the answers to get the final step-by-step reporting guide.
 */
export const submitReport = withDemoFallback(
  ({ language, description, messages, screenshots, answers }, signal) =>
    post("/api/report", { language, description, messages, screenshots, answers }, signal),
  demoReport
);

// ---------------------------------------------------------------------------
// Family circle
// ---------------------------------------------------------------------------

export const createFamily = withDemoFallback(
  ({ name, adminName }) => post("/api/family/create", { name, adminName }),
  ({ name, adminName } = {}) => ({ familyId: "demo-family", family: demoFamily("demo-family", { name, adminName }) })
);

export const getFamily = withDemoFallback(
  (familyId) => get(`/api/family/${familyId}`),
  (familyId) => ({ family: demoFamily(familyId || "demo-family") })
);

export const addFamilyMember = withDemoFallback(
  ({ familyId, name, role, allergies }) => post("/api/family/members", { familyId, name, role, allergies }),
  ({ name = "Member", role = "member", allergies = [] }) => ({
    member: { memberId: "demo-member", name, role, allergies, createdAt: new Date().toISOString() },
  })
);

export const addFamilyContact = withDemoFallback(
  ({ familyId, name, phone, note, flaggedBy }) => post("/api/family/contacts", { familyId, name, phone, note, flaggedBy }),
  ({ name = "Contact", phone = "+91 00000 00000", note = "", flaggedBy = "" }) => ({
    contact: { contactId: "demo-contact", name, phone, note, flaggedBy, status: "flagged", createdAt: new Date().toISOString() },
  })
);

export const addFamilyAlert = withDemoFallback(
  ({ familyId, title, detail, riskLevel }) => post("/api/family/alerts", { familyId, title, detail, riskLevel }),
  ({ title = "Alert", detail = "", riskLevel = "medium" }) => ({
    alert: { alertId: "demo-alert", title, detail, riskLevel, createdAt: new Date().toISOString(), confirmedBy: [] },
  })
);

export const confirmFamilyAlert = withDemoFallback(
  ({ familyId, alertId, memberId }) => post("/api/family/confirm-alert", { familyId, alertId, memberId }),
  ({ alertId = "demo-alert", memberId = "" }) => ({
    alert: { alertId, title: "OTP scam going around", detail: "", riskLevel: "high", createdAt: new Date().toISOString(), confirmedBy: [memberId] },
  })
);

// ---------------------------------------------------------------------------
// Food / product lookup (family-wide allergen flags)
// ---------------------------------------------------------------------------

export const foodLookup = withDemoFallback(
  ({ barcode, familyId }) => post("/api/food-lookup", { barcode, familyId }),
  demoProduct
);

// ---------------------------------------------------------------------------
// Family live location sharing
// ---------------------------------------------------------------------------

export const shareLocation = withDemoFallback(
  ({ familyId, memberId, name, lat, lng, accuracy }) =>
    post("/api/location/share", { familyId, memberId, name, lat, lng, accuracy }),
  () => ({ ok: true })
);

export const stopLocation = withDemoFallback(
  ({ familyId, memberId }) => post("/api/location/stop", { familyId, memberId }),
  () => ({ ok: true })
);

export const getFamilyLocations = withDemoFallback(
  (familyId) => get(`/api/location/family/${familyId}`),
  (familyId) => demoLocations(familyId || "demo-family")
);