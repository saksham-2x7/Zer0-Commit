const { detectScamPatterns } = require("./scamDetector");

describe("detectScamPatterns — input handling", () => {
  test("returns low risk with no matched patterns for empty string", () => {
    const result = detectScamPatterns("");
    expect(result.riskLevel).toBe("low");
    expect(result.matchedPatterns).toEqual([]);
    expect(result.evidence).toEqual([]);
  });

  test("handles non-string input without throwing", () => {
    expect(() => detectScamPatterns(undefined)).not.toThrow();
    expect(() => detectScamPatterns(null)).not.toThrow();
    expect(detectScamPatterns(null).riskLevel).toBe("low");
  });

  test("returns low risk for an innocuous message", () => {
    const result = detectScamPatterns("Hey, are we still on for lunch tomorrow?");
    expect(result.riskLevel).toBe("low");
    expect(result.matchedPatterns).toEqual([]);
  });

  test("is a pure function (same input -> same output, no mutation)", () => {
    const text = "URGENT: share your OTP now";
    const first = detectScamPatterns(text);
    const second = detectScamPatterns(text);
    expect(first).toEqual(second);
  });
});

describe("detectScamPatterns — urgency", () => {
  test("detects 'urgent'", () => {
    const result = detectScamPatterns("This is an urgent notice about your account.");
    expect(result.matchedPatterns).toContain("urgency");
  });

  test("detects 'immediately'", () => {
    const result = detectScamPatterns("Please respond immediately.");
    expect(result.matchedPatterns).toContain("urgency");
  });

  test("detects account-blocked phrasing", () => {
    const result = detectScamPatterns("Your account will be blocked within 24 hours.");
    expect(result.matchedPatterns).toContain("urgency");
  });

  test("detects Hindi urgency term", () => {
    const result = detectScamPatterns("कृपया तुरंत जवाब दें");
    expect(result.matchedPatterns).toContain("urgency");
  });

  test("is case-insensitive", () => {
    const result = detectScamPatterns("URGENT ACTION REQUIRED");
    expect(result.matchedPatterns).toContain("urgency");
  });
});

describe("detectScamPatterns — otp_request", () => {
  test("detects 'OTP'", () => {
    const result = detectScamPatterns("Share your OTP to verify.");
    expect(result.matchedPatterns).toContain("otp_request");
  });

  test("detects 'PIN'", () => {
    const result = detectScamPatterns("Enter your PIN to continue.");
    expect(result.matchedPatterns).toContain("otp_request");
  });

  test("detects 'CVV'", () => {
    const result = detectScamPatterns("We need your card CVV for verification.");
    expect(result.matchedPatterns).toContain("otp_request");
  });

  test("detects Hindi OTP term", () => {
    const result = detectScamPatterns("अपना ओटीपी शेयर करें");
    expect(result.matchedPatterns).toContain("otp_request");
  });
});

describe("detectScamPatterns — urgency (extended)", () => {
  test("detects KYC expiry phrasing", () => {
    const result = detectScamPatterns("Your KYC will expire today, please update immediately.");
    expect(result.matchedPatterns).toContain("urgency");
  });

  test("detects transliterated Hindi urgency ('turant')", () => {
    const result = detectScamPatterns("Apna account turant verify karein.");
    expect(result.matchedPatterns).toContain("urgency");
  });
});

describe("detectScamPatterns — screen_share_request", () => {
  test("detects AnyDesk", () => {
    const result = detectScamPatterns("Please install AnyDesk so I can help you.");
    expect(result.matchedPatterns).toContain("screen_share_request");
  });

  test("detects TeamViewer", () => {
    const result = detectScamPatterns("Download TeamViewer and share the code.");
    expect(result.matchedPatterns).toContain("screen_share_request");
  });

  test("detects generic screen share phrasing", () => {
    const result = detectScamPatterns("Can you screen share with our support agent?");
    expect(result.matchedPatterns).toContain("screen_share_request");
  });

  test("detects APK install requests", () => {
    const result = detectScamPatterns("Please download this apk and install it to continue.");
    expect(result.matchedPatterns).toContain("screen_share_request");
  });
});

describe("detectScamPatterns — suspicious_link", () => {
  test("detects http(s) links", () => {
    const result = detectScamPatterns("Verify here: https://bit.ly/abc123");
    expect(result.matchedPatterns).toContain("suspicious_link");
  });

  test("detects 'click here' phrasing", () => {
    const result = detectScamPatterns("Click here to claim your reward.");
    expect(result.matchedPatterns).toContain("suspicious_link");
  });

  test("detects www. links without scheme", () => {
    const result = detectScamPatterns("Go to www.suspicious-bank-login.com now");
    expect(result.matchedPatterns).toContain("suspicious_link");
  });
});

