/**
 * PRAHARI'S FILE — deterministic scam-pattern detection engine.
 * Keeps the exported function name and return shape EXACTLY as defined in
 * backend/api/CONTRACT.md. Pure and synchronous: no AWS SDK, no network
 * calls, no side effects.
 *
 * Pattern keys (fixed, see CONTRACT.md):
 *   "urgency", "otp_request", "screen_share_request",
 *   "suspicious_link", "impersonation", "suspicious_collect_request"
 */

// Each pattern is a list of regexes (case-insensitive, Hindi + English) that,
// if any match, count as evidence for that pattern key.
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
  ],
  otp_request: [
    /\botp\b/i,
    /\bone[\s-]?time[\s-]?password\b/i,
    /\bpin\b/i,
    /\bcvv\b/i,
    /\bshare\s+your\s+password\b/i,
    /ओटीपी/,
    /पिन\s*(नंबर|कोड)?/,
    /\botp\s+(bhej|share\s+kar|bata)/i,
    // Tamil
    /ஓடிபி/,
    /கடவுச்சொல்/,
    // Telugu
    /ఓటిపి/,
    /పాస్‌వర్డ్/,
    // Bengali
    /ওটিপি/,
    /পাসওয়ার্ড/,
    // Marathi
    /ओटीपी/,
    /पासवर्ड/,
  ],
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
    /\bwww\.\S+/i,
    /\bbit\.ly\b/i,
    /\btinyurl\b/i,
    /\bclick\s+(here|this\s+link|below)\b/i,
    /\bscan\s+(this|the)?\s*qr(\s+code)?\b/i,
    /लिंक\s*पर\s*क्लिक/,
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
  suspicious_collect_request: [
    /\bupi\s+collect\b/i,
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
    /यूपीआई\s*कलेक्ट/,
    /भुगतान\s*अनुरोध\s*स्वीकार/,
    // Tamil / Telugu / Bengali — "approve payment request" / "you have won"
    /நீங்கள்\s*வென்றீர்கள்/,
    /பணம்\s*பெற/,
    /మీరు\s*గెలిచారు/,
    /డబ్బు\s*పొందడానికి/,
    /আপনি\s*জিতেছেন/,
    /টাকা\s*পেতে/,
  ],
};

const HIGH_RISK_PATTERNS = new Set([
  "otp_request",
  "screen_share_request",
  "suspicious_collect_request",
]);

function findEvidence(text, pattern) {
  const rules = PATTERN_RULES[pattern];
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
