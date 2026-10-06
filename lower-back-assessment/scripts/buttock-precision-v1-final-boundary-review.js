"use strict";

// Design-only boundary review. Reads frozen Phase A-C artifacts; no runtime import or writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { combinations, incrementMap, mapEntriesByCount } = require("./body-check-audit-utils");

const root = path.resolve(__dirname, "..");
const audit = JSON.parse(fs.readFileSync(path.join(root, "docs/audits/buttock-current-audit-2026-10-03.json"), "utf8"));
const phaseC = JSON.parse(fs.readFileSync(path.join(root, "docs/audits/buttock-precision-v1-policy-simulation-2026-10-03.json"), "utf8"));
assert.equal(audit.reachable, 390037536);
assert.equal(audit.actualCalculateCalls, 106407);
assert.equal(phaseC.grid.allReachable, 672);
assert.equal(phaseC.recommendedUiSubset.reachable, 240);
assert.equal(phaseC.benchmarks.length, 24);

const HIP = require(path.join(root, "hip-candidate-precision-v1.js"));
const LOWBACK = require(path.join(root, "lowback-candidate-precision-v1.js"));
const LOCATION = ["buttock_upper_outer", "buttock_center", "buttock_lower", "location_unclear"];
const SIDE = ["right", "left", "both", "center"];
const FINAL_MOVEMENTS = ["stand_up", "leg_back", "leg_side", "knee_bend"];
const ALL_MOVEMENTS = ["stand_up", "stairs_up", "leg_back", "single_leg", "leg_side", "knee_bend"];
const ALIAS = { stairs_up: "stand_up", single_leg: "leg_side" };
const AXIS = { stand_up: "extension", stairs_up: "extension", leg_back: "extension",
  single_leg: "lateral", leg_side: "lateral", knee_bend: "knee" };
const MASTER = [
  { id: "buttock_gluteus_maximus", name: "大臀筋", location: "HPH", movement: "PPHN", confidence: "REVIEW_LOCATION" },
  { id: "buttock_gluteus_medius", name: "中臀筋", location: "PHN", movement: "HTPN", confidence: "REVIEW_LOCATION" },
  { id: "buttock_gluteus_minimus", name: "小臀筋", location: "PHN", movement: "HTPN", confidence: "REVIEW_LOCATION" },
  { id: "buttock_piriformis", name: "梨状筋", location: "NPN", movement: "NNTN", confidence: "REFERENCE_ONLY" },
  { id: "buttock_hamstrings", name: "ハムストリングス", location: "NNP", movement: "HPNP", confidence: "REVIEW_PROXIMAL_BOUNDARY" }
];
const PRIOR_NAMES = new Set(audit.master.map((item) => item.name));
for (const muscle of MASTER) {
  assert(PRIOR_NAMES.has(muscle.name), `New guessed muscle: ${muscle.name}`);
  assert.equal(muscle.location.length, 3);
  assert.equal(muscle.movement.length, FINAL_MOVEMENTS.length);
  assert(!/[^PHNT]/.test(muscle.location + muscle.movement));
}
const byName = Object.fromEntries(MASTER.map((item) => [item.name, item]));
const byId = Object.fromEntries(MASTER.map((item) => [item.id, item]));
assert.equal(byName["中臀筋"].location, byName["小臀筋"].location);
assert.equal(byName["中臀筋"].movement, byName["小臀筋"].movement);
assert.equal(byName["梨状筋"].movement.replace(/T/g, "N"), "NNNN");

// Cross-part movement meaning: hip extension/abduction is the comparable joint action.
const hipByName = Object.fromEntries(HIP.MASTER.map((item) => [item.name, item]));
const hipMovement = (name, id) => hipByName[name].movement[HIP.MOVEMENTS.findIndex(([key]) => key === id)];
const finalMovement = (name, id) => byName[name].movement[FINAL_MOVEMENTS.indexOf(id)];
const crossPart = ["大臀筋", "中臀筋", "小臀筋"].map((name) => ({
  name, hipExtend: hipMovement(name, "extend"), buttockLegBack: finalMovement(name, "leg_back"),
  hipAbduct: hipMovement(name, "abduct"), buttockLegSide: finalMovement(name, "leg_side")
}));
assert.deepEqual(crossPart.map((row) => [row.hipExtend, row.buttockLegBack, row.hipAbduct, row.buttockLegSide]),
  [["P", "P", "H", "H"], ["T", "T", "P", "P"], ["T", "T", "P", "P"]]);
const lowbackNameOverlap = LOWBACK.MASTER.filter((item) => PRIOR_NAMES.has(item.name)).map((item) => item.name);
assert.deepEqual(lowbackNameOverlap, []);
assert(!LOWBACK.MOVEMENTS.some(([id]) => id === "leg_back" || id === "leg_side" || id === "knee_bend"));

const strength = (grade) => grade === "P" ? 2 : grade === "H" ? 1 : 0;
const idList = (items) => items.map((item) => item.id).sort();
const dominates = (left, right) => Object.keys(left).every((axis) => left[axis] >= right[axis]) &&
  Object.keys(left).some((axis) => left[axis] > right[axis]);
