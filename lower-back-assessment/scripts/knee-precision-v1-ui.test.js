"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __renderBodyDiscovery: renderBodyDiscovery, __renderResult: renderResult, __aiHandoffText: aiHandoffText };"
);
const Platform = require(path.join(root, "body-platform.js"));
const Persistence = require(path.join(root, "precision-persistence.js"));
const Knee = require(path.join(root, "knee-candidate-precision-v1.js"));

function harness(search, hostname = "127.0.0.1") {
  const element = { innerHTML: "" };
  const stored = new Map();
  const storage = { getItem(key) { return stored.get(key) || null; },
    setItem(key, value) { stored.set(key, String(value)); } };
  const location = { hostname, origin: `http://${hostname}`, search };
  const window = { location, localStorage: storage,
    HealthCheckBodyPlatform: Platform,
    HealthCheckPrecisionPersistence: Persistence,
    HealthCheckKneePrecisionV1: Knee,
    scrollTo() {} };
  vm.runInNewContext(source, { window, location, localStorage: storage,
    sessionStorage: storage, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Date, Math, Intl },
  { filename: "body-check-ui.js" });
  const instance = window.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? element : null,
    $$: () => [], STORAGE_KEY: "knee-precision-test", copyText() {}
  });
  instance.init();
  return { html: element.innerHTML, instance };
}

const local = harness("?part=knee&knee_logic=precision-v1");
assert(local.html.includes("膝の前・内側・外側・後ろのどこが気になりますか？"));
assert(local.html.includes("質問 1 / 3"));
assert(local.html.includes("--step-count:4"));
assert(!local.html.includes("安全確認") && !local.html.includes("広がり"));
assert.deepEqual(Array.from(local.instance.getPartMeta().find(({ id }) => id === "knee").questions),
  ["extend", "flex", "heel_raise", "movement_unclear"]);
assert.deepEqual(Array.from(local.instance.getPartMeta().find(({ id }) => id === "knee").painLocations),
  ["knee_front", "knee_inner", "knee_outer", "knee_back", "location_unclear"]);
assert(!local.html.includes("下腿回旋"));
const localDefault = harness("?part=knee");
assert(localDefault.html.includes("気になる動き・場面はどれですか？"));
const production = harness("?part=knee", "health-check-platform-v2.netlify.app");
assert(production.html.includes("膝の前・内側・外側・後ろのどこが気になりますか？"));
assert(!production.html.includes("気になる動き・場面はどれですか？"));
const productionLegacyFlag = harness("?part=knee&knee_logic=legacy", "health-check-platform-v2.netlify.app");
assert(productionLegacyFlag.html.includes("膝の前・内側・外側・後ろのどこが気になりますか？"));

function caseResult(location, movements, side = "right") {
  const page = harness("?part=knee&knee_logic=precision-v1");
  page.instance.__setState({ primaryPart: "knee", selectedParts: ["knee"], showAllParts: false,
    painLocation: location, side, situations: movements, symptoms: [], timing: "", spread: "" });
  const result = page.instance.__calculate();
  return { result, discovery: page.instance.__renderBodyDiscovery(result),
    ai: page.instance.__aiHandoffText(result), full: page.instance.__renderResult() };
}
const cases = [
  ["knee_front", ["extend"], "ranked", "ranked_unique_main"],
  ["knee_back", ["flex", "heel_raise"], "tied", "main_tie"],
  ["knee_inner", ["flex"], "insufficient", "no_main_evidence"],
  ["knee_outer", ["flex"], "insufficient", "no_main_evidence"],
  ["knee_front", ["flex"], "stretch_only_reference", "stretch_only_reference"],
  ["location_unclear", ["extend"], "insufficient", "location_unclear"],
  ["knee_back", ["movement_unclear"], "insufficient", "movement_unclear"]
];
for (const [location, movements, status, reason] of cases) {
  const { result, discovery, ai, full } = caseResult(location, movements);
  assert.equal(result.candidateStatus, status);
  assert.equal(result.candidateStatusReason, reason);
  assert.equal(result.diagnosisVersion, "knee_precision_v1");
  assert.equal(result.precisionData.persistenceVersion, 1);
  assert.deepEqual(result.precisionData.safety,
    { numbness: null, weakness: null, limbSpread: null });
  assert(discovery.indexOf("hip-precision-notice") < discovery.indexOf("muscleVisualFigure") ||
    !discovery.includes("muscleVisualFigure"));
  assert(ai.includes("結果状態：") && ai.includes("その理由："));
  assert(ai.includes("Main（") && ai.includes("Additional（") && ai.includes("初期表示する候補："));
  assert(ai.includes("候補筋の追加・削除・入れ替え") && ai.includes("独自の順位付け"));
  assert(!ai.includes("ストレッチ方法") && !ai.includes("症状の感じ方："));
  assert(full.includes("候補筋についてAIに聞く内容をコピー"));
  assert(full.includes("医療機関への相談もご検討ください"));
  assert(!full.includes("安全確認画面") && !full.includes("広がり画面"));
  assert(!discovery.includes("原因筋") && !discovery.includes("最有力"));
  const normalized = Platform.normalizeRecord(result);
  assert.equal(normalized.symptomScore, null);
  assert.deepEqual(normalized.precisionData, result.precisionData);
  const hydrated = Persistence.hydratePrecisionHistory({
    diagnosis_id: result.diagnosisId, diagnosis_version: normalized.diagnosisVersion,
    diagnosis_date: normalized.savedAt, body_part: "knee", precision_data: normalized.precisionData
  }, Object.fromEntries(Knee.MASTER.map(({ id, name }) => [id, name])));
  assert.equal(hydrated.symptomScore, null);
  assert(hydrated.topMuscles.every((item) => item.name !== "名称未登録の候補"));
  assert(!/NaN|undefined|0点/.test(JSON.stringify(hydrated)));
}
const inner = caseResult("knee_inner", ["flex"]);
assert(inner.discovery.includes("動きから追加で考えられる候補"));
assert(inner.discovery.includes("その他の関連候補（1）"));
const outer = caseResult("knee_outer", ["extend", "flex"]);
assert.equal(outer.result.precisionData.result.mainMuscleIds.length, 0);
assert.equal(outer.result.precisionData.result.additionalMuscleIds.length, 4);
assert(outer.discovery.includes("その他の関連候補（2）"));
assert(outer.discovery.includes("膝窩筋"));
assert.equal((outer.discovery.match(/data-muscle-candidate=/g) || []).length,
  outer.result.topMuscles.length);
console.log("Knee precision-v1 local gate, UI, AI, serializer, history: PASS");
