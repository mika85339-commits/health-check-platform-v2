"use strict";

// Read-only legacy runtime audit and an independent, unshipped knee policy model.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "body-check-ui.js");
const source = fs.readFileSync(sourcePath, "utf8");
const outputPath = path.join(root, "docs", "audits", "knee-precision-v1-design-audit-2026-10-03.json");
const started = Date.now();
const PART = "knee";
const count = (map, key, weight = 1) => map.set(key, (map.get(key) || 0) + weight);
const sortedEntries = (map) => [...map].map(([key, value]) => ({ key, count: value }))
  .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
const signature = (values) => [...values].sort().join("|");
function choose(values, min, max) {
  const results = [];
  function visit(start, current) {
    if (current.length >= min) results.push([...current]);
    if (current.length === max) return;
    for (let i = start; i < values.length; i += 1) {
      current.push(values[i]);
      visit(i + 1, current);
      current.pop();
    }
  }
  visit(0, []);
  return results;
}
function extract(pattern, label) {
  const match = source.match(pattern);
  assert(match, `Legacy definition changed: ${label}`);
  return vm.runInNewContext(`(${match[1]})`);
}

const partOrder = extract(/const partOrder = (\[[^\n]+\]);/, "partOrder");
const parts = extract(/const parts = (\{[\s\S]*?\n  \});/, "parts");
const situationsByPart = extract(/const situationByPart = (\{[\s\S]*?\n  \});/, "situationByPart");
const locationsByPart = extract(/const painLocationByPart = (\{[\s\S]*?\n  \});/, "painLocationByPart");
const symptoms = extract(/const symptomOptions = (\[[\s\S]*?\n  \]);/, "symptomOptions");
const timing = extract(/const timingOptions = (\[[\s\S]*?\n  \]);/, "timingOptions");
const sides = extract(/const sideOptions = (\[[^\n]+\]);/, "sideOptions");
const spread = extract(/const spreadOptions = (\[[^\n]+\]);/, "spreadOptions");
const allRules = extract(/const muscleRules = (\[[\s\S]*?\n  \]);/, "muscleRules");
const visuals = extract(/const muscleVisuals = (\{[\s\S]*?\n  \});/, "muscleVisuals");
const rankableSymptoms = new Set(extract(/const RANKABLE_SYMPTOMS = new Set\((\[[^\n]+\])\);/, "RANKABLE_SYMPTOMS"));
const kneeRules = allRules.filter((rule) => rule.primary.includes(PART));
assert.strictEqual(kneeRules.length, 4);
const situationChoices = [...situationsByPart[PART], ["movement_unclear", "特定の動き・場面は分からない"]];
const locationChoices = [...locationsByPart[PART], ["location_unclear", "場所ははっきり分からない", []]];
const movementSets = [...choose(situationsByPart[PART].map(([id]) => id), 1, 3), ["movement_unclear"]];
const symptomSets = choose(symptoms.map(([id]) => id), 1, 3).filter((set) =>
  !(set.includes("no_change") && (set.includes("better_move") || set.includes("better_rest"))));
const symptomClasses = new Map();
for (const values of symptomSets) {
  const key = signature(values.filter((id) => rankableSymptoms.has(id)));
  if (!symptomClasses.has(key)) symptomClasses.set(key, { representative: values, weight: 0 });
  symptomClasses.get(key).weight += 1;
}
const selectedPartSets = choose(partOrder.filter((id) => id !== PART), 0, 2).map((values) => [PART, ...values]);
const partClasses = new Map();
for (const values of selectedPartSets) {
  const key = kneeRules.map((rule) => values.filter((id) => id !== PART &&
    (rule.primary.includes(id) || rule.related.includes(id))).length * 7).join(":");
  if (!partClasses.has(key)) partClasses.set(key, { representative: values, weight: 0 });
  partClasses.get(key).weight += 1;
}
const neutralFactor = timing.length * sides.length * spread.length;
const theoretical = selectedPartSets.length * choose(situationChoices.map(([id]) => id), 1, 3).length *
  choose(symptoms.map(([id]) => id), 1, 3).length * locationChoices.length * neutralFactor;