const equalVector = (left, right) => Object.keys(left).every((axis) => left[axis] === right[axis]);
const incomparable = (left, right) => !dominates(left, right) && !dominates(right, left) && !equalVector(left, right);
const frontier = (items) => items.filter((item) => !items.some((other) => other !== item &&
  dominates(other.vector, item.vector)));
function evidence(muscle, input, options = {}) {
  const location = input.location === "buttock_lower" && muscle.id === "buttock_hamstrings" &&
    options.lowerIschial === false ? "N" : input.location === "location_unclear" ? "?" :
    muscle.location[LOCATION.indexOf(input.location)];
  const vector = { extension: 0, lateral: 0, knee: 0 };
  const trustedMovements = [], weakMovements = [], reviewMovements = [];
  for (const raw of input.movements) {
    if (raw === "movement_unclear") continue;
    const movement = ALIAS[raw] || raw;
    const relation = muscle.movement[FINAL_MOVEMENTS.indexOf(movement)];
    if (relation === "P") trustedMovements.push(raw);
    if (relation === "H") weakMovements.push(raw);
    if (relation === "T") reviewMovements.push(raw);
    vector[AXIS[raw]] = Math.max(vector[AXIS[raw]], strength(relation));
  }
  const trusted = Object.values(vector).some((value) => value === 2);
  const active = Object.values(vector).some(Boolean);
  return { id: muscle.id, name: muscle.name, location, vector,
    trusted, active, trustedMovements, weakMovements, reviewMovements };
}

let policyCalls = 0;
function evaluate(input, policy, options = {}) {
  policyCalls += 1;
  const hasInput = input.location !== "location_unclear" &&
    input.movements.length > 0 && !input.movements.includes("movement_unclear");
  const orderedMaster = options.reverseMaster ? [...MASTER].reverse() : MASTER;
  const values = orderedMaster.filter((item) =>
    (options.includeMinimus !== false || item.name !== "小臀筋") &&
    (options.piriformis !== "inactive" || item.name !== "梨状筋"))
    .map((muscle) => evidence(muscle, input, options));
  const main = hasInput ? values.filter((item) => item.location === "P" && item.active &&
    (!options.requireTrustedMain || item.trusted)) : [];
  const trustedMain = main.filter((item) => item.trusted);
  const additional = hasInput ? values.filter((item) => item.location !== "P" && item.trusted) : [];
  const related = hasInput ? values.filter((item) => item.active && !item.trusted &&
    (item.location !== "P" || options.requireTrustedMain)) : [];
  const reference = hasInput && options.piriformis !== "inactive" && options.piriformis !== "rankable"
    ? values.filter((item) => item.name === "梨状筋" && item.location === "P" && !item.active)
    : [];
  const reviewOnly = hasInput ? values.filter((item) => !item.active && item.reviewMovements.length &&
    item.location !== "N" && item.name !== "梨状筋") : [];
  const mainFront = policy === "A-main-priority" || policy === "B-axis-cap"
    ? trustedMain : frontier(trustedMain);
  const challenging = additional.filter((extra) => mainFront.length &&
    (policy !== "E-h-location-guard" || extra.location === "H") &&
    !mainFront.every((primary) => dominates(primary.vector, extra.vector)));
  const additionalDominatesAll = challenging.some((extra) => mainFront.every((primary) =>
    dominates(extra.vector, primary.vector)));
  const crossEquality = challenging.some((extra) => mainFront.some((primary) =>
    equalVector(extra.vector, primary.vector)));
  const crossIncomparable = challenging.some((extra) => mainFront.some((primary) =>
    incomparable(extra.vector, primary.vector)));
  let status = "insufficient", reason = "no_trusted_main", top = [];
  if (!hasInput) reason = input.location === "location_unclear" ? "location_unclear" : "movement_unclear";
  else if (mainFront.length) {
    top = mainFront;
    status = mainFront.length === 1 ? "ranked" : "tied";
    reason = status === "ranked" ? "unique_trusted_main" : "main_tie";
    if (["D-cross-group-guard", "E-h-location-guard"].includes(policy) && challenging.length) {
      if (additionalDominatesAll) {
        status = "insufficient";
        reason = "additional_dominates_main";
        top = [];
      } else {
        status = "tied";
        reason = crossIncomparable ? "cross_group_incomparable" : crossEquality ? "cross_group_equal" : "cross_group_review";
        top = [...mainFront, ...challenging];
      }
    }
  } else if (main.length && !trustedMain.length) reason = "weak_main_only";
  else if (additional.length) reason = "additional_without_main";
  else if (reviewOnly.length) reason = "review_only";
  else if (reference.length) reason = "reference_only";
  const display = [...main, ...additional, ...related, ...reviewOnly, ...reference];
  const displayIds = new Set(display.map((item) => item.id));
  assert(top.every((item) => displayIds.has(item.id)));
  return {
    status, reason, top: idList(top), main: idList(main), trustedMain: idList(trustedMain),
    additional: idList(additional), related: idList(related), reviewOnly: idList(reviewOnly),
    reference: idList(reference), mainFrontier: idList(mainFront),
    frontier: idList([...mainFront, ...challenging]), display: idList(display),
    displayCount: displayIds.size, weakOnlyUniqueUnprotected: main.length === 1 && trustedMain.length === 0,
    crossEquality, crossIncomparable, additionalDominatesAll,
    challengingAdditional: idList(challenging)
  };
}

