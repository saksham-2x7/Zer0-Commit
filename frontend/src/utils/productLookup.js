/**
 * Barcode -> product info via Open Food Facts (free, keyless, public API).
 * Called directly from the browser — no backend involvement, no AWS cost.
 * Coverage is limited (mostly packaged food) — callers must handle a null
 * result gracefully rather than implying every barcode will resolve.
 */

const API_BASE = "https://world.openfoodfacts.org/api/v0/product";

export async function lookupProductByBarcode(code) {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(code)}.json`);
  if (!response.ok) {
    throw new Error(`Product lookup failed with status ${response.status}`);
  }

  const data = await response.json();
  if (data.status !== 1 || !data.product) {
    return null;
  }

  const p = data.product;
  return {
    name: p.product_name || p.product_name_en || null,
    brand: p.brands || null,
    imageUrl: p.image_front_small_url || p.image_url || null,
    categories: p.categories || null,
    nutriScore: p.nutriscore_grade ? p.nutriscore_grade.toUpperCase() : null,
  };
}
