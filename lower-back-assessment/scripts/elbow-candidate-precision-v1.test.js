"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const design = require("../docs/audits/elbow-precision-v1-final-human-review-v2-2026-10-07.json");
const Elbow = require("../elbow-candidate-precision-v1.js");
const Platform = require("../body-platform.js");
const Persistence = require("../precision-persistence.js");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const moduleScript = "/elbow-candidate-precision-v1.js?v=20261007-elbow-precision-v1";
const uiScript = "/body-check-ui.js?v=20261008-wrist-precision-v1";
assert.equal(html.split(moduleScript).length - 1, 1);
assert.equal(html.split(uiScript).length - 1, 1);
assert(html.indexOf(moduleScript) < html.indexOf(uiScript));

const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __steps: currentSteps, __render: render, __ai: aiHandoffText, __normalize: normalizedRecord, __latest() { return state.latest; } };"
);

function createUi({ hostname = "health-check-platform-v2.netlify.app", search = "?part=elbow" } = {}) {
  const storage = { getItem() { return null; }, setItem() {} };
  const location = { hostname, origin: `http://${hostname}`, search };
  const window = { location, localStorage: storage, HealthCheckBodyPlatform: Platform,
    HealthCheckPrecisionPersistence: Persistence, HealthCheckElbowPrecisionV1: Elbow,
    scrollTo() {} };
  vm.runInNewContext(uiSource, { window, location, localStorage: storage,
    sessionStorage: storage, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Date, Math, Intl },
  { filename: "body-check-ui.js" });
  const element = { innerHTML: "" };
  const instance = window.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? element : null,
    $$: () => [], STORAGE_KEY: "elbow-runtime-test", copyText() {}
  });
  instance.init();
  instance.__html = () => element.innerHTML;
  return instance;
}

function calculateUi(ui, input) {
  ui.__setState({ selectedParts: ["elbow"], primaryPart: "elbow",
    painLocation: input.location, side: input.side, situations: [...input.movements],
    symptoms: [], timing: "", spread: "" });
  assert.deepEqual([...ui.__steps()], ["precision_location", "precision_side", "situations", "result"]);
  return ui.__calculate();
}

const fields = ["status", "reason", "main", "additional", "related", "reference",
  "frontier", "guardConsidered", "guardChallengers"];
const comparable = (result) => Object.fromEntries(fields.map((key) => [key, result[key]]));
const permutations = (items) => items.length < 2 ? [items] : items.flatMap((item, at) =>
  permutations(items.filter((_, index) => index !== at)).map((rest) => [item, ...rest]));

