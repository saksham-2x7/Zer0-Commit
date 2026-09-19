const { lookupProduct, clearCache, normalizeProduct, stripLangPrefix } = require("./productLookup");

describe("productLookup", () => {
  const ORIGINAL_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    clearCache();
  });

  function mockFetchResponse(body, ok = true, status = 200) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    });
  }

  test("normalizes a v2 product payload", () => {
    const product = normalizeProduct({
      product_name: "Peanut Chikki",
      brands: "Acme",
      image_front_small_url: "https://img.example/1.jpg",
      ingredients_text: "peanuts, jaggery",
      allergens_tags: ["en:peanuts", "en:milk"],
      traces_tags: ["en:sesame"],
      additives_tags: ["en:e322"],
      nova_group: 4,
      nutriscore_grade: "d",
    });

    expect(product).toEqual({
      name: "Peanut Chikki",
      brand: "Acme",
      imageUrl: "https://img.example/1.jpg",
      ingredientsText: "peanuts, jaggery",
      allergens: ["peanuts", "milk"],
      traces: ["sesame"],
      additives: ["e322"],
      novaGroup: 4,
      nutriScore: "D",
    });
  });

  test("strips language prefixes from tag lists", () => {
    expect(stripLangPrefix(["en:peanuts", "hi:peanuts", "not-a-tag"])).toEqual(["peanuts", "peanuts", "not-a-tag"]);
    expect(stripLangPrefix(undefined)).toEqual([]);
  });

  test("returns null for an unknown barcode", async () => {
    mockFetchResponse({ status: 0, product: null });
    expect(await lookupProduct("0000000000000")).toBeNull();
  });

  test("throws on a non-OK upstream response", async () => {
    mockFetchResponse({}, false, 429);
    await expect(lookupProduct("8901234567890")).rejects.toThrow(/status 429/);
  });

  test("caches the second lookup without hitting the network", async () => {
    const body = { status: 1, product: { product_name: "Biscuit", brands: "B" } };
    mockFetchResponse(body);

    const first = await lookupProduct("8901234567890");
    const second = await lookupProduct("8901234567890");

    expect(first.name).toBe("Biscuit");
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("sends a real User-Agent header", async () => {
    mockFetchResponse({ status: 1, product: { product_name: "X" } });
    await lookupProduct("8901234567890");

    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers["User-Agent"]).toMatch(/ScamSahayak/);
  });
});