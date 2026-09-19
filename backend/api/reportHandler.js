/**
 * REPORT FLOW ORCHESTRATOR — POST /api/report.
 *
 * Turns a free-form scam description (+ optional messages and screenshots)
 * into a guided reporting plan:
 *
 *   1. validate the request (language, description, optional messages,
 *      optional screenshots, optional follow-up answers)
 *   2. classify the scam type (deterministic keyword rules, en + regional)
 *   3. detect risk indicators by reusing the shared scam detector
 *   4. generate follow-up questions for whatever is still missing
 *   5. build the step-by-step cybercrime.gov.in reporting guide, refined by
 *      any answers the user already gave
 *
 * Stateless: every call returns the full picture. The frontend calls once
 * with the description, then again with the answers to get the final guide.
 * All text fields are redacted before any analysis or storage.
 */

const { randomUUID } = require("crypto");
const { ApiError } = require("./errors");
const { validateImageBytes, SUPPORTED_LANGUAGES } = require("./validation");
const { detectScamPatterns } = require("../detection/scamDetector");
const { redactText } = require("../redaction/redact");
const { wrapHandler } = require("./handlerUtils");

const REPORTING_LINKS = { helpline: "1930", portal: "https://cybercrime.gov.in/" };
const RISK_DISCLAIMER = "This is a risk signal, not an official fraud determination.";
const MAX_SCREENSHOTS = 3;
const MAX_TEXT_CHARS = 8000;

// Scam-type classifier: ordered rules of [type, regexes]. The first rule that
// matches any of its regexes wins. English + Hindi + Tamil + Telugu + Bengali
// + Marathi keywords where the wording is stable.
const SCAM_TYPE_RULES = [
  {
    type: "electricity_bill",
    regexes: [
      /\belectricity\b/i, /\bpower\s*(cut|disconnect)/i, /\bbill\s*(unpaid|pending|due)/i,
      /\bdisconnect(ion)?\s*(notice|warning)/i,
      /बिजली/, /बिल\s*(बकाया|कट)/, /वीज/, /विद्युत/, /மின்சார/, /విద్యుత్/, /বিদ্যুৎ/,
    ],
  },
  {
    type: "bank_otp",
    regexes: [
      /\botp\b/i, /\bpin\b/i, /\bcvv\b/i, /\bkyc\b/i, /\baccount\s*(blocked|suspended|frozen)/i,
      /\batm\s*(card|block)/i, /\bbank\s*(manager|official|employee)/i,
      /ओटीपी/, /पिन/, /खाता\s*(ब्लॉक|बंद)/, /बैंक/, /केवाईसी/,
      /ஓடிபி/, /வங்கி/, /ఓటిపి/, /బ్యాంక్/, /ওটিপি/, /ব্যাংক/, /बँक/, /पिन\s*कोड/,
    ],
  },
  {
    type: "lottery_prize",
    regexes: [
      /\b(won|win|winner)\b/i, /\bprize\b/i, /\blottery\b/i, /\blucky\s*draw\b/i,
      /\bcashback\b/i, /\brefund\b/i, /\bclaim\s+your\s+(prize|reward)/i,
      /जीत/, /लॉटरी/, /इनाम/, /बक्षीस/, /பரிசு/, /லாட்டரி/, /బహుమతి/, /లాటరీ/, /পুরস্কার/, /লটারি/, /बक्षीस/,
    ],
  },
  {
    type: "family_emergency",
    regexes: [
      /\b(son|daughter|brother|sister|relative|nephew|niece)\b.{0,30}\b(accident|hospital|emergency|arrested|jail|trouble)\b/i,
      /\bfamily\s*emergency\b/i, /\bmoney\s*(urgently|immediately|right\s*now)\b/i,
      /बेटा/, /बेटी/, /भाई/, /बहन/, /रिश्तेदार/, /दुर्घटना/, /अस्पताल/, /पैसे\s*(तुरंत|जल्दी)/,
      /மகன்/, /மகள்/, /விபத்து/, /மருத்துவமனை/, /కొడుకు/, /కూతురు/, /ప్రమాదం/, /ఆసుపత్రి/,
      /ছেলে/, /মেয়ে/, /দুর্ঘটনা/, /হাসপাতাল/, /मुलगा/, /मुलगी/, /अपघात/, /रुग्णालय/,
    ],
  },
  {
    type: "parcel_customs",
    regexes: [
      /\b(parcel|package|courier)\b/i, /\bcustoms\b/i, /\b(fedex|dhl|bluedart|blue\s*dart|india\s*post)\b/i,
      /\bshipping\s*(fee|charge|duty)\b/i,
      /पार्सल/, /कस्टम/, /कूरियर/, /பார்சல்/, /சுங்க/, /పార్సెల్/, /కస్టమ్స్/, /পার্সেল/, /কাস্টমস/, /पार्सल/, /कस्टम्स/,
    ],
  },
  {
    type: "investment",
    regexes: [
      /\binvest(ment|ing)?\b/i, /\bprofit\b/i, /\breturns?\b/i, /\btrading\b/i, /\bstock\s*market\b/i,
      /\bguaranteed\s*(returns|profit)\b/i, /\bdouble\s+your\s+money\b/i,
      /निवेश/, /मुनाफा/, /ट्रेडिंग/, /शेयर\s*बाजार/, /முதலீடு/, /லாபம்/, /పెట్టుబడి/, /లాభం/, /বিনিয়োগ/, /লাভ/, /गुंतवणूक/, /नफा/,
    ],
  },
  {
    type: "job",
    regexes: [
      /\bjob\b/i, /\bwork\s*from\s*home\b/i, /\bregistration\s*(fee|charge)\b/i,
      /\bpart[\s-]?time\s*(job|work)\b/i, /\binterview\s*fee\b/i,
      /नौकरी/, /रजिस्ट्रेशन\s*शुल्क/, /வேலை/, /పని/, /চাকরি/, /नोकरी/,
    ],
  },
  {
    type: "loan",
    regexes: [
      /\bloan\b/i, /\badvance\s*(fee|charge)\b/i, /\bprocessing\s*fee\b/i,
      /\binstant\s*loan\b/i, /\bno\s*paperwork\b/i,
      /लोन/, /ऋण/, /प्रोसेसिंग\s*शुल्क/, /கடன்/, /రుణం/, /ঋণ/, /कर्ज/,
    ],
  },
];