const policies = ["A-main-priority", "B-axis-cap", "C-main-pareto", "D-cross-group-guard",
  "E-h-location-guard"];
const finalSets = [...combinations(FINAL_MOVEMENTS, 1, 3), ["movement_unclear"]];
const boundarySets = [...combinations(ALL_MOVEMENTS, 1, 3), ["movement_unclear"]];
const totals = () => ({ status: { ranked: 0, tied: 0, insufficient: 0 },
  referenceDisplayed: 0, mainNoAdditional: 0, mainAndAdditional: 0, noMainAdditional: 0,
  weakOnlyUniqueUnprotected: 0, crossEqual: 0, crossIncomparable: 0,
  additionalDominatesAll: 0, uniqueMainChallenged: 0, displayCount: new Map(),
  main: new Map(), additional: new Map(), related: new Map(), reference: new Map(),
  unique: new Map(), tie: new Map(), reasons: new Map() });
function countResult(stats, value) {
  stats.status[value.status] += 1;
  if (value.reference.length) stats.referenceDisplayed += 1;
  if (value.main.length && !value.additional.length) stats.mainNoAdditional += 1;
  if (value.main.length && value.additional.length) stats.mainAndAdditional += 1;
  if (!value.main.length && value.additional.length) stats.noMainAdditional += 1;
  if (value.weakOnlyUniqueUnprotected) stats.weakOnlyUniqueUnprotected += 1;
  if (value.crossEquality) stats.crossEqual += 1;
  if (value.crossIncomparable) stats.crossIncomparable += 1;
  if (value.additionalDominatesAll) stats.additionalDominatesAll += 1;
  if (value.mainFrontier.length === 1 && value.challengingAdditional.length) stats.uniqueMainChallenged += 1;
  incrementMap(stats.displayCount, value.displayCount);
  incrementMap(stats.reasons, value.reason);
  for (const [field, list] of [["main", value.main], ["additional", value.additional],
    ["related", value.related], ["reference", value.reference]]) {
    for (const id of list) incrementMap(stats[field], id);
  }
  if (value.status === "ranked") for (const id of value.top) incrementMap(stats.unique, id);
  if (value.status === "tied") for (const id of value.top) incrementMap(stats.tie, id);
}
const finalStats = Object.fromEntries(policies.map((policy) => [policy, totals()]));
const boundaryStats = Object.fromEntries(policies.map((policy) => [policy, totals()]));
const finalCases = [], boundaryCases = [];
for (const [sets, store, stats] of [[finalSets, finalCases, finalStats], [boundarySets, boundaryCases, boundaryStats]]) {
  for (const location of LOCATION) for (const side of SIDE) for (const movements of sets) {
    const input = { location, side, movements };
    const results = Object.fromEntries(policies.map((policy) => [policy, evaluate(input, policy)]));
    for (const policy of policies) countResult(stats[policy], results[policy]);
    store.push({ input, results });
  }
}
assert.equal(finalCases.length, 240);
assert.equal(boundaryCases.length, 672);

const medius = "buttock_gluteus_medius", minimus = "buttock_gluteus_minimus", piriformis = "buttock_piriformis";
const glutePair = { mediusOnlyMain: 0, minimusOnlyMain: 0, mediusOnlyAdditional: 0,
  minimusOnlyAdditional: 0, bothMain: 0, bothAdditional: 0,
  bothTopTied: 0, sourceOrderUniqueIfForced: 0, m2UniqueMedius: 0 };
const pir = { p0RankableActive: 0, p0Unique: 0, p0Main: 0, p1InactiveVisible: 0,
  p2ReferenceVisible: 0, reviewEvidenceOnly: 0, locationEligibleCenter: 0 };
const ham = { lowerMain: 0, lowerTrustedMain: 0, lowerWeakMain: 0,
  nonLowerTrustedAdditional: 0, nonLowerWeakRelated: 0, lowerKneeBendTrusted: 0,
  lowerLegBackTrusted: 0 };
