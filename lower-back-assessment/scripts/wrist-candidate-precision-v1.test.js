"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { combinations } = require("./body-check-audit-utils");
const Wrist = require("../wrist-candidate-precision-v1.js");
const Platform = require("../body-platform.js");
const Persistence = require("../precision-persistence.js");
const design = require("../docs/audits/wrist-precision-v1-final-lock-2026-10-08.json");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const moduleScript = "/wrist-candidate-precision-v1.js?v=20261008-wrist-precision-v1";
const uiScript = "/body-check-ui.js?v=20261008-wrist-precision-v1";
assert.equal(html.split(moduleScript).length - 1, 1);
assert.equal(html.split(uiScript).length - 1, 1);
assert(html.indexOf(moduleScript) < html.indexOf(uiScript));

const uiSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8").replace(
  "return { init, localRecords, getPartMeta };",
  "return { init, localRecords, getPartMeta, __setState(values) { Object.assign(state, values); }, __calculate: calculate, __steps: currentSteps, __render: render, __ai: aiHandoffText, __normalize: normalizedRecord, __latest() { return state.latest; } };"
);

function createUi({ hostname = "health-check-platform-v2.netlify.app", search = "?part=wrist" } = {}) {
  const storage = { getItem() { return null; }, setItem() {} };
  const location = { hostname, origin: `http://${hostname}`, search };
  const window = { location, localStorage: storage, HealthCheckBodyPlatform: Platform,
    HealthCheckPrecisionPersistence: Persistence, HealthCheckWristPrecisionV1: Wrist,
    scrollTo() {} };
  vm.runInNewContext(uiSource, { window, location, localStorage: storage,
    sessionStorage: storage, document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent() {}, URL, URLSearchParams, Date, Math, Intl },
  { filename: "body-check-ui.js" });
  const element = { innerHTML: "" };
  const instance = window.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? element : null,
    $$: () => [], STORAGE_KEY: "wrist-runtime-test", copyText() {}
  });
  instance.init();
  instance.__html = () => element.innerHTML;
  return instance;
}

function calculateUi(ui, input) {
  ui.__setState({ selectedParts: ["wrist"], primaryPart: "wrist",
    painLocation: input.location, side: input.side, situations: [...input.movements],
    symptoms: [], timing: "", spread: "" });
  assert.deepEqual([...ui.__steps()], ["precision_location", "precision_side", "situations", "result"]);
  return ui.__calculate();
}

const fields = ["status", "reason", "main", "additional", "related", "reference", "frontier", "visible"];
const comparable = (result) => Object.fromEntries(fields.map((key) => [key, result[key]]));
const ids = (rows) => rows.map((row) => row.id).sort();
const dominates = (a, b) => b.t.every((axis) => a.t.includes(axis)) && a.t.length > b.t.length;
const frontier = (rows) => rows.filter((row) => !rows.some((other) => other.id !== row.id && dominates(other, row)));

// The reference evaluator reads only the locked JSON; it does not call the runtime ranker.
function expected(input) {
  const answer = { location: input.location, side: input.side, movements: [...input.movements].sort() };
  const unknownMovement = answer.movements.includes("movement_unclear");
  const rows = design.master.map((muscle) => {
    const relation = answer.movements.map((movement) => [movement, movement === "movement_unclear" ? "N" :
      muscle.movement[design.relationOrder.indexOf(movement)]]);
    const matching = (code) => relation.filter(([, value]) => value === code).map(([movement]) => movement).sort();
    return { id: muscle.id, location: answer.location === "location_unclear" ? "?" :
      muscle.location[design.locations.indexOf(answer.location)],
    t: matching("T"), b: matching("B"), w: matching("W"), r: matching("R"), s: matching("S") };
  });
  const main = unknownMovement ? [] : rows.filter((row) => row.location === "P" && row.t.length);
  const additional = unknownMovement ? [] : rows.filter((row) => row.location !== "P" && row.t.length);
  const active = new Set(ids([...main, ...additional]));
  const reference = unknownMovement ? [] : rows.filter((row) => !active.has(row.id) &&
    row.s.length && !row.b.length && !row.w.length && !row.r.length && row.location !== "N");
  const referenceIds = new Set(ids(reference));
  const related = unknownMovement ? [] : rows.filter((row) => !active.has(row.id) &&
    !referenceIds.has(row.id) && (row.b.length || row.w.length || row.r.length || row.location === "P"));
  const mainFront = frontier(main);
  const guard = additional.filter((row) => !mainFront.some((candidate) => dominates(candidate, row)));
  const crossFront = mainFront.length ? frontier([...mainFront, ...guard]) : [];
  let top = crossFront;
  let reason = "main_evidence";
  if (answer.location === "location_unclear") { top = []; reason = "location_unclear"; }
  else if (unknownMovement) { top = []; reason = "movement_unclear"; }
  else if (!main.length) {
    top = [];
    reason = !additional.length && reference.length && !related.length
      ? "stretch_only_reference" : "no_main_discriminatory_evidence";
  } else if (!crossFront.some((row) => main.includes(row))) {
    top = []; reason = "additional_dominates_main";
  } else if (crossFront.some((row) => additional.includes(row))) reason = "cross_group_guard";
  else if (mainFront.length > 1) reason = "main_tie";
  return { status: !top.length ? "insufficient" : top.length === 1 ? "ranked" : "tied",
    reason, main: ids(main), additional: ids(additional), related: ids(related),
    reference: ids(reference), frontier: ids(top),
    visible: ids([...main, ...additional, ...related, ...reference]) };
}

