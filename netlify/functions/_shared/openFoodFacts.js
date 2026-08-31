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

// Turns one Open Food Facts "product" object into the simplified shape the
// frontend expects (name/brand/servingLabel/calories/protein/carbs/fat).
// Prefers per-serving nutrition data when the product states a serving
// size; falls back to per-100g otherwise. Returns null if there isn't
// enough usable data to show (OFF's data is user-submitted, so plenty of
// entries are incomplete).
function extractNutrition(product) {
  if (!product || !product.product_name) return null;
  const n = product.nutriments || {};
  const hasServing = n["energy-kcal_serving"] != null;
  const calories = hasServing ? n["energy-kcal_serving"] : n["energy-kcal_100g"];
  if (typeof calories !== "number") return null;

  return {
    name: product.product_name,
    brand: product.brands || null,
    servingLabel: hasServing && product.serving_size ? product.serving_size : "100 g",
    calories: calories,
    protein: hasServing ? n["proteins_serving"]      : n["proteins_100g"],
    carbs:   hasServing ? n["carbohydrates_serving"] : n["carbohydrates_100g"],
    fat:     hasServing ? n["fat_serving"]           : n["fat_100g"]
  };
}

module.exports = { fetchWithRetry, extractNutrition, MAX_ATTEMPTS };
