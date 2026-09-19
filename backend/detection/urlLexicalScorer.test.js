const { scoreUrl } = require("./urlLexicalScorer");

const PHISHING_CASES = [
  {
    url: "http://192.168.1.1/verify",
    risk: "medium",
    flags: { has_ip_address: true, https_absent: true, brand_impersonation: false },
  },
  {
    url: "https://micr0soft-verify.tk/login",
    risk: "high",
    flags: {
      brand_impersonation: true,
      suspicious_tld: true,
      has_hyphen_in_domain: true,
      digit_in_domain: true,
    },
  },
  {
    url: "http://sbi-verify.com/update",
    risk: "high",
    flags: { brand_impersonation: true, has_hyphen_in_domain: true, https_absent: true },
  },
  {
    url: "https://hdfc.login-verify.com/secure",
    risk: "high",
    flags: {
      brand_impersonation: true,
      brand_in_subdomain: true,
      has_hyphen_in_domain: true,
    },
  },
  {
    url: "http://paypa1-otp.xyz/verify?acc=1&otp=2&id=3",
    risk: "high",
    flags: {
      brand_impersonation: true,
      suspicious_tld: true,
      many_query_params: true,
      digit_in_domain: true,
      https_absent: true,
    },
  },
  {
    url: "https://xn--80ak6aa92e.com",
    risk: "high",
    flags: { punycode: true, has_hyphen_in_domain: true, digit_in_domain: true },
  },
  {
    url: "http://www.secure-login-bank-verify-2024.top/account",
    risk: "high",
    flags: {
      suspicious_tld: true,
      has_hyphen_in_domain: true,
      digit_in_domain: true,
      https_absent: true,
    },
  },
];

const CLEAN_CASES = [
  "https://www.sbi.co.in/web/personal-banking",
  "https://www.hdfcbank.com/personal",
  "https://paytm.com",
  "https://www.irctc.co.in/nget/train-search",
  "https://uidai.gov.in",
  "https://www.google.com/search?q=otp",
];

describe("scoreUrl - phishing URLs", () => {
  test.each(PHISHING_CASES)("flags $url as expected", ({ url, risk, flags }) => {
    const result = scoreUrl(url);
    expect(result.risk).toBe(risk);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.features).toMatchObject(flags);
  });
});

describe("scoreUrl - official / clean URLs", () => {
  test.each(CLEAN_CASES)("scores official domain $url low", (url) => {
    const result = scoreUrl(url);
    expect(result.risk).toBe("low");
    expect(result.score).toBe(0);
  });

  test("official domains are not flagged as brand impersonation", () => {
    for (const url of CLEAN_CASES) {
      const result = scoreUrl(url);
      expect(result.features.brand_impersonation).toBe(false);
      expect(result.features.brand_in_subdomain).toBe(false);
    }
  });
});

describe("scoreUrl - shape and robustness", () => {
  test("feature keys are present for explainability", () => {
    const result = scoreUrl("https://micr0soft-verify.tk/login");
    const keys = [
      "has_ip_address",
      "url_entropy",
      "subdomain_count",
      "has_hyphen_in_domain",
      "digit_count",
      "digit_ratio",
      "suspicious_tld",
      "brand_impersonation",
      "long_url",
      "many_query_params",
      "has_at_symbol",
      "double_slash_in_path",
      "punycode",
      "https_absent",
      "brand_in_subdomain",
    ];
    for (const key of keys) {
      expect(result.features).toHaveProperty(key);
    }
  });

  test("url_entropy is a finite number", () => {
    const result = scoreUrl("https://paypa1-otp.xyz/verify");
    expect(typeof result.features.url_entropy).toBe("number");
    expect(Number.isFinite(result.features.url_entropy)).toBe(true);
  });

  test("returns low risk for unparseable input instead of throwing", () => {
    expect(() => scoreUrl(undefined)).not.toThrow();
    expect(() => scoreUrl(null)).not.toThrow();
    const blank = scoreUrl(null);
    expect(blank.risk).toBe("low");
    expect(blank.score).toBe(0);
  });

  test("is a pure function (same input -> same output)", () => {
    const url = "http://sbi-verify.com/update";
    expect(scoreUrl(url)).toEqual(scoreUrl(url));
  });
});