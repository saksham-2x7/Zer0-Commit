import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { lookupProductByBarcode } from "./productLookup";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupProductByBarcode", () => {
  test("calls the correct Open Food Facts URL", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 0 }) });
    await lookupProductByBarcode("8901030895555");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://world.openfoodfacts.org/api/v0/product/8901030895555.json"
    );
  });

  test("returns product info when found", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: "Example Biscuits",
          brands: "Example Brand",
          image_front_small_url: "https://example.com/img.jpg",
          nutriscore_grade: "c",
        },
      }),
    });

    const result = await lookupProductByBarcode("1234567890123");
    expect(result).toEqual({
      name: "Example Biscuits",
      brand: "Example Brand",
      imageUrl: "https://example.com/img.jpg",
      categories: null,
      nutriScore: "C",
    });
  });

  test("returns null when the product is not found", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 0 }) });
    const result = await lookupProductByBarcode("0000000000000");
    expect(result).toBeNull();
  });

  test("throws on a non-ok response", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(lookupProductByBarcode("123")).rejects.toThrow(/500/);
  });
});
