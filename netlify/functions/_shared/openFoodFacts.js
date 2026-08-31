// Shared helpers for talking to Open Food Facts, used by both
// search-food.js (search by name) and barcode-lookup.js (look up by exact
// barcode). Keeping this in one place means a fix here — like the retry
// logic — automatically applies everywhere it's used, instead of needing
// the same change made twice.

const RETRY_STATUSES = [502, 503, 504];
const MAX_ATTEMPTS = 3;
const USER_AGENT = "MacroLedgerLearningProject/1.0 (personal project)";

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Calls fetch, and if the response comes back with a "temporarily
// unavailable" status, waits a moment and retries — up to MAX_ATTEMPTS
// total — before giving up and returning whatever the last response was.
async function fetchWithRetry(url) {
  let response;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok || !RETRY_STATUSES.includes(response.status) || attempt === MAX_ATTEMPTS) {
      return response;
    }
    await sleep(300 * attempt); // wait a bit longer on each retry
  }
  return response;
}

// Pulls a gram quantity out of a free-text serving_size string, e.g.
// "1 bar (36g)" -> 36, "30 g" -> 30, "2/3 cup (55g)" -> 55. Returns null
// when no gram amount is present (e.g. "1 cup (240 ml)") — we only know
// how to convert grams-based servings, not volume-based ones.
function parseGramsFromServingSize(servingSize) {
  if (!servingSize) return null;
  const match = String(servingSize).match(/(\d+(?:\.\d+)?)\s*g\b/i);
  return match ? parseFloat(match[1]) : null;
}

function scale(value, factor) {
  return typeof value === "number" ? value * factor : null;
}

// Turns one Open Food Facts "product" object into the simplified shape the
// frontend expects (name/brand/servingLabel/calories/protein/carbs/fat).
// Three tiers, in order of preference:
//   1. OFF has pre-computed per-serving nutrients (energy-kcal_serving etc)
//      -> use those directly.
//   2. OFF only has per-100g nutrients, but DOES know the serving size in
//      grams (e.g. "1 bar (36g)") -> scale the per-100g numbers ourselves,
//      so a 36g bar shows "1 bar (36g)" figures instead of unlabeled-looking
//      per-100g ones. This is the case that made a barcode scan look
//      "wrong" against a box label — the data was accurate, it just hadn't
//      been converted to the product's real serving size yet.
//   3. Neither is available -> fall back to per-100g, clearly labeled
//      "100 g" so it's obvious that's the basis.
// Returns null if there isn't enough usable data to show at all (OFF's
// data is user-submitted, so plenty of entries are incomplete).
function extractNutrition(product) {
  if (!product || !product.product_name) return null;
  const n = product.nutriments || {};
  const name = product.product_name;
  const brand = product.brands || null;

  if (n["energy-kcal_serving"] != null) {
    return {
      name: name,
      brand: brand,
      servingLabel: product.serving_size || "1 serving",
      calories: n["energy-kcal_serving"],
      protein: n["proteins_serving"],
      carbs: n["carbohydrates_serving"],
      fat: n["fat_serving"]
    };
  }

  const per100Calories = n["energy-kcal_100g"];
  if (typeof per100Calories !== "number") return null;

  const grams = parseGramsFromServingSize(product.serving_size);
  if (grams) {
    const factor = grams / 100;
    return {
      name: name,
      brand: brand,
      servingLabel: product.serving_size,
      calories: per100Calories * factor,
      protein: scale(n["proteins_100g"], factor),
      carbs: scale(n["carbohydrates_100g"], factor),
      fat: scale(n["fat_100g"], factor)
    };
  }

  return {
    name: name,
    brand: brand,
    servingLabel: "100 g",
    calories: per100Calories,
    protein: n["proteins_100g"],
    carbs: n["carbohydrates_100g"],
    fat: n["fat_100g"]
  };
}

module.exports = { fetchWithRetry, extractNutrition, MAX_ATTEMPTS };
