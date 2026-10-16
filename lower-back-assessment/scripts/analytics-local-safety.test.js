const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const analyticsSource = fs.readFileSync(path.join(root, "analytics.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "analytics-bootstrap.js"), "utf8");
const bodyPlatformSource = fs.readFileSync(path.join(root, "body-platform.js"), "utf8");
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
  const scheduled = [], observerCallbacks = [];
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
    MutationObserver: class MutationObserver { constructor(callback) { observerCallbacks.push(callback); } observe() {} disconnect() {} },
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
    setTimeout(callback) { scheduled.push(callback); }
  };
  vm.runInNewContext(bodyPlatformSource, context, { filename: "body-platform.js" });
  vm.runInNewContext(analyticsSource, context, { filename: "analytics.js" });
  return { context, documentListeners, observerCallbacks, flush() { while (scheduled.length) scheduled.shift()(); }, getFetchCount: () => fetchCount, getBeaconCount: () => beaconCount };
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
runtime.context.window.HealthCheckBodyPlatform.CANONICAL_BODY_PARTS.forEach((bodyPart) => {
  assert.strictEqual(analytics.isArticleDiagnosisDestination(new URL(`http://127.0.0.1:4197/body-check/?part=${bodyPart}&from=article-diagnosis`)), true);
});
assert.strictEqual(analytics.isArticleDiagnosisDestination(new URL("http://127.0.0.1:4197/body-check")), false);
assert.strictEqual(analytics.isArticleDiagnosisDestination(new URL("https://example.com/body-check/shoulder/")), false);
assert.strictEqual(analytics.isArticleDiagnosisDestination(new URL("http://127.0.0.1:4197/body-check/unsupported/")), false);

clickLink(runtime, "http://127.0.0.1:4197/body-check/?part=shoulder&from=article-diagnosis");
const diagnosisEvents = runtime.context.window.__HCL_LOCAL_EVENTS__.filter((event) => event.event === "article_to_diagnosis");
assert.strictEqual(diagnosisEvents.length, 1, "One article CTA click must emit article_to_diagnosis exactly once.");
assert.strictEqual(diagnosisEvents[0].link_url, "http://127.0.0.1:4197/body-check/?part=shoulder&from=article-diagnosis");
assert.strictEqual(diagnosisEvents[0].destination_part, "shoulder");
assert.strictEqual(runtime.context.window.dataLayer, undefined, "Local events must not enter the production dataLayer.");
assert.strictEqual(runtime.getFetchCount(), 0, "Local analytics must not call a production Function.");
assert.strictEqual(runtime.getBeaconCount(), 0, "Local analytics must not send a beacon.");

clickLink(runtime, "https://example.com/body-check/shoulder/");
assert.strictEqual(runtime.context.window.__HCL_LOCAL_EVENTS__.filter((event) => event.event === "article_to_diagnosis").length, 1, "An external same-path URL must not be counted.");

function dispatchDiagnosisEvent(runtimeValue, eventName) {
  (runtimeValue.documentListeners.get("hcl:diagnosis-event") || []).forEach((callback) => callback({ detail: { eventName } }));
}

const bodyRuntime = analyticsContext("/body-check");
["diagnosis_save_click", "diagnosis_save_complete", "diagnosis_history_view", "diagnosis_retry_click"].forEach((eventName) => {
  dispatchDiagnosisEvent(bodyRuntime, eventName);
  const matching = bodyRuntime.context.window.__HCL_LOCAL_EVENTS__.filter((event) => event.event === eventName);
  assert.strictEqual(matching.length, 1, `${eventName} must reach the local measurement sink once.`);
});
dispatchDiagnosisEvent(bodyRuntime, "diagnosis_save_complete");
assert.strictEqual(
  bodyRuntime.context.window.__HCL_LOCAL_EVENTS__.filter((event) => event.event === "diagnosis_save_complete").length,
  1,
  "One diagnosis run must not report save completion twice."
);
assert.strictEqual(bodyRuntime.context.window.dataLayer, undefined, "Local body events must not enter the production dataLayer.");
assert.strictEqual(bodyRuntime.getFetchCount(), 0, "Local body events must not call a production Function.");
assert.strictEqual(bodyRuntime.getBeaconCount(), 0, "Local body events must not send a beacon.");

// Exercise the actual emitters with all network APIs stubbed; no Google or DB traffic.
const migrationRuntime = analyticsContext("/body-check");
const scripts = [];
const sentDiagnosisBodies = [];
migrationRuntime.context.fetch = (_url, options) => { sentDiagnosisBodies.push(JSON.parse(options.body)); return Promise.resolve({ ok: true }); };
const hiddenPrimary = { value: "neck", closest() { return null; } };
migrationRuntime.context.document.querySelector = selector => selector === 'input[name="primaryPart"]:checked' ? hiddenPrimary : null;
Object.assign(migrationRuntime.context.location, { hostname: "health-check-platform-v2.netlify.app", origin: "https://health-check-platform-v2.netlify.app", href: "https://health-check-platform-v2.netlify.app/body-check/" });
Object.assign(migrationRuntime.context.document, { createElement() { return {}; }, head: { appendChild(script) { scripts.push(script); } } });
vm.runInNewContext(require("./analytics-config").injectGaMeasurementId(bootstrapSource, "G-PWV5LBJEQ7"), migrationRuntime.context);
(migrationRuntime.documentListeners.get("DOMContentLoaded") || []).forEach(callback => callback());
migrationRuntime.flush();
let resultVisible = false;
migrationRuntime.context.document.querySelector = selector => selector === 'input[name="primaryPart"]:checked' ? hiddenPrimary : selector === ".result-panel" && resultVisible ? {} : null;
resultVisible = true;
migrationRuntime.observerCallbacks.forEach(callback => { callback(); callback(); });
const migratedEvents = Array.from(migrationRuntime.context.window.dataLayer, args => Array.from(args));
assert.strictEqual(scripts.length, 1);
assert.strictEqual(migratedEvents.filter(args => args[0] === "config" && args[1] === "G-PWV5LBJEQ7").length, 1);
for (const name of ["muscle_check_start", "muscle_check_complete"]) assert.strictEqual(migratedEvents.filter(args => args[0] === "event" && args[1] === name).length, 1, `${name} must survive the ID switch exactly once.`);
assert.strictEqual(sentDiagnosisBodies.find(e => e.eventName === "diagnosis_completed").selectedRegion, "neck", "Hidden inputs outside labels must retain the canonical body part.");
assert(migratedEvents.filter(args => args[0] === "event" && args[1].startsWith("muscle_check_")).every(args => !Object.hasOwn(args[2], "selectedRegion")), "Body selections must stay out of the Google event payload.");
assert.strictEqual(migratedEvents.filter(args => args[0] === "event" && args[1] === "page_view").length, 0, "No extra manual page_view may accompany the one automatic config pageview.");
const migratedArticle = analyticsContext();
Object.assign(migratedArticle.context.location, { hostname: "health-check-platform-v2.netlify.app", origin: "https://health-check-platform-v2.netlify.app" });
migratedArticle.context.window.__HCL_LOCAL_PREVIEW__ = false;
const articleGtag = [];
migratedArticle.context.window.gtag = (...args) => articleGtag.push(args);
clickLink(migratedArticle, "https://health-check-platform-v2.netlify.app/body-check/shoulder/");
assert.strictEqual(articleGtag.filter(args => args[0] === "event" && args[1] === "article_to_diagnosis").length, 1);
console.log("Local analytics safety, tag switch and diagnosis/article event checks passed.");

module.exports = { analyticsContext, clickLink, dispatchDiagnosisEvent };
