import { describe, test, expect } from "vitest";
import { redactText } from "./redact";
import backendRedaction from "../../../backend/redaction/redact.js";

const backendRedactText = backendRedaction.redactText;

describe("redactText", () => {
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
    expect(result).toMatch(/98\*+10/);
  });

  test("masks a UPI id", () => {
    const result = redactText("Pay to john.doe@okhdfcbank now.");
    expect(result).not.toContain("john.doe@okhdfcbank");
    expect(result).toMatch(/jo\*+nk/);
  });

  test("masks a long account-like number", () => {
    const result = redactText("My account number is 123456789012.");
    expect(result).not.toContain("123456789012");
    expect(result).toMatch(/\*+/);
  });

  test("does not mask short numbers like OTP length (under threshold)", () => {
    const result = redactText("Your code is 1234");
    expect(result).toContain("1234");
  });

  test("masking is idempotent-safe (does not throw on already-masked text)", () => {
    const once = redactText("Call 9876543210");
    expect(() => redactText(once)).not.toThrow();
  });

  test("masks an email address", () => {
    const result = redactText("Contact me at pushpa.r@example.com");
    expect(result).not.toContain("pushpa.r@example.com");
  });

  test("strips a URL's path/query but keeps the host (matches backend redaction)", () => {
    const result = redactText("Click https://bit.ly/verify?token=abc123secret now");
    expect(result).not.toContain("token=abc123secret");
    expect(result).toContain("https://bit.ly/***");
  });
});

describe("redactText — disguised digit normalization", () => {
  // Every script block maps 0-9 in order, so this 10-char run is 9876543210
  // in every row.
  const DIGIT_PHONES = [
    ["Devanagari", "९८७६५४३२१०"],
    ["Bengali", "৯৮৭৬৫৪৩২১০"],
    ["Tamil", "௯௮௭௬௫௪௩௨௧௦"],
    ["Telugu", "౯౮౭౬౫౪౩౨౧౦"],
    ["Kannada", "೯೮೭೬೫೪೩೨೧೦"],
    ["Malayalam", "൯൮൭൬൫൪൩൨൧൦"],
    ["Thai", "๙๘๗๖๕๔๓๒๑๐"],
    ["Arabic-Indic", "٩٨٧٦٥٤٣٢١٠"],
    ["Persian/Urdu", "۹۸۷۶۵۴۳۲۱۰"],
    ["Fullwidth", "９８７６５４３２１０"],
  ];

  test.each(DIGIT_PHONES)("masks a phone written in %s digits", (_name, digits) => {
    const result = redactText(`Call ${digits} now`);
    expect(result).not.toContain(digits);
    expect(result).toMatch(/98\*+10/);
  });

  test("masks digits obfuscated with zero-width chars (ZWSP/ZWNJ/ZWJ/BOM)", () => {
    const obfuscated = "98\u200B76\u200C54\u200D32\uFEFF10";
    const result = redactText(`Call ${obfuscated} now`);
    expect(result).toMatch(/98\*+10/);
    expect(result).not.toContain(obfuscated);
  });

  test("masks digits obfuscated with bidi marks (LRM/RLM) and the word joiner", () => {
    const obfuscated = "9\u200E8\u200F7\u200E6\u200F5\u200E4\u200F3\u200E2\u200F1\u200E0\u2060";
    const result = redactText(`Call ${obfuscated} now`);
    expect(result).not.toContain(obfuscated);
    expect(result).toMatch(/98\*+10/);
  });
});

describe("redactText — backend parity", () => {
  const SHARED_CASES = [
    "Call me on 9876543210 please.",
    "Devanagari ९८७६५४३२१० end.",
    "zwsp 98\u200B76\u200C54\u200D32\uFEFF10 x",
    "My account number is 123456789012.",
    "Pay to john.doe@okhdfcbank now.",
    "Contact me at pushpa.r@example.com",
    "Click https://bit.ly/verify?token=abc123secret now",
    "Hi, are we still meeting for lunch tomorrow?",
    "Your code is 1234",
  ];

  test.each(SHARED_CASES)("masking matches backend/redaction/redact.js: %s", (input) => {
    expect(redactText(input)).toBe(backendRedactText(input));
  });
});