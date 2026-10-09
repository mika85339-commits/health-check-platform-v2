const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __renderBodyDiscovery: renderBodyDiscovery, __aiHandoffText: aiHandoffText };"
);
const Platform = require(path.join(root, "body-platform.js"));
const Persistence = require(path.join(root, "precision-persistence.js"));
const Hip = require(path.join(root, "hip-candidate-precision-v1.js"));
const frozenCases = require(path.join(root, "docs/audits/hip-precision-v1-cross-group-guard-review-2026-10-02.json")).stats.cases;

function harness(search, hostname = "127.0.0.1") {
  const rootElement = { innerHTML: "" };
  const storage = new Map();
  const storageApi = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, String(value)); }
  };
  const windowStub = {
    location: { hostname, origin: hostname === "127.0.0.1" ? "http://127.0.0.1:14530" : `https://${hostname}`, search },
    HealthCheckHipPrecisionV1: Hip,
    HealthCheckPrecisionPersistence: Persistence,
    HealthCheckBodyPlatform: Platform,
    localStorage: storageApi,
    scrollTo() {}
  };
  vm.runInNewContext(source, {
    window: windowStub, location: windowStub.location, localStorage: storageApi,
    sessionStorage: storageApi, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Date, Math, Intl
  }, { filename: "body-check-ui.js" });
  const instance = windowStub.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? rootElement : null,
    $$: () => [], STORAGE_KEY: "hip-precision-test", copyText() {}
  });
  instance.init();
  return { html: rootElement.innerHTML, instance };
}

const local = harness("?part=hip&hip_logic=precision-v1");
assert(local.html.includes("股関節の前・横・後ろ・内側のどこが気になりますか？"));
assert(local.html.includes("質問 1 / 3"));
assert(local.html.includes("--step-count:4"));
assert(!local.html.includes("症状の特徴へ"));
assert.deepEqual(Array.from(local.instance.getPartMeta().find(({ id }) => id === "hip").questions),
  ["flex", "extend", "abduct", "adduct", "movement_unclear"]);
assert.deepEqual(Array.from(local.instance.getPartMeta().find(({ id }) => id === "hip").painLocations),
  ["hip_front_groin", "hip_outer", "hip_back", "hip_inner", "location_unclear"]);
assert(!local.html.includes("内旋") && !local.html.includes("外旋"));
const localDefault = harness("?part=hip");
assert(localDefault.html.includes("股関節の前・横・後ろ・内側のどこが気になりますか？"));
const localLegacy = harness("?part=hip&hip_logic=legacy");
assert(localLegacy.html.includes("気になる動き・場面はどれですか？"));
const production = harness("?part=hip&hip_logic=precision-v1", "health-check-platform-v2.netlify.app");
assert(production.html.includes("股関節の前・横・後ろ・内側のどこが気になりますか？"));
const productionDefault = harness("?part=hip", "health-check-platform-v2.netlify.app");
assert(productionDefault.html.includes("股関節の前・横・後ろ・内側のどこが気になりますか？"));
assert(productionDefault.html.includes("質問 1 / 3") && productionDefault.html.includes("--step-count:4"));
assert.equal(frozenCases.length, 300);
for (const { answer, after, main, additional, unionFrontier, D1_initial, D1_expanded } of frozenCases) {
  productionDefault.instance.__setState({ primaryPart: "hip", selectedParts: ["hip"],
    painLocation: answer.location, side: answer.side, situations: answer.movements,
    symptoms: [], timing: "", spread: "" });
  const result = productionDefault.instance.__calculate();
  const data = result.precisionData;
  const expectedReason = after.reason === "existing_insufficient"
    ? answer.location === "location_unclear" ? "location_unclear"
      : answer.movements.includes("movement_unclear") ? "movement_unclear" : "no_main_evidence"
    : after.reason;
  assert.equal(result.candidateStatus, after.status);
  assert.equal(result.candidateStatusReason, expectedReason);
  assert.equal(result.diagnosisVersion, "hip_precision_v1");
  assert.deepEqual(data.result.mainMuscleIds, main);
  assert.deepEqual(data.result.additionalMuscleIds, additional);
  assert.deepEqual(data.result.frontierMuscleIds, unionFrontier);
  assert.deepEqual(result.topMuscles.filter((item) => item.displayGroup !== "Reference" && !item.folded)
    .map((item) => item.muscleId).sort(), D1_initial);
  assert.deepEqual(result.topMuscles.filter((item) => item.displayGroup !== "Reference")
    .map((item) => item.muscleId).sort(), D1_expanded);
}

