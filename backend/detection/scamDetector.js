/**
 * PRAHARI'S FILE — deterministic scam-pattern detection engine.
 * Keeps the exported function name and return shape EXACTLY as defined in
 * backend/api/CONTRACT.md. Pure and synchronous: no AWS SDK, no network
 * calls, no side effects.
 *
 * Pattern keys (fixed, see CONTRACT.md):
 *   "urgency", "otp_request", "screen_share_request",
 *   "suspicious_link", "impersonation", "suspicious_collect_request",
 *   "digital_arrest"
 */

// Each pattern is a list of regexes (case-insensitive, Hindi + English) that,
// if any match, count as evidence for that pattern key. "otp_request" and
// "suspicious_collect_request" are matcher FUNCTIONS instead: a bare OTP/PIN/
// CVV or "UPI collect" mention is NOT evidence by itself — a transactional
// message ("Your OTP for login is 123456") or a protective warning
// ("Never share your PIN") must not score high. Only when combined with a
// scam action, urgency, link, impersonation, or prize/payment hook does it
// count.
const COLLECT_BASE_RULES = [
  /\bapprove\s+the\s+(payment\s+)?request\b/i,
  /\baccept\s+(the\s+)?(payment|collect)\s+request\b/i,
  /\bpay\s*(₹|rs\.?|inr)\s*1\b/i,
  /\bto\s+receive\s+(the\s+)?(money|refund|cashback|prize)\b/i,
  /\byou\s+(have\s+)?won\b/i,
  /\blucky\s+draw\b/i,
  /\bclaim\s+your\s+prize\b/i,
  /\bcashback\s+of\s*(₹|rs\.?|inr)/i,
  /\brefund\s+of\s*(₹|rs\.?|inr)/i,
  /\bscan\s+(the\s+)?qr\s+code\s+to\s+receive\b/i,
  /भुगतान\s*अनुरोध\s*स्वीकार/,
  // Hindi — prize-won + pay-fee / deposit
  /जीत\s*गए( हैं)?/,
  /इनाम\s*पाने/,
  /शुल्क\s*(भर|जमा)/,
  /बक्षीस/,
  /लॉटरी/,
  // Marathi — prize-won + pay-fee
  /जिंकलात/,
  /बक्षीस\s*मिळव/,
  /शुल्क\s*भर/,
  // Tamil / Telugu / Bengali — "you have won" and prize+fee hooks. Word order
  // and verb form vary a lot in these languages ("நீங்கள் பரிசு வென்றுள்ளீர்கள்",
  // "మీరు బహుమతి గెలుచుకున్నారు", "আপনি পুরস্কার জিতেছেন"), so allow an optional
  // prize word between the subject and the verb and accept common verb variants.
  // `[^!.\n]` keeps a match inside one clause/sentence.
  /நீங்கள்[^!.\n]{0,20}(?:வென்றுள்ளீர்கள்|வென்றுவிட்டீர்கள்|வென்றீர்கள்)/,
  /(?:பரிசு|பணம்)[^!.\n]{0,20}(?:பெற|பெறுவதற்கு)/,
  /(?:பரிசு|பணம்)[^!.\n]{0,20}கட்டணம்/,
  /మీరు[^!.\n]{0,20}(?:గెలుచుకున్నారు|గెలిచారు)/,
  /(?:బహుమతి|డబ్బు)[^!.\n]{0,20}(?:పొందడానికి|పొంద)/,
  /(?:బహుమతి|డబ్బు)[^!.\n]{0,20}రుసుము/,
  /আপনি[^!.\n]{0,20}(?:জিতেছেন|জিতে\s*গেছেন|জেতেছেন)/,
  /(?:পুরস্কার|টাকা)[^!.\n]{0,20}(?:পেতে|পাওয়ার)/,
  /(?:পুরস্কার|টাকা)[^!.\n]{0,20}ফি/,
];

