const assert = require("node:assert/strict");
const path = require("node:path");
const design = require(path.join(__dirname, "..", "docs", "audits",
  "hip-precision-v1-cross-group-guard-review-2026-10-02.json"));
const moduleApi = require(path.join(__dirname, "..", "hip-candidate-precision-v1.js"));
const { rank, MASTER, MOVEMENT_AXIS } = moduleApi;
const { rank: designRank, masterFor } = require("./hip-precision-v1-final-boundary-review.js");
const designMaster = masterFor("P1", "S1");
const grade = { N: 0, H: 1, P: 2 };
const counts = { status: {}, reason: {}, category: {}, initial: {}, expanded: {} };
const mismatches = { mirror: 0, movementOrder: 0, definitionOrder: 0,
  sourceOrderTop1: 0, sameAxisDouble: 0, missingExpanded: 0 };
const increment = (map, key) => { map[key] = (map[key] || 0) + 1; };
const sorted = (items) => [...items].sort();
const bucket = (length) => length >= 4 ? "4+" : String(length);
const comparable = (result) => JSON.stringify({ status: result.status, reason: result.statusReason,
  main: result.main, additional: result.additional, reference: result.reference,
  mainFrontier: result.mainFrontier, unionFrontier: result.unionFrontier,
  initial: result.display.initial, expanded: result.display.expanded });
function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, i) => permutations(values.filter((_, j) => j !== i))
    .map((tail) => [value, ...tail]));
}

assert.equal(MASTER.length, 7);
assert(!MASTER.some(({ id }) => id === "hip_piriformis"));
assert.deepEqual(MASTER.map(({ id }) => id), designMaster.map(({ id }) => id));
for (const [index, muscle] of MASTER.entries()) {
  const expected = designMaster[index];
  assert.equal(muscle.location, expected.location.join(""), `${muscle.id}/location`);
  assert.equal(muscle.movement, expected.movement.slice(0, 4).join(""), `${muscle.id}/movement`);
}
assert.equal(MASTER.find(({ id }) => id === "hip_sartorius").location[0], "H");
assert.equal(MASTER.find(({ id }) => id === "hip_sartorius").movement[2], "H");

let previousMirror = null;
let previousMirrorInput = "";
for (const item of design.stats.cases) {
  const actual = rank(item.answer);
  const original = designRank(item.answer, designMaster);
  const context = JSON.stringify(item.answer);
  assert.equal(actual.status, item.after.status, `${context}/status`);
  const expectedReason = item.after.reason === "existing_insufficient"
    ? item.answer.location === "location_unclear" ? "location_unclear"
      : item.answer.movements.includes("movement_unclear") ? "movement_unclear" : "no_main_evidence"
    : item.after.reason;
  assert.equal(actual.statusReason, expectedReason, `${context}/reason`);
  for (const [field, expected] of [["main", item.main], ["additional", item.additional],
    ["mainFrontier", item.mainFrontier], ["unionFrontier", item.unionFrontier],
    ["reference", original.reference]]) {
    assert.deepEqual(actual[field], expected, `${context}/${field}`);
  }
  assert.deepEqual(actual.display.initial, item.D1_initial, `${context}/D1 initial`);
  assert.deepEqual(actual.display.expanded, item.D1_expanded, `${context}/D1 expanded`);
  assert.equal(actual.frontierCategory, item.category, `${context}/frontier category`);
  assert.deepEqual(sorted([...actual.display.initial, ...actual.dominatedAdditional]),
    actual.display.expanded, `${context}/expanded candidate loss`);
  assert(!actual.main.includes("hip_piriformis"));
  assert(!actual.additional.includes("hip_piriformis"));
  increment(counts.status, actual.status);
  increment(counts.reason, actual.statusReason);
  increment(counts.category, actual.frontierCategory);
  increment(counts.initial, bucket(actual.display.initial.length));
  increment(counts.expanded, bucket(actual.display.expanded.length));

  const key = `${item.answer.location}/${item.answer.movements.join("+")}`;
  const signature = comparable(actual);
  if (key === previousMirrorInput && signature !== previousMirror) mismatches.mirror += 1;
  previousMirror = signature;
  previousMirrorInput = key;
  if (comparable(rank(item.answer, [...MASTER].reverse())) !== signature) {
    mismatches.definitionOrder += 1;
  }
  for (const movements of permutations(item.answer.movements)) {
    if (comparable(rank({ ...item.answer, movements })) !== signature) mismatches.movementOrder += 1;
  }
  if (actual.status === "ranked" && actual.display.expanded.some((id) =>
    id !== actual.unionFrontier[0] &&
    JSON.stringify(actual.evidence[id].strength) ===
      JSON.stringify(actual.evidence[actual.unionFrontier[0]].strength))) {
    mismatches.sourceOrderTop1 += 1;
  }
  for (const muscle of MASTER) for (const axis of ["sagittal", "frontal"]) {
    const relevant = item.answer.movements.filter((movement) => MOVEMENT_AXIS[movement] === axis);
    const expected = Math.max(0, ...relevant.map((movement) => {
      const relation = muscle.movement[moduleApi.MOVEMENTS.findIndex(([id]) => id === movement)];
      return grade[relation] || 0;
    }));
    if (grade[actual.evidence[muscle.id].strength[axis]] !== expected) mismatches.sameAxisDouble += 1;
  }
  const active = sorted([...actual.main, ...actual.additional]);
  if (JSON.stringify(actual.display.expanded) !== JSON.stringify(active)) mismatches.missingExpanded += 1;
}

assert.equal(design.stats.cases.length, 300);
assert.deepEqual(counts.status, { ranked: 12, tied: 100, insufficient: 188 });
assert.equal(counts.reason.cross_group_equal, 24);
assert.equal(counts.reason.cross_group_incomparable, 72);
assert.equal(counts.reason.cross_group_additional_dominates, 32);
assert.deepEqual(counts.category,
  { main_only: 16, mixed: 96, additional_only: 32, main0: 156 });
assert.deepEqual(counts.initial, { "0": 76, "1": 44, "2": 60, "3": 44, "4+": 76 });
assert.deepEqual(counts.expanded, { "0": 76, "1": 32, "2": 16, "3": 16, "4+": 160 });
assert(Object.values(mismatches).every((value) => value === 0), JSON.stringify(mismatches));
for (const benchmark of design.benchmarks) {
  const actual = rank(benchmark.answers);
  assert.equal(actual.status, benchmark.after.status, benchmark.id);
  if (benchmark.after.reason !== "existing_insufficient") {
    assert.equal(actual.statusReason, benchmark.after.reason, benchmark.id);
  }
  assert.deepEqual(actual.main, benchmark.main, `${benchmark.id}/main`);
  assert.deepEqual(actual.additional, benchmark.additional, `${benchmark.id}/additional`);
  assert.deepEqual(actual.unionFrontier, benchmark.unionFrontier, `${benchmark.id}/frontier`);
}
for (const id of ["HIP-003", "HIP-004"]) {
  const answers = design.benchmarks.find((item) => item.id === id).answers;
  const actual = rank(answers);
  assert.equal(actual.status, "tied");
  assert.equal(actual.statusReason, "main_tie");
  assert.deepEqual(actual.unionFrontier,
    ["hip_gluteus_medius", "hip_gluteus_minimus", "hip_tfl"]);
}
console.log(JSON.stringify({ patterns: 300, benchmarks: design.benchmarks.length,
  status: counts.status, reasons: counts.reason, categories: counts.category,
  D1Initial: counts.initial, D1Expanded: counts.expanded, invariants: mismatches }, null, 2));
