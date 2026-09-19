const assert = require("assert");
const { DEFAULT_SITE_URL, SITE_URL_TOKEN, injectSiteUrl, normalizeSiteUrl, resolveSiteUrl } = require("./site-url");

assert.strictEqual(resolveSiteUrl({ SITE_URL: "https://example.com/", URL: "https://ignored.example" }), "https://example.com");
assert.strictEqual(resolveSiteUrl({ SITE_URL: "", URL: "https://deploy.example/" }), "https://deploy.example");
assert.strictEqual(resolveSiteUrl({}), DEFAULT_SITE_URL);
assert.strictEqual(normalizeSiteUrl("http://127.0.0.1:4177/"), "http://127.0.0.1:4177");
assert.strictEqual(injectSiteUrl(`canonical=${SITE_URL_TOKEN}/health-library`, "https://example.com/"), "canonical=https://example.com/health-library");
assert.throws(() => normalizeSiteUrl("example.com"), /absolute URL/);
assert.throws(() => normalizeSiteUrl("https://example.com/path"), /site origin/);

console.log("site-url tests passed");