describe("detectScamPatterns — impersonation", () => {
  test("detects 'calling from' phrasing", () => {
    const result = detectScamPatterns("We are calling from your bank's fraud department.");
    expect(result.matchedPatterns).toContain("impersonation");
  });

  test("detects RBI mention", () => {
    const result = detectScamPatterns("This is an official notice from RBI.");
    expect(result.matchedPatterns).toContain("impersonation");
  });

  test("detects income tax impersonation", () => {
    const result = detectScamPatterns("Notice from Income Tax department regarding your refund.");
    expect(result.matchedPatterns).toContain("impersonation");
  });

  test("detects courier/customs impersonation", () => {
    const result = detectScamPatterns("This is FedEx, your parcel is held at customs.");
    expect(result.matchedPatterns).toContain("impersonation");
  });

  test("detects telecom SIM-block impersonation", () => {
    const result = detectScamPatterns("Your Jio SIM will be deactivated today.");
    expect(result.matchedPatterns).toContain("impersonation");
  });
});

describe("detectScamPatterns — suspicious_collect_request", () => {
  test("detects UPI collect phrasing", () => {
    const result = detectScamPatterns("You have received a UPI collect request, please approve.");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
  });

  test("detects 'approve the request' phrasing", () => {
    const result = detectScamPatterns("Approve the payment request to receive your refund.");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
  });

  test("detects pay-re-1-to-receive scam phrasing", () => {
    const result = detectScamPatterns("Pay Rs.1 to receive your cashback instantly.");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
  });

  test("detects lottery/prize scam phrasing", () => {
    const result = detectScamPatterns("Congratulations, you have won a lucky draw! Claim your prize now.");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
  });

  test("detects QR-code payment approval phrasing", () => {
    const result = detectScamPatterns("Scan the QR code to receive your refund of Rs.500.");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
    expect(result.matchedPatterns).toContain("suspicious_link");
  });
});

describe("detectScamPatterns — risk level thresholds", () => {
  test("zero matches -> low risk", () => {
    const result = detectScamPatterns("Let's meet at the usual place.");
    expect(result.riskLevel).toBe("low");
  });

  test("exactly one non-high-risk match -> medium risk", () => {
    const result = detectScamPatterns("This is urgent, please read.");
    expect(result.matchedPatterns).toEqual(["urgency"]);
    expect(result.riskLevel).toBe("medium");
  });

  test("any high-risk pattern alone -> high risk", () => {
    const result = detectScamPatterns("Please share your OTP.");
    expect(result.matchedPatterns).toEqual(["otp_request"]);
    expect(result.riskLevel).toBe("high");
  });

  test("two or more matches -> high risk even without a high-risk pattern", () => {
    const result = detectScamPatterns(
      "URGENT: click here immediately to verify, https://bit.ly/xyz"
    );
    expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(2);
    expect(result.riskLevel).toBe("high");
  });

  test("classic multi-pattern scam message -> high risk with multiple patterns", () => {
    const result = detectScamPatterns(
      "URGENT: Your account will be blocked. Share your OTP immediately to verify. Click here: https://bit.ly/verify"
    );
    expect(result.riskLevel).toBe("high");
    expect(result.matchedPatterns).toEqual(
      expect.arrayContaining(["urgency", "otp_request", "suspicious_link"])
    );
  });
});

describe("detectScamPatterns — evidence", () => {
  test("evidence entries reference the matched pattern and a text snippet", () => {
    const result = detectScamPatterns("Please share your OTP immediately.");
    expect(result.evidence.length).toBe(result.matchedPatterns.length);
    for (const item of result.evidence) {
      expect(result.matchedPatterns).toContain(item.pattern);
      expect(typeof item.snippet).toBe("string");
      expect(item.snippet.length).toBeGreaterThan(0);
    }
  });

  test("only returns evidence for patterns that actually matched", () => {
    const result = detectScamPatterns("Let's catch up soon.");
    expect(result.evidence).toEqual([]);
  });
});

describe("detectScamPatterns — additional Indian languages", () => {
  test("detects Tamil urgency and OTP terms", () => {
    const result = detectScamPatterns("உடனடியாக உங்கள் ஓடிபி பகிரவும்");
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["urgency", "otp_request"]));
  });

  test("detects Telugu urgency and OTP terms", () => {
    const result = detectScamPatterns("వెంటనే మీ ఓటిపి షేర్ చేయండి");
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["urgency", "otp_request"]));
  });

  test("detects Bengali urgency and OTP terms", () => {
    const result = detectScamPatterns("অবিলম্বে আপনার ওটিপি শেয়ার করুন");
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["urgency", "otp_request"]));
  });

  test("detects Marathi urgency term", () => {
    const result = detectScamPatterns("त्वरित तुमचा ओटीपी पाठवा");
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["urgency", "otp_request"]));
  });

  test("detects Tamil bank-official impersonation and prize-collect phrasing", () => {
    const result = detectScamPatterns("வங்கி அதிகாரி பேசுகிறேன், நீங்கள் வென்றீர்கள்!");
    expect(result.matchedPatterns).toEqual(
      expect.arrayContaining(["impersonation", "suspicious_collect_request"])
    );
  });
});