async function main() {
  const { sanitizeRecord } = await import("../netlify/functions/save-diagnosis-record.mjs");
  assert.deepEqual(Elbow.MASTER.map(({ id, name, location, movement }) =>
    ({ id, name, location, movement })), design.master);
  assert.deepEqual(Elbow.MOVEMENTS.map(([id]) => id), design.movements);
  assert.equal(Elbow.MASTER.length, 7);
  assert.deepEqual([...createUi().__steps()], ["precision_location", "precision_side", "situations", "result"]);
  assert.deepEqual([...createUi({ hostname: "127.0.0.1", search: "?part=elbow&elbow_logic=precision-v1" }).__steps()],
    ["precision_location", "precision_side", "situations", "result"]);
  assert.equal(createUi({ hostname: "127.0.0.1", search: "?part=elbow&elbow_logic=legacy" }).__steps()[0], "situations");
  const questions = createUi();
  for (const [stepIndex, words] of [
    [0, ["詳しい場所", ...Elbow.LOCATIONS.map(([, text]) => text), "場所ははっきり分からない"]],
    [1, ["左右", "右側", "左側", "両側", "中央"]],
    [2, ["動作", ...Elbow.MOVEMENTS.map(([, text]) => text), "特定の動きが分からない"]]
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
  const invariants = { mirror: 0, movementOrder: 0, definitionOrder: 0,
    sourceOrderOnlyTop1: 0, sameAxisDoubleCount: 0, stableIdDuplicate: 0,
    broadOnlyUnique: 0, weakOnlyUnique: 0, displayLoss: 0,
    mainLoss: 0, additionalLoss: 0, relatedLoss: 0, referenceLoss: 0,
    dtoMismatch: 0 };
  let maxBytes = 0;
  for (const row of design.cases) {
    const expected = row.results.human;
    const ranked = Elbow.rank(row.input);
    assert.deepEqual(comparable(ranked), Object.fromEntries(fields.map((key) => [key, expected[key]])),
      JSON.stringify(row.input));
    assert.deepEqual(ranked.visible, expected.display);
    const result = calculateUi(ui, row.input);
    assert.equal(result.diagnosisVersion, "elbow_precision_v1");
    assert.equal(result.candidateStatus, expected.status);
    assert.equal(result.candidateStatusReason, expected.reason);
    assert.deepEqual(result.topMuscles.map(({ muscleId }) => muscleId).sort(), expected.display);
    const dto = result.precisionData;
    assert.equal(dto.persistenceVersion, 2);
    assert.deepEqual(dto.result, { status: expected.status, reason: expected.reason,
      mainMuscleIds: expected.main, additionalMuscleIds: expected.additional,
      relatedMuscleIds: expected.related, frontierMuscleIds: expected.frontier,
      referenceMuscleIds: expected.reference });
    assert.deepEqual(dto.safety, { numbness: null, weakness: null, limbSpread: null });
    maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(dto), "utf8"));
    const stableIds = [...expected.main, ...expected.additional, ...expected.related, ...expected.reference];
    if (new Set(stableIds).size !== stableIds.length) invariants.stableIdDuplicate += 1;
    const hydrated = Persistence.hydratePrecisionHistory({ diagnosis_id: "local-elbow-audit",
      diagnosis_version: "elbow_precision_v1", diagnosis_date: "2026-10-07",
      body_part: "elbow", precision_data: dto },
    Object.fromEntries(Elbow.MASTER.map(({ id, name }) => [id, name])));
    for (const [group, ids, key] of [
      ["Main", expected.main, "mainLoss"], ["Additional", expected.additional, "additionalLoss"],
      ["Related", expected.related, "relatedLoss"], ["Reference", expected.reference, "referenceLoss"]
    ]) {
      if (JSON.stringify(hydrated.topMuscles.filter(({ displayGroup }) => displayGroup === group)
        .map(({ muscleId }) => muscleId)) !== JSON.stringify(ids)) invariants[key] += 1;
    }
    const saved = sanitizeRecord(ui.__normalize(result));
    assert.equal(saved.symptom_score, null);
    assert.equal(saved.precision_data.persistenceVersion, 2);
    assert(saved.candidate_muscles.length <= 5);
    if (JSON.stringify(saved.precision_data) !== JSON.stringify(dto)) invariants.dtoMismatch += 1;
    counts[ranked.status] += 1;
    const mirror = Elbow.rank({ ...row.input,
      side: row.input.side === "right" ? "left" : row.input.side === "left" ? "right" : row.input.side });
    if (JSON.stringify(comparable(mirror)) !== JSON.stringify(comparable(ranked))) invariants.mirror += 1;
    if (JSON.stringify(comparable(Elbow.rank(row.input, [...Elbow.MASTER].reverse()))) !==
      JSON.stringify(comparable(ranked))) invariants.definitionOrder += 1;
    if (ranked.status === "ranked" && ranked.frontier.length !== 1) invariants.sourceOrderOnlyTop1 += 1;
    if (ranked.status === "ranked" && !ranked.evidence[ranked.frontier[0]].discriminatory.length) invariants.broadOnlyUnique += 1;
    if (ranked.status === "ranked" && !ranked.evidence[ranked.frontier[0]].active.length) invariants.weakOnlyUnique += 1;
    for (const movements of permutations(row.input.movements)) {
      if (JSON.stringify(comparable(Elbow.rank({ ...row.input, movements }))) !==
        JSON.stringify(comparable(ranked))) invariants.movementOrder += 1;
    }
    if (new Set(row.input.movements).size !== row.input.movements.length) invariants.sameAxisDoubleCount += 1;
    if (JSON.stringify(result.topMuscles.map(({ muscleId }) => muscleId).sort()) !==
      JSON.stringify(stableIds.sort())) invariants.displayLoss += 1;
  }
  assert.deepEqual(counts, { ranked: 16, tied: 108, insufficient: 176 });
  assert.deepEqual(invariants, Object.fromEntries(Object.keys(invariants).map((key) => [key, 0])));
  assert(maxBytes <= Persistence.MAX_BYTES);
  assert.equal(design.oldEight.length, 8);
  for (const row of design.oldEight) assert.equal(Elbow.rank(row.input).status, "tied");
  assert.equal(design.oldSixteen.length, 16);
  for (const row of design.oldSixteen) {
    const ranked = Elbow.rank(row.input);
    assert.equal(ranked.status, "ranked");
    assert.deepEqual(ranked.frontier, ["elbow_forearm_flexor_pronator_group"]);
  }
  assert.equal(design.benchmarks.length, 30);
  for (const benchmark of design.benchmarks) {
    assert.deepEqual(comparable(Elbow.rank(benchmark.input)), comparable(benchmark.final), benchmark.id);
  }
  const representative = design.cases.find((row) => row.results.human.related.length &&
    row.results.human.additional.length && row.results.human.reference.length);
  const selected = representative || design.cases.find((row) => row.results.human.related.length);
  const result = calculateUi(ui, selected.input);
  ui.__setState({ stepIndex: 3 });
  ui.__render();
  for (const word of ["参考として関連する筋肉", "候補筋についてAIに聞く内容をコピー",
    "医療機関への相談"]) assert(ui.__html().includes(word), word);
  const ai = ui.__ai(result);
  for (const word of ["筋肉の説明", "起こることがある症状", "今回の回答との関係",
    "追加・削除", "順位変更", "参考として関連する筋肉"]) assert(ai.includes(word), word);
  assert(!ai.includes("ストレッチ方法を教えて") && !ai.includes("セルフケア方法を教えて"));
  const group = calculateUi(ui, design.oldSixteen[0].input);
  ui.__setState({ stepIndex: 3 });
  ui.__render();
  assert(group.topMuscles.some((item) => item.muscleId === "elbow_forearm_flexor_pronator_group"));
  assert(ui.__html().includes("この表示群には、前腕を回内する動作に関与する筋を含みます"));
  assert(ui.__ai(group).includes("この表示群には、前腕を回内する動作に関与する筋を含みます"));
  console.log(JSON.stringify({ runtime: design.cases.length, counts,
    oldEightTie: 8, oldSixteenRanked: 16, benchmarks: design.benchmarks.length,
    invariants, maxBytes, hydrated: design.cases.length, normalUrlPrecision: true }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { createUi, calculateUi };
