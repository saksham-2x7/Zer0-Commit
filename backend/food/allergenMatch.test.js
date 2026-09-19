const { matchAllergens, canonicalize } = require("./allergenMatch");

describe("allergenMatch", () => {
  test("canonicalizes common aliases", () => {
    expect(canonicalize("Peanuts")).toBe("peanut");
    expect(canonicalize("dairy")).toBe("milk");
    expect(canonicalize("soya")).toBe("soy");
    expect(canonicalize("tree nuts")).toBe("tree nut");
    expect(canonicalize("unknown-thing")).toBe("unknown-thing");
  });

  test("matches declared allergens", () => {
    const product = { allergens: ["peanuts", "milk"], traces: [], ingredientsText: null };
    const matched = matchAllergens(product, ["peanut", "gluten"]);

    expect(matched).toEqual([{ allergen: "peanut", source: "allergens" }]);
  });

  test("matches trace allergens ('may contain')", () => {
    const product = { allergens: [], traces: ["en:sesame"], ingredientsText: null };
    const matched = matchAllergens(product, ["sesame"]);

    expect(matched).toEqual([{ allergen: "sesame", source: "traces" }]);
  });

  test("matches keywords inside the ingredient text", () => {
    const product = {
      allergens: [],
      traces: [],
      ingredientsText: "wheat flour, sugar, milk solids",
    };
    const matched = matchAllergens(product, ["gluten", "dairy"]);

    expect(matched).toEqual([
      { allergen: "gluten", source: "ingredients" },
      { allergen: "milk", source: "ingredients" },
    ]);
  });

  test("matches tree-nut aliases in ingredients", () => {
    const product = { allergens: [], traces: [], ingredientsText: "cashew butter" };
    const matched = matchAllergens(product, ["tree nuts"]);

    expect(matched).toEqual([{ allergen: "tree nut", source: "ingredients" }]);
  });

  test("returns no matches when nothing relates", () => {
    const product = { allergens: ["milk"], traces: [], ingredientsText: "sugar, water" };
    expect(matchAllergens(product, ["peanut", "sesame"])).toEqual([]);
  });

  test("handles missing product fields and empty tags", () => {
    expect(matchAllergens({}, [])).toEqual([]);
    expect(matchAllergens({ allergens: undefined, traces: undefined, ingredientsText: undefined }, ["peanut"])).toEqual([]);
  });

  test("does not false-positive on substring collisions", () => {
    // "fish" must not match "selfish" — keyword matching is word-aware via
    // the canonical keyword list, and plain tags only match exact canonical
    // equality on declared allergens/traces.
    const product = { allergens: [], traces: [], ingredientsText: "selfish snacks" };
    expect(matchAllergens(product, ["fish"])).toEqual([]);
  });
});