const finalPolicy = "D-cross-group-guard";
for (const { input, results } of finalCases) {
  const value = results[finalPolicy];
  const m = value.main.includes(medius), n = value.main.includes(minimus);
  const am = value.additional.includes(medius), an = value.additional.includes(minimus);
  if (m && n) glutePair.bothMain += 1;
  if (am && an) glutePair.bothAdditional += 1;
  if (m && !n) glutePair.mediusOnlyMain += 1;
  if (n && !m) glutePair.minimusOnlyMain += 1;
  if (am && !an) glutePair.mediusOnlyAdditional += 1;
  if (an && !am) glutePair.minimusOnlyAdditional += 1;
  if (value.status === "tied" && value.top.includes(medius) && value.top.includes(minimus)) {
    glutePair.bothTopTied += 1;
    glutePair.sourceOrderUniqueIfForced += 1;
  }
  const m2 = evaluate(input, finalPolicy, { includeMinimus: false });
  if (m2.status === "ranked" && m2.top.includes(medius) && value.status !== "ranked") glutePair.m2UniqueMedius += 1;
  const p0 = evaluate(input, finalPolicy, { piriformis: "rankable" });
  const p1 = evaluate(input, finalPolicy, { piriformis: "inactive" });
  if (p0.main.includes(piriformis) || p0.additional.includes(piriformis)) pir.p0RankableActive += 1;
  if (p0.main.includes(piriformis)) pir.p0Main += 1;
  if (p0.status === "ranked" && p0.top.includes(piriformis)) pir.p0Unique += 1;
  if (p1.display.includes(piriformis)) pir.p1InactiveVisible += 1;
  if (value.reference.includes(piriformis)) pir.p2ReferenceVisible += 1;
  if (input.location === "buttock_center") pir.locationEligibleCenter += 1;
  if (input.movements.includes("leg_side") && input.location === "buttock_center") pir.reviewEvidenceOnly += 1;
  const hamId = "buttock_hamstrings";
  if (input.location === "buttock_lower") {
    if (value.main.includes(hamId)) ham.lowerMain += 1;
    if (value.trustedMain.includes(hamId)) ham.lowerTrustedMain += 1;
    if (value.main.includes(hamId) && !value.trustedMain.includes(hamId)) ham.lowerWeakMain += 1;
    if (value.trustedMain.includes(hamId) && input.movements.includes("knee_bend")) ham.lowerKneeBendTrusted += 1;
    if (value.trustedMain.includes(hamId) && input.movements.includes("leg_back")) ham.lowerLegBackTrusted += 1;
  } else {
    if (value.additional.includes(hamId)) ham.nonLowerTrustedAdditional += 1;
    if (value.related.includes(hamId)) ham.nonLowerWeakRelated += 1;
  }
}
assert.equal(glutePair.mediusOnlyMain + glutePair.minimusOnlyMain +
  glutePair.mediusOnlyAdditional + glutePair.minimusOnlyAdditional, 0);
assert.equal(pir.p0Unique + pir.p0Main + pir.p0RankableActive + pir.p1InactiveVisible, 0);

const hardExclusions = Object.entries(audit.hardExclusion)
  .filter(([location]) => location !== "location_unclear")
  .flatMap(([location, value]) => value.primaryExcluded.map((name) => ({
    location, muscle: name, category: "C_REVIEW", finalTreatment: "No location-only hard exclusion"
  })));
assert.equal(hardExclusions.length, 8);
const finalist = finalCases.map(({ input, results }) => ({ ...input, ...results[finalPolicy] }));
const crossGroupBoundary = {
  uniqueMainChallengedByLocation: { H: 0, N: 0 },
  allChallengedByLocation: { H: 0, N: 0 },
  additionalDominatesMainByLocation: { H: 0, N: 0 },
  challengeLocationCombination: { H_only: 0, N_only: 0, both: 0 },
  uniqueMainChallengeLocationCombination: { H_only: 0, N_only: 0, both: 0 },
  examples: { H: null, N: null }
};
for (const { input, results } of finalCases) {
  const value = results[finalPolicy];
  const locations = new Set(value.challengingAdditional.map((id) => evidence(byId[id], input).location));
  const combination = locations.has("H") && locations.has("N") ? "both" :
    locations.has("H") ? "H_only" : locations.has("N") ? "N_only" : null;
  if (combination) {
    crossGroupBoundary.challengeLocationCombination[combination] += 1;
    if (value.mainFrontier.length === 1) {
      crossGroupBoundary.uniqueMainChallengeLocationCombination[combination] += 1;
    }
  }
  for (const grade of ["H", "N"]) {
    if (!locations.has(grade)) continue;
    crossGroupBoundary.allChallengedByLocation[grade] += 1;
    if (value.mainFrontier.length === 1) crossGroupBoundary.uniqueMainChallengedByLocation[grade] += 1;
    if (value.additionalDominatesAll) crossGroupBoundary.additionalDominatesMainByLocation[grade] += 1;
    crossGroupBoundary.examples[grade] ||= { input, reason: value.reason,
      mainFrontier: value.mainFrontier, challengingAdditional: value.challengingAdditional };
  }
}
const lookup = (input) => {
  const key = [...input.movements].sort().join("|");
  const item = boundaryCases.find(({ input: actual }) => actual.location === input.location &&
    actual.side === input.side && [...actual.movements].sort().join("|") === key);
  assert(item, `Missing benchmark input: ${JSON.stringify(input)}`);
  return item.results[finalPolicy];
};
const benchmarks = phaseC.benchmarks.map((item) => ({ id: item.id, purpose: item.purpose,
  input: item.input, finalUiReachable: item.input.movements.every((id) =>
    id === "movement_unclear" || FINAL_MOVEMENTS.includes(id)),
  proposedResult: lookup(item.input), acceptableCandidates: "HUMAN_REVIEW_REQUIRED" }));