// Pattern keys from the shared detector -> human label keys (frontend i18n).
const INDICATOR_LABELS = {
  urgency: "report.indicator.urgency",
  otp_request: "report.indicator.otp_request",
  screen_share_request: "report.indicator.screen_share_request",
  suspicious_link: "report.indicator.suspicious_link",
  impersonation: "report.indicator.impersonation",
  suspicious_collect_request: "report.indicator.suspicious_collect_request",
};

// Follow-up questions, keyed by id. `when` lets the handler skip questions
// whose answer is already known or irrelevant.
const FOLLOW_UP_QUESTIONS = [
  { id: "platform", type: "select", when: (a) => !a.platform },
  { id: "senderNumber", type: "text", when: (a) => !a.senderNumber },
  { id: "sharedOtp", type: "yesno", when: (a) => !a.sharedOtp },
  { id: "amountLost", type: "text", when: (a) => !a.amountLost },
  { id: "transactionRef", type: "text", when: (a) => !a.transactionRef },
  { id: "screenshots", type: "yesno", when: (a) => !a.screenshots },
];

function classifyScamType(text) {
  for (const rule of SCAM_TYPE_RULES) {
    if (rule.regexes.some((re) => re.test(text))) {
      return rule.type;
    }
  }
  return "other";
}

function summarizeScamType(scamType, riskLevel) {
  const summaryKey = `report.summary.${scamType}`;
  return { summaryKey, riskLevel };
}

function buildFollowUpQuestions(answers, screenshotCount) {
  const answered = answers || {};
  return FOLLOW_UP_QUESTIONS.filter((q) => q.when(answered))
    .filter((q) => q.id !== "screenshots" || screenshotCount === 0)
    .map((q) => ({ id: q.id, type: q.type, optional: true }));
}

function buildGuideSteps(answers) {
  const answered = answers || {};
  const lostMoney = /[1-9]\d*/.test(String(answered.amountLost || ""));
  const sharedSecret = String(answered.sharedOtp || "").toLowerCase().startsWith("y");

  const steps = [];
  if (lostMoney || sharedSecret) {
    steps.push({ key: "report.step.helpline", link: `tel:${REPORTING_LINKS.helpline}` });
  }
  steps.push({ key: "report.step.portal", link: REPORTING_LINKS.portal });
  steps.push({ key: "report.step.file" });
  steps.push({ key: "report.step.category" });
  steps.push({ key: "report.step.form" });
  steps.push({ key: "report.step.attach" });
  steps.push({ key: "report.step.submit" });
  if (lostMoney) {
    steps.push({ key: "report.step.bank" });
  }
  if (sharedSecret) {
    steps.push({ key: "report.step.passwords" });
  }
  steps.push({ key: "report.step.platform" });
  return steps;
}

