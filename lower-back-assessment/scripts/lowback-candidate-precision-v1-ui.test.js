"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const platform = require("../body-platform.js");
const persistence = require("../precision-persistence.js");

const root = path.resolve(__dirname, "..");
const precisionSource = fs.readFileSync(path.join(root, "lowback-candidate-precision-v1.js"), "utf8");
const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __steps: currentSteps, __calculate: calculate, __normalize: normalizedRecord, __result: renderResult, __latest: () => state.latest, __saveAgain: saveAgain, __aiText: aiHandoffText };"
);

function create(search, hostname = "127.0.0.1") {
  const node = { innerHTML: "" };
  const values = new Map();
  const storage = { getItem(key) { return values.get(key) || null; }, setItem(key, value) { values.set(key, String(value)); } };
  const location = { hostname, origin: `http://${hostname}:14429`, search };
  const window = { location, localStorage: storage, setTimeout() {}, scrollTo() {},
    HealthCheckBodyPlatform: { ...platform, createId: () => "diagnosis-local-test",
      anonymousDeviceId: () => "device-local-test", anonymousSessionId: () => "session-local-test" },
    HealthCheckPrecisionPersistence: persistence };
  const context = { window, location, localStorage: storage, sessionStorage: storage,
    document: { dispatchEvent() {} }, CustomEvent: function CustomEvent() {}, URLSearchParams, URL, Date, Math, Intl, console };
  vm.runInNewContext(precisionSource, context, { filename: "lowback-candidate-precision-v1.js" });
  vm.runInNewContext(uiSource, context, { filename: "body-check-ui.js" });
  const instance = window.createBodyCheck({ $: (selector) => selector === "#bodyCheckRoot" ? node : null,
    $$: () => [], STORAGE_KEY: "test-lowback", copyText() {} });
  instance.init();
  return { instance, node, window };
}

const local = create("?part=lowback&lowback_logic=precision-v1");
assert.deepEqual(Array.from(local.instance.__steps()), ["precision_location", "precision_side", "situations", "result"]);
assert.match(local.node.innerHTML, /腰の中央/);
assert.match(local.node.innerHTML, /腰の下（骨盤の上）/);
assert.match(local.node.innerHTML, /--step-count:4/);
assert.doesNotMatch(local.node.innerHTML, /安全確認|広がり/);
local.instance.__setState({ painLocation: "lowback_center", side: "right", situations: ["extend_back"],
  symptoms: ["heavy"], spread: "local" });
const plain = local.instance.__calculate();
assert.equal(plain.candidateStatus, "tied");
assert.equal(plain.candidateStatusReason, "main_tie");
assert.deepEqual(Array.from(plain.topMuscles.map((item) => item.name)), ["脊柱起立筋", "多裂筋"]);
assert(!Object.hasOwn(plain, "totalScore"));
assert(plain.topMuscles.every((item) => !Object.hasOwn(item, "score")));
assert.match(local.instance.__result(), /選んだ位置と動きが重なる候補/);
assert.match(local.instance.__result(), /id="copyAiHandoffBtn"/);
assert.match(local.instance.__result(), /id="saveBodyBtn"/);
assert.equal(plain.diagnosisVersion, "lowback_precision_v1");
assert.equal(plain.precisionData.persistenceVersion, 1);
assert.deepEqual(plain.precisionData.safety, { numbness: null, weakness: null, limbSpread: null });
const localRecord = local.instance.__normalize(plain);
assert.equal(localRecord.symptomScore, null);
assert.deepEqual(localRecord.precisionData, plain.precisionData);

local.instance.__setState({ symptoms: ["numbness", "weakness"], spread: "limb" });
const staleAnswers = local.instance.__calculate();
assert.equal(staleAnswers.candidateStatus, plain.candidateStatus);
assert.deepEqual(Array.from(staleAnswers.topMuscles.map((item) => item.name)), Array.from(plain.topMuscles.map((item) => item.name)));
assert.equal(staleAnswers.hasDanger, false);
assert.deepEqual(Array.from(staleAnswers.answers.symptoms), []);
assert.equal(staleAnswers.answers.spread, "");
assert.deepEqual(staleAnswers.precisionData.safety, { numbness: null, weakness: null, limbSpread: null });
assert.match(local.instance.__result(), /医療機関への相談もご検討ください/);
assert.doesNotMatch(local.instance.__result(), /class="result-safety-note is-alert"/);

const normal = create("?part=lowback");
assert.deepEqual(Array.from(normal.instance.__steps()), ["situations", "symptoms", "result"]);
assert.match(normal.node.innerHTML, /立ち上がる時/);
const production = create("?part=lowback", "health-check-platform-v2.netlify.app");
assert.deepEqual(Array.from(production.instance.__steps()), ["precision_location", "precision_side", "situations", "result"]);
assert.match(production.node.innerHTML, /腰の中央/);
production.instance.__setState({ painLocation: "lowback_center", side: "right", situations: ["extend_back"],
  symptoms: ["heavy"], spread: "local" });
const productionResult = production.instance.__calculate();
const productionRecord = production.instance.__normalize(productionResult);
assert.equal(productionRecord.diagnosisVersion, "lowback_precision_v1");
assert.equal(productionRecord.symptomScore, null);
assert.deepEqual(productionRecord.precisionData.safety, { numbness: null, weakness: null, limbSpread: null });
assert.deepEqual(productionRecord.precisionData, productionResult.precisionData);
const productionLegacyQuery = create("?part=lowback&lowback_logic=legacy", "health-check-platform-v2.netlify.app");
assert.deepEqual(Array.from(productionLegacyQuery.instance.__steps()), Array.from(production.instance.__steps()));
for (const part of ["elbow", "wrist", "back", "hip", "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"]) {
  const unrelated = create(`?part=${part}&lowback_logic=precision-v1`);
  assert(!unrelated.instance.__steps().includes("precision_safety_spread"), `${part} unaffected`);
}
console.log("Lowback precision-v1 three-question flow, local comparison, unanswered safety and persistence wiring passed.");

(async () => {
  const aiBeforeSave = local.instance.__aiText(staleAnswers);
  await local.instance.__saveAgain();
  assert.equal(local.instance.localRecords().length, 1);
  assert.equal(local.instance.localRecords()[0].symptomScore, null);
  assert.deepEqual(local.instance.localRecords()[0].precisionData.safety,
    { numbness: null, weakness: null, limbSpread: null });
  assert.equal(local.instance.__aiText(local.instance.__latest()), aiBeforeSave);
  assert.deepEqual(Array.from(local.window.__HCL_LOCAL_REQUESTS__, (request) => request.mocked), [true]);
  console.log("Local device save preserves precision DTO and AI handoff without a network request.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
