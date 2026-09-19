const { report } = require("./reportHandler");

describe("reportHandler — validation", () => {
  test("rejects a missing body", async () => {
    await expect(report()).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  test("rejects an unsupported language", async () => {
    await expect(
      report({ language: "fr", description: "I was scammed by a fake call." })
    ).rejects.toMatchObject({ code: "UNSUPPORTED_LANGUAGE" });
  });

  test("rejects a description that is too short", async () => {
    await expect(
      report({ language: "en", description: "short" })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  test("rejects an oversized description", async () => {
    await expect(
      report({ language: "en", description: "x".repeat(8001) })
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });

  test("rejects more than 3 screenshots", async () => {
    const shots = Array.from({ length: 4 }, () => ({ imageBase64: "a", imageMimeType: "image/png" }));
    await expect(
      report({ language: "en", description: "I was scammed by a fake call.", screenshots: shots })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  test("rejects an invalid screenshot image", async () => {
    await expect(
      report({
        language: "en",
        description: "I was scammed by a fake call.",
        screenshots: [{ imageBase64: "bm90YW5pbWFnZQ==", imageMimeType: "image/png" }],
      })
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });

  test("rejects non-object answers", async () => {
    await expect(
      report({ language: "en", description: "I was scammed by a fake call.", answers: "yes" })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("reportHandler — analysis", () => {
  test("classifies an electricity bill scam and detects indicators", async () => {
    const result = await report({
      language: "en",
      description:
        "I got a call saying my electricity bill is unpaid and my power will be cut unless I pay immediately. They asked me to share an OTP.",
      messages: "URGENT: Your account will be blocked. Share your OTP now.",
    });

    expect(result.reportId).toMatch(/^report_/);
    expect(result.scamType).toBe("electricity_bill");
    expect(result.riskLevel).toBe("high");
    expect(result.analysis.summaryKey).toBe("report.summary.electricity_bill");
    expect(result.analysis.indicators).toContain("report.indicator.urgency");
    expect(result.analysis.indicators).toContain("report.indicator.otp_request");
    expect(result.inputSummary.redactionApplied).toBe(true);
  });

  test("classifies a lottery scam", async () => {
    const result = await report({
      language: "en",
      description: "You have won a lottery of 5 lakh rupees. Pay a small fee to claim your prize.",
    });
    expect(result.scamType).toBe("lottery_prize");
  });

  test("classifies a family emergency scam in Hindi", async () => {
    const result = await report({
      language: "hi",
      description: "बेटा अस्पताल में है, तुरंत पैसे भेजो।",
    });
    expect(result.scamType).toBe("family_emergency");
  });

  test("falls back to other when nothing matches", async () => {
    const result = await report({
      language: "en",
      description: "Someone sent me a strange message about my garden plants.",
    });
    expect(result.scamType).toBe("other");
    expect(result.riskLevel).toBe("low");
  });
});

describe("reportHandler — follow-up questions", () => {
  test("asks for missing details when none are answered", async () => {
    const result = await report({
      language: "en",
      description: "I was scammed by a fake call asking for money.",
    });
    const ids = result.followUpQuestions.map((q) => q.id);
    expect(ids).toContain("platform");
    expect(ids).toContain("senderNumber");
    expect(ids).toContain("sharedOtp");
    expect(ids).toContain("amountLost");
    expect(ids).toContain("transactionRef");
    expect(ids).toContain("screenshots");
    expect(result.followUpQuestions.every((q) => q.optional === true)).toBe(true);
  });

  test("skips the screenshots question when screenshots were uploaded", async () => {
    const png = Buffer.from(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0].map((b) => b)
    ).toString("base64");
    const result = await report({
      language: "en",
      description: "I was scammed by a fake call asking for money.",
      screenshots: [{ imageBase64: png, imageMimeType: "image/png" }],
    });
    const ids = result.followUpQuestions.map((q) => q.id);
    expect(ids).not.toContain("screenshots");
    expect(result.inputSummary.screenshots).toBe(1);
  });

  test("does not ask again for already-answered questions", async () => {
    const result = await report({
      language: "en",
      description: "I was scammed by a fake call asking for money.",
      answers: { platform: "WhatsApp", senderNumber: "9876543210" },
    });
    const ids = result.followUpQuestions.map((q) => q.id);
    expect(ids).not.toContain("platform");
    expect(ids).not.toContain("senderNumber");
    expect(ids).toContain("sharedOtp");
  });
});

describe("reportHandler — reporting guide", () => {
  test("builds the base guide without answers", async () => {
    const result = await report({
      language: "en",
      description: "I was scammed by a fake call asking for money.",
    });
    const keys = result.reportingGuide.steps.map((s) => s.key);
    expect(keys).toContain("report.step.portal");
    expect(keys).toContain("report.step.file");
    expect(keys).toContain("report.step.submit");
    expect(keys).not.toContain("report.step.helpline");
    expect(result.reportingGuide.evidenceChecklist).toContain("report.evidence.ack");
  });

  test("adds the helpline step when money was lost", async () => {
    const result = await report({
      language: "en",
      description: "I was scammed by a fake call asking for money.",
      answers: { amountLost: "25000" },
    });
    const keys = result.reportingGuide.steps.map((s) => s.key);
    expect(keys[0]).toBe("report.step.helpline");
    expect(keys[0] && result.reportingGuide.steps[0].link).toBe("tel:1930");
    expect(keys).toContain("report.step.bank");
  });

  test("adds password-change step when an OTP was shared", async () => {
    const result = await report({
      language: "en",
      description: "I was scammed by a fake call asking for money.",
      answers: { sharedOtp: "yes" },
    });
    const keys = result.reportingGuide.steps.map((s) => s.key);
    expect(keys).toContain("report.step.passwords");
    expect(keys[0]).toBe("report.step.helpline");
  });

  test("includes sender and transaction evidence when provided", async () => {
    const result = await report({
      language: "en",
      description: "I was scammed by a fake call asking for money.",
      answers: { senderNumber: "9876543210", transactionRef: "UPI123456" },
    });
    const checklist = result.reportingGuide.evidenceChecklist;
    expect(checklist).toContain("report.evidence.sender");
    expect(checklist).toContain("report.evidence.transaction");
  });

  test("redacts personal details from the analysis input", async () => {
    const result = await report({
      language: "en",
      description: "My phone number is 9876543210 and my Aadhaar is 1234 5678 9012. I was scammed.",
    });
    expect(result.inputSummary.descriptionCharacters).toBeGreaterThan(0);
    expect(result.riskLevel).toBeDefined();
  });
});