function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, at) => permutations(values.filter((_, index) => index !== at))
    .map((rest) => [value, ...rest]));
}

async function main() {
  const { sanitizeRecord } = await import("../netlify/functions/save-diagnosis-record.mjs");
  assert.deepEqual(Wrist.MASTER, design.master);
  assert.deepEqual(Wrist.MOVEMENTS.map(([id]) => id), design.questionModels.Q7_directional);
  assert.deepEqual(Wrist.MOVEMENTS.map(([id, label]) => [id, label]),
    design.questionModels.Q7_directional.map((id) => [id, design.movementLabels[id]]));
  assert.equal(new Set(Wrist.MASTER.flatMap((item) => item.anatomy)).size, 14);
  assert.deepEqual([...createUi().__steps()], ["precision_location", "precision_side", "situations", "result"]);
  assert.deepEqual([...createUi({ hostname: "127.0.0.1", search: "?part=wrist&wrist_logic=precision-v1" }).__steps()],
    ["precision_location", "precision_side", "situations", "result"]);
  assert.equal(createUi({ hostname: "127.0.0.1", search: "?part=wrist&wrist_logic=legacy" }).__steps()[0], "situations");
  const questions = createUi();
  for (const [stepIndex, labels] of [
    [0, ["詳しい場所", ...Wrist.LOCATIONS.map(([, label]) => label), "場所ははっきり分からない"]],
    [1, ["左右", "右側", "左側", "両側", "中央"]],
    [2, ["動作", ...Wrist.MOVEMENTS.map(([, label]) => label), "特定の動きが分からない"]]
  ]) {
    questions.__setState({ stepIndex }); questions.__render();
    const markup = questions.__html();
    assert(markup.includes("--step-count:4"));
    for (const label of labels) assert(markup.includes(label), label);
    assert(!markup.includes("ふたやドアノブ") && !markup.includes("スマートフォンやキーボード"));
    assert(!markup.includes("安全確認") && !markup.includes("広がり"));
  }
  const ui = createUi();
  const counts = { ranked: 0, tied: 0, insufficient: 0 };
  const invariants = { mirror: 0, movementOrder: 0, definitionOrder: 0,
    sourceOrderOnlyTop1: 0, sameAxisDoubleCount: 0, stableIdDuplicate: 0,
    broadOnlyUnique: 0, physicalDuplicate: 0, relatedGuard: 0, referenceGuard: 0,
    locationOnlyMain: 0, displayLoss: 0, dtoMismatch: 0, hydrateMismatch: 0 };
  const rankedCases = [];
  let maxBytes = 0;
  const movements = design.questionModels.Q7_directional;
  const reachable = [...combinations(movements, 1, 3), ["movement_unclear"]];
  for (const location of design.locations) for (const side of design.sides) for (const selected of reachable) {
    const input = { location, side, movements: selected };
    const rank = Wrist.rank(input);
    const want = expected(input);
    assert.deepEqual(comparable(rank), want, JSON.stringify(input));
    const result = calculateUi(ui, input);
    assert.equal(result.diagnosisVersion, "wrist_precision_v1");
    assert.equal(result.candidateStatus, want.status);
    assert.equal(result.candidateStatusReason, want.reason);
    assert.deepEqual(result.topMuscles.map(({ muscleId }) => muscleId).sort(), want.visible);
    const dto = result.precisionData;
    assert.equal(dto.persistenceVersion, 2);
    assert.deepEqual(dto.result, { status: want.status, reason: want.reason,
      mainMuscleIds: want.main, additionalMuscleIds: want.additional,
      relatedMuscleIds: want.related, frontierMuscleIds: want.frontier,
      referenceMuscleIds: want.reference });
    assert.deepEqual(dto.safety, { numbness: null, weakness: null, limbSpread: null });
    maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(dto), "utf8"));
    const physical = result.topMuscles.flatMap(({ muscleId }) =>
      Wrist.MASTER.find(({ id }) => id === muscleId).anatomy);
    if (new Set(physical).size !== physical.length) invariants.physicalDuplicate++;
    const hydrated = Persistence.hydratePrecisionHistory({ diagnosis_id: "local-wrist-audit",
      diagnosis_version: "wrist_precision_v1", diagnosis_date: "2026-10-08",
      body_part: "wrist", precision_data: dto },
    Object.fromEntries(Wrist.MASTER.map(({ id, name }) => [id, name])));
    for (const [group, ids] of [["Main", want.main], ["Additional", want.additional],
      ["Related", want.related], ["Reference", want.reference]]) {
      if (JSON.stringify(hydrated.topMuscles.filter((item) => item.displayGroup === group)
        .map((item) => item.muscleId)) !== JSON.stringify(ids)) invariants.hydrateMismatch++;
    }
    const saved = sanitizeRecord(ui.__normalize(result));
    assert.equal(saved.symptom_score, null);
    assert(saved.candidate_muscles.length <= 5);
    if (JSON.stringify(saved.precision_data) !== JSON.stringify(dto)) invariants.dtoMismatch++;
    counts[rank.status]++;
    if (rank.status === "ranked") {
      const competingCandidateIds = [...rank.main, ...rank.additional]
        .filter((id) => id !== rank.frontier[0]);
      rankedCases.push({ input: rank.input, muscleId: rank.frontier[0],
        trustedDiscriminatory: rank.evidence[rank.frontier[0]].trustedDiscriminatory,
        competingCandidateIds,
        competingEvidence: competingCandidateIds.map((id) => ({ id,
          trustedDiscriminatory: rank.evidence[id].trustedDiscriminatory })),
        mainCandidateIds: rank.main, additionalCandidateIds: rank.additional,
        guardCandidateIds: rank.guard,
        g3Outcome: rank.guard.length ? "undominated_additional_retained" : "no_undominated_additional",
        reason: rank.reason });
    }
    const mirror = Wrist.rank({ ...input, side: side === "right" ? "left" : side === "left" ? "right" : side });
    if (JSON.stringify(comparable(mirror)) !== JSON.stringify(comparable(rank))) invariants.mirror++;
    if (JSON.stringify(comparable(Wrist.rank(input, [...Wrist.MASTER].reverse()))) !==
      JSON.stringify(comparable(rank))) invariants.definitionOrder++;
    if (rank.status === "ranked" && (!rank.frontier.length || rank.sourceOrderUsedForTop1))
      invariants.sourceOrderOnlyTop1++;
    if (rank.status === "ranked" && !rank.evidence[rank.frontier[0]].trustedDiscriminatory.length)
      invariants.broadOnlyUnique++;
    if (rank.main.some((id) => rank.evidence[id].locationClass !== "P" ||
      !rank.evidence[id].trustedDiscriminatory.length)) invariants.locationOnlyMain++;
    if (rank.related.some((id) => rank.guard.includes(id))) invariants.relatedGuard++;
    if (rank.reference.some((id) => rank.guard.includes(id))) invariants.referenceGuard++;
    if (new Set(rank.visible).size !== rank.visible.length) invariants.displayLoss++;
    if (new Set(Wrist.MASTER.map(({ id }) => id)).size !== Wrist.MASTER.length) invariants.stableIdDuplicate++;
    if (Object.values(rank.evidence).some((evidence) => {
      const axes = [...evidence.trustedDiscriminatory, ...evidence.trustedBroad,
        ...evidence.weak, ...evidence.review, ...evidence.stretch];
      return new Set(axes).size !== axes.length;
    })) invariants.sameAxisDoubleCount++;
    for (const order of permutations(selected))
      if (JSON.stringify(comparable(Wrist.rank({ ...input, movements: order }))) !==
        JSON.stringify(comparable(rank))) invariants.movementOrder++;
  }
  assert.deepEqual(counts, design.models.Q7_directional.status);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 1280);
  assert.deepEqual(invariants, Object.fromEntries(Object.keys(invariants).map((key) => [key, 0])));
  assert(maxBytes <= Persistence.MAX_BYTES);
  assert.equal(rankedCases.length, 28);
  for (const want of design.models.Q7_directional.rankedCases) {
    const actual = rankedCases.find((row) => JSON.stringify(row.input) === JSON.stringify(want.input));
    assert(actual, JSON.stringify(want.input));
    for (const key of ["muscleId", "trustedDiscriminatory", "competingCandidateIds",
      "competingEvidence", "mainCandidateIds", "additionalCandidateIds", "guardCandidateIds",
      "g3Outcome", "reason"])
      assert.deepEqual(actual[key], want[key], `${key}:${JSON.stringify(want.input)}`);
  }
  assert.equal(design.benchmarks.length, 42);
  for (const benchmark of design.benchmarks) {
    const actual = benchmark.historicalOnly ? Wrist.rankHistorical(benchmark.input) : Wrist.rank(benchmark.input);
    assert.deepEqual(comparable(actual), benchmark.proposedExpected, benchmark.id);
  }
  assert.equal(design.independentBoundaryAssertions, 15);
  for (const [id, status, top] of [
    ["WRS-001", "tied", "wrist_fcu,wrist_flexors_except_fcu"],
    ["WRS-002", "tied", "wrist_ecu,wrist_extensors_except_ecu"],
    ["WRS-004", "tied", "wrist_ecu,wrist_fcu"],
    ["WRS-005", "ranked", "wrist_fcu"],
    ["WRS-006", "ranked", "wrist_ecu"],
    ["WRS-021", "ranked", "wrist_thumb_abductor_extensors"],
    ["WRS-023", "ranked", "wrist_finger_extensors"],
    ["WRS-034", "tied", "wrist_ecu,wrist_fcu"],
    ["WRS-035", "ranked", "wrist_fcu"],
    ["WRS-036", "ranked", "wrist_ecu"],
    ["WRS-037", "insufficient", ""],
    ["WRS-031", "ranked", "wrist_finger_flexors"],
    ["WRS-032", "ranked", "wrist_finger_extensors"],
    ["WRS-033", "ranked", "wrist_thumb_abductor_extensors"],
    ["WRS-040", "insufficient", ""],
    ["WRS-041", "insufficient", ""],
    ["WRS-042", "insufficient", ""]
  ]) {
    const benchmark = design.benchmarks.find((item) => item.id === id);
    const actual = Wrist.rank(benchmark.input);
    assert.equal(actual.status, status, id);
    assert.equal(actual.frontier.join(","), top, id);
  }
  const q6 = design.questionModels.Q6;
  let q6Count = 0;
  for (const location of design.locations) for (const side of design.sides)
    for (const selected of [...combinations(q6, 1, 3), ["movement_unclear"]]) {
      const input = { location, side, movements: selected };
      assert.deepEqual(comparable(Wrist.rank(input)), expected(input));
      q6Count++;
    }
  assert.equal(q6Count, 840);
  const example = design.benchmarks.find((item) => item.id === "WRS-034");
  const result = calculateUi(ui, example.input);
  ui.__setState({ stepIndex: 3 }); ui.__render();
  for (const word of ["参考として関連する筋肉", "候補筋についてAIに聞く内容をコピー",
    "医療機関への相談"]) assert(ui.__html().includes(word), word);
  const ai = ui.__ai(result);
  for (const word of ["筋肉の説明", "起こることがある症状", "今回の回答との関係",
    "追加・削除", "順位変更", "参考として関連する筋肉"])
    assert(ai.includes(word), word);
  assert(!ai.includes("ストレッチ方法を教えて") && !ai.includes("セルフケア方法を教えて"));
  const relatedOne = calculateUi(ui, design.benchmarks.find((item) => item.id === "WRS-001").input);
  ui.__setState({ stepIndex: 3 }); ui.__render();
  assert.equal(relatedOne.topMuscles.filter((item) => item.displayGroup === "Related").length, 1);
  assert(ui.__html().includes("参考として関連する筋肉</p>"));
  assert(ui.__html().indexOf("選んだ位置と動きが重なる候補") <
    ui.__html().indexOf("動きから追加で考えられる候補"));
  assert(ui.__html().indexOf("動きから追加で考えられる候補") <
    ui.__html().indexOf("参考として関連する筋肉</p>"));
  const relatedThree = calculateUi(ui, design.benchmarks.find((item) => item.id === "WRS-040").input);
  ui.__setState({ stepIndex: 3 }); ui.__render();
  assert.equal(relatedThree.topMuscles.filter((item) => item.displayGroup === "Related").length, 3);
  assert(ui.__html().includes("参考として関連する筋肉（3筋）"));
  assert(ui.__html().includes("ほか1筋"));
  const withReference = calculateUi(ui, design.benchmarks.find((item) => item.id === "WRS-042").input);
  ui.__setState({ stepIndex: 3 }); ui.__render();
  assert(withReference.topMuscles.some((item) => item.displayGroup === "Reference"));
  assert(ui.__html().includes("伸ばされる方向としての参考"));
  console.log(JSON.stringify({ runtime: 1280, q6Common: q6Count, counts,
    benchmarks: design.benchmarks.length, boundaryAssertions: design.independentBoundaryAssertions,
    rankedCases: rankedCases.length, invariants, maxBytes, hydrated: 1280,
    normalUrlPrecision: true, localLegacyComparison: true }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { createUi, calculateUi };
