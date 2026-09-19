const { extractEntities } = require("./entityExtractor");

const EMPTY = { urls: [], upiIds: [], phones: [], senderHeaders: [] };

describe("extractEntities → urls", () => {
  test.each([
    ["http://example.com", ["http://example.com"]],
    ["https://scam-site.net/verify", ["https://scam-site.net/verify"]],
    ["visit http://pay.example.com/login now", ["http://pay.example.com/login"]],
    ["hxxp://sbi-verify.tk", ["http://sbi-verify.tk"]],
    ["hxxps://evil.example/trojan", ["https://evil.example/trojan"]],
    ["sbi-verify[.]tk", ["sbi-verify.tk"]],
    ["http://example[.]com/path", ["http://example.com/path"]],
    ["click scam[dot]net[dot]xyz", ["scam.net.xyz"]],
    ["visit sbi-verify dot tk now", ["sbi-verify.tk"]],
    ["visit sbi-verify.tk now", ["sbi-verify.tk"]],
    ["see http://evil.com.", ["http://evil.com"]],
    ["see http://evil.com/verify!", ["http://evil.com/verify"]],
    ["read (http://evil.com/exit)", ["http://evil.com/exit"]],
  ])("extracts %p", (text, expectedUrls) => {
    expect(extractEntities(text).urls).toEqual(expectedUrls);
  });

  test("deduplicates repeated URLs and drops bare-domain duplicates of URL hosts", () => {
    const result = extractEntities("http://a.com/x http://a.com/x");
    expect(result.urls).toEqual(["http://a.com/x"]);
    expect(extractEntities("http://a.com/ a.com").urls).toEqual(["http://a.com/"]);
  });

  test("no URL false positives on plain text and dotted prose", () => {
    expect(extractEntities("Please verify your account details immediately.").urls).toEqual([]);
    expect(extractEntities("It is 6.30 pm now, call after 5.30.").urls).toEqual([]);
    expect(extractEntities("Mr. Sharma lives in New Delhi.").urls).toEqual([]);
  });
});

describe("extractEntities → upiIds", () => {
  test.each([
    ["pay rahul@okhdfc now", ["rahul@okhdfc"]],
    ["send to pay@axl", ["pay@axl"]],
    ["refund to name@ybl", ["name@ybl"]],
    ["credited to me@upi", ["me@upi"]],
    ["transfer via acct@paytm today", ["acct@paytm"]],
    ["sent money to sh@okaxis", ["sh@okaxis"]],
    ["upi user@okhdfcbank", ["user@okhdfcbank"]],
  ])("extracts %p", (text, expectedUpi) => {
    expect(extractEntities(text).upiIds).toEqual(expectedUpi);
  });

  test("accepts dot-separated local parts and PSP-prefixed suffixes", () => {
    expect(extractEntities("paid rahul.kumar@okhdfc").upiIds).toEqual(["rahul.kumar@okhdfc"]);
    expect(extractEntities("paid me@npci.upi").upiIds).toEqual(["me@npci.upi"]);
  });

  test("rejects email addresses and bare @ tokens", () => {
    expect(extractEntities("mail rahul@example.com today").upiIds).toEqual([]);
    expect(extractEntities("use @okhdfc").upiIds).toEqual([]);
    expect(extractEntities("hello").upiIds).toEqual([]);
  });

  test("deduplicates case-insensitively", () => {
    expect(extractEntities("RAHUL@OkHDFC rahul@okhdfc").upiIds).toEqual(["rahul@okhdfc"]);
  });
});

describe("extractEntities → phones", () => {
  test.each([
    ["+91 9876543210", ["9876543210"]],
    ["call 9876543210 now", ["9876543210"]],
    ["tel +91-98765 43210", ["9876543210"]],
    ["reach 987 654 3210", ["9876543210"]],
    ["+91-9876543210", ["9876543210"]],
  ])("extracts %p", (text, expectedPhones) => {
    expect(extractEntities(text).phones).toEqual(expectedPhones);
  });

  test("deduplicates +91 and bare forms of the same number", () => {
    expect(extractEntities("+919876543210 then 9876543210").phones).toEqual(["9876543210"]);
  });

  test("rejects non-Indian numbers and bare digits", () => {
    expect(extractEntities("1156789012 is a landline").phones).toEqual([]);
    expect(extractEntities("pin is 1234567890").phones).toEqual([]);
    expect(extractEntities("short 987654321").phones).toEqual([]);
  });

  test("does not treat a number as UPI or sender", () => {
    const result = extractEntities("call 9123456789");
    expect(result.phones).toEqual(["9123456789"]);
    expect(result.senderHeaders).toEqual([]);
  });
});

describe("extractEntities → senderHeaders", () => {
  test("extracts DLT sender ids with isDlt: true", () => {
    expect(extractEntities("AD-ADITI sent you a message").senderHeaders).toEqual([
      { value: "AD-ADITI", isDlt: true },
    ]);
    expect(extractEntities("VM-RBIBNK").senderHeaders).toEqual([{ value: "VM-RBIBNK", isDlt: true }]);
  });

  test("extracts non-DLT sender-like tokens with isDlt: false", () => {
    const headers = extractEntities("SBIINB says send money vs ref VI-AP1").senderHeaders;
    expect(headers).toEqual([
      { value: "SBIINB", isDlt: false },
      { value: "VI-AP1", isDlt: false },
    ]);
  });

  test("deduplicates repeated sender ids", () => {
    expect(extractEntities("AD-ADITI AD-ADITI").senderHeaders).toEqual([{ value: "AD-ADITI", isDlt: true }]);
    expect(extractEntities("SBIINB SBIINB").senderHeaders).toEqual([{ value: "SBIINB", isDlt: false }]);
  });

  test("does not flag message content like STOP, OTP or numbers as senders", () => {
    expect(extractEntities("Reply STOP now, OTP is 384920").senderHeaders).toEqual([]);
    expect(extractEntities("Your request is processed today").senderHeaders).toEqual([]);
  });
});

describe("extractEntities → whole-object", () => {
  test("mixed message extracts every kind", () => {
    const text =
      "VM-RBIBNK: your account is frozen, pay to rahul@okhdfc or call +91 98765 43210, visit hxxp://sbi-verify[.]tk now";
    const result = extractEntities(text);
    expect(result.urls).toEqual(["http://sbi-verify.tk"]);
    expect(result.upiIds).toEqual(["rahul@okhdfc"]);
    expect(result.phones).toEqual(["9876543210"]);
    expect(result.senderHeaders).toEqual([{ value: "VM-RBIBNK", isDlt: true }]);
  });

  test("plain text yields all-empty arrays", () => {
    expect(extractEntities("Please verify your account details immediately")).toEqual(EMPTY);
    expect(extractEntities("")).toEqual(EMPTY);
    expect(extractEntities(null)).toEqual(EMPTY);
    expect(extractEntities(undefined)).toEqual(EMPTY);
    expect(extractEntities(42)).toEqual(EMPTY);
  });
});