// UPI collect notifications ("UPI collect request Rs 500 from Amazon") are a
// normal banking event. They are suspicious only when the message pushes the
// receiver to approve/accept/pay WITHOUT a caution like "only if you
// recognize".
const COLLECT_NOTIFICATION_RE = /\b(upi|यूपीआई)\s*collect\b/i;
const COLLECT_ACTION_RE = /\b(approve|accept|pay)\b|स्वीकार/i;
const COLLECT_CAUTION_RE = /\b(only|just|if|when|unless|verify|recogni|nahi)\b|नहीं|ही|जब|अगर|जर/i;

const OTP_TOKEN_RES = [
  /\botp\b/i,
  /\bone[\s-]?time[\s-]?password\b/i,
  /\bpin\b/i,
  /\bcvv\b/i,
  /ओटीपी/,
  /पिन(?:\s*(नंबर|कोड))?/,
  /ஓடிபி/,
  /கடவுச்சொல்/,
  /ఓటిపి/,
  /పాస్‌వర్డ్/,
  /ওটিপি/,
  /পাসওয়ার্ড/,
  /पासवर्ड/,
];

// Words that turn a bare OTP/PIN/CVV mention into an actual request for the
// secret (share/send/enter/verify...). NOTE: ASCII \b only matches at ASCII
// word-boundaries, so regional scripts must NOT use \b — they are matched as
// bare substrings.
const OTP_ACTION_RES = [
  /\bshare\b/i,
  /\bsend\b/i,
  /\bsubmit\b/i,
  /\benter\b/i,
  /\btype\b/i,
  /\bprovide\b/i,
  /\bneed\s+(your|the|this)\b/i,
  /\bverify\b/i,
  /\bconfirm\b/i,
  /\bunblock\b/i,
  /\breactivat\w*\b/i,
  /\b(bhej|bata)\b/i,
  /(पाठव|भेज|बताइए|बताओ|बताएं|शेयर|प्रदान)/,
  /(பகிர|கொடு|அனுப்ப|ஷேர்)/,
  /(షేర్|పంప|ఇవ్వ|పంచుకో)/,
  /(শেয়ার|পাঠান|দিতে|জানান)/,
];

// Urgency words also qualify as scam context for OTP/PIN/CVV.
const OTP_URGENCY_RES = [
  /\burgent(ly)?\b/i,
  /\bimmediately\b/i,
  /\bact\s+now\b/i,
  /\bwithin\s+\d+\s*(hour|hr|minute|min|day)s?\b/i,
  /\blast\s+(warning|chance|reminder)\b/i,
  /तुरंत/,
  /जल्दी/,
  /अभी/,
  /त्वरित/,
  /तातडीने/,
  /உடனடியாக/,
  /அவசரம்/,
  /వెంటనే/,
  /అత్యవసరం/,
  /অবিলম্বে/,
  /জরুরি/,
];

// "Never/Don't share your PIN..." is PROTECTIVE advice, not a scam.
const NEGATION_RES = [
  /\bnever\b/i,
  /\bnot\b/i,
  /don'?t/i,
  /doesn'?t/i,
  /didn'?t/i,
  /can'?t/i,
  /\bcannot\b/i,
  /\bshouldn'?t\b/i,
  /\bmust\s+not\b/i,
  /\bkabhi\b/i,
  /\bnahi\b/i,
  /नहीं/,
  /कभी/,
  /வேண்டாம்/,
  /చేయవద్దు/,
  /করবেন\s*না/,
  /কখনই\s*না/,
  /करू\s*नका/,
  /नको/,
];

const PROTECTIVE_VERB_RES = [
  /\bshare\b/i,
  /\bask\b/i,
  /\bgive\b/i,
  /\btell\b/i,
  /\bsend\b/i,
  /\benter\b/i,
  /\breveal\b/i,
  /\bdisclose\b/i,
  /\bprovide\b/i,
  /शेयर/,
  /पूछ/,
  /भेज/,
  /पाठव/,
  /बताइए/,
  /बताओ/,
  /பகிர/,
  /கேட்க/,
  /கொடு/,
  /షేర్/,
  /అడుగ/,
  /শেয়ার/,
  /জিজ্ঞাসা/,
];

