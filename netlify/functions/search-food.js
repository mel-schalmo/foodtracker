// Looks up real food products by NAME using Open Food Facts — a free, open
// nutrition database (openfoodfacts.org) with real branded/packaged product
// data submitted by users and manufacturers worldwide.
//
// This runs on Netlify's servers, not in the browser, for two reasons:
// 1) The page itself isn't allowed to call external sites directly.
// 2) It's the right place to eventually add caching or an API key without
//    exposing any of that to whoever opens the page.
//
// The retry logic and the "turn an Open Food Facts product into our simple
// shape" logic live in _shared/openFoodFacts.js — barcode-lookup.js uses
// the exact same two helpers, just against a different Open Food Facts URL.

const { fetchWithRetry, extractNutrition, MAX_ATTEMPTS } = require("./_shared/openFoodFacts");

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
    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Open Food Facts responded with status " + response.status + " (tried " + MAX_ATTEMPTS + " times)" })
      };
    }

    const data = await response.json();
    const rawProducts = Array.isArray(data.products) ? data.products : [];
    const results = rawProducts.map(extractNutrition).filter(Boolean);

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
