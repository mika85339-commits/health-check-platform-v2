"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const design = require("../docs/audits/ankle-precision-v1-final-human-review-2026-10-07.json");
const Ankle = require("../ankle-candidate-precision-v1.js");
const Platform = require("../body-platform.js");
const Persistence = require("../precision-persistence.js");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const moduleScript = "/ankle-candidate-precision-v1.js?v=20261007-ankle-precision-v1";
const uiScript = "/body-check-ui.js?v=20261007-sole-precision-v1";
assert.equal(index.split(moduleScript).length - 1, 1);
assert(index.indexOf(moduleScript) < index.indexOf(uiScript));

const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __steps: currentSteps, __render: render, __ai: aiHandoffText, __normalize: normalizedRecord, __latest() { return state.latest; } };"
);

function createUi({ hostname = "127.0.0.1", search = "?part=ankle&ankle_logic=precision-v1" } = {}) {
  const storage = { getItem() { return null; }, setItem() {} };
  const location = { hostname, origin: `http://${hostname}:14532`, search };
  const window = { location, localStorage: storage, HealthCheckBodyPlatform: Platform,
    HealthCheckPrecisionPersistence: Persistence, HealthCheckAnklePrecisionV1: Ankle,
    scrollTo() {} };
  vm.runInNewContext(uiSource, { window, location, localStorage: storage,
    sessionStorage: storage, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Date, Math, Intl },
  { filename: "body-check-ui.js" });
  const element = { innerHTML: "" };
  const instance = window.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? element : null,
    $$: () => [], STORAGE_KEY: "ankle-runtime-test", copyText() {}
  });
  instance.init();
  instance.__html = () => element.innerHTML;
  return instance;
}

function calculateUi(instance, input) {
  instance.__setState({ selectedParts: ["ankle"], primaryPart: "ankle",
    painLocation: input.location, side: input.side, situations: [...input.movements],
    symptoms: [], timing: "", spread: "" });
  assert.deepEqual([...instance.__steps()], ["precision_location", "precision_side", "situations", "result"]);
  return instance.__calculate();
}

const sorted = (items) => [...items].sort();
const compact = (ranked) => Object.fromEntries([
  "status", "reason", "main", "additional", "related", "reference", "top"
].map((key) => [key, ranked[key]]));
const permutations = (items) => items.length < 2 ? [items] : items.flatMap((value, at) =>
  permutations(items.filter((_, index) => index !== at)).map((rest) => [value, ...rest]));