assert.equal(benchmarks.length, 24);
const crossPartBenchmarks = [
  { id: "BUT-X01", purpose: "Buttock leg-back and hip extend refer to hip extension, not lumbar extension",
    buttock: lookup({ location: "buttock_center", side: "right", movements: ["leg_back"] }),
    hip: HIP.rank({ location: "hip_back", side: "right", movements: ["extend"] }),
    lowback: LOWBACK.rank({ location: "lowback_pelvis_top", side: "right", movements: ["extend_back"] }) },
  { id: "BUT-X02", purpose: "Buttock leg-side and hip abduct: max not trusted; medius/minimus trusted",
    buttock: lookup({ location: "buttock_upper_outer", side: "left", movements: ["leg_side"] }),
    hip: HIP.rank({ location: "hip_outer", side: "left", movements: ["abduct"] }) }
].map((item) => ({ ...item,
  hip: { main: item.hip.main, additional: item.hip.additional, status: item.hip.status },
  ...(item.lowback ? { lowback: { main: item.lowback.main, status: item.lowback.status } } : {}) }));

let mirrorMismatch = 0, movementOrderMismatch = 0, definitionOrderMismatch = 0;
let sameAxisDoubleCount = 0, displayCandidateLoss = 0, sourceOrderOnlyTop1 = 0;
const permutations = (ids) => ids.length < 2 ? [ids] : ids.flatMap((id, at) =>
  permutations(ids.filter((_, index) => index !== at)).map((rest) => [id, ...rest]));
for (const { input, results } of boundaryCases) for (const policy of policies) {
  const expected = JSON.stringify(results[policy]);
  if (expected !== JSON.stringify(evaluate({ ...input, side: "right" }, policy))) mirrorMismatch += 1;
  if (expected !== JSON.stringify(evaluate(input, policy, { reverseMaster: true }))) definitionOrderMismatch += 1;
  for (const movements of permutations(input.movements)) {
    if (expected !== JSON.stringify(evaluate({ ...input, movements }, policy))) movementOrderMismatch += 1;
  }
  if (results[policy].top.some((id) => !results[policy].display.includes(id))) displayCandidateLoss += 1;
  if (results[policy].status === "ranked") {
    const top = results[policy].top[0];
    if (results[policy].top.length !== 1 || results[policy].trustedMain.some((id) => id !== top &&
      equalVector(evidence(byId[id], input).vector, evidence(byId[top], input).vector))) {
      sourceOrderOnlyTop1 += 1;
    }
  }
  for (const muscle of MASTER) {
    const full = evidence(muscle, input).vector;
    for (const axis of ["extension", "lateral", "knee"]) {
      const largest = Math.max(0, ...input.movements.filter((id) => AXIS[id] === axis)
        .map((id) => evidence(muscle, { ...input, movements: [id] }).vector[axis]));
      if (full[axis] !== largest) sameAxisDoubleCount += 1;
    }
  }
}
assert.equal(mirrorMismatch + movementOrderMismatch + definitionOrderMismatch +
  sameAxisDoubleCount + displayCandidateLoss + sourceOrderOnlyTop1, 0);

const normalizeTotals = (stat) => ({ ...stat,
  displayCount: mapEntriesByCount(stat.displayCount), reasons: mapEntriesByCount(stat.reasons),
  main: mapEntriesByCount(stat.main), additional: mapEntriesByCount(stat.additional),
  related: mapEntriesByCount(stat.related), reference: mapEntriesByCount(stat.reference),
  unique: mapEntriesByCount(stat.unique), tie: mapEntriesByCount(stat.tie) });
const result = {
  status: "UNSHIPPED_BOUNDARY_HUMAN_REVIEW_REQUIRED",
  frozenInputs: { phaseAReachable: audit.reachable, phaseACalculateCalls: audit.actualCalculateCalls,
    phaseCGrid: phaseC.grid.allReachable, phaseCRecommended: phaseC.recommendedUiSubset.reachable,
    phaseCBenchmark: phaseC.benchmarks.length },
  model: { locations: LOCATION, sides: SIDE, finalMovements: FINAL_MOVEMENTS, exploratoryAliases: ALIAS,
    master: MASTER, policyDefinitions: {
      "A-main-priority": "Main trusted membership priority, Additional retained in display",
      "B-axis-cap": "A with max-per-axis evidence vector; no summed movement points",
      "C-main-pareto": "B plus Pareto frontier inside trusted Main",
      "D-cross-group-guard": "C plus suppression of ranked when trusted Additional challenges Main; never remove Main membership",
      "E-h-location-guard": "Sensitivity only: D with cross-group challengers restricted to H location"
    } },
  crossPart, lowbackNameOverlap, hardExclusions,
  grids: { finalUi: { reachable: finalCases.length,
    policy: Object.fromEntries(policies.map((p) => [p, normalizeTotals(finalStats[p])])) },
  exploratory: { reachable: boundaryCases.length,
    policy: Object.fromEntries(policies.map((p) => [p, normalizeTotals(boundaryStats[p])])) } },
  pair: glutePair, piriformis: pir, hamstrings: ham, crossGroupBoundary,
  invariants: { mirrorMismatch, movementOrderMismatch, definitionOrderMismatch,
    sourceOrderOnlyTop1, sameAxisDoubleCount, displayCandidateLoss },
  actualPolicyCalls: policyCalls,
  benchmarks, crossPartBenchmarks,
  examples: finalist.filter((item) => ["additional_dominates_main", "cross_group_equal", "cross_group_incomparable",
    "weak_main_only", "additional_without_main"].includes(item.reason)).slice(0, 50)
};
const outputPath = path.join(root, "docs/audits/buttock-precision-v1-final-boundary-review-2026-10-03.json");
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, finalUiReachable: result.grids.finalUi.reachable, pair: glutePair,
  piriformis: pir, hamstrings: ham, invariants: result.invariants,
  actualPolicyCalls: policyCalls }, null, 2));

