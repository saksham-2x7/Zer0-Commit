/**
 * Food/product scan endpoint — barcode -> Open Food Facts product (server
 * proxy, cached) -> deterministic allergen flags against every family
 * member's self-reported allergy tags. The existing /api/food-feedback
 * endpoint (LLM conversational feedback vs one user's tags) is unchanged;
 * this endpoint adds the family-wide flagging layer.
 *
 * memberFlags only includes members with at least one match — the response
 * never leaks who else is in the family.
 */

const { ApiError } = require("./errors");
const { wrapHandler } = require("./handlerUtils");
const { lookupProduct } = require("../food/productLookup");
const { matchAllergens } = require("../food/allergenMatch");
const { getFamily } = require("../family/familyStore");

const BARCODE_PATTERN = /^\d{8,14}$/;

async function foodLookupHandler({ barcode, familyId }) {
  if (typeof barcode !== "string" || !BARCODE_PATTERN.test(barcode.trim())) {
    throw new ApiError("INVALID_REQUEST", "barcode must be 8-14 digits.");
  }
  const cleanBarcode = barcode.trim();

  let product;
  try {
    product = await lookupProduct(cleanBarcode);
  } catch (err) {
    console.error("Product lookup failed:", err.name || "UnknownError");
    throw new ApiError("LOOKUP_FAILED", "Could not reach the product database. Please try again.");
  }
  if (!product) {
    throw new ApiError("NOT_FOUND", "No product found for this barcode.");
  }

  let memberFlags = [];
  if (familyId) {
    if (typeof familyId !== "string" || familyId.trim().length === 0) {
      throw new ApiError("INVALID_REQUEST", "familyId must be a non-empty string.");
    }
    const family = await getFamily(familyId.trim());
    if (!family) {
      throw new ApiError("NOT_FOUND", "Family not found.");
    }
    memberFlags = family.members
      .map((member) => ({
        memberId: member.memberId,
        name: member.name,
        matched: matchAllergens(product, member.allergies),
      }))
      .filter((flag) => flag.matched.length > 0);
  }

  return { product, memberFlags };
}

exports.handler = wrapHandler(foodLookupHandler, "foodHandler");
exports.foodLookupHandler = foodLookupHandler;