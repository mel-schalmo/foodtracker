// This is a "serverless function" — a small piece of backend code that only
// runs when something calls it, rather than a server that's always on.
// Netlify hosts and runs this for us; we never have to manage a server.
//
// Right now it just proves the pipeline works. Later, this is the kind of
// place where we'll call a real nutrition API (like Open Food Facts) — code
// that runs here, on Netlify's servers, never in the browser, is the right
// place for that, because anything in the browser is visible to anyone who
// looks at the page's source. An API key can live safely here as an
// environment variable; it can't live safely in index.html.

exports.handler = async function (event, context) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Hello from the Macro Ledger backend!",
      receivedAt: new Date().toISOString()
    })
  };
};