const reachable = selectedPartSets.length * movementSets.length * symptomSets.length * locationChoices.length * neutralFactor;
const directUrlReachable = movementSets.length * symptomSets.length * locationChoices.length * neutralFactor;
const expectedGridCalls = partClasses.size * movementSets.length * symptomClasses.size * locationChoices.length;

const returnSignature = "return { init, localRecords, getPartMeta };";
assert(source.includes(returnSignature));
assert(source.includes("|| a.sourceIndex - b.sourceIndex"));
const instrumented = source.replace(returnSignature,
  "return { init, localRecords, getPartMeta, __auditSetState(next) { state = next; }, __auditCalculate: calculate };");
const storage = { getItem() { return null; }, setItem() {} };
const windowStub = {
  location: { hostname: "127.0.0.1", origin: "http://127.0.0.1", search: "?part=knee" },
  HealthCheckBodyPlatform: { createId() { return "knee-audit-only"; } },
  localStorage: storage, sessionStorage: storage, setTimeout() {}, scrollTo() {}
};
vm.runInNewContext(instrumented, {
  window: windowStub, location: windowStub.location, localStorage: storage,
  sessionStorage: storage, document: { dispatchEvent() {} }, CustomEvent: function CustomEvent() {},
  URL, URLSearchParams, encodeURIComponent, Date, Math, Intl, console
}, { filename: "body-check-ui.js" });
const engine = windowStub.createBodyCheck({ $() { return null; }, $$() { return []; },
  STORAGE_KEY: "knee-audit", copyText() {} });
let calculateCalls = 0;
function legacyRank(selectedParts, location, movements, selectedSymptoms,
  side = "right", when = "start", extent = "local") {
  engine.__auditSetState({ stepIndex: 0, selectedParts, primaryPart: PART,
    situations: movements, symptoms: selectedSymptoms, painLocation: location,
    timing: when, side, spread: extent, adaptiveQuestion: null, adaptiveAnswer: "",
    latest: null, calculating: false, limitMessage: "" });
  calculateCalls += 1;
  return engine.__auditCalculate().topMuscles;
}
function legacySummary(items) {
  const key = (item) => [Number(item.locationMatched), item.matchedMotions.length,
    item.score, item.matchedContexts.length, item.matchedSymptoms.length].join(":");
  const tie = items.length ? items.filter((item) => key(item) === key(items[0])).map((item) => item.name) : [];
  return { names: items.map((item) => item.name), top: items[0]?.name || "",
    top3: items.slice(0, 3).map((item) => item.name), count: items.length, tie };
}

const current = { theoretical, reachable, directUrlReachable, actualCalculateCalls: 0,
  compression: { selectedPartSets: selectedPartSets.length, selectedPartClasses: partClasses.size,
    movementSets: movementSets.length, symptomSets: symptomSets.length,
    symptomClasses: symptomClasses.size, neutralFactor, gridCalls: expectedGridCalls },
  candidateCount: { zero: 0, one: 0, twoToThree: 0, fourPlus: 0 }, candidateSum: 0,
  topTie: 0, sourceOrderOnlyTop1: 0, motionFilteredCount: 0,
  top1: new Map(), top3: new Map(), tieGroups: new Map(), locations: {}, movements: {}, examples: {},
  directUrl: { candidateCount: { zero: 0, one: 0, twoToThree: 0, fourPlus: 0 },
    candidateSum: 0, topTie: 0, top1: new Map(), top3: new Map() } };
for (const [id] of locationChoices) current.locations[id] = { patterns: 0, candidateSum: 0, topTie: 0,
  sourceOrderOnlyTop1: 0, fourPlus: 0, top1: new Map() };
for (const [id] of situationChoices) current.movements[id] = { containingPatterns: 0,
  candidateSum: 0, topTie: 0, top1: new Map() };