function buildEvidenceChecklist(answers, screenshotCount) {
  const answered = answers || {};
  const checklist = [];
  if (screenshotCount > 0 || String(answered.screenshots || "").toLowerCase().startsWith("y")) {
    checklist.push("report.evidence.screenshots");
  }
  if (answered.senderNumber) {
    checklist.push("report.evidence.sender");
  }
  if (answered.transactionRef) {
    checklist.push("report.evidence.transaction");
  }
  checklist.push("report.evidence.ack");
  return checklist;
}

function validateReportRequest(body) {
  if (!body || typeof body !== "object") {
    throw new ApiError("INVALID_REQUEST", "Request body must be a JSON object.");
  }

  const { language, description, messages, screenshots, answers } = body;

  if (!SUPPORTED_LANGUAGES.has(language)) {
    throw new ApiError("UNSUPPORTED_LANGUAGE", `Language must be one of: ${[...SUPPORTED_LANGUAGES].join(", ")}.`);
  }

  if (typeof description !== "string" || description.trim().length < 10) {
    throw new ApiError("INVALID_REQUEST", "Please describe the scam in at least 10 characters.");
  }
  if (description.length > MAX_TEXT_CHARS) {
    throw new ApiError("INPUT_TOO_LARGE", `Description must be ${MAX_TEXT_CHARS} characters or fewer.`);
  }

  if (messages !== undefined && messages !== null) {
    if (typeof messages !== "string") {
      throw new ApiError("INVALID_REQUEST", "messages must be a string.");
    }
    if (messages.length > MAX_TEXT_CHARS) {
      throw new ApiError("INPUT_TOO_LARGE", `Messages must be ${MAX_TEXT_CHARS} characters or fewer.`);
    }
  }

  let validatedScreenshots = [];
  if (screenshots !== undefined && screenshots !== null) {
    if (!Array.isArray(screenshots)) {
      throw new ApiError("INVALID_REQUEST", "screenshots must be an array.");
    }
    if (screenshots.length > MAX_SCREENSHOTS) {
      throw new ApiError("INVALID_REQUEST", `At most ${MAX_SCREENSHOTS} screenshots are supported.`);
    }
    validatedScreenshots = screenshots.map((shot) => {
      if (!shot || typeof shot !== "object") {
        throw new ApiError("INVALID_REQUEST", "Each screenshot must be an object with imageBase64 and imageMimeType.");
      }
      return validateImageBytes(shot.imageBase64, shot.imageMimeType);
    });
  }

  if (answers !== undefined && answers !== null) {
    if (typeof answers !== "object" || Array.isArray(answers)) {
      throw new ApiError("INVALID_REQUEST", "answers must be an object.");
    }
  }

  return {
    language,
    description,
    messages: typeof messages === "string" ? messages : "",
    screenshots: validatedScreenshots,
    answers: answers && typeof answers === "object" ? answers : {},
  };
}

/**
 * @param {object} rawRequest - unvalidated request body
 * @returns {Promise<object>} response body
 */
async function report(rawRequest) {
  const request = validateReportRequest(rawRequest);
  const { language, description, messages, screenshots, answers } = request;

  // Redact before anything touches the detector or storage.
  const redactedDescription = redactText(description);
  const redactedMessages = redactText(messages);

  const combined = `${redactedDescription} ${redactedMessages}`.trim();
  const { riskLevel, matchedPatterns } = detectScamPatterns(combined);
  const scamType = classifyScamType(combined);

  const indicators = matchedPatterns
    .map((pattern) => INDICATOR_LABELS[pattern])
    .filter(Boolean);

  const followUpQuestions = buildFollowUpQuestions(answers, screenshots.length);
  const reportingGuide = {
    steps: buildGuideSteps(answers),
    evidenceChecklist: buildEvidenceChecklist(answers, screenshots.length),
  };

  return {
    reportId: "report_" + randomUUID(),
    language,
    scamType,
    riskLevel,
    riskDisclaimer: RISK_DISCLAIMER,
    analysis: {
      summaryKey: `report.summary.${scamType}`,
      indicators,
    },
    followUpQuestions,
    reportingGuide,
    reportingLinks: REPORTING_LINKS,
    inputSummary: {
      descriptionCharacters: redactedDescription.length,
      messagesCharacters: redactedMessages.length,
      screenshots: screenshots.length,
      redactionApplied: true,
    },
  };
}

// Lambda entry point (API Gateway proxy integration shape)
exports.handler = wrapHandler(report, "reportHandler");

exports.report = report;

// Quick manual smoke test: `node backend/api/reportHandler.js`
if (require.main === module) {
  report({
    language: "en",
    description:
      "I got a call saying my electricity bill is unpaid and my power will be cut unless I pay immediately. They asked me to share an OTP.",
    messages: "URGENT: Your account will be blocked. Share your OTP now.",
  }).then((result) => {
    console.log("Smoke test result:\n", JSON.stringify(result, null, 2));
  });
}