// Human-approved design is a separate artifact; the preceding comparison remains frozen.
const previousHumanOptions = { piriformis: "inactive" };
const humanOptions = { ...previousHumanOptions, requireTrustedMain: true };
const humanStartCalls = policyCalls;
const previousHumanFinalCases = finalCases.map(({ input }) => ({
  input, result: evaluate(input, finalPolicy, previousHumanOptions)
}));
const previousHumanBoundaryCases = boundaryCases.map(({ input }) => ({
  input, result: evaluate(input, finalPolicy, previousHumanOptions)
}));
const humanFinalCases = finalCases.map(({ input }) => ({ input, result: evaluate(input, finalPolicy, humanOptions) }));
const humanBoundaryCases = boundaryCases.map(({ input }) => ({ input, result: evaluate(input, finalPolicy, humanOptions) }));
const qualificationFields = ["status", "reason", "main", "additional", "related", "frontier", "display"];
const qualificationChanges = (before, after) => before.flatMap((item, index) => {
  const changedFields = qualificationFields.filter((field) =>
    JSON.stringify(item.result[field]) !== JSON.stringify(after[index].result[field]));
  return changedFields.length ? [{ input: item.input, changedFields,
    before: Object.fromEntries(changedFields.map((field) => [field, item.result[field]])),
    after: Object.fromEntries(changedFields.map((field) => [field, after[index].result[field]])) }] : [];
});
const changedFinalCases = qualificationChanges(previousHumanFinalCases, humanFinalCases);
const changedBoundaryCases = qualificationChanges(previousHumanBoundaryCases, humanBoundaryCases);
const candidateLoss = previousHumanFinalCases.reduce((total, item, index) => total +
  item.result.display.filter((id) => !humanFinalCases[index].result.display.includes(id)).length, 0);
const weakQualification = { main: 0, additional: 0, uniqueRanked: 0, guard: 0 };
for (const { input, result: value } of humanFinalCases) {
  const evidenceById = Object.fromEntries(MASTER.map((muscle) => [muscle.id, evidence(muscle, input)]));
  weakQualification.main += value.main.filter((id) => !evidenceById[id].trusted).length;
  weakQualification.additional += value.additional.filter((id) => !evidenceById[id].trusted).length;
  if (value.status === "ranked" && value.top.some((id) => !evidenceById[id].trusted)) {
    weakQualification.uniqueRanked += 1;
  }
  weakQualification.guard += value.challengingAdditional.filter((id) => !evidenceById[id].trusted).length;
}
assert.deepEqual(weakQualification, { main: 0, additional: 0, uniqueRanked: 0, guard: 0 });
assert.equal(candidateLoss, 0);
const humanFinalTotals = totals(), humanBoundaryTotals = totals();
for (const item of humanFinalCases) countResult(humanFinalTotals, item.result);
for (const item of humanBoundaryCases) countResult(humanBoundaryTotals, item.result);
assert.deepEqual(humanFinalTotals.status, { ranked: 16, tied: 84, insufficient: 140 });
assert.equal(humanFinalTotals.referenceDisplayed, 0);
assert.equal(humanBoundaryTotals.referenceDisplayed, 0);

const humanPair = { oneMain: 0, oneAdditional: 0, bothMain: 0, bothAdditional: 0, bothTopTied: 0 };
const hamQualification = { finalMain: 0, finalAdditional: 0, broadLowerMainToAdditional: 0,
  broadLowerMainToRelated: 0, trustedCandidateLoss: 0, displayCandidateLoss: 0,
  finalGridMainToAdditional: 0 };
const humanPir = { stableIdRetainedInDesign: MASTER.some((item) => item.id === piriformis),
  ranked: 0, main: 0, additional: 0, locationOnlyReference: 0, displayed: 0 };
const humanCrossGuard = { challengedCases: 0, challengedByHOnly: 0, challengedByNOnly: 0,
  challengedByBoth: 0, weakOrReviewChallenger: 0 };