const digest = crypto.createHash("sha256");
for (const [contextKey, context] of partClasses) {
  for (const [location, , allowed] of locationChoices) {
    for (const movements of movementSets) {
      for (const symptomClass of symptomClasses.values()) {
        const value = legacySummary(legacyRank(context.representative, location, movements, symptomClass.representative));
        const weight = context.weight * symptomClass.weight * neutralFactor;
        const loc = current.locations[location];
        digest.update(`${contextKey}/${location}/${signature(movements)}/${signature(symptomClass.representative.filter((id) => rankableSymptoms.has(id)))}:${value.names.join(",")};`);
        const allowedCount = location === "location_unclear" ? kneeRules.length : allowed.length;
        current.motionFilteredCount += (allowedCount - value.count) * weight;
        current.candidateSum += value.count * weight;
        loc.patterns += weight;
        loc.candidateSum += value.count * weight;
        const bucket = value.count === 0 ? "zero" : value.count === 1 ? "one" : value.count <= 3 ? "twoToThree" : "fourPlus";
        current.candidateCount[bucket] += weight;
        if (context.representative.length === 1) {
          const directWeight = symptomClass.weight * neutralFactor;
          current.directUrl.candidateCount[bucket] += directWeight;
          current.directUrl.candidateSum += value.count * directWeight;
          if (value.tie.length > 1) current.directUrl.topTie += directWeight;
          count(current.directUrl.top1, value.top, directWeight);
          for (const name of value.top3) count(current.directUrl.top3, name, directWeight);
        }
        if (value.count >= 4) loc.fourPlus += weight;
        count(current.top1, value.top, weight);
        count(loc.top1, value.top, weight);
        for (const name of value.top3) count(current.top3, name, weight);
        if (value.tie.length > 1) {
          current.topTie += weight;
          current.sourceOrderOnlyTop1 += weight;
          loc.topTie += weight;
          loc.sourceOrderOnlyTop1 += weight;
          const group = signature(value.tie);
          count(current.tieGroups, group, weight);
          if (!current.examples[group]) current.examples[group] = {
            selectedParts: context.representative, location, movements,
            symptoms: symptomClass.representative, output: value.names
          };
        }
        for (const id of movements) {
          const movement = current.movements[id];
          movement.containingPatterns += weight;
          movement.candidateSum += value.count * weight;
          if (value.tie.length > 1) movement.topTie += weight;
          count(movement.top1, value.top, weight);
        }
      }
    }
  }
}
assert.strictEqual(calculateCalls, expectedGridCalls);
assert.strictEqual(Object.values(current.candidateCount).reduce((sum, value) => sum + value, 0), reachable);
assert.strictEqual(Object.values(current.directUrl.candidateCount).reduce((sum, value) => sum + value, 0), directUrlReachable);
current.averageCandidates = current.candidateSum / reachable;
current.directUrl.averageCandidates = current.directUrl.candidateSum / directUrlReachable;
current.digest = digest.digest("hex");
const control = { selectedParts: [PART], location: "knee_back", movements: ["bend_knee"], symptoms: ["sharp"] };
const baseline = legacySummary(legacyRank(control.selectedParts, control.location, control.movements, control.symptoms));
current.neutralAxisControls = {};
for (const [axis, values] of [["side", sides], ["timing", timing], ["spread", spread]]) {
  let mismatches = 0;
  for (const [id] of values) {
    const args = { side: "right", timing: "start", spread: "local", [axis]: id };
    const actual = legacySummary(legacyRank(control.selectedParts, control.location, control.movements,
      control.symptoms, args.side, args.timing, args.spread));
    if (actual.names.join("|") !== baseline.names.join("|")) mismatches += 1;
  }
  current.neutralAxisControls[axis] = { choices: values.length, rankMismatches: mismatches };
  assert.strictEqual(mismatches, 0);
}
current.actualCalculateCalls = calculateCalls;

const reachableMovement = new Set(situationChoices.map(([id]) => id));
const allMovements = new Set(Object.values(situationsByPart).flatMap((values) => values.map(([id]) => id)));
const relationFields = ["motions", "contraction", "stretch", "bonus"];
current.deadRelations = [];
current.doubleEvidence = [];
for (const rule of kneeRules) {
  for (const field of relationFields) for (const id of rule[field] || []) {
    if (!reachableMovement.has(id)) current.deadRelations.push({ muscle: rule.name, field, id,
      kind: allMovements.has(id) ? "other_part_only" : "unreachable_everywhere" });
  }
  for (let i = 0; i < relationFields.length; i += 1) for (let j = i + 1; j < relationFields.length; j += 1) {
    for (const id of rule[relationFields[i]] || []) if (reachableMovement.has(id) &&
      (rule[relationFields[j]] || []).includes(id)) current.doubleEvidence.push({ muscle: rule.name,
      id, fields: [relationFields[i], relationFields[j]] });
  }
}
current.relatedOnlyExcluded = allRules.filter((rule) => !rule.primary.includes(PART) && rule.related.includes(PART))
  .map((rule) => rule.name);
