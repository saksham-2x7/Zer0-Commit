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

describe("detectScamPatterns — pattern key integrity", () => {
  const VALID_KEYS = [
    "urgency",
    "otp_request",
    "screen_share_request",
    "suspicious_link",
    "impersonation",
    "suspicious_collect_request",
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
