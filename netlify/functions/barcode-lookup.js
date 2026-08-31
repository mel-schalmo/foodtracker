// Looks up ONE exact product by its barcode number using Open Food Facts.
// Unlike search-food.js (a fuzzy text search that can return several
// matches), this is a direct lookup — a barcode maps to at most one
// product, so the response is a single result, or "not found."
//
// See _shared/openFoodFacts.js for the retry logic and the nutrition-field
// extraction — both functions share the same helpers.

const { fetchWithRetry, extractNutrition, MAX_ATTEMPTS } = require("./_shared/openFoodFacts");

exports.handler = async function (event, context) {
  const code = ((event.queryStringParameters && event.queryStringParameters.code) || "").trim();

  if (!code) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing barcode. Call this as /.netlify/functions/barcode-lookup?code=<the digits under the barcode>" })
    };
  }

  // Real barcodes (UPC-E, EAN-8, UPC-A, EAN-13, ITF-14) are 6-14 digits.
  // Reject anything else before making a network call for it.
  if (!/^\d{6,14}$/.test(code)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "That doesn't look like a valid barcode — expected 6 to 14 digits, no letters or spaces." })
    };
  }

  const url = "https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(code) + ".json";

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

    // Open Food Facts uses status: 1 for "found" and 0 for "not in our
    // database" — that second case is a normal, expected outcome (their
    // database doesn't have everything), not an error.
    if (data.status !== 1 || !data.product) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code, found: false, result: null })
      };
    }

    const result = extractNutrition(data.product);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code, found: !!result, result: result })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Lookup failed: " + err.message })
    };
  }
};
