"use strict";

const assert = require("node:assert/strict");
const design = require("../docs/audits/thigh-precision-v1-final-human-review-2026-10-06.json");
const Thigh = require("../thigh-candidate-precision-v1.js");

const idSort = (values) => [...values].sort();
const cases = design.cases;
const keyOf = ({ location, side, movements }) =>
  `${location}/${side}/${[...movements].sort().join("+")}`;
const byKey = new Map(cases.map((item) => [keyOf(item.input), item]));
const permutations = (values) => values.length < 2 ? [values] : values.flatMap((value, index) =>
  permutations(values.filter((_, at) => at !== index)).map((rest) => [value, ...rest]));
const comparable = (result) => ({
  status: result.status, reason: result.statusReason, main: result.main,
  additional: result.additional, related: result.related,
  relatedDisplayed: result.relatedDisplayed, reference: result.reference,
  top: result.top, mainFrontier: result.mainFrontier,
  unionFrontier: result.unionFrontier, display: result.display,
  evidence: result.evidence
});
const status = { ranked: 0, tied: 0, insufficient: 0 };
const counts = { referencePresent: 0, mainZeroAdditional: 0,
  tflMain: 0, tflAdditional: 0, weakOnlyMain: 0, weakOnlyAdditional: 0,
  weakOnlyRanked: 0, weakReviewGuard: 0, displayLoss: 0 };
const invariant = { mirror: 0, movementOrder: 0, definitionOrder: 0,
  sourceOrderTop1: 0, sameAxisDoubleCount: 0 };

assert.equal(cases.length, 520);
assert.equal(design.grid.reachable, 520);
assert.equal(design.grid.sampled, 0);
assert.deepEqual(Thigh.MOVEMENTS.map(([id]) => id), design.model.movements);
assert.deepEqual(Thigh.LOCATIONS.map(([id]) => id), design.model.locations.filter((id) => id !== "location_unclear"));
assert.deepEqual(Thigh.MASTER.map(({ id, location, movement, active }) =>
  ({ id, location, movement, active })),
design.model.master.map(({ id, location, movement, active }) =>
  ({ id, location, movement, active })));

for (const expected of cases) {
  const actual = Thigh.rank(expected.input);
  assert.deepEqual(comparable(actual), {
    status: expected.status, reason: expected.reason,
    main: expected.main, additional: expected.additional,
    related: expected.related, relatedDisplayed: expected.relatedDisplayed,
    reference: expected.reference, top: expected.top,
    mainFrontier: expected.mainFrontier, unionFrontier: expected.unionFrontier,
    display: expected.display, evidence: expected.evidence
  }, JSON.stringify(expected.input));
  const groups = Object.groupBy(actual.candidates, (item) => item.displayGroup);
  for (const [group, ids] of Object.entries({ Main: expected.main,
    Additional: expected.additional, Related: expected.relatedDisplayed,
    Reference: expected.reference })) {
    assert.deepEqual(idSort((groups[group] || []).map((item) => item.muscleId)), ids,
      `${group} ${JSON.stringify(expected.input)}`);
  }
  status[actual.status] += 1;
  if (actual.reference.length) counts.referencePresent += 1;
  if (!actual.main.length && actual.additional.length) counts.mainZeroAdditional += 1;
  if (actual.main.includes("thigh_tfl")) counts.tflMain += 1;
  if (actual.additional.includes("thigh_tfl")) counts.tflAdditional += 1;
  for (const id of actual.main) if (!actual.evidence[id].trusted.length) counts.weakOnlyMain += 1;
  for (const id of actual.additional) if (!actual.evidence[id].trusted.length) counts.weakOnlyAdditional += 1;
  if (actual.status === "ranked" && !actual.evidence[actual.top[0]].trusted.length) counts.weakOnlyRanked += 1;
  if (["cross_group_guard", "additional_dominates_main"].includes(actual.statusReason)) {
    for (const id of actual.top) if (!actual.evidence[id].trusted.length) counts.weakReviewGuard += 1;
  }
  if (actual.top.some((id) => !actual.display.initial.includes(id))) counts.displayLoss += 1;
  assert(!actual.main.includes("thigh_sartorius") && !actual.additional.includes("thigh_sartorius") &&
    !actual.top.includes("thigh_sartorius"));
  const mirrored = Thigh.rank({ ...expected.input,
    side: expected.input.side === "left" ? "right" : "left" });
  if (!isEqual(comparable(actual), comparable(mirrored))) invariant.mirror += 1;
  for (const order of permutations(expected.input.movements)) {
    if (!isEqual(comparable(actual), comparable(Thigh.rank({ ...expected.input, movements: order })))) {
      invariant.movementOrder += 1;
    }
  }
  const reversed = Thigh.rank(expected.input, [...Thigh.MASTER].reverse());
  if (!isEqual(comparable(actual), comparable(reversed))) invariant.definitionOrder += 1;
  if (actual.status === "ranked" && !isEqual(actual.top, reversed.top)) invariant.sourceOrderTop1 += 1;
  for (const muscle of Thigh.MASTER) for (const axis of ["knee", "hip", "frontal"]) {
    const singles = expected.input.movements.filter((id) => Thigh.MOVEMENT_AXIS[id] === axis)
      .map((id) => Thigh.rank({ ...expected.input, movements: [id] }).evidence[muscle.id].vector[axis]);
    if (actual.evidence[muscle.id].vector[axis] !== Math.max(0, ...singles)) {
      invariant.sameAxisDoubleCount += 1;
    }
  }
}

function isEqual(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
assert.deepEqual(status, { ranked: 28, tied: 132, insufficient: 360 });
assert.deepEqual(counts, { referencePresent: 108, mainZeroAdditional: 212,
  tflMain: 0, tflAdditional: 176, weakOnlyMain: 0, weakOnlyAdditional: 0,
  weakOnlyRanked: 0, weakReviewGuard: 0, displayLoss: 0 });
assert.deepEqual(invariant, { mirror: 0, movementOrder: 0, definitionOrder: 0,
  sourceOrderTop1: 0, sameAxisDoubleCount: 0 });
for (const benchmark of design.benchmarks) {
  const expected = byKey.get(keyOf(benchmark.input));
  assert(expected, benchmark.id);
  const actual = Thigh.rank(benchmark.input);
  assert.deepEqual([actual.status, actual.statusReason, actual.main, actual.additional,
    actual.relatedDisplayed, actual.reference, actual.top],
  [benchmark.status, benchmark.reason, benchmark.main, benchmark.additional,
    benchmark.related, benchmark.reference, benchmark.top], benchmark.id);
}
assert.equal(design.benchmarks.length, 31);
console.log("Thigh precision-v1 runtime 520/520, benchmark 31/31, invariants 0: PASS");