current.master = kneeRules.map((rule) => ({ internalKey: rule.name, name: rule.name, stableId: null,
  imageId: null, model3dId: null, primary: rule.primary, related: rule.related,
  motions: rule.motions, contraction: rule.contraction || [], stretch: rule.stretch || [],
  bonus: rule.bonus || [], symptoms: rule.symptoms, visual: visuals[rule.name] || null }));
current.hardLocationAllowlist = Object.fromEntries(locationChoices.map(([id, , allowed]) => [id,
  id === "location_unclear" ? kneeRules.map((rule) => rule.name) : allowed]));

// Proposal only: P strong active, H weaker active, S passive stretch, T review-only, N none.
const AXIS = { extend: "sagittal", flex: "sagittal", tibia_in: "rotation", tibia_out: "rotation",
  heel_raise: "ankle" };
const newMovements = Object.keys(AXIS);
const newMovementSets = [...choose(newMovements, 1, 3), ["movement_unclear"]];
const newLocations = ["knee_front", "knee_inner", "knee_outer", "knee_back", "location_unclear"];
const draft = [
  { id: "knee_quadriceps", name: "大腿四頭筋", location: "PHHN", movement: "PSNNT", confidence: "MEDIUM", imageId: "大腿四頭筋" },
  { id: "knee_hamstrings", name: "ハムストリングス", location: "NHHP", movement: "SPTTN", confidence: "MEDIUM", imageId: "ハムストリングス" },
  { id: "knee_popliteus", name: "膝窩筋", location: "NNHP", movement: "THHTN", confidence: "REVIEW", imageId: "膝窩筋" },
  { id: "knee_gastrocnemius", name: "腓腹筋", location: "NHHP", movement: "SHNNP", confidence: "MEDIUM", imageId: "腓腹筋" }
];
for (const item of draft) {
  assert.strictEqual(item.location.length, 4);
  assert.strictEqual(item.movement.length, 5);
  assert(!/[^PHSTN]/.test(item.location + item.movement));
}
const locationIndex = Object.fromEntries(newLocations.slice(0, 4).map((id, index) => [id, index]));
const movementIndex = Object.fromEntries(newMovements.map((id, index) => [id, index]));
const axes = ["sagittal", "rotation", "ankle"];
function evidence(muscle, location, movements) {
  const loc = location === "location_unclear" ? "?" : muscle.location[locationIndex[location]];
  const vector = { sagittal: 0, rotation: 0, ankle: 0 };
  const reference = [];
  for (const id of movements) {
    if (id === "movement_unclear") continue;
    const relation = muscle.movement[movementIndex[id]];
    const strength = relation === "P" ? 2 : relation === "H" ? 1 : 0;
    vector[AXIS[id]] = Math.max(vector[AXIS[id]], strength);
    if (relation === "S" || relation === "T") reference.push({ id, relation });
  }
  return { loc, vector, reference, max: Math.max(...Object.values(vector)),
    sum: Object.values(vector).reduce((a, b) => a + b, 0) };
}
function dominates(a, b) {
  return axes.every((axis) => a.vector[axis] >= b.vector[axis]) &&
    axes.some((axis) => a.vector[axis] > b.vector[axis]);
}
function mainDominatesAllAdditional(mainEvidence, additionalEvidence) {
  return additionalEvidence.every((item) => dominates(mainEvidence, item));
}
function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
    .map((rest) => [value, ...rest]));
}
function rankProposal({ location, side, movements }, policy, reversed = false) {
  void side;
  const values = (reversed ? [...draft].reverse() : draft).map((muscle) => ({ ...muscle,
    evidence: evidence(muscle, location, movements) }));
  const hasInput = location !== "location_unclear" && !movements.includes("movement_unclear");
  const main = hasInput ? values.filter((item) => item.evidence.loc === "P" && item.evidence.max > 0) : [];
  const additional = hasInput ? values.filter((item) => item.evidence.loc === "H" && item.evidence.max > 0) : [];
  const reference = hasInput ? values.filter((item) => !main.includes(item) && !additional.includes(item) &&
    item.evidence.loc !== "N" && item.evidence.reference.some((rel) => rel.relation === "S")) : [];
  const reviewOnly = hasInput ? values.filter((item) => !main.includes(item) && !additional.includes(item) &&
    !reference.includes(item) && (item.evidence.reference.some((rel) => rel.relation === "T") ||
      (item.evidence.loc === "N" && item.evidence.max > 0))) : [];
  let frontier = [];
  if (main.length) {
    if (policy === "A") {
      const best = Math.max(...main.map((item) => item.evidence.max));
      frontier = main.filter((item) => item.evidence.max === best);
    } else if (policy === "B") {
      const best = Math.max(...main.map((item) => item.evidence.sum));
      frontier = main.filter((item) => item.evidence.sum === best);
    } else {
      frontier = main.filter((item) => !main.some((other) => other !== item && dominates(other.evidence, item.evidence)));
    }
  }
  const union = [...main, ...additional];
  const unionFrontier = union.filter((item) => !union.some((other) => other !== item &&
    dominates(other.evidence, item.evidence)));
  const challengers = (policy === "C_guard" || policy === "C_guard_strict") && frontier.length === 1
    ? additional.filter((item) => !mainDominatesAllAdditional(frontier[0].evidence, [item.evidence])) : [];
  const weakUnique = policy === "C_guard_strict" && frontier.length === 1 && frontier[0].evidence.max < 2;
  const status = !hasInput ? "insufficient" : frontier.length > 1 ? "tied" :
    challengers.length || weakUnique ? "insufficient" : frontier.length === 1 ? "ranked" :
      reference.length && !additional.length ? "stretch_only_reference" : "insufficient";
  const ids = (items) => items.map((item) => item.id).sort();
  const additionalFrontier = additional.filter((item) => !additional.some((other) => other !== item &&
    dominates(other.evidence, item.evidence)));
  const visible = ids([...main, ...additionalFrontier, ...reference]);
  const collapsed = ids(additional.filter((item) => !additionalFrontier.includes(item)));
  return { status, main: ids(main), additional: ids(additional), reference: ids(reference),
    reviewOnly: ids(reviewOnly), frontier: ids(frontier), unionFrontier: ids(unionFrontier),
    challengers: ids(challengers), weakUnique, visible, collapsed,
    tieKind: frontier.length > 1 ? new Set(frontier.map((item) => JSON.stringify(item.evidence.vector))).size === 1
      ? "equal_vector" : "incomparable_vector" : "none" };
}
const benchmarkDrafts = [
  ["前・伸ばす", "knee_front", "right", ["extend"]],
  ["前・伸ばす mirror", "knee_front", "left", ["extend"]],
  ["前・曲げる reference", "knee_front", "right", ["flex"]],
  ["前・足先内向き", "knee_front", "left", ["tibia_in"]],
  ["内側・伸ばす", "knee_inner", "right", ["extend"]],
  ["内側・曲げる", "knee_inner", "left", ["flex"]],
  ["内側・かかと上げ", "knee_inner", "right", ["heel_raise"]],
  ["外側・曲げる", "knee_outer", "left", ["flex"]],
  ["外側・足先内向き", "knee_outer", "right", ["tibia_in"]],
  ["外側・足先外向き", "knee_outer", "left", ["tibia_out"]],
  ["後ろ・曲げる", "knee_back", "right", ["flex"]],
  ["後ろ・曲げる mirror", "knee_back", "left", ["flex"]],
  ["後ろ・かかと上げ", "knee_back", "left", ["heel_raise"]],
  ["後ろ・伸ばす reference", "knee_back", "right", ["extend"]],
  ["後ろ・足先内向き", "knee_back", "right", ["tibia_in"]],
  ["後ろ・足先外向き", "knee_back", "left", ["tibia_out"]],
  ["前・伸ばす+曲げる同軸", "knee_front", "both", ["extend", "flex"]],
  ["後ろ・伸ばす+曲げる同軸", "knee_back", "center", ["extend", "flex"]],
  ["後ろ・足先内外同軸", "knee_back", "right", ["tibia_in", "tibia_out"]],
  ["後ろ・曲げる+かかと上げ", "knee_back", "left", ["flex", "heel_raise"]],
  ["内側・曲げる+かかと上げ", "knee_inner", "both", ["flex", "heel_raise"]],
  ["外側・曲げる+足先内向き", "knee_outer", "right", ["flex", "tibia_in"]],
  ["三軸・後ろ", "knee_back", "right", ["flex", "tibia_in", "heel_raise"]],
  ["三軸・内側", "knee_inner", "left", ["extend", "tibia_in", "heel_raise"]],
  ["位置不明", "location_unclear", "right", ["extend"]],
  ["動作不明", "knee_back", "left", ["movement_unclear"]],
  ["位置・動作とも不明", "location_unclear", "center", ["movement_unclear"]],
  ["前・かかと上げのみ", "knee_front", "right", ["heel_raise"]]
];
const benchmarks = benchmarkDrafts.map(([purpose, location, side, movements], index) => ({
  id: `KNE-${String(index + 1).padStart(3, "0")}`, purpose,
  answers: { location, side, movements },
  results: Object.fromEntries(["A", "B", "C", "C_guard", "C_guard_strict"].map((policy) => [policy,
    rankProposal({ location, side, movements }, policy)]))
}));
const simulation = {};
const invariants = { mirrorMismatch: 0, movementOrderMismatch: 0,
  definitionOrderMismatch: 0, sourceOrderOnlyTop1: 0, sameAxisDoubleCount: 0, d1CandidateLoss: 0 };