const hamId = "buttock_hamstrings";
for (const [index, { input, result: value }] of humanFinalCases.entries()) {
  const previous = finalCases[index].results[finalPolicy];
  assert.equal(value.status, previous.status);
  for (const key of ["top", "additional", "reviewOnly", "mainFrontier", "frontier",
    "challengingAdditional"]) {
    assert.deepEqual(value[key], previous[key], `${key}: ${JSON.stringify(input)}`);
  }
  assert.deepEqual(value.display, previous.display.filter((id) => id !== piriformis));
  if (value.main.includes(medius) !== value.main.includes(minimus)) humanPair.oneMain += 1;
  if (value.additional.includes(medius) !== value.additional.includes(minimus)) humanPair.oneAdditional += 1;
  if (value.main.includes(medius) && value.main.includes(minimus)) humanPair.bothMain += 1;
  if (value.additional.includes(medius) && value.additional.includes(minimus)) humanPair.bothAdditional += 1;
  if (value.status === "tied" && value.top.includes(medius) && value.top.includes(minimus)) {
    humanPair.bothTopTied += 1;
  }
  if (value.top.includes(piriformis)) humanPir.ranked += 1;
  if (value.main.includes(piriformis)) humanPir.main += 1;
  if (value.additional.includes(piriformis)) humanPir.additional += 1;
  if (value.reference.includes(piriformis)) humanPir.locationOnlyReference += 1;
  if (value.display.includes(piriformis)) humanPir.displayed += 1;
  if (value.main.includes(hamId)) hamQualification.finalMain += 1;
  if (value.additional.includes(hamId)) hamQualification.finalAdditional += 1;
  if (previous.main.includes(hamId) && value.additional.includes(hamId)) {
    hamQualification.finalGridMainToAdditional += 1;
  }
  if (input.location === "buttock_lower") {
    const broadLower = evaluate(input, finalPolicy, { ...humanOptions, lowerIschial: false });
    if (value.main.includes(hamId) && broadLower.additional.includes(hamId)) {
      hamQualification.broadLowerMainToAdditional += 1;
    }
    if (value.main.includes(hamId) && broadLower.related.includes(hamId)) {
      hamQualification.broadLowerMainToRelated += 1;
    }
    for (const id of [...value.trustedMain, ...value.additional]) {
      if (![...broadLower.trustedMain, ...broadLower.additional].includes(id)) {
        hamQualification.trustedCandidateLoss += 1;
      }
    }
    for (const id of value.display) {
      if (!broadLower.display.includes(id)) hamQualification.displayCandidateLoss += 1;
    }
  }
  if (value.challengingAdditional.length) {
    humanCrossGuard.challengedCases += 1;
    const grades = new Set(value.challengingAdditional.map((id) => evidence(byId[id], input).location));
    if (grades.has("H") && grades.has("N")) humanCrossGuard.challengedByBoth += 1;
    else if (grades.has("H")) humanCrossGuard.challengedByHOnly += 1;
    else if (grades.has("N")) humanCrossGuard.challengedByNOnly += 1;
    for (const id of value.challengingAdditional) {
      if (!evidence(byId[id], input).trusted || !value.additional.includes(id)) {
        humanCrossGuard.weakOrReviewChallenger += 1;
      }
    }
  }
}
assert.deepEqual(humanPair, { oneMain: 0, oneAdditional: 0, bothMain: 28,
  bothAdditional: 56, bothTopTied: 60 });
assert.deepEqual(humanPir, { stableIdRetainedInDesign: true, ranked: 0, main: 0,
  additional: 0, locationOnlyReference: 0, displayed: 0 });
assert.deepEqual(hamQualification, { finalMain: 44, finalAdditional: 88,
  broadLowerMainToAdditional: 44, broadLowerMainToRelated: 0,
  trustedCandidateLoss: 0, displayCandidateLoss: 0, finalGridMainToAdditional: 0 });
assert.deepEqual(humanCrossGuard, { challengedCases: 96, challengedByHOnly: 28,
  challengedByNOnly: 28, challengedByBoth: 40, weakOrReviewChallenger: 0 });

const humanBenchmarkLookup = (input) => {
  const key = [...input.movements].sort().join("|");
  const item = humanBoundaryCases.find(({ input: actual }) => actual.location === input.location &&
    actual.side === input.side && [...actual.movements].sort().join("|") === key);
  assert(item);
  return item.result;
};
const humanBenchmarks = benchmarks.map((item) => {
  const actual = humanBenchmarkLookup(item.input);
  for (const key of ["status", "top", "additional", "frontier"]) {
    assert.deepEqual(actual[key], item.proposedResult[key], `${item.id}: ${key}`);
  }
  assert.deepEqual(actual.display, item.proposedResult.display.filter((id) => id !== piriformis));
  assert.equal(actual.reference.length, 0);
  return { id: item.id, purpose: item.purpose, input: item.input,
    finalUiReachable: item.finalUiReachable, result: actual,
    structuralCheck: "PASS", medicalCorrectness: "NOT_ESTABLISHED_BY_SIMULATION" };
});
assert.equal(humanBenchmarks.length, 24);
assert.deepEqual(humanBenchmarks.find((item) => item.id === "BUT-002").result.top, [medius, minimus]);
assert(humanBenchmarks.find((item) => item.id === "BUT-013").result.main.includes(hamId));
assert(humanBenchmarks.find((item) => item.id === "BUT-011").result.additional.includes(hamId));
assert.equal(humanBenchmarks.find((item) => item.id === "BUT-019").result.status, "insufficient");

