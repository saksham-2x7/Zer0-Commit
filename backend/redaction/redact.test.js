const { redactText } = require("./redact");

describe("redactText (backend)", () => {
  test("returns empty string for non-string or empty input", () => {
    expect(redactText("")).toBe("");
    expect(redactText(undefined)).toBe("");
    expect(redactText(null)).toBe("");
  });

  test("leaves ordinary text unchanged", () => {
    const text = "Hi, are we still meeting for lunch tomorrow?";
    expect(redactText(text)).toBe(text);
  });

  test("masks a 10-digit Indian phone number", () => {
    const result = redactText("Call me on 9876543210 please.");
    expect(result).not.toContain("9876543210");
  });

  test("masks a UPI id", () => {
    const result = redactText("Pay to john.doe@okhdfcbank now.");
    expect(result).not.toContain("john.doe@okhdfcbank");
  });

  test("masks an email address", () => {
    const result = redactText("Contact me at pushpa.r@example.com");
    expect(result).not.toContain("pushpa.r@example.com");
  });

  test("masks an Aadhaar-like 12-digit number", () => {
    const result = redactText("My Aadhaar is 1234 5678 9012");
    expect(result).not.toContain("1234 5678 9012");
    expect(result).not.toContain("123456789012");
  });

  test("masks a 16-digit card number with first-2/last-2 visible (no Aadhaar leak)", () => {
    const result = redactText("Card 4111 1111 1111 1111");
    expect(result).toContain("41************11");
    expect(result).not.toContain("4111 1111 1111 1111");
    expect(result).not.toContain("41****1111");
    expect(result).not.toContain("4111");
  });

  test("masks Devanagari-digit numbers after normalizing ०-९ to 0-9", () => {
    const result = redactText("आधार १२३४ ५६७८ ९०१२");
    expect(result).not.toContain("१२३४ ५६७८ ९०१२");
    expect(result).not.toContain("123456789012");
  });

  test("masks numbers padded with zero-width characters", () => {
    const result = redactText("Call 98\u200b7654\u200c3210 please");
    expect(result).not.toContain("9876543210");
  });

  test("masks phone numbers written in non-Devanagari digit scripts (M1)", () => {
    const phones = [
      "৯৮৭৬৫৪৩২১০", // Bengali
      "௯௮௭௬௫௪௩௨௧௦", // Tamil
      "౯౮౭౬౫౪౩౨౧౦", // Telugu
      "೯೮೭೬೫೪೩೨೧೦", // Kannada
      "൯൮൭൬൫൪൩൨൧൦", // Malayalam
      "๙๘๗๖๕๔๓๒๑๐", // Thai
      "٩٨٧٦٥٤٣٢١٠", // Arabic-Indic
      "۹۸۷۶۵۴۳۲۱۰", // Persian / Urdu
      "９８７６５４３２１０", // Fullwidth
    ];
    for (const phone of phones) {
      const result = redactText(`Call ${phone} now`);
      expect(result).not.toContain(phone);
    }
  });

  test("strips bidi-control characters so split numbers still mask (M1)", () => {
    const raw = "9876\u200e5432\u200f10";
    const result = redactText(`Call ${raw} now`);
    expect(result).not.toContain(raw);
    expect(result).toContain("98******10");
  });

  test("strips bidi embedding/override ranges so a phone split by U+202A/U+202C still masks", () => {
    const raw = "9876\u202a5432\u202c10";
    const result = redactText(`Call ${raw} now`);
    expect(result).not.toContain(raw);
    expect(result).toContain("98******10");
  });

  test("strips bidi isolate ranges so a phone split by U+2066/U+2069 still masks", () => {
    const raw = "9876\u20665432\u206910";
    const result = redactText(`Call ${raw} now`);
    expect(result).not.toContain(raw);
    expect(result).toContain("98******10");
  });

  test("masks a suspicious link's path/query but keeps the host visible", () => {
    const result = redactText("Click https://bit.ly/verify?token=abc123secret");
    expect(result).not.toContain("token=abc123secret");
    expect(result).toContain("https://bit.ly/***");
  });

  test("does not throw on already-redacted text", () => {
    const once = redactText("Call 9876543210, email a@b.com");
    expect(() => redactText(once)).not.toThrow();
  });

  test("preserves scam-relevant keywords used by the detector", () => {
    const result = redactText("URGENT: share your OTP immediately");
    expect(result).toContain("URGENT");
    expect(result).toContain("OTP");
    expect(result).toContain("immediately");
  });
});
