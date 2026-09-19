const { mockClient } = require("aws-sdk-client-mock");
const { DynamoDBDocumentClient, BatchGetCommand } = require("@aws-sdk/lib-dynamodb");
const { checkBlocklist, buildLookupKeys, registrableDomain, domainFromUrl } = require("./blocklistCheck");

const ddbMock = mockClient(DynamoDBDocumentClient);
const TABLE = "scamsahayak-blocklist";

describe("registrableDomain", () => {
  test("returns the last two labels for plain domains", () => {
    expect(registrableDomain("sbi-verify.tk")).toBe("sbi-verify.tk");
    expect(registrableDomain("pay.example.com")).toBe("example.com");
    expect(registrableDomain("www.example.com")).toBe("example.com");
  });

  test("uses three labels for multi-part public suffixes", () => {
    expect(registrableDomain("evil.example.co.in")).toBe("example.co.in");
    expect(registrableDomain("a.b.example.co.uk")).toBe("example.co.uk");
  });
});

describe("domainFromUrl", () => {
  test("parses scheme URLs and bare domains", () => {
    expect(domainFromUrl("https://www.evil.com/path?q=1")).toBe("www.evil.com");
    expect(domainFromUrl("evil.com")).toBe("evil.com");
    expect(domainFromUrl("http://sub.evil.co.in/a")).toBe("sub.evil.co.in");
    expect(domainFromUrl("not a url")).toBe("");
    expect(domainFromUrl("")).toBe("");
  });
});

describe("buildLookupKeys", () => {
  test("builds registrable + full host, upi and phone keys", () => {
    const keys = buildLookupKeys({
      urls: ["https://www.evil.com/click", "https://phish.example.co.in/a"],
      upiIds: ["Rahul@OkHDFC"],
      phones: ["+919876543210"],
    });
    expect(keys).toEqual(
      expect.arrayContaining(["www.evil.com", "evil.com", "phish.example.co.in", "example.co.in", "rahul@okhdfc", "9876543210"])
    );
  });

  test("skips malformed phones and urls", () => {
    expect(buildLookupKeys({ urls: ["http://"], upiIds: [], phones: ["12345", "not-a-phone"] })).toEqual([]);
  });
});

describe("checkBlocklist", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    ddbMock.reset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const entities = {
    urls: ["https://evil.com/click", "https://www.pay.bad.net/in"],
    upiIds: ["rahul@okhdfc"],
    phones: ["9876543210"],
  };

  test("hits: returns checked true with items found in the table", async () => {
    ddbMock.on(BatchGetCommand).resolves({
      Responses: {
        [TABLE]: [
          { value: "evil.com", type: "domain", source: "urlhaus", listedAt: "2026-01-01T00:00:00.000Z" },
          { value: "rahul@okhdfc", type: "upi", source: "manual", listedAt: "2026-01-02T00:00:00.000Z" },
        ],
      },
    });

    const result = await checkBlocklist(entities, TABLE);
    expect(result.checked).toBe(true);
    expect(result.hits).toHaveLength(2);
    expect(result.hits).toEqual(
      expect.arrayContaining([
        { type: "domain", value: "evil.com", source: "urlhaus", listedAt: "2026-01-01T00:00:00.000Z" },
        { type: "upi", value: "rahul@okhdfc", source: "manual", listedAt: "2026-01-02T00:00:00.000Z" },
      ])
    );

    const call = ddbMock.call(0);
    const keys = call.args[0].input.RequestItems[TABLE].Keys.map((k) => k.value);
    expect(keys).toEqual(expect.arrayContaining(["evil.com", "www.pay.bad.net", "bad.net", "rahul@okhdfc", "9876543210"]));
  });

  test("no hits: checked true with an empty hits array", async () => {
    ddbMock.on(BatchGetCommand).resolves({ Responses: { [TABLE]: [] } });
    const result = await checkBlocklist(entities, TABLE);
    expect(result).toEqual({ checked: true, hits: [] });
  });

  test("nothing to check: returns an all-clear without calling DynamoDB", async () => {
    const result = await checkBlocklist({ urls: [], upiIds: [], phones: [] }, TABLE);
    expect(result).toEqual({ checked: true, hits: [] });
    expect(ddbMock.calls()).toHaveLength(0);
  });

  test("missing table name fails open without querying", async () => {
    const result = await checkBlocklist(entities, "");
    expect(result).toEqual({ checked: false, hits: [] });
    expect(ddbMock.calls()).toHaveLength(0);
  });

  test("AWS error fails open: { checked: false, hits: [] } and never throws", async () => {
    ddbMock.on(BatchGetCommand).rejects(new Error("ProvisionedThroughputExceededException"));
    const result = await checkBlocklist(entities, TABLE);
    expect(result).toEqual({ checked: false, hits: [] });
  });

  test("chunks lookups of more than 100 keys into separate BatchGetItem calls", async () => {
    const manyUrls = Array.from({ length: 120 }, (_, i) => `https://domain-${i}.example/`);
    ddbMock.on(BatchGetCommand).resolves({ Responses: { [TABLE]: [] } });
    const result = await checkBlocklist({ urls: manyUrls, upiIds: [], phones: [] }, TABLE);
    expect(result.checked).toBe(true);
    expect(ddbMock.calls()).toHaveLength(2);
  });
});