describe("detectScamPatterns — digital_arrest", () => {
  test("flags the canonical English digital-arrest demand as high risk", () => {
    const result = detectScamPatterns(
      "Police case is filed against you. Pay the fine now, sir."
    );
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["digital_arrest"]));
    expect(result.riskLevel).toBe("high");
  });

  test("flags 'don't tell your family' coercion", () => {
    const result = detectScamPatterns(
      "You are under digital arrest. Do not tell your family, pay the fine immediately."
    );
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["digital_arrest"]));
    expect(result.riskLevel).toBe("high");
  });

  test("flags Hindi digital-arrest phrasing", () => {
    const result = detectScamPatterns(
      "सीबीआई से केस दर्ज है, जुर्माना भरें और परिवार को मत बताना।"
    );
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["digital_arrest"]));
    expect(result.riskLevel).toBe("high");
  });

  test("flags video-call/Skype only inside an authority context", () => {
    const result = detectScamPatterns(
      "An officer from the federal bureau will call you on Skype for the hearing."
    );
    expect(result.matchedPatterns).toContain("digital_arrest");
    expect(result.riskLevel).toBe("high");
  });

  test("flags Hindi video-call phrasing with police context", () => {
    const result = detectScamPatterns("पुलिस आपसे वीडियो कॉल पर बात करेगी");
    expect(result.matchedPatterns).toContain("digital_arrest");
    expect(result.riskLevel).toBe("high");
  });

  test("does NOT flag a bare Skype mention without an authority context", () => {
    const result = detectScamPatterns("Let's do the call on Skype tonight.");
    expect(result.matchedPatterns).not.toContain("digital_arrest");
    expect(result.riskLevel).toBe("low");
  });

  test("includes a text snippet as evidence", () => {
    const result = detectScamPatterns(
      "Pay the penalty now or the warrant will be served."
    );
    const item = result.evidence.find((e) => e.pattern === "digital_arrest");
    expect(typeof item.snippet).toBe("string");
    expect(item.snippet.length).toBeGreaterThan(0);
  });
});

describe("detectScamPatterns — pattern key integrity", () => {
  const VALID_KEYS = [
    "urgency",
    "otp_request",
    "screen_share_request",
    "suspicious_link",
    "impersonation",
    "suspicious_collect_request",
    "digital_arrest",
  ];

  test("never returns a pattern key outside the fixed contract list", () => {
    const result = detectScamPatterns(
      "URGENT: share your OTP, install AnyDesk, click https://bit.ly/x, this is RBI, approve the UPI collect request"
    );
    for (const pattern of result.matchedPatterns) {
      expect(VALID_KEYS).toContain(pattern);
    }
  });
});

describe("detectScamPatterns — context-aware otp_request (C1)", () => {
  test("does NOT flag a transactional OTP confirmation with protective advice", () => {
    const result = detectScamPatterns("Your OTP for login is 123456. Do not share it.");
    expect(result.matchedPatterns).not.toContain("otp_request");
    expect(result.riskLevel).toBe("low");
  });

  test("does NOT flag 'never share your PIN' protective advice", () => {
    const result = detectScamPatterns("Never share your PIN. Bank will never ask.");
    expect(result.matchedPatterns).not.toContain("otp_request");
    expect(result.riskLevel).toBe("low");
  });

  test("does NOT flag a conversational PIN mention", () => {
    const result = detectScamPatterns("WhatsApp PIN works on my phone");
    expect(result.matchedPatterns).not.toContain("otp_request");
    expect(result.riskLevel).toBe("low");
  });

  test("still flags an OTP being demanded with an action", () => {
    const result = detectScamPatterns("Share your OTP to verify.");
    expect(result.matchedPatterns).toContain("otp_request");
    expect(result.riskLevel).toBe("high");
  });

  test("still flags OTP demands with regional action verbs", () => {
    for (const text of [
      "अपना ओटीपी शेयर करें",
      "त्वरित तुमचा ओटीपी पाठवा",
      "உடனடியாக உங்கள் ஓடிபி பகிரவும்",
      "వెంటనే మీ ఓటిపి షేర్ చేయండి",
      "অবিলম্বে আপনার ওটিপি শেয়ার করুন",
    ]) {
      expect(detectScamPatterns(text).matchedPatterns).toContain("otp_request");
    }
  });
});

