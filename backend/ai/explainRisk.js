const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

// Hoisted across requests — same client reused for every Bedrock call.
let cachedClient = null;
function getClient() {
  if (!cachedClient) {
    cachedClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "ap-south-1" });
  }
  return cachedClient;
}

// Keep this list in sync with backend/api/validation.js SUPPORTED_LANGUAGES.
const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  bn: "Bengali",
  mr: "Marathi",
};

const BASE_CHECKLIST = {
  en: [
    "Never share your OTP, PIN, CVV, or password with anyone.",
    "Do not click on unknown or suspicious links.",
    "Verify the sender by contacting your bank through their official app or listed customer care number.",
    "If you suspect fraud, immediately call the 1930 helpline or report it at cybercrime.gov.in.",
  ],
  hi: [
    "अपना OTP, PIN, CVV या पासवर्ड कभी भी किसी के साथ शेयर न करें।",
    "किसी भी अनजान या संदिग्ध लिंक पर क्लिक न करें।",
    "अपने बैंक के आधिकारिक ऐप या कस्टमर केयर नंबर के माध्यम से प्रेषक की पुष्टि करें।",
    "यदि आपको धोखाधड़ी का संदेह है, तो तुरंत 1930 हेल्पलाइन पर कॉल करें या cybercrime.gov.in पर रिपोर्ट करें।",
  ],
  ta: [
    "உங்கள் OTP, PIN, CVV அல்லது கடவுச்சொல்லை யாருடனும் ஒருபோதும் பகிர வேண்டாம்.",
    "அறியப்படாத அல்லது சந்தேகத்திற்குரிய இணைப்புகளை கிளிக் செய்ய வேண்டாம்.",
    "உங்கள் வங்கியின் அதிகாரப்பூர்வ ஆப் அல்லது பட்டியலிடப்பட்ட வாடிக்கையாளர் சேவை எண் மூலம் அனுப்புநரை உறுதிப்படுத்தவும்.",
    "மோசடி சந்தேகப்பட்டால், உடனடியாக 1930 ஹெல்ப்லைனை அழைக்கவும் அல்லது cybercrime.gov.in இல் புகார் செய்யவும்.",
  ],
  te: [
    "మీ OTP, PIN, CVV లేదా పాస్‌వర్డ్‌ను ఎవరితోనూ ఎప్పుడూ పంచుకోవద్దు.",
    "తెలియని లేదా అనుమానాస్పద లింక్‌లపై క్లిక్ చేయవద్దు.",
    "మీ బ్యాంక్ అధికారిక యాప్ లేదా జాబితా చేయబడిన కస్టమర్ కేర్ నంబర్ ద్వారా పంపినవారిని ధృవీకరించండి.",
    "మోసం అనుమానం ఉంటే, వెంటనే 1930 హెల్ప్‌లైన్‌కు కాల్ చేయండి లేదా cybercrime.gov.in లో రిపోర్ట్ చేయండి.",
  ],
  bn: [
    "আপনার OTP, PIN, CVV বা পাসওয়ার্ড কখনও কারো সাথে শেয়ার করবেন না।",
    "অজানা বা সন্দেহজনক লিঙ্কে ক্লিক করবেন না।",
    "আপনার ব্যাংকের অফিসিয়াল অ্যাপ বা তালিকাভুক্ত কাস্টমার কেয়ার নম্বরের মাধ্যমে প্রেরক যাচাই করুন।",
    "প্রতারণার সন্দেহ হলে, অবিলম্বে 1930 হেল্পলাইনে কল করুন বা cybercrime.gov.in-এ রিপোর্ট করুন।",
  ],
  mr: [
    "तुमचा OTP, PIN, CVV किंवा पासवर्ड कधीही कोणाशीही शेअर करू नका.",
    "अनोळखी किंवा संशयास्पद लिंकवर क्लिक करू नका.",
    "तुमच्या बँकेच्या अधिकृत अ‍ॅपद्वारे किंवा सूचीबद्ध ग्राहक सेवा क्रमांकाद्वारे पाठवणाऱ्याची खात्री करा.",
    "फसवणुकीचा संशय असल्यास, त्वरित 1930 हेल्पलाइनवर कॉल करा किंवा cybercrime.gov.in वर तक्रार करा.",
  ],
};

