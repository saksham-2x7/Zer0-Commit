const {
  lookupReputation,
  extractDomains,
  normalizePhones,
  isScamFinding,
  summarize,
} = require("./lookup");

describe("extractDomains", () => {
  test("extracts unique domains from URLs, stripping www and paths", () => {
    expect(
      extractDomains("Visit https://www.example.com/verify now or http://example.com/***")
    ).toEqual(["example.com"]);
  });

  test("returns empty array for text without URLs", () => {
    expect(extractDomains("no links here")).toEqual([]);
  });

  test("handles non-string input", () => {
    expect(extractDomains(null)).toEqual([]);
    expect(extractDomains(undefined)).toEqual([]);
  });
});

describe("normalizePhones", () => {
  test("accepts 10-digit Indian numbers and +91 variants, dedupes", () => {
    expect(normalizePhones(["9876543210", "+919876543210", "9876543210"])).toEqual([
      "9876543210",
    ]);
  });

  test("rejects invalid numbers and non-array input", () => {
    expect(normalizePhones(["12345", "abcdefghij", "987654321"])).toEqual([]);
    expect(normalizePhones(null)).toEqual([]);
    expect(normalizePhones("9876543210")).toEqual([]);
  });

  test("caps at MAX_ENTITIES", () => {
    const many = ["9876543210", "9876543211", "9876543212", "9876543213"];
    expect(normalizePhones(many)).toHaveLength(3);
  });
});

describe("isScamFinding", () => {
  test("flags scam/fraud keywords in title or snippet", () => {
    expect(isScamFinding("Fraud alert", "this number is a scam")).toBe(true);
    expect(isScamFinding("Normal page", "nothing suspicious")).toBe(false);
    expect(isScamFinding("", "घोटाला की शिकायत")).toBe(true);
  });
});

describe("summarize", () => {
  test("reports scam findings when present", () => {
    const entities = [
      { findings: [{ scamRelated: true }, { scamRelated: false }] },
      { findings: [] },
    ];
    expect(summarize(entities)).toContain("1 report(s)");
  });

  test("reports no findings when empty", () => {
    expect(summarize([{ findings: [] }])).toContain("No public reports");
  });
});

describe("lookupReputation", () => {
  const ORIGINAL_ENV = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SERPAPI_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = originalFetch;
  });

  test("returns no_entities when nothing to look up", async () => {
    const result = await lookupReputation({ redactedText: "hello", lookupPhones: [] });
    expect(result.available).toBe(false);
    expect(result.reason).toBe("no_entities");
  });

  test("queries DuckDuckGo (keyless) and marks scam findings", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Heading: "9876543210",
        AbstractText: "This number is reported as a scam by multiple users.",
        AbstractURL: "https://example.com/report",
        RelatedTopics: [],
      }),
    });

    const result = await lookupReputation({
      redactedText: "Call me at 9876543210",
      lookupPhones: ["9876543210"],
    });

    expect(result.available).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe("phone");
    expect(result.entities[0].findings[0].scamRelated).toBe(true);
    expect(result.summary).toContain("1 report(s)");

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("api.duckduckgo.com");
    expect(calledUrl).toContain(encodeURIComponent("+9876543210 scam fraud report"));
  });

  test("uses SerpAPI when SERPAPI_KEY is set", async () => {
    process.env.SERPAPI_KEY = "test-key";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        organic_results: [{ title: "Safe page", snippet: "nothing here", link: "https://example.com" }],
      }),
    });

    const result = await lookupReputation({
      redactedText: "Check https://example.com/***",
      lookupPhones: [],
    });

    expect(result.available).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toContain("serpapi.com");
    expect(result.entities[0].type).toBe("domain");
    expect(result.entities[0].findings[0].scamRelated).toBe(false);
  });

  test("degrades gracefully on network failure", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ENOTFOUND"));

    const result = await lookupReputation({
      redactedText: "Call 9876543210",
      lookupPhones: ["9876543210"],
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe("error");
    expect(result.entities).toEqual([]);
  });

  test("degrades gracefully on non-OK HTTP response", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });

    const result = await lookupReputation({
      redactedText: "Call 9876543210",
      lookupPhones: ["9876543210"],
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe("error");
  });

  test("aborts slow lookups via timeout", async () => {
    global.fetch = jest.fn(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          // Never resolves; the AbortController signal must reject it.
          opts.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );

    const result = await lookupReputation({
      redactedText: "Call 9876543210",
      lookupPhones: ["9876543210"],
      timeoutMs: 50,
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe("error");
  });
});