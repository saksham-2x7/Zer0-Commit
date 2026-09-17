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
