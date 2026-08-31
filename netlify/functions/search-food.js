// Looks up real food products by name using Open Food Facts — a free, open
// nutrition database (openfoodfacts.org) with real branded/packaged product
// data submitted by users and manufacturers worldwide.
//
// This runs on Netlify's servers, not in the browser, for two reasons:
// 1) The page itself isn't allowed to call external sites directly.
// 2) It's the right place to eventually add caching or an API key without
//    exposing any of that to whoever opens the page.
//
// NOTE: written against Open Food Facts' documented API shape — I couldn't
// test it against a live response before you deployed it (my own dev
// environment is also network-restricted). So your first real search here
// is also the test of whether the field names below are right.

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
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MacroLedgerLearningProject/1.0 (personal project)"
      }
    });

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Open Food Facts responded with status " + response.status })
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
