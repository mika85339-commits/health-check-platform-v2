"use strict";

const assert = require("node:assert/strict");
const design = require("../docs/audits/buttock-precision-v1-final-human-review-2026-10-03.json");
const Buttock = require("../buttock-candidate-precision-v1.js");

const fields = ["status", "top", "main", "trustedMain", "additional", "related", "reviewOnly",
  "reference", "mainFrontier", "frontier", "display", "challengingAdditional"];
const piriformis = "buttock_piriformis";
const medius = "buttock_gluteus_medius";
const minimus = "buttock_gluteus_minimus";
const hamstrings = "buttock_hamstrings";
const status = { ranked: 0, tied: 0, insufficient: 0 };
const ham = { main: 0, additional: 0, related: 0, uniqueRanked: 0, tied: 0 };
let naturalTie = 0;
let weakMain = 0;
let weakAdditional = 0;
let weakRanked = 0;
let weakGuard = 0;
let mirrorMismatch = 0;
let movementOrderMismatch = 0;
let definitionOrderMismatch = 0;
let sourceOrderOnlyTop1 = 0;
let sameAxisDoubleCount = 0;
let displayCandidateLoss = 0;

function compare(input, expected, label) {
  const actual = Buttock.rank(input);
  for (const field of fields) assert.deepEqual(actual[field], expected[field], `${label}: ${field}`);
  assert.equal(actual.statusReason, expected.reason, `${label}: reason`);
  assert.deepEqual(actual.candidates.map((item) => item.muscleId).sort(), expected.display,
    `${label}: visible candidate membership`);
  assert(!actual.candidates.some((item) => item.muscleId === piriformis), `${label}: inactive piriformis`);
  return actual;
}

function permutations(items) {
  return items.length < 2 ? [items] : items.flatMap((item, index) =>
    permutations(items.filter((_, at) => at !== index)).map((rest) => [item, ...rest]));
}

assert.equal(design.finalUi.cases.length, 240);
assert.equal(design.exploratory.cases.length, 672);
assert.equal(design.benchmark.cases.length, 24);
assert.equal(design.qualificationReview.changedFinalCases.length, 32);
assert.equal(design.qualificationReview.changedBoundaryCases.length, 112);
assert.equal(design.qualificationReview.candidateLoss, 0);
assert(Buttock.MASTER.some((item) => item.id === piriformis && item.active === false));
assert(Buttock.LOCATIONS.find(([id]) => id === "buttock_lower")[1].includes("座ると当たる骨の近く"));

for (const { input, result } of design.finalUi.cases) {
  const actual = compare(input, result, `final ${JSON.stringify(input)}`);
  status[actual.status] += 1;
  if (actual.main.includes(hamstrings)) ham.main += 1;
  if (actual.additional.includes(hamstrings)) ham.additional += 1;
  if (actual.related.includes(hamstrings)) ham.related += 1;
  if (actual.status === "ranked" && actual.top.includes(hamstrings)) ham.uniqueRanked += 1;
  if (actual.status === "tied" && actual.top.includes(hamstrings)) ham.tied += 1;
  weakMain += actual.main.filter((id) => !actual.evidence[id].trusted).length;
  weakAdditional += actual.additional.filter((id) => !actual.evidence[id].trusted).length;
  weakGuard += actual.challengingAdditional.filter((id) => !actual.evidence[id].trusted).length;
  if (actual.status === "ranked" && actual.top.some((id) => !actual.evidence[id].trusted)) weakRanked += 1;
  if (actual.status === "tied" && actual.top.includes(medius) && actual.top.includes(minimus)) naturalTie += 1;
  assert.equal(actual.main.includes(medius), actual.main.includes(minimus));
  assert.equal(actual.additional.includes(medius), actual.additional.includes(minimus));
  if (actual.top.some((id) => !actual.display.includes(id))) displayCandidateLoss += 1;
  if (actual.status === "ranked" && (actual.top.length !== 1 || actual.trustedMain.some((id) =>
    id !== actual.top[0] && JSON.stringify(actual.evidence[id].vector) ===
      JSON.stringify(actual.evidence[actual.top[0]].vector)))) sourceOrderOnlyTop1 += 1;
}
assert.deepEqual(status, { ranked: 16, tied: 84, insufficient: 140 });
assert.deepEqual(ham, { main: 44, additional: 88, related: 24, uniqueRanked: 12, tied: 64 });
assert.deepEqual({ weakMain, weakAdditional, weakRanked, weakGuard },
  { weakMain: 0, weakAdditional: 0, weakRanked: 0, weakGuard: 0 });
assert.equal(naturalTie, 60);

for (const { input, result } of design.exploratory.cases) {
  const actual = compare(input, result, `boundary ${JSON.stringify(input)}`);
  const signature = (value) => JSON.stringify(fields.map((field) => value[field]).concat(value.statusReason));
  const expected = signature(actual);
  if (signature(Buttock.rank({ ...input, side: "right" })) !== expected) mirrorMismatch += 1;
  if (signature(Buttock.rank(input, [...Buttock.MASTER].reverse())) !== expected) definitionOrderMismatch += 1;
  for (const movements of permutations(input.movements)) {
    if (signature(Buttock.rank({ ...input, movements })) !== expected) movementOrderMismatch += 1;
  }
  if (actual.top.some((id) => !actual.display.includes(id))) displayCandidateLoss += 1;
  for (const [id, evidence] of Object.entries(actual.evidence)) {
    for (const axis of ["extension", "lateral", "knee"]) {
      const largest = Math.max(0, ...input.movements.map((movement) =>
        Buttock.rank({ ...input, movements: [movement] }).evidence[id].vector[axis]));
      if (evidence.vector[axis] !== largest) sameAxisDoubleCount += 1;
    }
  }
}
for (const benchmark of design.benchmark.cases) {
  compare(benchmark.input, benchmark.result, benchmark.id);
}
assert.deepEqual({ mirrorMismatch, movementOrderMismatch, definitionOrderMismatch,
  sourceOrderOnlyTop1, sameAxisDoubleCount, displayCandidateLoss },
{ mirrorMismatch: 0, movementOrderMismatch: 0, definitionOrderMismatch: 0,
  sourceOrderOnlyTop1: 0, sameAxisDoubleCount: 0, displayCandidateLoss: 0 });
console.log("Buttock precision-v1: final 240/240, boundary 672/672, benchmarks 24/24, invariants 0");
