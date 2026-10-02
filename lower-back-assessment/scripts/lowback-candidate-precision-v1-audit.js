"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = require("../lowback-candidate-precision-v1.js");

const design = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "audits",
  "lower-back-precision-v1-final-policy-design-2026-09-30.json"), "utf8"));
const designMaster = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "audits",
  "lower-back-precision-v1-ranking-policy-review-2026-09-30.json"), "utf8")).candidateMaster;
const started = Date.now();
const sort = (items) => [...items].sort();
const expectedFields = ["preStatus", "status", "frontierCategory", "main", "trustedAdditional",
  "mainFrontier", "unionFrontier", "unionMain", "unionAdditional", "crossRelationKinds"];
const counters = { statuses: {}, frontier: {}, reasons: {}, transitions: {}, display: {}, main: 0, additional: 0,
  reference: 0, overlap: 0, mirrorMismatch: 0, permutationMismatch: 0, definitionOrderMismatch: 0,
  sameAxisMismatch: 0, sourceOrderOnlyTop1: 0, runtimeCalls: 0, benchmark: 0,
  mirrorChecks: 0, permutationChecks: 0, definitionOrderChecks: 0, sameAxisChecks: 0 };
const increment = (map, key) => { map[key] = (map[key] || 0) + 1; };
const compare = (actual, expected, key) => assert.deepStrictEqual(actual, expected, key);
const rank = (input, master) => { counters.runtimeCalls += 1; return runtime.rank(input, master); };

compare(runtime.MASTER.map(({ id, name, relation, location }) => ({ id, name, relation, location })),
  designMaster.map(({ id, name, relation, location }) => ({ id, name, relation, location })), "relation/master drift");
assert.equal(runtime.MASTER.length, 4);
assert.equal(runtime.MASTER.reduce((total, item) => total + Object.keys(item.relation).length, 0), 24);
assert.equal(runtime.MASTER.reduce((total, item) => total + Object.keys(item.location).length, 0), 16);
assert.equal(design.cases.length, 672);

function fingerprint(result) {
  return {
    status: result.status, reason: result.statusReason, frontier: result.frontierCategory,
    main: result.main, additional: result.trustedAdditional, union: result.unionFrontier,
    display: result.display, candidateOrder: result.candidates.map((item) => [item.muscleId, item.displayGroup]),
    evidence: Object.fromEntries(Object.entries(result.evidence)
      .map(([id, item]) => [id, item.strength]).sort(([a], [b]) => a.localeCompare(b)))
  };
}

function permutations(items) {
  if (items.length < 2) return [[...items]];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index))
    .map((rest) => [item, ...rest]));
}

for (const [index, entry] of design.cases.entries()) {
  const input = entry.input;
  const expected = entry.byLocation.L1;
  const actual = rank(input);
  for (const field of expectedFields) compare(actual[field], expected[field], `case ${index} ${field}`);
  compare(actual.statusReason, expected.reason, `case ${index} reason`);
  compare(actual.display, expected.displays.D1, `case ${index} display`);
  compare(actual.evidence, expected.evidence, `case ${index} evidence`);
  assert.equal(actual.sourceOrderUsedForTop1, false);
  assert.equal(actual.candidates.length, actual.display.all.length);
  assert(actual.candidates.every((candidate) => !Object.hasOwn(candidate, "score") && !Object.hasOwn(candidate, "imageId")
    && !Object.hasOwn(candidate, "model3dId")));
  increment(counters.statuses, actual.status);
  increment(counters.frontier, actual.frontierCategory);
  increment(counters.reasons, actual.statusReason);
  increment(counters.transitions, `${actual.preStatus} -> ${actual.status}`);
  increment(counters.display, actual.display.all.length);
  counters.main += actual.display.main.length;
  counters.additional += actual.display.additional.length;
  counters.reference += actual.display.reference.length;
  if (actual.crossRelationKinds.includes("equal") && actual.crossRelationKinds.includes("incomparable")) {
    counters.overlap += 1;
    assert.equal(actual.statusReason, "cross_group_incomparable");
  }
  const flippedSide = input.side === "right" ? "left" : input.side === "left" ? "right" : input.side;
  const flipMovement = { side_bend_right: "side_bend_left", side_bend_left: "side_bend_right",
    rotate_right: "rotate_left", rotate_left: "rotate_right" };
  const mirrored = rank({ ...input, side: flippedSide, movements: input.movements.map((id) => flipMovement[id] || id) });
  counters.mirrorChecks += 1;
  if (JSON.stringify(fingerprint(actual)) !== JSON.stringify(fingerprint(mirrored))) counters.mirrorMismatch += 1;
  for (const ordered of permutations(input.movements)) {
    const variant = rank({ ...input, movements: ordered });
    counters.permutationChecks += 1;
    if (JSON.stringify(fingerprint(actual)) !== JSON.stringify(fingerprint(variant))) counters.permutationMismatch += 1;
  }
  const reversed = rank(input, [...runtime.MASTER].reverse());
  counters.definitionOrderChecks += 1;
  if (JSON.stringify(fingerprint(actual)) !== JSON.stringify(fingerprint(reversed))) counters.definitionOrderMismatch += 1;
  for (const pair of [["side_bend_right", "side_bend_left"], ["rotate_right", "rotate_left"]]) {
    if (!input.movements.includes(pair[0]) || !input.movements.includes(pair[1])) continue;
    const reduced = rank({ ...input, movements: input.movements.filter((id) => id !== pair[1]) });
    counters.sameAxisChecks += 1;
    if (JSON.stringify(Object.fromEntries(Object.entries(actual.evidence).map(([id, item]) => [id, item.strength]))) !==
      JSON.stringify(Object.fromEntries(Object.entries(reduced.evidence).map(([id, item]) => [id, item.strength])))) counters.sameAxisMismatch += 1;
  }
  if (actual.status === "ranked" && actual.unionMain.length !== 1) counters.sourceOrderOnlyTop1 += 1;
}

for (const benchmark of design.benchmark) {
  const actual = rank(benchmark.input);
  const expected = benchmark.byLocation.L1;
  compare(actual.status, expected.status, `${benchmark.id} status`);
  compare(actual.statusReason, expected.reason, `${benchmark.id} reason`);
  compare(actual.main, expected.main, `${benchmark.id} Main`);
  compare(actual.trustedAdditional, expected.trustedAdditional, `${benchmark.id} Additional`);
  compare(actual.unionFrontier, expected.unionFrontier, `${benchmark.id} frontier`);
  compare(actual.display, expected.displays.D1, `${benchmark.id} D1`);
  counters.benchmark += 1;
}

compare(counters.statuses, design.summary.L1.after, "status distribution");
compare(counters.frontier, design.summary.L1.frontierCategories, "frontier distribution");
compare(counters.reasons, design.summary.L1.reasons, "reason distribution");
compare(counters.transitions, design.summary.L1.transition, "guard transition");
compare(counters.display, design.summary.L1.displays.D1.counts, "D1 display distribution");
assert.equal(counters.main, design.summary.L1.displays.D1.mainShown);
assert.equal(counters.additional, design.summary.L1.displays.D1.additionalShown);
assert.equal(counters.reference, design.summary.L1.displays.D1.referenceOnlyShown);
assert.equal(counters.overlap, 40);
for (const key of ["mirrorMismatch", "permutationMismatch", "definitionOrderMismatch", "sameAxisMismatch", "sourceOrderOnlyTop1"]) assert.equal(counters[key], 0, key);
assert.equal(counters.benchmark, 20);
console.log(JSON.stringify({ ...counters, elapsedMs: Date.now() - started }, null, 2));
