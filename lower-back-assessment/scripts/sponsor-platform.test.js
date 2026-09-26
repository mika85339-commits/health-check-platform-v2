const assert = require("assert");
const fs = require("fs");
const path = require("path");
const sponsor = require("../sponsor-platform");

const expectedParts = [
  "neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip",
  "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"
];
assert.deepStrictEqual([...sponsor.CANONICAL_BODY_PARTS], expectedParts);
assert.strictEqual(sponsor.normalizeBodyPart("lower-back"), "lowback");
assert.strictEqual(sponsor.normalizeBodyPart("calf"), "lowerleg");
assert.strictEqual(sponsor.normalizeBodyPart("foot"), "sole");
assert.strictEqual(sponsor.normalizeBodyPart("scapula"), "shoulder");
assert.strictEqual(sponsor.normalizeBodyPart("other"), "unknown");
assert.strictEqual(sponsor.CREATIVE.placementId, "result_top");
assert.strictEqual(sponsor.CREATIVE.creativeId, "hariplus_result_top_v1");
assert.strictEqual(sponsor.CREATIVE.disclosureLabel, "広告");
assert.strictEqual(sponsor.SPONSOR.href, "https://hariplus-nagoya.com/");

expectedParts.forEach((bodyPart) => {
  const html = sponsor.renderBanner({ regionId: bodyPart });
  assert(html.includes(`data-body-part="${bodyPart}"`), `${bodyPart} must render a canonical ad context.`);
  assert(html.includes('data-placement-id="result_top"'));
  assert(html.includes('data-creative-id="hariplus_result_top_v1"'));
  assert(html.includes('aria-label="広告"'));
  assert(html.includes('data-sponsor-cta>公式サイトを見る<span aria-hidden="true">→</span>'), "The compact ad card needs a clear 44px CTA without changing its tracking hook.");
  assert(!html.includes(">PR<"));
});

const testCases = [
  ["shoulder", sponsor.REGION_FIXTURES["JP-23"]],
  ["lowback", sponsor.REGION_FIXTURES["JP-23"]],
  ["knee", sponsor.REGION_FIXTURES["JP-13"]],
  ["hip", sponsor.REGION_FIXTURES["JP-27"]]
];
testCases.forEach(([bodyPart, geo]) => {
  const payload = sponsor.buildEvent(sponsor.EVENT_TYPES.impression, {
    resultViewId: `view-${bodyPart}`,
    bodyPart
  }, { local: true, geo, occurredAt: "2026-09-26T00:00:00.000Z" });
  assert.strictEqual(payload.body_part, bodyPart);
  assert.strictEqual(payload.country_code, "JP");
  assert.strictEqual(payload.region_code, geo.regionCode);
  assert.strictEqual(payload.region_name, geo.regionName);
  assert.strictEqual(payload.creative_id, "hariplus_result_top_v1");
  assert.strictEqual(payload.placement_id, "result_top");
  sponsor.FORBIDDEN_PAYLOAD_FIELDS.forEach((field) => assert(!(field in payload), `Sponsor payload leaked ${field}.`));
});