// "digital arrest" scam (P1): a caller impersonates police/regulators, claims a
// case/warrant has been filed, and demands a fine or "verification" over a
// video call (Skype etc.) — while ordering the victim NOT to tell family, so
// elders stay isolated. STRONG terms alone are evidence ("pay the fine now",
// "don't tell your family", the Hindi equivalents). Soft tools that legit
// calls also use ("video call", "skype") only count when the SAME text already
// carries an authority context (police/arrest/CBI/federal/digital arrest).
const DIGITAL_ARREST_STRONG_RULES = [
  /digital\s+arrest/i,
  /arrest\s+warrant/i,
  /\bCBI\b/i,
  /police\s+case/i,
  /federal\s+agent/i,
  /pay\s+(the\s+)?(fine|penalty|a\s+fine)\b/i,
  /\bfine\s+(now|today|immediately)\b/i,
  /don'?t\s+tell\s+(your\s+)?family/i,
  /do\s+not\s+tell\s+(your\s+)?family/i,
  /keep\s+this\s+secret/i,
  // Hindi — CBI, digital arrest, arrest warrant, police case, pay the fine,
  // don't tell the family.
  /सीबीआई/,
  /डिजिटल\s*गिरफ्तारी/,
  /गिरफ्तारी\s*वारंट/,
  /पुलिस\s*केस/,
  /जुर्माना\s*(भर|चुक)/,
  /परिवार\s*को\s*(मत|नहीं)\s*बता/,
];

const DIGITAL_ARREST_WEAK_RULES = [
  /video\s*call/i,
  /\bskype\b/i,
  /वीडियो\s*कॉल/,
];

const DIGITAL_ARREST_AUTHORITY_RULES = [
  /\bpolice\b/i,
  /\barrest/i,
  /\bwarrant\b/i,
  /\bCBI\b/i,
  /\bfederal\b/i,
  /digital\s+arrest/i,
  /पुलिस/,
  /गिरफ्तारी/,
  /सीबीआई/,
  /वारंट/,
];

