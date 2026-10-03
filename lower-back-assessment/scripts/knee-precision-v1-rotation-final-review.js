"use strict";

// Read-only comparison of the frozen L2/G1/P2 proposal with and without rotation answers.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const previous = JSON.parse(fs.readFileSync(path.join(root,
  "docs/audits/knee-precision-v1-final-boundary-review-2026-10-03.json"), "utf8"));
const source = fs.readFileSync(path.join(__dirname, "knee-precision-v1-design-audit.js"), "utf8");
const bodySource = fs.readFileSync(path.join(root, "body-check-ui.js"));
assert.strictEqual(crypto.createHash("sha256").update(bodySource).digest("hex"),
  previous.referenceAuditSourceSha256, "Runtime source changed since the frozen knee audit");
assert.strictEqual(crypto.createHash("sha256").update(source).digest("hex"), previous.sourceSha256,
  "Proposal model changed since the boundary review");

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
const begin = source.indexOf("const AXIS = ");
const end = source.indexOf("const benchmarkDrafts = ");
assert(begin >= 0 && end > begin);
const context = { assert, choose };
vm.runInNewContext(`${source.slice(begin, end)}\nglobalThis.model = { AXIS, axes, draft,
  evidence, dominates, rankProposal, permutations, newLocations, newMovementSets, movementIndex };`, context);
const model = context.model;
assert.strictEqual(JSON.stringify(model.draft), JSON.stringify(previous.model));

const sides = ["right", "left", "both", "center"];
const rotation = new Set(["tibia_in", "tibia_out"]);
const r2MovementSets = [...choose(["extend", "flex", "heel_raise"], 1, 3), ["movement_unclear"]];
const enumerate = (sets) => model.newLocations.flatMap((location) => sides.flatMap((side) =>
  sets.map((movements) => ({ location, side, movements }))));
const r0Answers = enumerate(model.newMovementSets);
const r2Answers = enumerate(r2MovementSets);
assert.strictEqual(r0Answers.length, 520);
assert.strictEqual(r2Answers.length, 160);

