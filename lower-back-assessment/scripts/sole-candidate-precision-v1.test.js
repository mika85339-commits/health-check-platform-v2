"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const design = require("../docs/audits/sole-precision-v1-final-human-review-2026-10-07.json");
const Sole = require("../sole-candidate-precision-v1.js");
const Platform = require("../body-platform.js");
const Persistence = require("../precision-persistence.js");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const moduleScript = "/sole-candidate-precision-v1.js?v=20261007-sole-precision-v1";
const persistenceScript = "/precision-persistence.js?v=20261007-sole-precision-v1";
const uiScript = "/body-check-ui.js?v=20261007-sole-precision-v1";
for (const script of [moduleScript, persistenceScript, uiScript]) {
  assert.equal(html.split(script).length - 1, 1, script);
}
assert(html.indexOf(persistenceScript) < html.indexOf(moduleScript));
assert(html.indexOf(moduleScript) < html.indexOf(uiScript));

const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __steps: currentSteps, __render: render, __ai: aiHandoffText, __normalize: normalizedRecord, __latest() { return state.latest; } };"
);

function createUi({ hostname = "127.0.0.1", search = "?part=sole" } = {}) {
  const storage = { getItem() { return null; }, setItem() {} };
  const location = { hostname, origin: `http://${hostname}:14532`, search };
  const window = { location, localStorage: storage, HealthCheckBodyPlatform: Platform,
    HealthCheckPrecisionPersistence: Persistence, HealthCheckSolePrecisionV1: Sole,
    scrollTo() {} };
  vm.runInNewContext(uiSource, { window, location, localStorage: storage,
    sessionStorage: storage, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Date, Math, Intl },
  { filename: "body-check-ui.js" });
  const element = { innerHTML: "" };
  const instance = window.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? element : null,
    $$: () => [], STORAGE_KEY: "sole-runtime-test", copyText() {}
  });
  instance.init();
  instance.__html = () => element.innerHTML;
  return instance;
}

function calculateUi(ui, input) {
  ui.__setState({ selectedParts: ["sole"], primaryPart: "sole",
    painLocation: input.location, side: input.side, situations: [...input.movements],
    symptoms: [], timing: "", spread: "" });
  assert.deepEqual([...ui.__steps()], ["precision_location", "precision_side", "situations", "result"]);
  return ui.__calculate();
}

const compact = (result) => Object.fromEntries(["status", "reason", "main", "additional",
  "related", "reference", "frontier", "displayCandidates"].map((key) => [key, result[key]]));
const answerKey = ({ location, side, movements }) =>
  `${location}/${side}/${[...movements].sort().join("+")}`;
const permutations = (items) => items.length < 2 ? [items] : items.flatMap((item, at) =>
  permutations(items.filter((_, index) => index !== at)).map((rest) => [item, ...rest]));

