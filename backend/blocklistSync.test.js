const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const {
  handler,
  parseCsvRow,
  parseCsvRows,
  domainFromUrl,
  registrableDomain,
  entriesFromCsv,
  chunk,
  URLHAUS_FEED_URL,
  PHISHTANK_FEED_URL,
} = require("./blocklistSync");

const ddbMock = mockClient(DynamoDBDocumentClient);
const TABLE = "scamsahayak-blocklist";

const URLHAUS_CSV = [
  "# abuse.ch URLhaus CSV dump",
  "# id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter",
  '"1","2026-01-01 00:00:00","https://evil1.com/a","online","2026-01-02 00:00:00","malware_download",,"https://urlhaus.abuse.ch/url/1","reporter"',
  '"2","2026-01-02 00:00:00","https://sub.evil2.co.in/b","online","2026-01-03 00:00:00","phishing","malware,phishing","https://urlhaus.abuse.ch/url/2","reporter"',
  '"3","2026-01-03 00:00:00","hxxp://bare-hxxp.tk/c","online","2026-01-04 00:00:00","banking",,"https://urlhaus.abuse.ch/url/3","reporter"',
].join("\n");

const PHISHTANK_CSV = [
  "phish_id,url,phish_detail_url,submission_time,verified,verification_time,online,target",
  '"1","https://phish-evil.com/pay","https://phishtank.com/phish_detail.php?phish_id=1","2026-01-01T00:00:00+00:00","yes","2026-01-01T01:00:00+00:00","yes","Other"',
].join("\n");

function csvWith(count) {
  const rows = ["# comment header", "id,dateadded,url,url_status,last_online,threat,tags,urlhaus_link,reporter"];
  for (let i = 0; i < count; i += 1) {
    rows.push(
      `"${i}","2026-01-01 00:00:00","https://bulk-${i}.example/x","online","2026-01-02 00:00:00","phishing",,"https://urlhaus.abuse.ch/url/${i}","reporter"`
    );
  }
  return rows.join("\n");
}