const EXPLANATION_TEMPLATES = {
  en: {
    withPatterns: (risk, patterns) =>
      `This message shows warning signs associated with ${risk} risk: ${patterns}. This is a risk signal, not an official fraud determination.`,
    noPatterns:
      "No strong scam indicators were detected in this text. This is a risk signal, not an official fraud determination — stay cautious regardless.",
  },
  hi: {
    withPatterns: (risk, patterns) =>
      `इस संदेश में ${risk} जोखिम स्तर से जुड़े चेतावनी संकेत मिले हैं: ${patterns}। यह एक जोखिम संकेत है, आधिकारिक धोखाधड़ी निर्धारण नहीं।`,
    noPatterns:
      "इस संदेश में कोई स्पष्ट चेतावनी संकेत नहीं मिला। यह एक जोखिम संकेत है, आधिकारिक धोखाधड़ी निर्धारण नहीं — फिर भी सतर्क रहें।",
  },
  ta: {
    withPatterns: (risk, patterns) =>
      `இந்த செய்தியில் ${risk} ஆபத்து நிலையுடன் தொடர்புடைய எச்சரிக்கை அறிகுறிகள் உள்ளன: ${patterns}. இது ஒரு ஆபத்து குறிப்பு, அதிகாரப்பூர்வ மோசடி தீர்மானம் அல்ல.`,
    noPatterns:
      "இந்த உரையில் வலுவான மோசடி அறிகுறிகள் எதுவும் கண்டறியப்படவில்லை. இது ஒரு ஆபத்து குறிப்பு, அதிகாரப்பூர்வ மோசடி தீர்மானம் அல்ல — இருப்பினும் எச்சரிக்கையாக இருங்கள்.",
  },
  te: {
    withPatterns: (risk, patterns) =>
      `ఈ సందేశంలో ${risk} రిస్క్ స్థాయికి సంబంధించిన హెచ్చరిక సంకేతాలు కనిపించాయి: ${patterns}. ఇది ఒక రిస్క్ సంకేతం, అధికారిక మోసం నిర్ధారణ కాదు.`,
    noPatterns:
      "ఈ టెక్స్ట్‌లో బలమైన మోసం సంకేతాలు ఏవీ కనుగొనబడలేదు. ఇది ఒక రిస్క్ సంకేతం, అధికారిక మోసం నిర్ధారణ కాదు — అయినప్పటికీ జాగ్రత్తగా ఉండండి.",
  },
  bn: {
    withPatterns: (risk, patterns) =>
      `এই বার্তায় ${risk} ঝুঁকির স্তরের সাথে যুক্ত সতর্কতা চিহ্ন পাওয়া গেছে: ${patterns}। এটি একটি ঝুঁকির সংকেত, সরকারি প্রতারণা নির্ধারণ নয়।`,
    noPatterns:
      "এই টেক্সটে কোনো স্পষ্ট প্রতারণার লক্ষণ পাওয়া যায়নি। এটি একটি ঝুঁকির সংকেত, সরকারি প্রতারণা নির্ধারণ নয় — তবুও সতর্ক থাকুন।",
  },
  mr: {
    withPatterns: (risk, patterns) =>
      `या संदेशात ${risk} जोखीम पातळीशी संबंधित चेतावणी चिन्हे आढळली आहेत: ${patterns}. हा एक जोखीम संकेत आहे, अधिकृत फसवणूक निर्धारण नाही.`,
    noPatterns:
      "या मजकुरात कोणतीही स्पष्ट फसवणुकीची चिन्हे आढळली नाहीत. हा एक जोखीम संकेत आहे, अधिकृत फसवणूक निर्धारण नाही — तरीही सावध रहा.",
  },
};