const PATTERN_RULES = {
  urgency: [
    /\burgent(ly)?\b/i,
    /\bimmediately\b/i,
    /\bact now\b/i,
    /\bwithin\s+\d+\s*(hour|hr|minute|min|day)s?\b/i,
    /\b(account|card|kyc|sim)\s+(will\s+be\s+|is\s+being\s+)?(blocked|suspended|deactivated|frozen|closed)\b/i,
    /\blast\s+(warning|chance|reminder)\b/i,
    /\bexpir(es|ing|ed)\s+(today|soon)\b/i,
    /\bkyc\s+(is\s+)?(pending|incomplete|not\s+updated)\b/i,
    /\bupdate\s+your\s+kyc\b/i,
    /\bkyc\s+will\s+expire\b/i,
    /तुरंत/,
    /जल्दी/,
    /अभी/,
    /आखिरी\s*चेतावनी/,
    /\bturant\b/i,
    /\bjaldi\b/i,
    /\babhi\s+abhi\b/i,
    // Tamil
    /உடனடியாக/,
    /அவசரம்/,
    // Telugu
    /వెంటనే/,
    /అత్యవసరం/,
    // Bengali
    /অবিলম্বে/,
    /জরুরি/,
    // Marathi
    /त्वरित/,
    /तातडीने/,
    // Hindi — blocked/suspended account (Devanagari forms)
    /खाता\s*(ब्लॉक|बंद|निलंबित)/,
    /खाता\s*पुन\S*\s*सक्रिय/,
    /फिर\s*से\s*सक्रिय/,
    // Marathi — blocked/suspended/reactivated account
    /खाते\s*(ब्लॉक|बंद|निलंबित)/,
    /खाते\s*पुन्हा\s*सुरू/,
    /पुन्हा\s*सुरू\s*करा/,
  ],
  // Context-aware matcher function — see module docstring.
  otp_request: null, // set below (hoisted function)
  screen_share_request: [
    /\banydesk\b/i,
    /\bteamviewer\b/i,
    /\bquick\s*support\b/i,
    /\bscreen[\s-]?shar(e|ing)\b/i,
    /\bremote\s+access\b/i,
    /\binstall\s+this\s+app\b/i,
    /\binstall\s+(the\s+)?apk\b/i,
    /\bdownload\s+(this|the)?\s*apk\b/i,
    /\.apk\b/i,
    /स्क्रीन\s*शेयर/,
    // Tamil / Telugu / Bengali — "screen share" is commonly said in English
    // even within regional-language text; APK/remote-access terms too.
    /திரையை\s*பகிர/,
    /స్క్రీన్\s*షేర్/,
    /স্ক্রিন\s*শেয়ার/,
  ],
  suspicious_link: [
    /https?:\/\/\S+/i,
    /\bwww\.[a-z0-9-]+(?:\.[a-z]{2,})+(?:\/\S*)?/i,
    /\b(?:t\.co|bit\.ly|goo\.gl|is\.gd|cutt\.ly|tinyurl\.com)\/\S+/i,
    /\bbit\.ly\b/i,
    /\btinyurl\b/i,
    /\bclick\s+(here|this\s+link|below)\b/i,
    /\bscan\s+(this|the)?\s*qr(\s+code)?\b/i,
    /लिंक\s*पर\s*क्लिक/,
    /लिंक\s*वर\s*क्लिक/,
    // Tamil / Telugu / Bengali — "click the link"
    /இணைப்பை\s*கிளிக்/,
    /లింక్‌ను\s*క్లిక్/,
    /লিঙ্কে\s*ক্লিক/,
  ],
  impersonation: [
    /\b(we are|this is)\s+(calling|writing)\s+from\b/i,
    /\b(rbi|reserve bank|income tax|customs|cbi|trai|police)\b/i,
    /\bofficial(ly)?\s+(bank|government|govt)\s+(representative|official|notice)\b/i,
    /\byour\s+bank\s+(account\s+)?manager\b/i,
    /\bcustomer\s+care\s+(executive|representative)\b/i,
    /\b(fedex|bluedart|blue\s*dart|india\s*post|dhl)\b.{0,20}\b(customs|duty|parcel|package)\b/i,
    /\b(airtel|jio|vodafone|vi)\b.{0,20}\bsim\b.{0,10}(block|deactivat|suspend)/i,
    /सरकारी\s*अधिकारी/,
    /बैंक\s*प्रतिनिधि/,
    // Tamil / Telugu / Bengali — "bank official" / "government official"
    /வங்கி\s*அதிகாரி/,
    /அரசு\s*அதிகாரி/,
    /బ్యాంక్\s*అధికారి/,
    /ప్రభుత్వ\s*అధికారి/,
    /ব্যাংক\s*কর্মকর্তা/,
    /সরকারি\s*কর্মকর্তা/,
  ],
  // Context-aware matcher function — see module docstring.
  suspicious_collect_request: null, // set below (hoisted function)
};