for (const policy of ["A", "B", "C", "C_guard", "C_guard_strict"]) {
  const stat = { patterns: 0, statuses: new Map(), mainCount: new Map(), additionalCount: new Map(),
    referenceCount: new Map(), displayedCount: new Map(), uniqueTop1: new Map(),
    muscleMain: new Map(), muscleAdditional: new Map(), frontierMembership: new Map(),
    tieKind: new Map(), locations: {}, movements: {}, crossGroupChallengers: 0 };
  for (const location of newLocations) {
    stat.locations[location] = { patterns: 0, statuses: new Map(), uniqueTop1: new Map() };
    for (const side of sides.map(([id]) => id)) for (const movements of newMovementSets) {
      const answer = { location, side, movements };
      const result = rankProposal(answer, policy);
      const payload = JSON.stringify(result);
      stat.patterns += 1;
      stat.locations[location].patterns += 1;
      count(stat.statuses, result.status);
      count(stat.locations[location].statuses, result.status);
      count(stat.mainCount, result.main.length);
      count(stat.additionalCount, result.additional.length);
      count(stat.referenceCount, result.reference.length);
      count(stat.displayedCount, result.visible.length);
      count(stat.tieKind, result.tieKind);
      if (result.challengers.length) stat.crossGroupChallengers += 1;
      for (const id of result.main) count(stat.muscleMain, id);
      for (const id of result.additional) count(stat.muscleAdditional, id);
      if (result.status === "ranked") {
        count(stat.uniqueTop1, result.frontier[0]);
        count(stat.locations[location].uniqueTop1, result.frontier[0]);
      }
      for (const id of result.frontier) count(stat.frontierMembership, id);
      for (const id of movements) {
        if (!stat.movements[id]) stat.movements[id] = { containingPatterns: 0, statuses: new Map(), uniqueTop1: new Map() };
        stat.movements[id].containingPatterns += 1;
        count(stat.movements[id].statuses, result.status);
        if (result.status === "ranked") count(stat.movements[id].uniqueTop1, result.frontier[0]);
      }
      if (JSON.stringify(rankProposal({ ...answer, side: side === "right" ? "left" : "right" }, policy)) !== payload)
        invariants.mirrorMismatch += 1;
      for (const order of permutations(movements)) if (JSON.stringify(rankProposal({ ...answer, movements: order }, policy)) !== payload)
        invariants.movementOrderMismatch += 1;
      if (JSON.stringify(rankProposal(answer, policy, true)) !== payload) {
        invariants.definitionOrderMismatch += 1;
        if (result.status === "ranked") invariants.sourceOrderOnlyTop1 += 1;
      }
      if (signature([...result.visible, ...result.collapsed]) !== signature([...result.main, ...result.additional, ...result.reference]))
        invariants.d1CandidateLoss += 1;
      for (const muscle of draft) {
        const actual = evidence(muscle, location, movements).vector;
        for (const axis of axes) {
          const expected = Math.max(0, ...movements.filter((id) => AXIS[id] === axis).map((id) => {
            const rel = muscle.movement[movementIndex[id]];
            return rel === "P" ? 2 : rel === "H" ? 1 : 0;
          }));
          if (actual[axis] !== expected) invariants.sameAxisDoubleCount += 1;
        }
      }
    }
  }
  simulation[policy] = stat;
}
assert(Object.values(invariants).every((value) => value === 0));
assert(Object.values(simulation).every((item) => item.patterns === newLocations.length * sides.length * newMovementSets.length));
const comparisons = {};
for (const [left, right] of [["A", "B"], ["A", "C"], ["B", "C"], ["C", "C_guard"],
  ["C_guard", "C_guard_strict"]]) {
  const result = { statusChanged: 0, frontierChanged: 0 };
  for (const location of newLocations) for (const [side] of sides) for (const movements of newMovementSets) {
    const a = rankProposal({ location, side, movements }, left);
    const b = rankProposal({ location, side, movements }, right);
    if (a.status !== b.status) result.statusChanged += 1;
    if (signature(a.frontier) !== signature(b.frontier)) result.frontierChanged += 1;
  }
  comparisons[`${left}_vs_${right}`] = result;
}
const guardFixtures = [
  { name: "dominated_additional", main: [2, 1, 0], additional: [1, 0, 0], expectRanked: true },
  { name: "equal_additional", main: [2, 0, 0], additional: [2, 0, 0], expectRanked: false },
  { name: "superior_additional", main: [1, 0, 0], additional: [2, 0, 0], expectRanked: false },
  { name: "incomparable_additional", main: [2, 0, 0], additional: [0, 1, 0], expectRanked: false }
].map((item) => {
  const vector = (values) => ({ vector: Object.fromEntries(axes.map((axis, index) => [axis, values[index]])) });
  const actualRanked = mainDominatesAllAdditional(vector(item.main), [vector(item.additional)]);
  assert.strictEqual(actualRanked, item.expectRanked, item.name);
  return { ...item, actualRanked };
});
const persistence = require(path.join(root, "precision-persistence.js"));
let validatedDtos = 0;
let maximumDtoBytes = 0;
for (const location of newLocations) for (const [side] of sides) for (const movements of newMovementSets) {
  const candidate = rankProposal({ location, side, movements }, "C_guard");
  const dto = persistence.serializePrecisionResult({ bodyPart: PART,
    diagnosisVersion: "knee_precision_v1", answers: { location, side, movements },
    result: { status: candidate.status, reason: "knee_policy_review_pending",
      mainMuscleIds: candidate.main, additionalMuscleIds: candidate.additional,
      frontierMuscleIds: candidate.frontier, referenceMuscleIds: candidate.reference },
    safety: { numbness: null, weakness: null, limbSpread: null } });
  validatedDtos += 1;
  maximumDtoBytes = Math.max(maximumDtoBytes, Buffer.byteLength(JSON.stringify(dto)));
}
function jsonSafe(value) {
  if (value instanceof Map) return sortedEntries(value);
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}
const result = jsonSafe({ generatedAt: new Date().toISOString(), durationMs: Date.now() - started,
  sourceSha256: crypto.createHash("sha256").update(source).digest("hex"), current,
  proposal: { locations: newLocations, movements: newMovements, movementSets: newMovementSets.length,
    draftMaster: draft, simulation, comparisons, invariants, benchmarks, guardFixtures,
    persistenceCompatibility: { validatedDtos, maximumDtoBytes,
      schemaLimitBytes: persistence.MAX_BYTES, diagnosisVersion: "knee_precision_v1" } } });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, durationMs: result.durationMs, current: {
  theoretical, reachable, directUrlReachable, actualCalculateCalls: calculateCalls,
  compression: current.compression, candidateCount: current.candidateCount,
  averageCandidates: current.averageCandidates, topTie: current.topTie,
  sourceOrderOnlyTop1: current.sourceOrderOnlyTop1, top1: result.current.top1,
  top3: result.current.top3, doubleEvidence: current.doubleEvidence.length,
  deadRelations: current.deadRelations.length }, proposal: {
    reachable: simulation.C.patterns, statuses: result.proposal.simulation.C_guard.statuses,
    comparisons, invariants } }, null, 2));