describe("csv parsing", () => {
  test("parseCsvRow handles quoted commas and escaped quotes", () => {
    expect(parseCsvRow('"a,b","c""d",e')).toEqual(["a,b", 'c"d', "e"]);
  });

  test("parseCsvRows skips comment and blank lines including the header row", () => {
    const rows = parseCsvRows("a,b\n# comment\n\n1,2");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  test("domainFromUrl normalizes hxxp/hxxps schemes", () => {
    expect(domainFromUrl("hxxp://evil.tk/x")).toBe("evil.tk");
    expect(domainFromUrl("hxxps://evil.co.in/x")).toBe("evil.co.in");
    expect(domainFromUrl("https://www.evil.com/a")).toBe("www.evil.com");
  });

  test("chunk splits arrays evenly", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("handler", () => {
  const originalFetch = global.fetch;
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    ddbMock.reset();
    process.env = { ...ORIGINAL_ENV };
    process.env.TABLE_NAME = TABLE;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = originalFetch;
  });

  test("synces URLhaus domains into the blocklist with source + listedAt", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => URLHAUS_CSV });
    ddbMock.on(BatchWriteCommand).resolves({});

    const result = await handler({});

    expect(result.error).toBeUndefined();
    expect(result.sources).toEqual([{ name: "urlhaus", entries: 3 }]);
    expect(result.synced).toBe(3);

    expect(ddbMock.calls()).toHaveLength(1);
    const requests = ddbMock.call(0).args[0].input.RequestItems[TABLE];
    expect(requests).toHaveLength(3);

    const items = requests.map((r) => r.PutRequest.Item);
    const values = items.map((i) => i.value);
    expect(values).toEqual(expect.arrayContaining(["evil1.com", "evil2.co.in", "bare-hxxp.tk"]));
    for (const item of items) {
      expect(item.type).toBe("domain");
      expect(item.source).toBe("urlhaus");
      expect(typeof item.listedAt).toBe("string");
    }
  });

  test("writes in chunks of 25", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => csvWith(30) });
    ddbMock.on(BatchWriteCommand).resolves({});

    const result = await handler({});

    expect(result.synced).toBe(30);
    expect(ddbMock.calls()).toHaveLength(2);
    expect(ddbMock.call(0).args[0].input.RequestItems[TABLE]).toHaveLength(25);
    expect(ddbMock.call(1).args[0].input.RequestItems[TABLE]).toHaveLength(5);

    const requestedUrl = global.fetch.mock.calls[0][0];
    expect(requestedUrl).toBe(URLHAUS_FEED_URL);
  });

  test("fetch failure fails open: returns synced 0 without throwing", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ENETUNREACH"));

    const result = await handler({});

    expect(result.synced).toBe(0);
    expect(result.error).toContain("urlhaus");
    expect(ddbMock.calls()).toHaveLength(0);
  });

  test("non-OK feed response fails open", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    const result = await handler({});

    expect(result.synced).toBe(0);
    expect(result.error).toContain("HTTP 503");
  });

  test("missing TABLE_NAME fails open", async () => {
    delete process.env.TABLE_NAME;
    const result = await handler({});
    expect(result).toEqual({ synced: 0, error: "TABLE_NAME not set", sources: [] });
  });

  test("empty feed writes nothing and returns synced 0", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => "# only comments\n" });
    const result = await handler({});
    expect(result.synced).toBe(0);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  test("PhishTank is fetched when PHISHTANK_API_KEY is set", async () => {
    process.env.PHISHTANK_API_KEY = "pt-key-123";
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => URLHAUS_CSV })
      .mockResolvedValueOnce({ ok: true, text: async () => PHISHTANK_CSV });
    ddbMock.on(BatchWriteCommand).resolves({});

    const result = await handler({});

    expect(result.synced).toBe(4);
    expect(result.sources).toEqual([
      { name: "urlhaus", entries: 3 },
      { name: "phishtank", entries: 1 },
    ]);
    expect(global.fetch.mock.calls[1][0]).toBe(PHISHTANK_FEED_URL("pt-key-123"));

    const values = ddbMock
      .call(0)
      .args[0].input.RequestItems[TABLE]
      .map((r) => r.PutRequest.Item.value);
    expect(values).toContain("phish-evil.com");
  });

  test("PhishTank failure is non-fatal: URLhaus data is still written", async () => {
    process.env.PHISHTANK_API_KEY = "pt-key-123";
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => URLHAUS_CSV })
      .mockRejectedValueOnce(new Error("HTTP 429"));
    ddbMock.on(BatchWriteCommand).resolves({});

    const result = await handler({});

    expect(result.error).toBeUndefined();
    expect(result.synced).toBe(3);
    expect(result.sources).toEqual([
      { name: "urlhaus", entries: 3 },
      { name: "phishtank", entries: 0, error: "HTTP 429" },
    ]);
  });

  test("DynamoDB write failure fails open with synced 0", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => URLHAUS_CSV });
    ddbMock.on(BatchWriteCommand).rejects(new Error("ValidationException"));

    const result = await handler({});

    expect(result.synced).toBe(0);
    expect(result.error).toContain("dynamodb");
  });
});

describe("entriesFromCsv", () => {
  test("deduplicates domains and derives registrable values", () => {
    const csv = ["id,url", '"1","https://d.evil.com/a"', '"2","https://evil.com/b"'].join("\n");
    const entries = entriesFromCsv(csv, "urlhaus", 1);
    expect(entries.map((e) => e.value)).toEqual(["evil.com"]);
    expect(entries[0].source).toBe("urlhaus");
    expect(entries[0].type).toBe("domain");
  });

  test("registrableDomain keeps three labels for .co.in", () => {
    expect(registrableDomain("x.example.co.in")).toBe("example.co.in");
  });
});