const count = (map, key) => { map[key] = (map[key] || 0) + 1; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ids = (items) => [...new Set(items)].sort();
const active = (result) => ids([...result.main, ...result.additional]);
const difference = (a, b) => a.filter((id) => !b.includes(id));
const answerKey = (answer) => `${answer.location}|${answer.side}|${answer.movements.join(",")}`;
function policyResult(answer, reversed = false) {
  const base = model.rankProposal(answer, "C", reversed);
  const top = base.frontier.length === 1 ? model.draft.find((item) => item.id === base.frontier[0]) : null;
  const topEvidence = top ? model.evidence(top, answer.location, answer.movements) : null;
  const weakUnique = Boolean(top && topEvidence.max < 2);
  const challengers = top ? base.additional.filter((id) => {
    const muscle = model.draft.find((item) => item.id === id);
    return muscle.confidence !== "REVIEW" &&
      !model.dominates(topEvidence, model.evidence(muscle, answer.location, answer.movements));
  }) : [];
  return { ...base, status: base.status === "ranked" && (weakUnique || challengers.length)
    ? "insufficient" : base.status, weakUnique, challengers };
}
const fields = ["main", "additional", "reference", "frontier", "visible"];
const select = (result) => result && Object.fromEntries(["status", ...fields, "reviewOnly", "collapsed"]
  .map((field) => [field, result[field]]));
function lossClass(muscleId, answer, remaining) {
  const muscle = model.draft.find((item) => item.id === muscleId);
  const residual = model.evidence(muscle, answer.location, remaining);
  const removed = model.evidence(muscle, answer.location,
    answer.movements.filter((movement) => rotation.has(movement)));
  const stillTrusted = ["P", "H"].includes(residual.loc) && residual.max > 0;
  const category = stillTrusted ? "A" : muscle.confidence === "REVIEW" || removed.max < 2 ? "C" : "B";
  return { id: muscleId, category, confidence: muscle.confidence,
    removedRotationStrength: removed.max, remainingStrength: residual.max,
    onlyActiveEvidenceWasRotation: !stillTrusted && removed.max > 0 };
}
const muscleIds = model.draft.map((item) => item.id);
const muscleStats = Object.fromEntries(muscleIds.map((id) => [id, {
  activeLossMixed: 0, activeLossUnreachable: 0, mainLossMixed: 0, mainLossUnreachable: 0,
  additionalLossMixed: 0, additionalLossUnreachable: 0, onlyRotationActive: 0,
  lossClass: { A: 0, B: 0, C: 0 }, r2Main: 0, r2Additional: 0,
  r2ReferenceOnly: 0, r2ReviewOnly: 0, r2Ranked: 0, r2Tied: 0
}]));
const output = { method: "exact projection of all 360 rotation-containing R0 answers; no sampling",
  frozenPolicy: "L2 + G1 + P2", r0Patterns: 520, r2Patterns: 160,
  mixed: { total: 0, membershipChanged: 0, activeChanged: 0, mainChanged: 0,
    additionalChanged: 0, referenceChanged: 0, frontierChanged: 0, visibleChanged: 0,
    statusChanged: 0, statusOnlyChanged: 0, addedActive: 0, lostActive: 0,
    statusTransitions: {}, frontierLostByMuscle: {}, visibleLostByMuscle: {},
    defaultVisibleToCollapsed: 0, accessibleNonRotationCandidateLoss: 0,
    changedRows: [], statusOnlyRows: [] },
  rotationOnly: { total: 0, withActiveCandidate: 0, rows: [] },
  muscles: muscleStats, lossCategories: { A: 0, B: 0, C: 0 },
  fullR2: { statuses: {}, mainCount: {}, additionalCount: {}, frontierCount: {}, displayCount: {},
    uniqueTop1: {}, tieMembership: {}, locations: {}, movements: {} },
  benchmarks: { retained: [], unreachable: [], replacements: [], unexpectedMembershipChanges: [] },
  invariants: { mirrorMismatch: 0, movementOrderMismatch: 0, definitionOrderMismatch: 0,
    sourceOrderOnlyTop1: 0, sameAxisDoubleCount: 0, displayCandidateLoss: 0 } };

for (const answer of r0Answers) {
  const removedRotation = answer.movements.filter((movement) => rotation.has(movement));
  if (!removedRotation.length) continue;
  const remaining = answer.movements.filter((movement) => !rotation.has(movement));
  const before = policyResult(answer);
  const after = remaining.length ? policyResult({ ...answer, movements: remaining }) : null;
  const activeLost = difference(active(before), after ? active(after) : []);
  const activeAdded = after ? difference(active(after), active(before)) : [];
  const row = { location: answer.location, side: answer.side, remainingMovement: remaining,
    removedRotation, r0: select(before), r2: select(after),
    lostMuscles: activeLost, addedMuscles: activeAdded,
    mainLost: difference(before.main, after?.main || []),
    mainAdded: after ? difference(after.main, before.main) : [],
    additionalLost: difference(before.additional, after?.additional || []),
    additionalAdded: after ? difference(after.additional, before.additional) : [],
    statusChanged: after ? before.status !== after.status : "not_comparable",
    lossReasons: activeLost.map((id) => lossClass(id, answer, remaining)) };
  for (const loss of row.lossReasons) {
    count(output.lossCategories, loss.category);
    count(muscleStats[loss.id].lossClass, loss.category);
    if (loss.onlyActiveEvidenceWasRotation) muscleStats[loss.id].onlyRotationActive += 1;
    if (remaining.length) muscleStats[loss.id].activeLossMixed += 1;
    else muscleStats[loss.id].activeLossUnreachable += 1;
  }
  for (const id of row.mainLost) {
    if (remaining.length) muscleStats[id].mainLossMixed += 1;
    else muscleStats[id].mainLossUnreachable += 1;
  }
  for (const id of row.additionalLost) {
    if (remaining.length) muscleStats[id].additionalLossMixed += 1;
    else muscleStats[id].additionalLossUnreachable += 1;
  }
  if (!remaining.length) {
    output.rotationOnly.total += 1;
    if (activeLost.length) output.rotationOnly.withActiveCandidate += 1;
    output.rotationOnly.rows.push(row);
    continue;
  }
  output.mixed.total += 1;
  const changed = Object.fromEntries(fields.map((field) => [field, !same(before[field], after[field])]));
  for (const field of fields) if (changed[field]) count(output.mixed, `${field === "visible" ? "visible" : field}Changed`);
  if (row.statusChanged) {
    output.mixed.statusChanged += 1;
    count(output.mixed.statusTransitions, `${before.status}->${after.status}`);
  }
  for (const id of difference(before.frontier, after.frontier)) count(output.mixed.frontierLostByMuscle, id);
  for (const id of difference(before.visible, after.visible)) {
    count(output.mixed.visibleLostByMuscle, id);
    if (after.collapsed.includes(id)) output.mixed.defaultVisibleToCollapsed += 1;
  }
  for (const id of active(before)) {
    const muscle = model.draft.find((item) => item.id === id);
    const residual = model.evidence(muscle, answer.location, remaining);
    if (["P", "H"].includes(residual.loc) && residual.max > 0 &&
      ![...after.visible, ...after.collapsed].includes(id)) output.mixed.accessibleNonRotationCandidateLoss += 1;
  }
  if (activeLost.length || activeAdded.length) output.mixed.activeChanged += 1;
  output.mixed.lostActive += activeLost.length;
  output.mixed.addedActive += activeAdded.length;
  if (Object.values(changed).some(Boolean)) {
    output.mixed.membershipChanged += 1;
    output.mixed.changedRows.push({ ...row, changed });
  } else if (row.statusChanged) {
    output.mixed.statusOnlyChanged += 1;
    output.mixed.statusOnlyRows.push(row);
  }
}
assert.strictEqual(output.mixed.total, 300);
assert.strictEqual(output.rotationOnly.total, 60);
assert.strictEqual(output.mixed.membershipChanged, previous.rotationImpact.mixedMembershipChangedWhenOmitted);
assert.strictEqual(output.mixed.statusChanged, previous.rotationImpact.mixedStatusChangedWhenOmitted);
assert.strictEqual(output.lossCategories.A, 0, "Trusted non-rotation candidate disappeared");
assert.strictEqual(output.mixed.addedActive, 0, "Removing an answer created a new active muscle");
assert.strictEqual(output.mixed.accessibleNonRotationCandidateLoss, 0);

for (const answer of r2Answers) {
  const result = policyResult(answer);
  const row = output.fullR2;
  count(row.statuses, result.status);
  count(row.mainCount, result.main.length);
  count(row.additionalCount, result.additional.length);
  count(row.frontierCount, result.frontier.length);
  count(row.displayCount, result.visible.length);
  if (result.status === "ranked") count(row.uniqueTop1, result.frontier[0]);
  if (result.status === "tied") for (const id of result.frontier) count(row.tieMembership, id);
  const location = row.locations[answer.location] ||= { patterns: 0, statuses: {} };
  location.patterns += 1;
  count(location.statuses, result.status);
  for (const movement of answer.movements) {
    const movementRow = row.movements[movement] ||= { patterns: 0, statuses: {} };
    movementRow.patterns += 1;
    count(movementRow.statuses, result.status);
  }
  for (const id of muscleIds) {
    const stat = muscleStats[id];
    if (result.main.includes(id)) stat.r2Main += 1;
    if (result.additional.includes(id)) stat.r2Additional += 1;
    if (result.reference.includes(id) && !active(result).includes(id)) stat.r2ReferenceOnly += 1;
    if (result.reviewOnly.includes(id)) stat.r2ReviewOnly += 1;
    if (result.status === "ranked" && result.frontier.includes(id)) stat.r2Ranked += 1;
    if (result.status === "tied" && result.frontier.includes(id)) stat.r2Tied += 1;
  }
  const inv = output.invariants;
  const expected = JSON.stringify(result);
  const mirrorSide = answer.side === "right" ? "left" : "right";
  if (JSON.stringify(policyResult({ ...answer, side: mirrorSide })) !== expected) inv.mirrorMismatch += 1;
  for (const order of model.permutations(answer.movements))
    if (JSON.stringify(policyResult({ ...answer, movements: order })) !== expected) inv.movementOrderMismatch += 1;
  if (JSON.stringify(policyResult(answer, true)) !== expected) {
    inv.definitionOrderMismatch += 1;
    if (result.status === "ranked") inv.sourceOrderOnlyTop1 += 1;
  }
  if (!same(ids([...result.visible, ...result.collapsed]),
    ids([...result.main, ...result.additional, ...result.reference]))) inv.displayCandidateLoss += 1;
  for (const muscle of model.draft) {
    const vector = model.evidence(muscle, answer.location, answer.movements).vector;
    for (const axis of model.axes) {
      const expectedAxis = Math.max(0, ...answer.movements.filter((movement) => model.AXIS[movement] === axis)
        .map((movement) => {
          const grade = muscle.movement[model.movementIndex[movement]];
          return grade === "P" ? 2 : grade === "H" ? 1 : 0;
        }));
      if (vector[axis] !== expectedAxis) inv.sameAxisDoubleCount += 1;
    }
  }
}
for (const field of ["statuses", "mainCount", "additionalCount", "frontierCount", "displayCount",
  "uniqueTop1", "tieMembership"]) {
  const previousField = field === "displayCount" ? "displayedCount" : field;
  assert(same(output.fullR2[field], previous.r2.P2[previousField]), `Frozen R2 mismatch: ${field}`);
}
assert(Object.values(output.invariants).every((value) => value === 0));

const oldBenchmarks = JSON.parse(fs.readFileSync(path.join(root,
  "docs/audits/knee-precision-v1-design-audit-2026-10-03.json"), "utf8")).proposal.benchmarks;
const oldById = new Map(oldBenchmarks.map((item) => [item.id, item]));
for (const item of previous.benchmark.retained) {
  const result = policyResult(item.answers);
  const old = oldById.get(item.id).results.C_guard_strict;
  const changed = fields.filter((field) => !same(result[field], old[field]));
  if (changed.length) output.benchmarks.unexpectedMembershipChanges.push({ id: item.id, changed });
  assert.strictEqual(result.status, old.status, `Retained benchmark status changed: ${item.id}`);
  output.benchmarks.retained.push({ id: item.id, answer: item.answers, result: select(result) });
}
output.benchmarks.unreachable = previous.benchmark.unreachable;
for (const item of previous.benchmark.replacement) {
  const result = policyResult(item.answers);
  for (const field of ["status", ...fields])
    assert(same(result[field], item.final[field]), `Replacement benchmark changed: ${item.id} ${field}`);
  output.benchmarks.replacements.push({ id: item.id, answer: item.answers, result: select(result) });
}
assert.strictEqual(output.benchmarks.retained.length, 19);
assert.strictEqual(output.benchmarks.unreachable.length, 9);
assert.strictEqual(output.benchmarks.replacements.length, 8);
assert.strictEqual(output.benchmarks.unexpectedMembershipChanges.length, 0);

const outputPath = path.join(root, "docs/audits/knee-precision-v1-rotation-final-review-2026-10-03.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, mixed: { total: output.mixed.total,
  membershipChanged: output.mixed.membershipChanged, activeChanged: output.mixed.activeChanged,
  statusChanged: output.mixed.statusChanged, statusOnlyChanged: output.mixed.statusOnlyChanged,
  lostActive: output.mixed.lostActive, addedActive: output.mixed.addedActive,
  statusTransitions: output.mixed.statusTransitions,
  frontierLostByMuscle: output.mixed.frontierLostByMuscle,
  visibleLostByMuscle: output.mixed.visibleLostByMuscle,
  defaultVisibleToCollapsed: output.mixed.defaultVisibleToCollapsed,
  accessibleNonRotationCandidateLoss: output.mixed.accessibleNonRotationCandidateLoss },
  rotationOnly: { total: output.rotationOnly.total, withActiveCandidate: output.rotationOnly.withActiveCandidate },
  lossCategories: output.lossCategories, muscles: output.muscles,
  r2: output.fullR2.statuses, invariants: output.invariants }, null, 2));