function caseResult(location, movements, side = "right") {
  const page = harness("?part=hip&hip_logic=precision-v1");
  page.instance.__setState({ primaryPart: "hip", selectedParts: ["hip"], showAllParts: false,
    painLocation: location, side, situations: movements, symptoms: [], timing: "", spread: "" });
  const result = page.instance.__calculate();
  const html = page.instance.__renderBodyDiscovery(result);
  const ai = page.instance.__aiHandoffText(result);
  return { result, html, ai };
}

const cases = [
  ["hip_front_groin", ["flex"], "ranked", "ranked_unique_main"],
  ["hip_outer", ["abduct"], "tied", "main_tie"],
  ["hip_front_groin", ["flex", "extend"], "tied", "cross_group_equal"],
  ["hip_front_groin", ["flex", "extend", "adduct"], "tied", "cross_group_incomparable"],
  ["hip_front_groin", ["flex", "extend", "abduct"], "insufficient", "cross_group_additional_dominates"],
  ["hip_front_groin", ["extend"], "insufficient", "no_main_evidence"],
  ["location_unclear", ["flex"], "insufficient", "location_unclear"],
  ["hip_outer", ["movement_unclear"], "insufficient", "movement_unclear"]
];
for (const [location, movements, status, reason] of cases) {
  const { result, html, ai } = caseResult(location, movements);
  assert.equal(result.candidateStatus, status);
  assert.equal(result.candidateStatusReason, reason);
  assert.equal(result.diagnosisVersion, "hip_precision_v1");
  assert.equal(result.precisionData.persistenceVersion, 1);
  assert.deepEqual(result.precisionData.safety,
    { numbness: null, weakness: null, limbSpread: null });
  assert.deepEqual(result.precisionData.result.mainMuscleIds, result.topMuscles
    .filter((item) => item.displayGroup === "Main").map((item) => item.muscleId).sort());
  assert(html.indexOf("hip-precision-notice") < html.indexOf("muscleVisualFigure") ||
    !html.includes("muscleVisualFigure"));
  assert(ai.includes("結果状態：") && ai.includes("その理由："));
  assert(ai.includes("Main（") && ai.includes("Additional（") && ai.includes("初期表示する候補："));
  assert(!ai.includes("結果ページ："));
  assert(ai.includes("順位を計算し直さないでください"));
  assert(!ai.includes("梨状筋") && !ai.includes("症状の感じ方："));
  assert(!html.includes("原因筋") && !html.includes("最有力"));
  const normalized = Platform.normalizeRecord(result);
  assert.equal(normalized.symptomScore, null);
  assert.equal(normalized.diagnosisVersion, "hip_precision_v1");
  assert.deepEqual(normalized.precisionData, result.precisionData);
  const hydrated = Persistence.hydratePrecisionHistory({
    diagnosis_id: result.diagnosisId, diagnosis_version: normalized.diagnosisVersion,
    diagnosis_date: normalized.savedAt, body_part: "hip", precision_data: normalized.precisionData
  }, Object.fromEntries(Hip.MASTER.map(({ id, name }) => [id, name])));
  assert.equal(hydrated.symptomScore, null);
  assert(!JSON.stringify(hydrated).includes("NaN"));
  assert(!JSON.stringify(hydrated).includes("undefined"));
  assert(hydrated.topMuscles.every((item) => item.name !== "名称未登録の候補"));
}

const tie = caseResult("hip_outer", ["abduct"]);
assert.deepEqual(tie.result.precisionData.result.frontierMuscleIds,
  ["hip_gluteus_medius", "hip_gluteus_minimus", "hip_tfl"]);
assert.equal((tie.html.match(/data-muscle-candidate=/g) || []).length, tie.result.topMuscles.length);
assert(tie.html.includes("その他の関連候補（2）"));
assert(tie.html.includes("<details class=\"hip-candidate-more\">"));
assert(tie.html.includes("中臀筋") && tie.html.includes("小臀筋") && tie.html.includes("大腿筋膜張筋"));
console.log("Hip precision-v1 local comparison, production default 300, AI, serializer, history: PASS");
