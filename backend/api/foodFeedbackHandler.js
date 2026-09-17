/**
 * Generates conversational feedback about a scanned food product against
 * the user's self-reported health profile (conditions/allergies — never a
 * medical record, just short tags the user confirmed). This is explicitly
 * NOT a medical verdict: the model is instructed to never tell the user
 * definitively to eat or not eat something, and the "not medical advice"
 * disclaimer is appended by this code itself (never left to the model),
 * so it's always present regardless of what Bedrock returns.
 *
 * Nothing here is persisted server-side.
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { ApiError } = require("./errors");
const { corsHeaders } = require("./analyzeHandler");
const { LANGUAGE_NAMES } = require("../ai/explainRisk");

const DISCLAIMER = {
  en: "This is general information based on what you told us, not medical advice. Always confirm with a doctor or pharmacist, especially for allergies.",
  hi: "यह आपके द्वारा बताई गई जानकारी पर आधारित सामान्य जानकारी है, चिकित्सीय सलाह नहीं। हमेशा डॉक्टर या फार्मासिस्ट से पुष्टि करें, खासकर एलर्जी के लिए।",
  ta: "இது நீங்கள் எங்களிடம் கூறியதன் அடிப்படையிலான பொதுவான தகவல், மருத்துவ ஆலோசனை அல்ல. எப்போதும் மருத்துவர் அல்லது மருந்தாளரிடம் உறுதிப்படுத்தவும், குறிப்பாக ஒவ்வாமைக்கு.",
  te: "ఇది మీరు మాకు చెప్పిన దాని ఆధారంగా సాధారణ సమాచారం, వైద్య సలహా కాదు. ఎల్లప్పుడూ వైద్యుడు లేదా ఫార్మసిస్ట్‌తో నిర్ధారించుకోండి, ముఖ్యంగా అలర్జీల కోసం.",
  bn: "এটি আপনি আমাদের যা বলেছেন তার উপর ভিত্তি করে সাধারণ তথ্য, চিকিৎসা পরামর্শ নয়। সর্বদা একজন ডাক্তার বা ফার্মাসিস্টের সাথে নিশ্চিত করুন, বিশেষ করে অ্যালার্জির জন্য।",
  mr: "ही तुम्ही आम्हाला सांगितलेल्या माहितीवर आधारित सामान्य माहिती आहे, वैद्यकीय सल्ला नाही. नेहमी डॉक्टर किंवा फार्मासिस्टकडून खात्री करा, विशेषतः ॲलर्जीसाठी.",
};

const NO_CONCERNS_FALLBACK = {
  en: (productName) =>
    `We didn't find a specific match between your health tags and ${productName || "this product"}'s listed information, but product data can be incomplete — check the label yourself too.`,
  hi: (productName) =>
    `हमें आपके स्वास्थ्य टैग और ${productName || "इस प्रोडक्ट"} की सूचीबद्ध जानकारी के बीच कोई विशेष मेल नहीं मिला, लेकिन प्रोडक्ट डेटा अधूरा हो सकता है — कृपया लेबल खुद भी जांचें।`,
  ta: (productName) =>
    `உங்கள் சுகாதார டேக்குகளுக்கும் ${productName || "இந்த தயாரிப்பின்"} பட்டியலிடப்பட்ட தகவலுக்கும் இடையே குறிப்பிட்ட பொருத்தம் எதுவும் கிடைக்கவில்லை, ஆனால் தயாரிப்பு தரவு முழுமையற்றதாக இருக்கலாம் — லேபிளையும் நீங்களே சரிபார்க்கவும்.`,
  te: (productName) =>
    `మీ ఆరోగ్య ట్యాగ్‌లకు మరియు ${productName || "ఈ ఉత్పత్తి"} జాబితా చేయబడిన సమాచారానికి మధ్య నిర్దిష్ట సరిపోలిక కనుగొనబడలేదు, కానీ ఉత్పత్తి డేటా అసంపూర్ణంగా ఉండవచ్చు — లేబుల్‌ను మీరే కూడా తనిఖీ చేయండి.`,
  bn: (productName) =>
    `আপনার স্বাস্থ্য ট্যাগ এবং ${productName || "এই পণ্যের"} তালিকাভুক্ত তথ্যের মধ্যে নির্দিষ্ট কোনো মিল পাওয়া যায়নি, তবে পণ্যের তথ্য অসম্পূর্ণ হতে পারে — লেবেলটিও নিজে দেখুন।`,
  mr: (productName) =>
    `तुमचे आरोग्य टॅग आणि ${productName || "या उत्पादना"}च्या सूचीबद्ध माहितीमध्ये कोणतीही विशिष्ट जुळणी आढळली नाही, परंतु उत्पादन डेटा अपूर्ण असू शकतो — लेबल स्वतः देखील तपासा.`,
};

function isValidFeedback(parsed) {
  return parsed && typeof parsed.feedback === "string" && parsed.feedback.trim().length > 0;
}

async function generateFoodFeedback({ language, healthTags, product }) {
  if (!Array.isArray(healthTags) || healthTags.length === 0) {
    throw new ApiError("INVALID_REQUEST", "Please provide at least one health tag.");
  }
  if (!product || typeof product !== "object" || typeof product.name !== "string") {
    throw new ApiError("INVALID_REQUEST", "Please provide product information.");
  }

  const lang = LANGUAGE_NAMES[language] ? language : "en";
  const disclaimer = DISCLAIMER[lang] || DISCLAIMER.en;
  const fallbackText = NO_CONCERNS_FALLBACK[lang] || NO_CONCERNS_FALLBACK.en;
  const fallback = { feedback: `${fallbackText(product.name)} ${disclaimer}` };

  if (process.env.MOCK_BEDROCK === "true") {
    return fallback;
  }

  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) {
    console.warn("BEDROCK_MODEL_ID is not set, using fallback food feedback");
    return fallback;
  }

  try {
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "ap-south-1" });

    const systemPrompt = `You help someone think about a food product relative to health conditions/allergies they told you about. You are NOT a doctor and must NEVER give a definitive verdict like "this is safe to eat" or "do not eat this" — instead, point out specific, concrete things worth noticing (e.g. "this contains peanuts, and you noted a peanut allergy" or "this has 28g of sugar per serving, and you noted diabetes — you may want to check with your doctor about portion size"). Only reference information actually present in the product data given to you — never invent ingredients or nutrition facts. If nothing in the product data relates to the listed health tags, say that plainly rather than inventing a concern. Keep it to 2-4 sentences, in ${LANGUAGE_NAMES[lang]}. Do NOT include a "not medical advice" disclaimer yourself — that is added separately. Return ONLY this JSON shape, no markdown fences: {"feedback": "..."}`;

    const userPrompt = `Health tags the user confirmed: ${healthTags.join(", ")}\n\nProduct: ${JSON.stringify(product)}\n\nProvide the JSON response now.`;

    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 500,
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
    if (!isValidFeedback(parsed)) {
      throw new Error("Invalid JSON shape returned from Bedrock");
    }

    // The disclaimer is always appended here, never left to the model.
    return { feedback: `${parsed.feedback.trim()} ${disclaimer}` };
  } catch (error) {
    console.error("Food feedback generation failed:", error.name || "UnknownError");
    return fallback;
  }
}

function generateRequestId() {
  return "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function errorBody(code, message, requestId) {
  return JSON.stringify({ error: { code, message, requestId } });
}

exports.handler = async (event) => {
  const headers = corsHeaders();
  const requestId = event.requestContext?.requestId || generateRequestId();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  let body;
  try {
    body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  } catch {
    return {
      statusCode: 400,
      headers: { ...headers, "Content-Type": "application/json" },
      body: errorBody("INVALID_REQUEST", "Request body must be valid JSON.", requestId),
    };
  }

  try {
    const result = await generateFoodFeedback(body || {});
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        statusCode: err.statusCode,
        headers: { ...headers, "Content-Type": "application/json" },
        body: errorBody(err.code, err.message, requestId),
      };
    }
    console.error("Unhandled error in foodFeedbackHandler:", err.name || "UnknownError");
    return {
      statusCode: 500,
      headers: { ...headers, "Content-Type": "application/json" },
      body: errorBody("INTERNAL_ERROR", "Something went wrong. Please try again.", requestId),
    };
  }
};

exports.generateFoodFeedback = generateFoodFeedback;