const sent = [];
const timers = new Map();
let nextTimer = 1;
let intersectionObserver;
let clickListener;
const banner = {
  dataset: {
    resultViewId: "view-shoulder",
    sponsorId: "hariplus",
    creativeId: "hariplus_result_top_v1",
    placementId: "result_top",
    bodyPart: "shoulder"
  },
  isConnected: true,
  matches(selector) { return selector === "[data-sponsor-banner]"; },
  querySelectorAll() { return []; }
};
const cta = {
  closest(selector) {
    if (selector === "[data-sponsor-cta]") return this;
    if (selector === "[data-sponsor-banner]") return banner;
    return null;
  }
};
const documentStub = {
  documentElement: {},
  querySelectorAll(selector) { return selector === "[data-sponsor-banner]" ? [banner] : []; },
  addEventListener(type, callback) { if (type === "click") clickListener = callback; },
  removeEventListener() {}
};
const runtime = {
  document: documentStub,
  location: { hostname: "127.0.0.1", search: "" },
  innerWidth: 390,
  innerHeight: 844,
  IntersectionObserver: class {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      intersectionObserver = this;
    }
    observe() {}
    disconnect() {}
  },
  MutationObserver: class { observe() {} disconnect() {} },
  setTimeout(callback, delay) {
    assert.strictEqual(delay, 1000, "Impression dwell time must be one second.");
    const id = nextTimer++;
    timers.set(id, callback);
    return id;
  },
  clearTimeout(id) { timers.delete(id); }
};
const tracker = sponsor.createEventTracker({
  runtime,
  geo: sponsor.REGION_FIXTURES["JP-23"],
  send(payload) { sent.push(payload); }
});
const controller = sponsor.createBrowserController({ runtime, document: documentStub, tracker });
intersectionObserver.callback([{ target: banner, isIntersecting: true, intersectionRatio: 0.49 }]);
assert.strictEqual(timers.size, 0, "Less than 50% visibility must not start the timer.");
intersectionObserver.callback([{ target: banner, isIntersecting: true, intersectionRatio: 0.5 }]);
assert.strictEqual(sent.length, 0, "Visibility alone must not emit before one second.");
assert.strictEqual(timers.size, 1);
[...timers.values()][0]();
timers.clear();
assert.strictEqual(sent.filter((event) => event.event_type === sponsor.EVENT_TYPES.impression).length, 1);

intersectionObserver.callback([{ target: banner, isIntersecting: false, intersectionRatio: 0 }]);
intersectionObserver.callback([{ target: banner, isIntersecting: true, intersectionRatio: 1 }]);
assert.strictEqual(timers.size, 0, "A counted impression must not restart on scroll.");
controller.beginVisibility({ ...banner, isConnected: true });
assert.strictEqual(timers.size, 0, "A DOM redraw with the same view key must not duplicate the impression.");

clickListener({ target: { closest() { return null; } } });
assert.strictEqual(sent.length, 1, "Non-CTA clicks must not emit sponsor events.");
clickListener({ target: cta });
clickListener({ target: cta });
assert.strictEqual(sent.filter((event) => event.event_type === sponsor.EVENT_TYPES.click).length, 1, "One result view must emit one CTA click event.");
controller.stop();

const bodyCheckSource = fs.readFileSync(path.join(__dirname, "..", "body-check-ui.js"), "utf8");
const sponsorRenderIndex = bodyCheckSource.indexOf("Sponsor.renderBanner(result)");
const muscleResultIndex = bodyCheckSource.indexOf("renderBodyDiscovery(result)", sponsorRenderIndex);
assert(sponsorRenderIndex >= 0 && muscleResultIndex > sponsorRenderIndex, "The sponsor banner must render above the result and muscle content.");

const migration = fs.readFileSync(path.join(__dirname, "..", "supabase-sponsor-phase1.sql"), "utf8");
["sponsor_key", "event_id", "creative_id", "placement_id", "country_code", "region_code", "region_name"].forEach((column) => {
  assert(new RegExp(`\\b${column}\\b`).test(migration), `Production migration is missing ${column}.`);
});
assert(migration.includes("where sponsor_key = 'hariplus'"), "The migration must prefer the stable Hariplus sponsor key.");
assert(migration.includes("regexp_replace(lower(trim(website_url))"), "The migration must reuse a legacy Hariplus URL record.");
assert(migration.includes("clinic_name = 'ハリプラス鍼灸院'"), "The migration must reuse a legacy Hariplus name record.");
assert(migration.includes("hariplus_sponsor_id := 'd685ab5b-efb3-4a40-9ecf-9695a9b1a5b6'"), "A new sponsor must receive the approved stable internal UUID.");
assert(migration.includes("status = 'active'"));
assert(migration.includes("disclosure_label = '広告'"));
assert(!/\b(drop|truncate|delete)\b/i.test(migration), "The migration must not remove production data.");

console.log("Sponsor Phase 1 browser, privacy, and migration checks passed.");
