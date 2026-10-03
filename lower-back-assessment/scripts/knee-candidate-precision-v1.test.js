"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const Knee = require(path.join(root, "knee-candidate-precision-v1.js"));
const boundary = require(path.join(root, "docs/audits/knee-precision-v1-final-boundary-review-2026-10-03.json"));
const frozen = require(path.join(root, "docs/audits/knee-precision-v1-rotation-final-review-2026-10-03.json"));
const designSource = fs.readFileSync(path.join(__dirname, "knee-precision-v1-design-audit.js"), "utf8");
const rotationSource = fs.readFileSync(path.join(__dirname, "knee-precision-v1-rotation-final-review.js"), "utf8");
assert.equal(crypto.createHash("sha256").update(designSource).digest("hex"), boundary.sourceSha256);
const begin = designSource.indexOf("const AXIS = ");
const end = designSource.indexOf("const benchmarkDrafts = ");
const policyBegin = rotationSource.indexOf("function policyResult(");
const policyEnd = rotationSource.indexOf("const fields = ");
assert(begin >= 0 && end > begin && policyBegin >= 0 && policyEnd > policyBegin);
function choose(values, min, max) {
  const output = [];
  function visit(start, selected) {
    if (selected.length >= min) output.push([...selected]);
    if (selected.length === max) return;
    for (let index = start; index < values.length; index += 1) {
      selected.push(values[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  }
  visit(0, []);
  return output;
}
const context = { assert, choose };
vm.runInNewContext(`${designSource.slice(begin, end)}
  const model = { draft, evidence, dominates, rankProposal };
  ${rotationSource.slice(policyBegin, policyEnd)}
  globalThis.oracle = policyResult;`, context);
const oracle = context.oracle;
const oracleMaster = JSON.parse(JSON.stringify(boundary.model));
assert.deepEqual(Knee.MASTER.map(({ id, name, location, movement, confidence, imageId }) =>
  ({ id, name, location, movement, confidence, imageId })), oracleMaster);
assert.deepEqual(Knee.MOVEMENTS.map(([id]) => id), ["extend", "flex", "heel_raise"]);

const movementSets = [["extend"], ["extend", "flex"], ["extend", "heel_raise"],
  ["extend", "flex", "heel_raise"], ["flex"], ["flex", "heel_raise"],
  ["heel_raise"], ["movement_unclear"]];
const locations = ["knee_front", "knee_inner", "knee_outer", "knee_back", "location_unclear"];
const sides = ["right", "left", "both", "center"];
const counts = { statuses: {}, mainCount: {}, additionalCount: {}, frontierCount: {}, displayCount: {} };
const muscle = Object.fromEntries(Knee.MASTER.map(({ id }) => [id, { main: 0, additional: 0, ranked: 0 }]));
const invariants = { mirrorMismatch: 0, movementOrderMismatch: 0, definitionOrderMismatch: 0,
  sourceOrderOnlyTop1: 0, sameAxisDoubleCount: 0, displayCandidateLoss: 0 };
const count = (object, key) => { object[key] = (object[key] || 0) + 1; };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = (items) => [...items].sort();
const signature = (result) => JSON.stringify({ status: result.status, reason: result.statusReason,
  main: result.main, additional: result.additional, reference: result.reference,
  reviewOnly: result.reviewOnly, frontier: result.frontier, unionFrontier: result.unionFrontier,
  visible: result.visible, collapsed: result.collapsed });
function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
    .map((remaining) => [value, ...remaining]));
}
function expectedReason(answer, expected) {
  if (answer.location === "location_unclear") return "location_unclear";
  if (answer.movements.includes("movement_unclear")) return "movement_unclear";
  if (expected.frontier.length > 1) return "main_tie";
  if (expected.frontier.length === 1) {
    if (expected.weakUnique) return "weak_unique_main";
    if (expected.challengers.length) return "cross_group_additional_challenge";
    return "ranked_unique_main";
  }
  return expected.reference.length && !expected.additional.length
    ? "stretch_only_reference" : "no_main_evidence";
}

let patterns = 0;
for (const location of locations) for (const side of sides) for (const movements of movementSets) {
  const answer = { location, side, movements };
  const expected = oracle(answer);
  const actual = Knee.rank(answer);
  const where = `${location}/${side}/${movements.join("+")}`;
  for (const field of ["status", "main", "additional", "reference", "reviewOnly", "frontier",
    "unionFrontier", "challengers", "weakUnique", "visible", "collapsed"]) {
    assert(same(actual[field], expected[field]), `${where}/${field}: ${JSON.stringify(actual[field])} != ${JSON.stringify(expected[field])}`);
  }
  assert.equal(actual.statusReason, expectedReason(answer, expected), `${where}/reason`);
  assert.deepEqual(actual.display.initial, sorted([...expected.main, ...expected.visible.filter((id) =>
    expected.additional.includes(id))]));
  assert.deepEqual(actual.display.expanded, sorted([...expected.main, ...expected.additional]));
  count(counts.statuses, actual.status);
  count(counts.mainCount, actual.main.length);
  count(counts.additionalCount, actual.additional.length);
  count(counts.frontierCount, actual.frontier.length);
  count(counts.displayCount, actual.visible.length);
  for (const id of actual.main) muscle[id].main += 1;
  for (const id of actual.additional) muscle[id].additional += 1;
  if (actual.status === "ranked") muscle[actual.frontier[0]].ranked += 1;
  patterns += 1;

  const expectedSignature = signature(actual);
  const mirrorSide = side === "right" ? "left" : "right";
  if (signature(Knee.rank({ ...answer, side: mirrorSide })) !== expectedSignature) invariants.mirrorMismatch += 1;
  for (const order of permutations(movements)) {
    if (signature(Knee.rank({ ...answer, movements: order })) !== expectedSignature) invariants.movementOrderMismatch += 1;
  }
  if (signature(Knee.rank(answer, [...Knee.MASTER].reverse())) !== expectedSignature) {
    invariants.definitionOrderMismatch += 1;
    if (actual.status === "ranked") invariants.sourceOrderOnlyTop1 += 1;
  }
  if (!same(sorted([...actual.visible, ...actual.collapsed]),
    sorted([...actual.main, ...actual.additional, ...actual.reference]))) invariants.displayCandidateLoss += 1;
  for (const item of Knee.MASTER) for (const axis of ["sagittal", "rotation", "ankle"]) {
    const strength = Math.max(0, ...movements.filter((id) => Knee.MOVEMENT_AXIS[id] === axis)
      .map((id) => {
        const relation = item.movement[{ extend: 0, flex: 1, heel_raise: 4 }[id]];
        return relation === "P" ? 2 : relation === "H" ? 1 : 0;
      }));
    if (actual.evidence[item.id].vector[axis] !== strength) invariants.sameAxisDoubleCount += 1;
  }
}
assert.equal(patterns, 160);
for (const field of Object.keys(counts)) {
  assert.deepEqual(counts[field], frozen.fullR2[field], field);
}
assert.deepEqual(invariants, frozen.invariants);
assert.equal(muscle.knee_popliteus.main, 16);
assert.equal(muscle.knee_popliteus.additional, 16);
assert.equal(muscle.knee_popliteus.ranked, 0);
for (const item of [...frozen.benchmarks.retained, ...frozen.benchmarks.replacements]) {
  const actual = Knee.rank(item.answer);
  for (const field of ["status", "main", "additional", "reference", "frontier", "visible"]) {
    assert(same(actual[field], item.result[field]), `${item.id}/${field}`);
  }
  assert.equal(actual.statusReason, expectedReason(item.answer, oracle(item.answer)), `${item.id}/reason`);
}
assert.equal(frozen.benchmarks.retained.length + frozen.benchmarks.replacements.length, 27);
for (const bad of ["tibia_in", "tibia_out"]) {
  assert.throws(() => Knee.rank({ location: "knee_back", side: "right", movements: [bad] }));
}
const weak = Knee.rank({ location: "knee_front", side: "right", movements: ["flex"] }, [
  { id: "knee_weak", name: "弱い候補", imageId: "", confidence: "REVIEW", location: "PNNN", movement: "NHNNN" }
]);
assert.equal(weak.status, "insufficient");
assert.equal(weak.statusReason, "weak_unique_main");
assert.deepEqual(weak.main, ["knee_weak"]);
const cross = Knee.rank({ location: "knee_front", side: "right", movements: ["extend"] }, [
  { id: "knee_main", name: "位置候補", imageId: "", confidence: "MEDIUM", location: "PNNN", movement: "PNNNN" },
  { id: "knee_additional", name: "動き候補", imageId: "", confidence: "MEDIUM", location: "HNNN", movement: "PNNNN" }
]);
assert.equal(cross.status, "insufficient");
assert.equal(cross.statusReason, "cross_group_additional_challenge");
assert.deepEqual(cross.main, ["knee_main"]);
assert.deepEqual(cross.additional, ["knee_additional"]);
console.log(JSON.stringify({ patterns, benchmarks: 27, statuses: counts.statuses,
  mainCount: counts.mainCount, additionalCount: counts.additionalCount,
  frontierCount: counts.frontierCount, displayCount: counts.displayCount,
  popliteus: muscle.knee_popliteus, invariants }, null, 2));