const humanInvariants = { mirrorMismatch: 0, movementOrderMismatch: 0,
  definitionOrderMismatch: 0, sourceOrderOnlyTop1: 0, sameAxisDoubleCount: 0,
  displayCandidateLoss: 0 };
for (const { input, result: expectedResult } of humanBoundaryCases) {
  const expected = JSON.stringify(expectedResult);
  if (expected !== JSON.stringify(evaluate({ ...input, side: "right" }, finalPolicy, humanOptions))) {
    humanInvariants.mirrorMismatch += 1;
  }
  if (expected !== JSON.stringify(evaluate(input, finalPolicy,
    { ...humanOptions, reverseMaster: true }))) humanInvariants.definitionOrderMismatch += 1;
  for (const movements of permutations(input.movements)) {
    if (expected !== JSON.stringify(evaluate({ ...input, movements }, finalPolicy, humanOptions))) {
      humanInvariants.movementOrderMismatch += 1;
    }
  }
  if (expectedResult.top.some((id) => !expectedResult.display.includes(id))) {
    humanInvariants.displayCandidateLoss += 1;
  }
  if (expectedResult.status === "ranked") {
    const top = expectedResult.top[0];
    if (expectedResult.top.length !== 1 || expectedResult.trustedMain.some((id) => id !== top &&
      equalVector(evidence(byId[id], input).vector, evidence(byId[top], input).vector))) {
      humanInvariants.sourceOrderOnlyTop1 += 1;
    }
  }
  for (const muscle of MASTER.filter((item) => item.id !== piriformis)) {
    const full = evidence(muscle, input).vector;
    for (const axis of ["extension", "lateral", "knee"]) {
      const largest = Math.max(0, ...input.movements.filter((id) => AXIS[id] === axis)
        .map((id) => evidence(muscle, { ...input, movements: [id] }).vector[axis]));
      if (full[axis] !== largest) humanInvariants.sameAxisDoubleCount += 1;
    }
  }
}
assert(Object.values(humanInvariants).every((count) => count === 0));

const approvedMaster = MASTER.map((item) => ({ ...item,
  confidence: "HUMAN_POLICY_APPROVED_FOR_DESIGN",
  classification: item.id === piriformis ? "INACTIVE_IN_V1" : "KEEP" }));
const unresolvedCriticalReview = approvedMaster.filter((item) =>
  item.classification === "REVIEW_REQUIRED").length;
assert.equal(unresolvedCriticalReview, 0);
const humanOutput = {
  status: "UNSHIPPED_HUMAN_POLICY_DESIGN_PASS",
  runtimeChanged: false,
  master: approvedMaster,
  stableIdScope: "All five proposed IDs retained in design including inactive piriformis; legacy runtime has no stable IDs",
  questions: ["location", "side", "directional_movements", "result"],
  lowerLocation: { id: "buttock_lower",
    proposedLabel: "お尻の下（太ももの付け根・座ると当たる骨の近く）",
    mainEligibility: "ischial/proximal buttock only",
    broadLowerSensitivityIsFinalUiReachable: false },
  policy: finalPolicy,
  finalUi: { reachable: humanFinalCases.length, totals: normalizeTotals(humanFinalTotals),
    cases: humanFinalCases },
  exploratory: { reachable: humanBoundaryCases.length, totals: normalizeTotals(humanBoundaryTotals),
    cases: humanBoundaryCases },
  qualificationReview: { decisionDate: "2026-10-06", rule: "Main requires primary location and trusted active movement",
    weakQualification, candidateLoss, changedFinalCases, changedBoundaryCases },
  mediusMinimus: humanPair, piriformis: humanPir, hamstrings: hamQualification,
  crossGroupGuard: humanCrossGuard,
  benchmark: { count: humanBenchmarks.length, structuralPassed: humanBenchmarks.length,
    cases: humanBenchmarks },
  invariants: humanInvariants, actualPolicyCalls: policyCalls - humanStartCalls,
  unresolvedCriticalReview,
  crossPartConsistency: { hip: crossPart, lowbackNameOverlap }
};
const humanOutputPath = path.join(root, "docs/audits/buttock-precision-v1-final-human-review-2026-10-03.json");
fs.writeFileSync(humanOutputPath, `${JSON.stringify(humanOutput, null, 2)}\n`);
console.log(JSON.stringify({ humanOutputPath, status: humanOutput.finalUi.totals.status,
  changedFinalCases: changedFinalCases.length, changedBoundaryCases: changedBoundaryCases.length,
  weakQualification, candidateLoss,
  pair: humanPair, piriformis: humanPir, hamstrings: hamQualification,
  crossGroupGuard: humanCrossGuard, invariants: humanInvariants,
  benchmarkPassed: humanBenchmarks.length }, null, 2));