function splitSentences(text) {
  return text
    .split(/[.!?\n।॥]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function makeSnippet(sentence) {
  return sentence.slice(0, 120).trim();
}

function matchAnyRegex(text, rules) {
  for (const rule of rules) {
    if (rule.test(text)) {
      const match = text.match(rule);
      const index = Math.max(0, match.index - 20);
      return text.slice(index, index + 100).trim();
    }
  }
  return null;
}

function isProtectiveAdvice(sentence) {
  return (
    OTP_TOKEN_RES.some((re) => re.test(sentence)) &&
    NEGATION_RES.some((re) => re.test(sentence)) &&
    PROTECTIVE_VERB_RES.some((re) => re.test(sentence))
  );
}

/**
 * OTP/PIN/CVV only evidence scam activity when the sentence ALSO asks for or
 * pressures the recipient into sharing/entering it. Protective advice
 * ("Never share your PIN"), transaction confirmations ("Your OTP is 123456"),
 * and conversational mentions ("WhatsApp PIN works on my phone") do not count.
 */
function otpContextMatch(text) {
  const sentences = splitSentences(text);
  for (const sentence of sentences) {
    if (!OTP_TOKEN_RES.some((re) => re.test(sentence))) continue;
    if (isProtectiveAdvice(sentence)) continue;
    const hasAction = OTP_ACTION_RES.some((re) => re.test(sentence));
    const hasUrgency = OTP_URGENCY_RES.some((re) => re.test(sentence));
    if (hasAction || hasUrgency) {
      return makeSnippet(sentence);
    }
  }
  return null;
}

function hasCautionAfter(sentence, index) {
  const tail = sentence.slice(index, index + 40);
  return COLLECT_CAUTION_RE.test(tail);
}

/**
 * Collect/payment signals are suspicious on their own (won prize, refund,
 * pay-Rs-1) OR when a bare "UPI collect" notification pushes the receiver to
 * approve/accept/pay. A notification that tells the user to be careful
 * ("Approve only if you recognize") is NOT flagged.
 */
function collectContextMatch(text) {
  const base = matchAnyRegex(text, COLLECT_BASE_RULES);
  if (base) {
    return base;
  }
  const sentences = splitSentences(text);
  for (const sentence of sentences) {
    if (!COLLECT_NOTIFICATION_RE.test(sentence)) continue;
    const action = sentence.match(COLLECT_ACTION_RE);
    if (action && !hasCautionAfter(sentence, action.index + action[0].length)) {
      return makeSnippet(sentence);
    }
  }
  return null;
}

function digitalArrestMatch(text) {
  const strong = matchAnyRegex(text, DIGITAL_ARREST_STRONG_RULES);
  if (strong) {
    return strong;
  }
  const sentences = splitSentences(text);
  const hasAuthority = DIGITAL_ARREST_AUTHORITY_RULES.some((re) => re.test(text));
  if (!hasAuthority) {
    return null;
  }
  for (const sentence of sentences) {
    if (DIGITAL_ARREST_WEAK_RULES.some((re) => re.test(sentence))) {
      return makeSnippet(sentence);
    }
  }
  return null;
}

PATTERN_RULES.otp_request = otpContextMatch;
PATTERN_RULES.suspicious_collect_request = collectContextMatch;
PATTERN_RULES.digital_arrest = digitalArrestMatch;

const HIGH_RISK_PATTERNS = new Set([
  "otp_request",
  "screen_share_request",
  "suspicious_collect_request",
  "digital_arrest",
]);

function findEvidence(text, pattern) {
  const rules = PATTERN_RULES[pattern];
  if (typeof rules === "function") {
    return rules(text);
  }
  for (const rule of rules) {
    const match = text.match(rule);
    if (match) {
      const index = Math.max(0, match.index - 20);
      return text.slice(index, index + 100).trim();
    }
  }
  return null;
}

function detectScamPatterns(text) {
  const safeText = typeof text === "string" ? text : "";
  const matchedPatterns = [];
  const evidence = [];

  for (const pattern of Object.keys(PATTERN_RULES)) {
    const snippet = findEvidence(safeText, pattern);
    if (snippet !== null) {
      matchedPatterns.push(pattern);
      evidence.push({ pattern, snippet });
    }
  }

  let riskLevel = "low";
  const hasHighRiskPattern = matchedPatterns.some((p) => HIGH_RISK_PATTERNS.has(p));
  if (matchedPatterns.length >= 2 || hasHighRiskPattern) {
    riskLevel = "high";
  } else if (matchedPatterns.length === 1) {
    riskLevel = "medium";
  }

  return { riskLevel, matchedPatterns, evidence };
}

module.exports = { detectScamPatterns };