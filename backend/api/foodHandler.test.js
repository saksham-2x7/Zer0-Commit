const { ApiError } = require("./errors");
const { foodLookupHandler } = require("./foodHandler");
const { lookupProduct } = require("../food/productLookup");
const { getFamily } = require("../family/familyStore");

jest.mock("../food/productLookup", () => ({
  lookupProduct: jest.fn(),
}));

jest.mock("../family/familyStore", () => ({
  getFamily: jest.fn(),
}));

describe("foodHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const PRODUCT = {
    name: "Peanut Chikki",
    brand: "Acme",
    imageUrl: null,
    ingredientsText: "peanuts, jaggery",
    allergens: ["peanuts"],
    traces: [],
    additives: [],
    novaGroup: 4,
    nutriScore: "D",
  };

  test("returns the product without member flags when no familyId is given", async () => {
    lookupProduct.mockResolvedValue(PRODUCT);

    const result = await foodLookupHandler({ barcode: "8901234567890" });

    expect(result.product.name).toBe("Peanut Chikki");
    expect(result.memberFlags).toEqual([]);
    expect(getFamily).not.toHaveBeenCalled();
  });

  test("flags family members whose allergies match the product", async () => {
    lookupProduct.mockResolvedValue(PRODUCT);
    getFamily.mockResolvedValue({
      familyId: "fam_1",
      members: [
        { memberId: "mem_1", name: "Meera", allergies: ["peanut"] },
        { memberId: "mem_2", name: "Ravi", allergies: ["gluten"] },
      ],
    });

    const result = await foodLookupHandler({ barcode: "8901234567890", familyId: "fam_1" });

    expect(result.memberFlags).toEqual([
      { memberId: "mem_1", name: "Meera", matched: [{ allergen: "peanut", source: "allergens" }] },
    ]);
  });

  test("omits members with no matches so the response does not leak the family roster", async () => {
    lookupProduct.mockResolvedValue(PRODUCT);
    getFamily.mockResolvedValue({
      familyId: "fam_1",
      members: [
        { memberId: "mem_1", name: "Meera", allergies: ["gluten"] },
        { memberId: "mem_2", name: "Ravi", allergies: [] },
      ],
    });

    const result = await foodLookupHandler({ barcode: "8901234567890", familyId: "fam_1" });
    expect(result.memberFlags).toEqual([]);
  });

  test("rejects invalid barcodes", async () => {
    await expect(foodLookupHandler({ barcode: "abc" })).rejects.toThrow(ApiError);
    await expect(foodLookupHandler({ barcode: "123" })).rejects.toThrow(ApiError);
    await expect(foodLookupHandler({ barcode: "" })).rejects.toThrow(ApiError);
    await expect(foodLookupHandler({})).rejects.toThrow(ApiError);
  });

  test("returns NOT_FOUND for an unknown barcode", async () => {
    lookupProduct.mockResolvedValue(null);
    await expect(foodLookupHandler({ barcode: "8901234567890" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("returns LOOKUP_FAILED when the upstream product database is unreachable", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      lookupProduct.mockRejectedValue(new Error("network down"));
      await expect(foodLookupHandler({ barcode: "8901234567890" })).rejects.toMatchObject({
        code: "LOOKUP_FAILED",
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("returns NOT_FOUND for an unknown family", async () => {
    lookupProduct.mockResolvedValue(PRODUCT);
    getFamily.mockResolvedValue(null);

    await expect(foodLookupHandler({ barcode: "8901234567890", familyId: "fam_missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});