describe("detectScamPatterns — context-aware suspicious_collect_request (C1)", () => {
  test("does NOT flag a bare UPI collect notification", () => {
    const result = detectScamPatterns("UPI collect request Rs 500 from Amazon. Approve only if you recognize.");
    expect(result.matchedPatterns).not.toContain("suspicious_collect_request");
    expect(result.riskLevel).toBe("low");
  });

  test("still flags a UPI collect request the message pushes you to approve", () => {
    const result = detectScamPatterns("You have received a UPI collect request, please approve.");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
    expect(result.riskLevel).toBe("high");
  });
});

describe("detectScamPatterns — Hindi & Marathi coverage (C2)", () => {
  test("flags Hindi prize-won/pay-fee phrasing", () => {
    const result = detectScamPatterns("आप जीत गए हैं! इनाम पाने के लिए शुल्क जमा करें");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
    expect(result.riskLevel).toBe("high");
  });

  test("flags Marathi prize-won/pay-fee phrasing", () => {
    const result = detectScamPatterns("तुम्ही जिंकलात! शुल्क भरून बक्षीस मिळवा");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
    expect(result.riskLevel).toBe("high");
  });

  test("flags Hindi account-blocked + click-link phrasing", () => {
    const result = detectScamPatterns("आपका खाता ब्लॉक कर दिया गया है। लिंक पर क्लिक करें");
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["urgency", "suspicious_link"]));
    expect(result.riskLevel).toBe("high");
  });

  test("flags Marathi account-blocked + click-link phrasing", () => {
    const result = detectScamPatterns("तुमचे खाते ब्लॉक केले आहे. लिंक वर क्लिक करा");
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["urgency", "suspicious_link"]));
    expect(result.riskLevel).toBe("high");
  });

  test("flags Marathi account-reactivation link scam", () => {
    const result = detectScamPatterns("लिंक वर क्लिक करून तुमचे खाते पुन्हा सुरू करा");
    expect(result.matchedPatterns).toEqual(expect.arrayContaining(["urgency", "suspicious_link"]));
    expect(result.riskLevel).toBe("high");
  });
});

describe("detectScamPatterns — regional won-prize flexibility (C2b)", () => {
  test("flags Tamil prize-won with alternate verb form + prize/fee phrasing", () => {
    const result = detectScamPatterns("நீங்கள் பரிசு வென்றுள்ளீர்கள்! பரிசு பெற கட்டணம் செலுத்துங்கள்");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
    expect(result.riskLevel).toBe("high");
  });

  test("flags Telugu prize-won with prize word between subject and verb", () => {
    const result = detectScamPatterns("మీరు బహుమతి గెలుచుకున్నారు! బహుమతి పొందడానికి రుసుము చెల్లించండి");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
    expect(result.riskLevel).toBe("high");
  });

  test("flags Bengali prize-won with prize word between subject and verb", () => {
    const result = detectScamPatterns("আপনি পুরস্কার জিতেছেন! পুরস্কার পেতে ফি জমা দিন");
    expect(result.matchedPatterns).toContain("suspicious_collect_request");
    expect(result.riskLevel).toBe("high");
  });
});

describe("detectScamPatterns — cross-language canonical messages (all high)", () => {
  test("flags prize/link/OTP phrasings in every supported language as high risk", () => {
    const messages = [
      "URGENT: Your account will be blocked. Share your OTP via https://bit.ly/x",
      "आप जीत गए हैं! इनाम पाने के लिए शुल्क जमा करें",
      "तुम्ही जिंकलात! शुल्क भरून बक्षीस मिळवा",
      "வங்கி அதிகாரி பேசுகிறேன், நீங்கள் வென்றீர்கள்!",
      "మీరు గెలిచారు, డబ్బు పొందడానికి లింక్ క్లిక్ చేయండి",
      "আপনি জিতেছেন, টাকা পেতে লিঙ্কে ক্লিক করুন",
    ];
    for (const text of messages) {
      expect(detectScamPatterns(text).riskLevel).toBe("high");
    }
  });
});

describe("detectScamPatterns — URL extraction (M6)", () => {
  test.each([
    "Visit t.co/xyz123 now",
    "Check this http://goo.gl/abc",
    "verify at is.gd/verify",
    "confirm on cutt.ly/promo",
    "tinyurl.com/claim",
  ])("flags short-link %p", (text) => {
    expect(detectScamPatterns(text).matchedPatterns).toContain("suspicious_link");
  });

  test("flags dotted www link without scheme", () => {
    const result = detectScamPatterns("Login to www.bank-update-portal.in now");
    expect(result.matchedPatterns).toContain("suspicious_link");
  });
});
