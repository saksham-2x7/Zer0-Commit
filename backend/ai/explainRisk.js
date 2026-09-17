/**
 * VAANI'S FILE — replace the logic below with a real Bedrock call.
 * Keep the exported function name and return shape EXACTLY as defined in
 * backend/api/CONTRACT.md. This stub exists so the full pipeline runs
 * end-to-end from the first commit; the rest of the team is already
 * integrating against this shape.
 *
 * Respect MOCK_BEDROCK=true (already the default behavior here, since this
 * stub never calls AWS at all) so others can test offline.
 */

const CHECKLIST_EN = [
  "Never share your OTP, PIN, or password with anyone.",
  "Do not click links from unknown senders.",
  "Verify any request only through your bank's official app or phone number.",
  "Report suspicious activity: call 1930 or visit cybercrime.gov.in",
];

const CHECKLIST_HI = [
  "अपना OTP, PIN या पासवर्ड किसी के साथ साझा न करें।",
  "अनजान भेजने वाले के लिंक पर क्लिक न करें।",
  "किसी भी अनुरोध की पुष्टि केवल अपने बैंक के आधिकारिक ऐप या फोन नंबर से करें।",
  "संदिग्ध गतिविधि की रिपोर्ट करें: 1930 पर कॉल करें या cybercrime.gov.in पर जाएं",
];

async function generateExplanation({ riskLevel, matchedPatterns, language }) {
  // --- STUB LOGIC: canned explanation, no real Bedrock call yet. Replace this. ---
  const isHi = language === "hi";
  const patterns = (matchedPatterns || []).join(", ") || "none";

  const explanation = isHi
    ? `जोखिम स्तर: ${riskLevel}. पाए गए संकेत: ${patterns}. सावधान रहें और नीचे दी गई सूची का पालन करें।`
    : `Risk level: ${riskLevel}. Warning signs found: ${patterns}. Please be cautious and follow the checklist below.`;

  return {
    explanation,
    checklist: isHi ? CHECKLIST_HI : CHECKLIST_EN,
    languageUsed: isHi ? "hi" : "en",
  };
}

module.exports = { generateExplanation };