async function main() {
  const { sanitizeRecord } = await import("../netlify/functions/save-diagnosis-record.mjs");
  assert.equal(Sole.MASTER.length, 15);
  assert.deepEqual(Sole.MASTER.map(({ id, name, role, location, movement }) =>
    ({ id, name, role, location, movement })),
  design.master.map(({ id, name, proposedClass, location, movement }) =>
    ({ id, name, role: proposedClass, location, movement })));
  assert.deepEqual(Sole.DISPLAY_GROUPS.map(({ id, name, memberIds }) =>
    ({ id, name, memberIds })), design.displayGroups.map(({ id, name, memberIds }) =>
    ({ id, name, memberIds })));
  assert.deepEqual(Sole.MOVEMENTS.map(([id]) => id), ["toe_curl", "toes_extend", "heel_raise"]);
  assert.deepEqual([...createUi().__steps()], ["precision_location", "precision_side", "situations", "result"]);
  assert.equal(createUi({ search: "?part=sole&sole_logic=legacy" }).__steps()[0], "situations");
  const questions = createUi();
  for (const [stepIndex, words] of [
    [0, ["詳しい場所", ...Sole.LOCATIONS.map(([, text]) => text), "場所ははっきり分からない"]],
    [1, ["左右", "右側", "左側", "両側", "中央"]],
    [2, ["動作", ...Sole.MOVEMENTS.map(([, text]) => text), "特定の動きが分からない"]]
  ]) {
    questions.__setState({ stepIndex });
    questions.__render();
    const markup = questions.__html();
    assert(markup.includes("--step-count:4"));
    for (const word of words) assert(markup.includes(word), word);
    assert(!markup.includes("安全確認") && !markup.includes("広がり"));
  }

  const ui = createUi();
  const counts = { ranked: 0, tied: 0, insufficient: 0 };
  const checks = { mismatch: 0, mainLoss: 0, additionalLoss: 0, relatedLoss: 0,
    referenceLoss: 0, duplicate: 0, mirror: 0, movementOrder: 0,
    definitionOrder: 0, sourceOrderTop1: 0, sameAxisDoubleCount: 0, displayLoss: 0 };
  let maxBytes = 0;
  let relatedSixPlus = 0;
  for (const expected of design.cases) {
    const ranked = Sole.rank(expected.input);
    assert.deepEqual(compact(ranked), Object.fromEntries(Object.keys(compact(ranked))
      .map((key) => [key, expected[key]])), JSON.stringify(expected.input));
    const result = calculateUi(ui, expected.input);
    assert.equal(result.diagnosisVersion, "sole_precision_v1");
    assert.equal(result.candidateStatus, expected.status);
    assert.equal(result.candidateStatusReason, expected.reason);
    assert.deepEqual(result.topMuscles.map(({ muscleId }) => muscleId),
      expected.displayCandidates.map(({ displayId }) => displayId));
    assert.deepEqual(result.topMuscles.map(({ memberIds }) => memberIds),
      expected.displayCandidates.map(({ memberIds }) => memberIds));
    const dto = result.precisionData;
    assert.equal(dto.persistenceVersion, 2);
    assert.deepEqual(dto.result, { status: expected.status, reason: expected.reason,
      mainMuscleIds: expected.main, additionalMuscleIds: expected.additional,
      relatedMuscleIds: expected.related, frontierMuscleIds: expected.frontier,
      referenceMuscleIds: expected.reference });
    assert.deepEqual(dto.safety, { numbness: null, weakness: null, limbSpread: null });
    maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(dto), "utf8"));
    relatedSixPlus += Number(expected.related.length >= 6);
    const stableIds = [...expected.main, ...expected.additional, ...expected.related, ...expected.reference];
    if (new Set(stableIds).size !== stableIds.length) checks.duplicate += 1;
    const hydrated = Persistence.hydratePrecisionHistory({ diagnosis_id: "local-sole-audit",
      diagnosis_version: "sole_precision_v1", diagnosis_date: "2026-10-07",
      body_part: "sole", precision_data: dto },
    Object.fromEntries(Sole.MASTER.map(({ id, name }) => [id, name])));
    for (const [group, ids, key] of [
      ["Main", expected.main, "mainLoss"], ["Additional", expected.additional, "additionalLoss"],
      ["Related", expected.related, "relatedLoss"], ["Reference", expected.reference, "referenceLoss"]
    ]) {
      if (JSON.stringify(hydrated.topMuscles.filter(({ displayGroup }) => displayGroup === group)
        .map(({ muscleId }) => muscleId)) !== JSON.stringify(ids)) checks[key] += 1;
    }
    const record = ui.__normalize(result);
    const row = sanitizeRecord(record);
    assert.equal(row.symptom_score, null);
    assert.equal(row.precision_data.persistenceVersion, 2);
    assert.deepEqual(row.precision_data.result.relatedMuscleIds, expected.related);
    assert(row.candidate_muscles.length <= 5);
    if (JSON.stringify(row.precision_data) !== JSON.stringify(dto)) checks.mismatch += 1;
    counts[ranked.status] += 1;
    const mirror = Sole.rank({ ...expected.input,
      side: expected.input.side === "right" ? "left" : expected.input.side === "left" ? "right" : expected.input.side });
    if (JSON.stringify(compact(mirror)) !== JSON.stringify(compact(ranked))) checks.mirror += 1;
    const reverse = Sole.rank(expected.input, [...Sole.MASTER].reverse());
    if (JSON.stringify(compact(reverse)) !== JSON.stringify(compact(ranked))) checks.definitionOrder += 1;
    if (ranked.status === "ranked" && ranked.frontier.length !== 1) checks.sourceOrderTop1 += 1;
    for (const movements of permutations(expected.input.movements)) {
      if (JSON.stringify(compact(Sole.rank({ ...expected.input, movements }))) !== JSON.stringify(compact(ranked))) checks.movementOrder += 1;
    }
    const axes = expected.input.movements.filter((movement) => movement !== "movement_unclear")
      .map((movement) => Sole.MOVEMENT_AXIS[movement]);
    if (new Set(axes).size !== axes.length) checks.sameAxisDoubleCount += 1;
    if (JSON.stringify([...result.topMuscles.flatMap(({ memberIds }) => memberIds)].sort()) !==
      JSON.stringify([...stableIds].sort())) checks.displayLoss += 1;
  }
  assert.deepEqual(counts, { ranked: 0, tied: 32, insufficient: 160 });
  assert.deepEqual(checks, Object.fromEntries(Object.keys(checks).map((key) => [key, 0])));
  assert.equal(relatedSixPlus, 36);
  assert(maxBytes <= Persistence.MAX_BYTES);
  assert.equal(design.benchmarks.length, 28);
  for (const benchmark of design.benchmarks) {
    const expected = design.cases.find(({ input }) => answerKey(input) === answerKey(benchmark.finalInput));
    assert(expected, benchmark.id);
    assert.deepEqual(compact(Sole.rank(benchmark.finalInput)), compact(expected), benchmark.id);
  }
  const representative = design.cases.find((item) => item.related.length >= 6 && item.main.length);
  assert(representative);
  const result = calculateUi(ui, representative.input);
  ui.__setState({ stepIndex: 3 });
  ui.__render();
  const resultHtml = ui.__html();
  for (const text of ["参考として関連する筋肉", "候補筋についてAIに聞く内容をコピー",
    "医療機関への相談", "動きから追加で考えられる候補"]) assert(resultHtml.includes(text), text);
  assert(resultHtml.includes("腓腹筋・ヒラメ筋") || result.topMuscles.some(({ name }) => name === "腓腹筋・ヒラメ筋"));
  const ai = ui.__ai(result);
  for (const text of ["筋肉の説明", "起こることがある症状", "今回の回答との関係",
    "追加・削除", "順位変更", "参考として関連する筋肉"]) assert(ai.includes(text), text);
  assert(!ai.includes("ストレッチ方法を教えて") && !ai.includes("セルフケア方法を教えて"));
  console.log(JSON.stringify({ runtime: design.cases.length, counts, benchmarks: design.benchmarks.length,
    invariants: checks, stableIds: Sole.MASTER.length, relatedSixPlus, maxBytes,
    v2Hydration: design.cases.length, normalUrlPrecision: true, legacyLocalComparison: true }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { createUi, calculateUi };