function normalizeLanguage(language) {
  return LANGUAGE_NAMES[language] ? language : "en";
}

function buildFallback(riskLevel, matchedPatterns, lang) {
  const patterns = (matchedPatterns || []).join(", ");
  const template = EXPLANATION_TEMPLATES[lang] || EXPLANATION_TEMPLATES.en;
  const explanation =
    matchedPatterns && matchedPatterns.length > 0
      ? template.withPatterns(riskLevel, patterns)
      : template.noPatterns;

  return {
    explanation,
    checklist: BASE_CHECKLIST[lang] || BASE_CHECKLIST.en,
  };
}

function isValidModelOutput(parsed) {
  return (
    parsed &&
    typeof parsed.explanation === "string" &&
    parsed.explanation.trim().length > 0 &&
    Array.isArray(parsed.checklist) &&
    parsed.checklist.length > 0 &&
    parsed.checklist.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

/**
 * @param {{ riskLevel: string, matchedPatterns: string[], language: string }} input
 * @returns {Promise<{ explanation: string, checklist: string[], languageUsed: string, generationMode: "bedrock"|"fallback" }>}
 */
async function generateExplanation({ riskLevel, matchedPatterns, language }) {
  const lang = normalizeLanguage(language);
  const fallback = buildFallback(riskLevel, matchedPatterns, lang);

  if (process.env.MOCK_BEDROCK === "true") {
    return { ...fallback, languageUsed: lang, generationMode: "fallback" };
  }

  // No matched patterns: the deterministic fallback already answers in the
  // requested language, and there is nothing for Bedrock to elaborate on —
  // skip building the client/prompt entirely.
  if (!matchedPatterns || matchedPatterns.length === 0) {
    return { ...fallback, languageUsed: lang, generationMode: "fallback" };
  }

  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    console.warn("BEDROCK_MODEL_ID is not set, falling back to deterministic response");
    return { ...fallback, languageUsed: lang, generationMode: "fallback" };
  }

  try {
    const client = getClient();

    const systemPrompt = `You are a cautious cybersecurity assistant helping an elder decide whether a message is safe. You never receive the original message — only a risk level and a list of observable pattern categories. Respond with ONLY a valid JSON object:
{
  "explanation": "A clear, concise explanation (2-4 sentences) of why these patterns are warning signs, in the requested language. Never state with certainty that the message IS a scam — describe it as a risk signal only.",
  "checklist": [
    "Never share your OTP, PIN, CVV, or password.",
    "Do not click on unknown or suspicious links.",
    "Verify via the bank's official app or listed customer care number.",
    "Report to the 1930 helpline or cybercrime.gov.in."
  ]
}
The checklist MUST always include those 4 points (translated/adapted to the requested language), and may add at most 2 more specific to the matched patterns. Do NOT ask for or repeat any OTP, PIN, CVV, password, or account number. Do NOT include markdown formatting like \`\`\`json or \`\`\`. Return raw JSON only.`;

    const userPrompt = `Language requested: ${LANGUAGE_NAMES[lang]}\nRisk Level: ${riskLevel}\nMatched Pattern Categories: ${(matchedPatterns || []).join(", ") || "none"}\n\nProvide the JSON response now.`;

    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      system: systemPrompt,
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
      explanation: parsed.explanation,
      checklist: parsed.checklist,
      languageUsed: lang,
      generationMode: "bedrock",
    };
  } catch (error) {
    // Never surface the raw Bedrock/parsing error to the caller — log only a
    // redacted category and fall back to the deterministic response.
    console.error("Bedrock generation failed, using fallback:", error.name || "UnknownError");
    return { ...fallback, languageUsed: lang, generationMode: "fallback" };
  }
}

module.exports = { generateExplanation, LANGUAGE_NAMES };
