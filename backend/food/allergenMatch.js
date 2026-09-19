/**
 * Deterministic allergen matching — no LLM involved. A product's declared
 * allergens, traces, and ingredient text are matched against a member's
 * self-reported allergy tags using a canonical alias map (peanuts -> peanut,
 * dairy -> milk, soya -> soy, ...). This is a flagging aid, never a medical
 * verdict: "may contain" traces and incomplete product data are surfaced as
 * matches so the family can decide.
 */

// Canonical allergen name -> keywords that appear in ingredient text.
const KEYWORDS = {
  peanut: ["peanut"],
  milk: ["milk", "dairy", "lactose", "casein", "whey", "butter", "cheese", "cream"],
  egg: ["egg", "albumin", "egg white", "egg yolk"],
  fish: ["fish", "anchovy", "sardine", "tuna", "salmon", "cod"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "crayfish", "shellfish"],
  mollusc: ["mollusc", "clam", "mussel", "oyster", "squid", "octopus"],
  gluten: ["gluten", "wheat", "barley", "rye", "spelt", "oats"],
  soy: ["soy", "soya", "soybean", "tofu", "edamame"],
  "tree nut": ["almond", "cashew", "walnut", "pecan", "hazelnut", "pistachio", "brazil nut", "macadamia", "tree nut"],
  sesame: ["sesame", "til"],
  sulfite: ["sulfite", "sulphite", "sulfur dioxide", "sulphur dioxide"],
  mustard: ["mustard"],
  celery: ["celery"],
  lupin: ["lupin"],
};

// Alias map: any spelling/variant -> canonical key above.
const ALIASES = {
  peanut: "peanut",
  peanuts: "peanut",
  milk: "milk",
  dairy: "milk",
  lactose: "milk",
  casein: "milk",
  whey: "milk",
  egg: "egg",
  eggs: "egg",
  fish: "fish",
  shellfish: "shellfish",
  shrimp: "shellfish",
  prawn: "shellfish",
  crab: "shellfish",
  lobster: "shellfish",
  mollusc: "mollusc",
  molluscs: "mollusc",
  gluten: "gluten",
  wheat: "gluten",
  barley: "gluten",
  rye: "gluten",
  soy: "soy",
  soya: "soy",
  soybean: "soy",
  "tree nut": "tree nut",
  "tree nuts": "tree nut",
  almond: "tree nut",
  cashew: "tree nut",
  walnut: "tree nut",
  pecan: "tree nut",
  hazelnut: "tree nut",
  pistachio: "tree nut",
  sesame: "sesame",
  til: "sesame",
  sulfite: "sulfite",
  sulfites: "sulfite",
  sulphite: "sulfite",
  mustard: "mustard",
  celery: "celery",
  lupin: "lupin",
};

function canonicalize(tag) {
  const t = String(tag || "").toLowerCase().trim().replace(/^[a-z]{2}:/, "");
  return ALIASES[t] || t;
}

function keywordsFor(canonical) {
  return KEYWORDS[canonical] || [canonical];
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary match so "fish" never matches inside "selfish". */
function textContainsKeyword(text, keyword) {
  return new RegExp(`\\b${escapeRegex(keyword)}\\b`).test(text);
}

/**
 * @param {object} product - normalized product from productLookup.js
 * @param {string[]} allergyTags - member's self-reported allergy tags
 * @returns {Array<{allergen: string, source: string}>} matched allergens
 */
function matchAllergens(product, allergyTags) {
  const allergens = (product.allergens || []).map(canonicalize);
  const traces = (product.traces || []).map(canonicalize);
  const ingredientsText = (product.ingredientsText || "").toLowerCase();

  const matched = [];
  for (const tag of allergyTags || []) {
    const canonical = canonicalize(tag);
    if (!canonical) {
      continue;
    }

    if (allergens.includes(canonical)) {
      matched.push({ allergen: canonical, source: "allergens" });
    }
    if (traces.includes(canonical)) {
      matched.push({ allergen: canonical, source: "traces" });
    }
    if (ingredientsText) {
      const keywords = keywordsFor(canonical);
      if (keywords.some((k) => textContainsKeyword(ingredientsText, k))) {
        matched.push({ allergen: canonical, source: "ingredients" });
      }
    }
  }
  return matched;
}

module.exports = { matchAllergens, canonicalize, keywordsFor };