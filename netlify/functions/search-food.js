// Looks up real food products by name using Open Food Facts — a free, open
// nutrition database (openfoodfacts.org) with real branded/packaged product
// data submitted by users and manufacturers worldwide.
//
// This runs on Netlify's servers, not in the browser, for two reasons:
// 1) The page itself isn't allowed to call external sites directly.
// 2) It's the right place to eventually add caching or an API key without
//    exposing any of that to whoever opens the page.
//
// Open Food Facts is a free, community-run service — it doesn't promise
// uptime, and it occasionally responds with a "temporarily unavailable"
// status under load. RETRY_STATUSES lists the response codes worth trying
// again for; anything else (like a 400 for a bad request) fails immediately
// since retrying wouldn't change the outcome.
const RETRY_STATUSES = [502, 503, 504];
const MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Calls fetch, and if the response comes back with one of the "try again"
// statuses above, waits a moment and retries — up to MAX_ATTEMPTS total —
// before giving up and returning whatever the last response was.
async function fetchWithRetry(url, options) {
  let response;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    response = await fetch(url, options);
    if (response.ok || !RETRY_STATUSES.includes(response.status) || attempt === MAX_ATTEMPTS) {
      return response;
    }
    await sleep(300 * attempt); // wait a bit longer on each retry
  }
  return response;
}

exports.handler = async function (event, context) {
  const query = ((event.queryStringParameters && event.queryStringParameters.q) || "").trim();

  if (!query) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing search query. Call this as /.netlify/functions/search-food?q=something" })
    };
  }

  const url = "https://world.openfoodfacts.org/cgi/search.pl"
    + "?search_terms=" + encodeURIComponent(query)
    + "&search_simple=1&action=process&json=1&page_size=8"
    + "&fields=product_name,brands,serving_size,nutriments";

  try {
    const response = await fetchWithRetry(url, {
      headers: {
        // Open Food Facts asks API users to identify their app in requests.
        "User-Agent": "MacroLedgerLearningProject/1.0 (personal project)"
      }
    });

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Open Food Facts responded with status " + response.status + " (tried " + MAX_ATTEMPTS + " times)" })
      };
    }

    const data = await response.json();
    const rawProducts = Array.isArray(data.products) ? data.products : [];

    const results = rawProducts.map(function (p) {
      const n = p.nutriments || {};
      const hasServing = n["energy-kcal_serving"] != null;

      const calories = hasServing ? n["energy-kcal_serving"]  : n["energy-kcal_100g"];
      const protein  = hasServing ? n["proteins_serving"]     : n["proteins_100g"];
      const carbs    = hasServing ? n["carbohydrates_serving"]: n["carbohydrates_100g"];
      const fat      = hasServing ? n["fat_serving"]          : n["fat_100g"];
      const servingLabel = hasServing && p.serving_size ? p.serving_size : "100 g";

      return {
        name: p.product_name || null,
        brand: p.brands || null,
        servingLabel: servingLabel,
        calories: calories,
        protein: protein,
        carbs: carbs,
        fat: fat
      };
    }).filter(function (r) {
      // Skip anything without a name or a usable calorie number — OFF's data
      // is user-submitted, so a lot of entries are incomplete.
      return !!r.name && typeof r.calories === "number";
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query, count: results.length, results: results })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Lookup failed: " + err.message })
    };
  }
};
