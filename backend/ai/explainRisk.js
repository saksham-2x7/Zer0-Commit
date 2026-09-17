const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

async function generateExplanation({ riskLevel, matchedPatterns, language }) {
  const lang = language === 'hi' ? 'hi' : 'en';

  const fallbackEn = {
    explanation: `This message has been identified as a ${riskLevel} risk based on suspicious patterns: ${(matchedPatterns || []).join(", ")}. It is highly likely to be a scam.`,
    checklist: [
      "Never share your OTP, PIN, or passwords with anyone.",
      "Do not click on unknown or suspicious links.",
      "Verify the sender by contacting your bank through their official app or listed customer care number.",
      "If you suspect fraud, immediately call the 1930 helpline or report it at cybercrime.gov.in."
    ]
  };

  const fallbackHi = {
    explanation: `इस संदेश को ${riskLevel} जोखिम के रूप में पहचाना गया है क्योंकि इसमें संदिग्ध पैटर्न हैं: ${(matchedPatterns || []).join(", ")}। यह एक घोटाला (स्कैम) होने की बहुत अधिक संभावना है।`,
    checklist: [
      "अपना OTP, PIN या पासवर्ड कभी भी किसी के साथ शेयर न करें।",
      "किसी भी अनजान या संदिग्ध लिंक पर क्लिक न करें।",
      "अपने बैंक के आधिकारिक ऐप या कस्टमर केयर नंबर के माध्यम से प्रेषक (भेजने वाले) की पुष्टि करें।",
      "यदि आपको धोखाधड़ी का संदेह है, तो तुरंत 1930 हेल्पलाइन पर कॉल करें या cybercrime.gov.in पर रिपोर्ट करें।"
    ]
  };

  const fallback = lang === 'hi' ? fallbackHi : fallbackEn;

  if (process.env.MOCK_BEDROCK === "true") {
    return {
      explanation: fallback.explanation,
      checklist: fallback.checklist,
      languageUsed: lang
    };
  }

  try {
    const client = new BedrockRuntimeClient();
    const modelId = process.env.BEDROCK_MODEL_ID;

    if (!modelId) {
      console.warn("BEDROCK_MODEL_ID is not set, falling back to mock");
      return { ...fallback, languageUsed: lang };
    }

    const systemPrompt = `You are a cybersecurity expert analyzing potential scam messages. 
You must respond with ONLY a valid JSON object in the following format:
{
  "explanation": "A clear, concise explanation of why the message is risky, referencing the matched patterns.",
  "checklist": [
    "Never share your OTP or PIN.",
    "Do not click on unknown links.",
    "Verify via the bank's official app or number.",
    "Report to 1930 helpline or cybercrime.gov.in."
  ]
}
The checklist MUST always include the 4 points mentioned above (adapted to the requested language). 
Do NOT include any markdown formatting like \`\`\`json or \`\`\`. Return raw JSON only.`;

    const userPrompt = `Language requested: ${lang === 'hi' ? 'Hindi' : 'English'}\nRisk Level: ${riskLevel}\nMatched Patterns: ${(matchedPatterns || []).join(", ")}\n\nProvide the JSON response now.`;

    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt }
      ]
    };

    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(payload)
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    // Some bedrock models return text directly or wrapped in different structures.
    // Handling Anthropic Claude 3 structure as assumed by the payload.
    let responseText = responseBody.content?.[0]?.text || "";

    // Strip markdown fences if present
    responseText = responseText.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();

    const parsed = JSON.parse(responseText);

    if (!parsed.explanation || !Array.isArray(parsed.checklist)) {
      throw new Error("Invalid JSON shape returned from Bedrock");
    }

    return {
      explanation: parsed.explanation,
      checklist: parsed.checklist,
      languageUsed: lang
    };
  } catch (error) {
    console.error("Error generating explanation from Bedrock, using fallback:", error.message);
    return {
      explanation: fallback.explanation,
      checklist: fallback.checklist,
      languageUsed: lang
    };
  }
}

module.exports = { generateExplanation };