async function main() {
  const { sanitizeRecord } = await import("../netlify/functions/save-diagnosis-record.mjs");
  assert.deepEqual(Ankle.MASTER.map(({ id, name, location, movement }) =>
    ({ id, name, location, movement })),
  design.finalMaster.map(({ id, name, location, movement }) => ({ id, name, location, movement })));
  assert.deepEqual(Ankle.MOVEMENTS.map(([id]) => id),
    ["ankle_up", "ankle_down", "foot_in", "foot_out", "toes_up", "toes_down"]);
  assert.equal(createUi({ search: "?part=ankle" }).__steps()[0], "situations");
  assert.deepEqual([...createUi({ hostname: "health-check-platform-v2.netlify.app",
    search: "?part=ankle" }).__steps()],
  ["precision_location", "precision_side", "situations", "result"]);
  const questionUi = createUi({ hostname: "health-check-platform-v2.netlify.app", search: "?part=ankle" });
  for (const [stepIndex, words] of [
    [0, ["詳しい場所", "足首の前", "足首の内側", "足首の外側", "足首の後ろ"]],
    [1, ["左右", "右側", "左側", "両側", "中央"]],
    [2, ["動作", ...Ankle.MOVEMENTS.map(([, text]) => text), "つま先の向きを変える動きではありません"]]
  ]) {
    questionUi.__setState({ stepIndex });
    questionUi.__render();
    const html = questionUi.__html();
    assert(html.includes("--step-count:4"));
    for (const word of words) assert(html.includes(word), word);
    assert(!html.includes("安全確認") && !html.includes("広がり"));
  }

  const ui = createUi({ hostname: "health-check-platform-v2.netlify.app", search: "?part=ankle" });
  const status = { ranked: 0, tied: 0, insufficient: 0 };
  const checks = { mismatch: 0, relatedLoss: 0, mainLoss: 0, duplicate: 0, stableIdLoss: 0,
    rankedTrusted: 0, posteriorUnique: 0, gastroUnique: 0, soleusUnique: 0,
    weakMain: 0, weakAdditional: 0, weakRanked: 0, weakGuard: 0,
    mirror: 0, movementOrder: 0, definitionOrder: 0, sourceOrderTop1: 0,
    sameAxisDoubleCount: 0, displayLoss: 0 };
  const names = new Map(Ankle.MASTER.map(({ id, name }) => [id, name]));
  assert.equal(design.cases.length, 840);
  for (const { input, result: expected } of design.cases) {
    const ranked = Ankle.rank(input);
    assert.deepEqual(compact(ranked), expected, JSON.stringify(input));
    const result = calculateUi(ui, input);
    assert.equal(result.candidateStatus, expected.status);
    assert.equal(result.candidateStatusReason, expected.reason);
    assert.equal(result.diagnosisVersion, "ankle_precision_v1");
    assert.deepEqual(result.precisionData.safety,
      { numbness: null, weakness: null, limbSpread: null });
    assert.deepEqual(result.precisionData.result, {
      status: expected.status, reason: expected.reason,
      mainMuscleIds: expected.main, additionalMuscleIds: expected.additional,
      frontierMuscleIds: expected.top, referenceMuscleIds: expected.reference
    });
    for (const [group, ids] of Object.entries({ Main: expected.main,
      Additional: expected.additional, Related: expected.related, Reference: expected.reference })) {
      assert.deepEqual(sorted(result.topMuscles.filter((item) => item.displayGroup === group)
        .map((item) => item.muscleId)), ids, `${group} ${JSON.stringify(input)}`);
    }
    assert.deepEqual(sorted(result.topMuscles.map((item) => item.muscleId)),
      sorted([...expected.main, ...expected.additional, ...expected.related, ...expected.reference]));
    assert.deepEqual(result.topMuscles.map((item) => item.muscleId),
      [...expected.main, ...expected.additional, ...expected.related, ...expected.reference]);
    const displayBefore = JSON.stringify(result.topMuscles);
    const record = ui.__normalize(result);
    const row = sanitizeRecord(record);
    assert.equal(JSON.stringify(result.topMuscles), displayBefore);
    assert.equal(JSON.stringify(record.topMuscles), displayBefore);
    assert.equal(row.symptom_score, null);
    assert.equal(row.diagnosis_version, "ankle_precision_v1");
    assert.deepEqual(row.precision_data, result.precisionData);
    const projected = ["Related", "Main", "Additional", "Reference"].flatMap((group) =>
      result.topMuscles.filter((item) => item.displayGroup === group).map((item) => item.name)).slice(0, 5);
    if (JSON.stringify(row.candidate_muscles) !== JSON.stringify(projected)) checks.mismatch += 1;
    if (expected.related.some((id) => !row.candidate_muscles.includes(names.get(id)))) checks.relatedLoss += 1;
    if (expected.main.some((id) => !row.candidate_muscles.includes(names.get(id)))) checks.mainLoss += 1;
    if (new Set(row.candidate_muscles).size !== row.candidate_muscles.length) checks.duplicate += 1;
    const dtoIds = new Set([...expected.main, ...expected.additional, ...expected.reference, ...expected.top]);
    const savedIds = new Set([...row.precision_data.result.mainMuscleIds,
      ...row.precision_data.result.additionalMuscleIds,
      ...row.precision_data.result.referenceMuscleIds,
      ...row.precision_data.result.frontierMuscleIds]);
    if ([...dtoIds].some((id) => !savedIds.has(id))) checks.stableIdLoss += 1;

    status[ranked.status] += 1;
    if (ranked.status === "ranked") {
      const winner = ranked.evidence[ranked.frontier[0]];
      if (winner.location === "P" && winner.trusted.length &&
        ranked.pairRelations.every((pair) => pair.class === "MAIN_DOMINATES")) checks.rankedTrusted += 1;
      if (ranked.frontier[0] === "ankle_tibialis_posterior") checks.posteriorUnique += 1;
      if (ranked.frontier[0] === "ankle_gastrocnemius") checks.gastroUnique += 1;
      if (ranked.frontier[0] === "ankle_soleus") checks.soleusUnique += 1;
      if (!winner.trusted.length) checks.weakRanked += 1;
    }
    for (const id of ranked.main) if (!ranked.evidence[id].trusted.length) checks.weakMain += 1;
    for (const id of ranked.additional) if (!ranked.evidence[id].trusted.length) checks.weakAdditional += 1;
    for (const pair of ranked.pairRelations) if (!ranked.evidence[pair.additional].trusted.length) checks.weakGuard += 1;
    if (new Set(result.topMuscles.map((item) => item.muscleId)).size !== ranked.visible.length) checks.displayLoss += 1;
    const mirror = Ankle.rank({ ...input, side: input.side === "left" ? "right" : "left" });
    if (JSON.stringify(compact(mirror)) !== JSON.stringify(compact(ranked))) checks.mirror += 1;
    const reverse = Ankle.rank(input, [...Ankle.MASTER].reverse());
    if (JSON.stringify(compact(reverse)) !== JSON.stringify(compact(ranked))) checks.definitionOrder += 1;
    if (ranked.status === "ranked" && JSON.stringify(reverse.frontier) !== JSON.stringify(ranked.frontier)) checks.sourceOrderTop1 += 1;
    for (const movements of permutations(input.movements)) {
      if (JSON.stringify(compact(Ankle.rank({ ...input, movements }))) !== JSON.stringify(compact(ranked))) checks.movementOrder += 1;
    }
    for (const evidence of Object.values(ranked.evidence)) for (const axis of Object.keys(evidence.axis)) {
      const singles = input.movements.filter((id) => Ankle.MOVEMENT_AXIS[id] === axis)
        .some((id) => Ankle.rank({ ...input, movements: [id] }).evidence[evidence.id].axis[axis]);
      if (evidence.axis[axis] !== singles) checks.sameAxisDoubleCount += 1;
    }
  }
  assert.deepEqual(status, { ranked: 36, tied: 292, insufficient: 512 });
  assert.equal(checks.rankedTrusted, 36);
  for (const [key, value] of Object.entries(checks)) {
    if (key !== "rankedTrusted") assert.equal(value, 0, key);
  }
  assert.equal(design.benchmark.length, 31);
  for (const benchmark of design.benchmark) {
    assert.deepEqual(compact(Ankle.rank(benchmark.input)), benchmark.result, benchmark.id);
  }
  const aiCase = design.cases.find((item) => item.result.related.length && item.result.reference.length);
  assert(aiCase);
  const aiResult = calculateUi(ui, aiCase.input);
  const ai = ui.__ai(aiResult);
  for (const name of aiResult.topMuscles.map((item) => item.name)) assert(ai.includes(name), name);
  assert(ai.includes("筋肉の説明") && ai.includes("症状") && ai.includes("今回の回答との関係"));
  assert(ai.includes("追加・削除") && ai.includes("独自の順位変更"));
  assert(!ai.includes("ストレッチ") && !ai.includes("しびれなし"));
  ui.__setState({ stepIndex: 3 });
  ui.__render();
  const html = ui.__html();
  assert(html.includes("参考として関連する筋肉"));
  assert(html.includes("強い腫れ") && html.includes("明らかな変形"));
  assert(html.includes("候補筋についてAIに聞く内容をコピー"));
  console.log("Ankle runtime 840/840, status 36/292/512, ranked36 trusted, benchmarks31/31, invariants0, save projection840/840: PASS");
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { createUi, calculateUi, main };
