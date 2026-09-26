const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const analyticsSource = fs.readFileSync(path.join(root, "analytics.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "analytics-bootstrap.js"), "utf8");
assert(!analyticsSource.includes("burdenScoreRange"), "The retired reference score must not be sent with analytics events.");

function storageStub() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function runBootstrap(hostname) {
  const scripts = [];
  const window = {};
  const context = {
    window,
    location: { hostname },
    document: {
      createElement() { return {}; },
      head: { appendChild(script) { scripts.push(script); } }
    },
    Date,
    Set
  };
  vm.runInNewContext(bootstrapSource, context, { filename: "analytics-bootstrap.js" });
  return { window, scripts };
}

const localBootstrap = runBootstrap("127.0.0.1");
assert.strictEqual(localBootstrap.window.__HCL_LOCAL_PREVIEW__, true);
assert.strictEqual(localBootstrap.scripts.length, 0, "Local preview must not load gtag.js.");
assert.strictEqual(localBootstrap.window.dataLayer, undefined, "Local preview must not create a GA dataLayer.");

const productionBootstrap = runBootstrap("health-check-platform-v2.netlify.app");
assert.strictEqual(productionBootstrap.window.__HCL_LOCAL_PREVIEW__, false);
assert.strictEqual(productionBootstrap.scripts.length, 1, "Production must load gtag.js once.");
assert(productionBootstrap.scripts[0].src.includes("googletagmanager.com/gtag/js?id="));

function analyticsContext(pathname = "/health-library/example/") {
  const documentListeners = new Map();
  const windowListeners = new Map();
  let fetchCount = 0;
  let beaconCount = 0;
  const origin = "http://127.0.0.1:4197";
  const location = {
    pathname,
    search: "",
    hostname: "127.0.0.1",
    origin,
    href: `${origin}${pathname}`
  };
  const document = {
    referrer: "",
    addEventListener(type, callback) {
      const callbacks = documentListeners.get(type) || [];
      callbacks.push(callback);
      documentListeners.set(type, callbacks);
    },
    dispatchEvent() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const window = {
    __HCL_LOCAL_PREVIEW__: true,
    addEventListener(type, callback) {
      const callbacks = windowListeners.get(type) || [];
      callbacks.push(callback);
      windowListeners.set(type, callbacks);
    }
  };
  const context = {
    window,
    document,
    location,
    sessionStorage: storageStub(),
    localStorage: storageStub(),
    navigator: { sendBeacon() { beaconCount += 1; return true; } },
    fetch() { fetchCount += 1; return Promise.resolve({ ok: true }); },
    MutationObserver: class MutationObserver { observe() {} disconnect() {} },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    URL,
    URLSearchParams,
    Blob,
    Date,
    Math,
    Set,
    Array,
    JSON,
    decodeURIComponent,
    setTimeout() {}
  };
  vm.runInNewContext(analyticsSource, context, { filename: "analytics.js" });
  return { context, documentListeners, getFetchCount: () => fetchCount, getBeaconCount: () => beaconCount };
}

function clickLink(runtime, href, text = "セルフチェックへ") {
  const link = {
    href,
    textContent: text,
    getAttribute() { return ""; },
    closest() { return null; }
  };
  const target = {
    closest(selector) { return selector === "a[href]" ? link : null; }
  };
  (runtime.documentListeners.get("click") || []).forEach((callback) => callback({ target }));
}

const runtime = analyticsContext();
const analytics = runtime.context.window.HealthCheckAnalytics;
assert(analytics, "Analytics test API must be available.");

["lower-back", "neck", "shoulder", "hip", "knee"].forEach((slug) => {
  assert.strictEqual(analytics.isArticleDiagnosisDestination(new URL(`http://127.0.0.1:4197/body-check/${slug}/`)), true);
});
assert.strictEqual(analytics.isArticleDiagnosisDestination(new URL("http://127.0.0.1:4197/body-check")), true);
assert.strictEqual(analytics.isArticleDiagnosisDestination(new URL("https://example.com/body-check/shoulder/")), false);
assert.strictEqual(analytics.isArticleDiagnosisDestination(new URL("http://127.0.0.1:4197/body-check/unsupported/")), false);

clickLink(runtime, "http://127.0.0.1:4197/body-check/shoulder/");
const diagnosisEvents = runtime.context.window.__HCL_LOCAL_EVENTS__.filter((event) => event.event === "article_to_diagnosis");
assert.strictEqual(diagnosisEvents.length, 1, "One article CTA click must emit article_to_diagnosis exactly once.");
assert.strictEqual(diagnosisEvents[0].link_url, "http://127.0.0.1:4197/body-check/shoulder/");
assert.strictEqual(runtime.context.window.dataLayer, undefined, "Local events must not enter the production dataLayer.");
assert.strictEqual(runtime.getFetchCount(), 0, "Local analytics must not call a production Function.");
assert.strictEqual(runtime.getBeaconCount(), 0, "Local analytics must not send a beacon.");

clickLink(runtime, "https://example.com/body-check/shoulder/");
assert.strictEqual(runtime.context.window.__HCL_LOCAL_EVENTS__.filter((event) => event.event === "article_to_diagnosis").length, 1, "An external same-path URL must not be counted.");

console.log("Local analytics safety and article CTA routing checks passed.");
