/**
 * Server-side Open Food Facts proxy with an in-memory TTL cache. The public
 * API is keyless but rate-limited (~15 req/min/IP) and requires a real
 * User-Agent, so the browser never calls it directly for the family flow —
 * the backend caches aggressively and normalizes the response.
 *
 * Normalized product shape:
 * {
 *   name, brand, imageUrl, ingredientsText,
 *   allergens: string[], traces: string[], additives: string[],
 *   novaGroup: number|null, nutriScore: string|null
 * }
 */

const API_BASE = "https://world.openfoodfacts.org/api/v2/product";
const USER_AGENT =
  "ScamSahayak/0.1 (family food allergy checker; contact: dev@scamsahayak.example)";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const cache = new Map(); // barcode -> { expiresAt, product }

function stripLangPrefix(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags
    .map((t) => (typeof t === "string" ? t.replace(/^[a-z]{2}:/, "") : ""))
    .filter(Boolean);
}

function normalizeProduct(p) {
  return {
    name: p.product_name || p.product_name_en || null,
    brand: p.brands || null,
    imageUrl: p.image_front_small_url || p.image_url || null,
    ingredientsText: p.ingredients_text || p.ingredients_text_en || null,
    allergens: stripLangPrefix(p.allergens_tags),
    traces: stripLangPrefix(p.traces_tags),
    additives: stripLangPrefix(p.additives_tags),
    novaGroup: typeof p.nova_group === "number" ? p.nova_group : null,
    nutriScore: p.nutriscore_grade ? String(p.nutriscore_grade).toUpperCase() : null,
  };
}

async function fetchProduct(barcode) {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(barcode)}.json`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Open Food Facts returned status ${response.status}`);
  }
  const data = await response.json();
  if (data.status !== 1 || !data.product) {
    return null;
  }
  return normalizeProduct(data.product);
}

/**
 * @param {string} barcode - EAN/UPC digits
 * @returns {Promise<object|null>} normalized product, or null when the
 *   barcode is unknown to Open Food Facts
 */
async function lookupProduct(barcode) {
  const cached = cache.get(barcode);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.product;
  }

  const product = await fetchProduct(barcode);
  cache.set(barcode, { expiresAt: Date.now() + CACHE_TTL_MS, product });
  return product;
}

/** Test hook — clears the cache between tests. */
function clearCache() {
  cache.clear();
}

module.exports = { lookupProduct, clearCache, normalizeProduct, stripLangPrefix };