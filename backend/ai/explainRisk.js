const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const BASE_CHECKLIST_EN = [
  "Never share your OTP, PIN, CVV, or password with anyone.",
  "Do not click on unknown or suspicious links.",
  "Verify the sender by contacting your bank through their official app or listed customer care number.",
  "If you suspect fraud, immediately call the 1930 helpline or report it at cybercrime.gov.in.",
];

const BASE_CHECKLIST_HI = [
  "अपना OTP, PIN, CVV या पासवर्ड कभी भी किसी के साथ शेयर न करें।",
  "किसी भी अनजान या संदिग्ध लिंक पर क्लिक न करें।",
  "अपने बैंक के आधिकारिक ऐप या कस्टमर केयर नंबर के माध्यम से प्रेषक की पुष्टि करें।",
  "यदि आपको धोखाधड़ी का संदेह है, तो तुरंत 1930 हेल्पलाइन पर कॉल करें या cybercrime.gov.in पर रिपोर्ट करें।",
];

function buildFallback(riskLevel, matchedPatterns, lang) {
  const patterns = (matchedPatterns || []).join(", ");
  if (lang === "hi") {
    return {
      explanation:
        matchedPatterns && matchedPatterns.length > 0
          ? `इस संदेश में ${riskLevel} जोखिम स्तर से जुड़े चेतावनी संकेत मिले हैं: ${patterns}। यह एक जोखिम संकेत है, आधिकारिक धोखाधड़ी निर्धारण नहीं।`
          : `इस संदेश में कोई स्पष्ट चेतावनी संकेत नहीं मिला। यह एक जोखिम संकेत है, आधिकारिक धोखाधड़ी निर्धारण नहीं — फिर भी सतर्क रहें।`,
      checklist: BASE_CHECKLIST_HI,
    };
  }
  return {
    explanation:
      matchedPatterns && matchedPatterns.length > 0
        ? `This message shows warning signs associated with ${riskLevel} risk: ${patterns}. This is a risk signal, not an official fraud determination.`
        : `No strong scam indicators were detected in this text. This is a risk signal, not an official fraud determination — stay cautious regardless.`,
    checklist: BASE_CHECKLIST_EN,
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
 * @param {{ riskLevel: string, matchedPatterns: string[], language: "hi"|"en" }} input
 * @returns {Promise<{ explanation: string, checklist: string[], languageUsed: "hi"|"en", generationMode: "bedrock"|"fallback" }>}
 */
async function generateExplanation({ riskLevel, matchedPatterns, language }) {
  const lang = language === "hi" ? "hi" : "en";
  const fallback = buildFallback(riskLevel, matchedPatterns, lang);

  if (process.env.MOCK_BEDROCK === "true") {
    return { ...fallback, languageUsed: lang, generationMode: "fallback" };
  }

  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    console.warn("BEDROCK_MODEL_ID is not set, falling back to deterministic response");
    return { ...fallback, languageUsed: lang, generationMode: "fallback" };
  }

  try {
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "ap-south-1" });

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

    const userPrompt = `Language requested: ${lang === "hi" ? "Hindi" : "English"}\nRisk Level: ${riskLevel}\nMatched Pattern Categories: ${(matchedPatterns || []).join(", ") || "none"}\n\nProvide the JSON response now.`;

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

module.exports = { generateExplanation };
