const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const audits = path.join(root, "docs", "audits");
const prior = JSON.parse(fs.readFileSync(path.join(audits,
  "hip-precision-v1-final-policy-2026-10-02.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(audits,
  "hip-precision-v1-policy-review-2026-10-02.json"), "utf8"));
const output = path.join(audits, "hip-precision-v1-final-boundary-review-2026-10-02.json");
const { locations, sides, movements, movementSets, nClasses } = prior.design;
const axes = { flex: "sagittal", extend: "sagittal", abduct: "frontal", adduct: "frontal" };
const locationIndex = Object.fromEntries(locations.slice(0, 4).map((id, i) => [id, i]));
const movementIndex = Object.fromEntries(movements.map((id, i) => [id, i]));
const originalMaster = baseline.proposed.draftMaster;
assert.equal(originalMaster.length, 8);
const originalSartorius = originalMaster.find((row) => row.id === "hip_sartorius");
assert.equal(originalSartorius.location[locationIndex.hip_front_groin], "P");
assert.equal(originalSartorius.movement[movementIndex.abduct], "H");
assert.equal(originalSartorius.confidence, "REVIEW");
assert.equal(prior.simulation.patterns, 300);
assert.equal(prior.finalBenchmarks.length, 26);

function masterFor(piriformis, sartorius) {
  const rows = originalMaster.filter((row) => piriformis === "P0" || row.id !== "hip_piriformis")
    .map((row) => ({ ...row, location: [...row.location], movement: [...row.movement] }));
  const sart = rows.find((row) => row.id === "hip_sartorius");
  if (sartorius === "S1") sart.location[locationIndex.hip_front_groin] = "H";
  if (sartorius === "S2") sart.movement[movementIndex.abduct] = "T";
  return rows;
}

function evidence(muscle, location, selected) {
  const loc = location === "location_unclear" ? "?" : muscle.location[locationIndex[location]];
  const strengths = { sagittal: 0, frontal: 0 };
  const references = [];
  for (const movement of selected) {
    if (movement === "movement_unclear") continue;
    const relation = muscle.movement[movementIndex[movement]];
    strengths[axes[movement]] = Math.max(strengths[axes[movement]],
      relation === "P" ? 2 : relation === "H" ? 1 : 0);
    if (relation === "S" || relation === "T") references.push({ movement, relation });
  }
  return { loc, nClass: loc === "N" ? nClasses[muscle.id][location] : null,
    strengths, max: Math.max(...Object.values(strengths)), references };
}

function dominates(left, right) {
  return Object.keys(left).every((axis) => left[axis] >= right[axis]) &&
    Object.keys(left).some((axis) => left[axis] > right[axis]);
}

function rank(answer, master, reverse = false) {
  const hasInput = answer.location !== "location_unclear" &&
    !answer.movements.includes("movement_unclear");
  const scored = (reverse ? [...master].reverse() : master).map((muscle) => ({
    id: muscle.id, evidence: evidence(muscle, answer.location, answer.movements)
  }));
  const main = hasInput ? scored.filter(({ evidence: e }) => e.loc === "P" && e.max > 0) : [];
  const additional = hasInput ? scored.filter(({ evidence: e }) =>
    (e.loc === "H" || e.loc === "N") && e.max > 0) : [];
  const active = [...main, ...additional];
  const activeIds = new Set(active.map((item) => item.id));
  const reference = hasInput ? scored.filter(({ id, evidence: e }) => !activeIds.has(id) &&
    e.references.some((item) => item.relation === "S") &&
    (e.loc === "P" || e.loc === "H" || e.nClass === "ambiguous")) : [];
  const displayed = new Set([...active, ...reference].map((item) => item.id));
  const reviewOnly = hasInput ? scored.filter(({ id, evidence: e }) => !displayed.has(id) &&
    (e.references.length > 0 || (e.loc === "N" && e.max > 0))) : [];
  const mainFrontier = main.filter((item) => !main.some((other) => other !== item &&
    dominates(other.evidence.strengths, item.evidence.strengths)));
  const unionFrontier = active.filter((item) => !active.some((other) => other !== item &&
    dominates(other.evidence.strengths, item.evidence.strengths)));
  const unionIds = new Set(unionFrontier.map((item) => item.id));
  const unionAdditional = additional.filter((item) => unionIds.has(item.id));
  const dominatedAdditional = additional.filter((item) => !unionIds.has(item.id));
  const status = !hasInput ? "insufficient" : mainFrontier.length > 1 ? "tied" :
    mainFrontier.length === 1 ? "ranked" : additional.length ? "insufficient" :
      reference.length ? "stretch_only_reference" : "insufficient";
  const ids = (items) => items.map((item) => item.id).sort();
  return { status, main: ids(main), additional: ids(additional), reference: ids(reference),
    reviewOnly: ids(reviewOnly), frontier: ids(mainFrontier), unionFrontier: ids(unionFrontier),
    unionAdditional: ids(unionAdditional), dominatedAdditional: ids(dominatedAdditional),
    displayedCount: displayed.size, activeCount: active.length,
    initialD1Count: main.length + unionAdditional.length,
    evidence: Object.fromEntries(scored.map(({ id, evidence: e }) => [id, e])) };
}

function count(map, key) {
  map[key] = (map[key] || 0) + 1;
}

function bucket(map, value) {
  count(map, value >= 4 ? "4plus" : String(value));
}

function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, i) => permutations(values.filter((_, j) => j !== i))
    .map((tail) => [value, ...tail]));
}

function comparable(result) {
  const { status, main, additional, reference, frontier, unionFrontier,
    unionAdditional, dominatedAdditional } = result;
  return JSON.stringify({ status, main, additional, reference, frontier, unionFrontier,
    unionAdditional, dominatedAdditional });
}

function simulate(piriformis, sartorius) {
  const master = masterFor(piriformis, sartorius);
  const stats = { patterns: 0,
    status: { ranked: 0, tied: 0, insufficient: 0, stretch_only_reference: 0 },
    mainCount: {}, additionalCount: {}, frontierCount: {}, unionFrontierCount: {},
    muscleMain: {}, muscleAdditional: {}, muscleUniqueTop1: {}, muscleTie: {},
    locations: {}, movements: {}, frontSartoriusOnlyMain: [],
    display: { D0: { buckets: {}, total: 0 }, D1_initial: { buckets: {}, total: 0 },
      D1_expanded: { buckets: {}, total: 0 }, D2: { buckets: {}, total: 0 },
      referenceTotal: 0, dominatedAdditionalTotal: 0, casesWithFoldedAdditional: 0 },
    rankedWithUnionAdditional: 0, additionalOnlyUnion: 0,
    additionalOnlyUnionByStatus: {}, rankedMainDominatedByAdditional: 0,
    rankedMainEqualAdditional: 0, rankedMainIncomparableAdditional: 0,
    rankedMainDominatedExamples: [] };
  const invariants = { mirrorMismatch: 0, movementOrderMismatch: 0,
    definitionOrderMismatch: 0, sourceOrderOnlyTop1: 0, sameAxisDoubleCount: 0,
    displayLostTrustedCandidate: 0 };
  for (const location of locations) for (const selected of movementSets) {
    let mirror = null;
    for (const side of sides) {
      const answer = { location, side, movements: selected };
      const result = rank(answer, master);
      const signature = comparable(result);
      stats.patterns += 1;
      count(stats.status, result.status);
      count(stats.mainCount, result.main.length);
      count(stats.additionalCount, result.additional.length);
      count(stats.frontierCount, result.frontier.length);
      count(stats.unionFrontierCount, result.unionFrontier.length);
      for (const id of result.main) count(stats.muscleMain, id);
      for (const id of result.additional) count(stats.muscleAdditional, id);
      if (result.status === "ranked") count(stats.muscleUniqueTop1, result.frontier[0]);
      if (result.status === "tied") for (const id of result.frontier) count(stats.muscleTie, id);
      const display = stats.display;
      for (const [name, size] of [["D0", result.activeCount],
        ["D1_initial", result.initialD1Count], ["D1_expanded", result.activeCount],
        ["D2", result.initialD1Count]]) {
        bucket(display[name].buckets, size);
        display[name].total += size;
      }
      display.referenceTotal += result.reference.length;
      display.dominatedAdditionalTotal += result.dominatedAdditional.length;
      if (result.dominatedAdditional.length) display.casesWithFoldedAdditional += 1;
      if (result.status === "ranked" && result.unionAdditional.length) stats.rankedWithUnionAdditional += 1;
      if (result.main.length && result.unionFrontier.length &&
        result.unionFrontier.every((id) => result.additional.includes(id))) {
        stats.additionalOnlyUnion += 1;
        count(stats.additionalOnlyUnionByStatus, result.status);
      }
      if (result.status === "ranked") {
        const top = result.evidence[result.frontier[0]].strengths;
        const unionAdditional = result.unionAdditional.map((id) => result.evidence[id].strengths);
        if (unionAdditional.some((vector) => dominates(vector, top))) {
          stats.rankedMainDominatedByAdditional += 1;
          if (stats.rankedMainDominatedExamples.length < 3) {
            stats.rankedMainDominatedExamples.push({ answer, main: result.frontier,
              unionAdditional: result.unionAdditional });
          }
        }
        if (unionAdditional.some((vector) => JSON.stringify(vector) === JSON.stringify(top))) {
          stats.rankedMainEqualAdditional += 1;
        }
        if (unionAdditional.some((vector) => !dominates(vector, top) &&
          !dominates(top, vector) && JSON.stringify(vector) !== JSON.stringify(top))) {
          stats.rankedMainIncomparableAdditional += 1;
        }
      }
      if (location === "hip_front_groin" && selected.includes("abduct") &&
        result.main.length === 1 && result.main[0] === "hip_sartorius") {
        stats.frontSartoriusOnlyMain.push(answer);
      }
      if (!stats.locations[location]) stats.locations[location] = {
        patterns: 0, status: {}, mainCount: {}, additionalCount: {},
        D0: {}, D1_initial: {}, D1_expanded: {}, D2: {}
      };
      const loc = stats.locations[location];
      loc.patterns += 1;
      count(loc.status, result.status);
      count(loc.mainCount, result.main.length);
      count(loc.additionalCount, result.additional.length);
      bucket(loc.D0, result.activeCount);
      bucket(loc.D1_initial, result.initialD1Count);
      bucket(loc.D1_expanded, result.activeCount);
      bucket(loc.D2, result.initialD1Count);
      for (const movement of selected) {
        if (!stats.movements[movement]) stats.movements[movement] = {
          patterns: 0, status: {}, mainCount: {}, additionalCount: {}, D1_initial: {}
        };
        const movementStats = stats.movements[movement];
        movementStats.patterns += 1;
        count(movementStats.status, result.status);
        count(movementStats.mainCount, result.main.length);
        count(movementStats.additionalCount, result.additional.length);
        bucket(movementStats.D1_initial, result.initialD1Count);
      }
      if (mirror !== null && mirror !== signature) invariants.mirrorMismatch += 1;
      mirror = signature;
      if (comparable(rank(answer, master, true)) !== signature) invariants.definitionOrderMismatch += 1;
      for (const variant of permutations(selected)) {
        if (comparable(rank({ ...answer, movements: variant }, master)) !== signature) {
          invariants.movementOrderMismatch += 1;
        }
      }
      if (result.frontier.length === 1) {
        const top = result.evidence[result.frontier[0]].strengths;
        if (result.main.some((id) => id !== result.frontier[0] &&
          JSON.stringify(result.evidence[id].strengths) === JSON.stringify(top))) {
          invariants.sourceOrderOnlyTop1 += 1;
        }
      }
      for (const muscle of master) for (const axis of ["sagittal", "frontal"]) {
        const expected = Math.max(0, ...selected.filter((movement) => axes[movement] === axis)
          .map((movement) => {
            const relation = muscle.movement[movementIndex[movement]];
            return relation === "P" ? 2 : relation === "H" ? 1 : 0;
          }));
        if (result.evidence[muscle.id].strengths[axis] !== expected) {
          invariants.sameAxisDoubleCount += 1;
        }
      }
      if (result.initialD1Count + result.dominatedAdditional.length !== result.activeCount) {
        invariants.displayLostTrustedCandidate += 1;
      }
    }
  }
  assert.equal(stats.patterns, 300);
  assert(Object.values(invariants).every((value) => value === 0), JSON.stringify(invariants));
  for (const variant of Object.values(stats.display).filter((value) => value && value.buckets)) {
    variant.average = variant.total / stats.patterns;
  }
  const benchmarks = prior.finalBenchmarks.map(({ id, answers }) => ({
    id, answers, result: rank(answers, master)
  }));
  if (piriformis === "P0" && sartorius === "S0") {
    for (let i = 0; i < benchmarks.length; i += 1) {
      const current = benchmarks[i].result;
      const previous = prior.finalBenchmarks[i].result;
      for (const field of ["status", "main", "additional", "reference", "frontier", "displayedCount"]) {
        assert.deepEqual(current[field], previous[field], `${benchmarks[i].id}/${field}`);
      }
    }
    assert.deepEqual(stats.status, prior.simulation.status);
    assert.equal(stats.frontSartoriusOnlyMain.length, 16);
  }
  for (const id of ["HIP-003", "HIP-004"]) {
    const result = benchmarks.find((item) => item.id === id).result;
    assert.equal(result.status, "tied");
    assert.deepEqual(result.frontier,
      ["hip_gluteus_medius", "hip_gluteus_minimus", "hip_tfl"]);
  }
  return { masterIds: master.map((row) => row.id), stats, invariants, benchmarks };
}

if (require.main === module) {
const scenarios = {
  P0_S0: simulate("P0", "S0"),
  P1_S0: simulate("P1", "S0"),
  P1_S1: simulate("P1", "S1"),
  P1_S2: simulate("P1", "S2")
};
for (const key of ["P1_S0", "P1_S1", "P1_S2"]) {
  assert(!scenarios[key].masterIds.includes("hip_piriformis"));
  assert(scenarios[key].benchmarks.every(({ result }) =>
    ![...result.main, ...result.additional, ...result.reference].includes("hip_piriformis")));
}
assert.deepEqual(scenarios.P0_S0.stats.status, scenarios.P1_S0.stats.status);
const finalBenchmarks = scenarios.P1_S1.benchmarks;
const frontAbduct = finalBenchmarks.find(({ id }) => id === "HIP-F28").result;
assert.equal(frontAbduct.status, "insufficient");
assert.equal(frontAbduct.main.length, 0);
assert(frontAbduct.additional.includes("hip_sartorius"));
const benchmarkChanges = finalBenchmarks.flatMap(({ id, result }, index) => {
  const before = scenarios.P0_S0.benchmarks[index].result;
  const fields = ["status", "main", "additional", "frontier"];
  return fields.some((field) => JSON.stringify(before[field]) !== JSON.stringify(result[field])) ?
    [{ id, before: Object.fromEntries(fields.map((field) => [field, before[field]])),
      after: Object.fromEntries(fields.map((field) => [field, result[field]])) }] : [];
});
const statusTransitions = {};
const beforeMaster = masterFor("P0", "S0");
const afterMaster = masterFor("P1", "S1");
for (const location of locations) for (const movementsForCase of movementSets) for (const side of sides) {
  const answer = { location, side, movements: movementsForCase };
  const before = rank(answer, beforeMaster);
  const after = rank(answer, afterMaster);
  if (before.status !== after.status) count(statusTransitions, `${before.status}->${after.status}`);
}
assert.equal(benchmarkChanges.length, 4);
const historicalPiriformis = Object.fromEntries(["main", "additional", "reference", "reviewOnly", "frontier"]
  .map((group) => [group, baseline.proposed.benchmarks.filter((benchmark) =>
    benchmark.results.C[group].includes("hip_piriformis")).map((benchmark) => benchmark.id)]));
const report = { generatedAt: new Date().toISOString(),
  source: "hip-precision-v1-final-policy-2026-10-02.json",
  comparison: "Design-only Policy C simulation; no runtime change",
  piriformisGlobalIdRetained: true, scenarios, benchmarkChanges, statusTransitions,
  historicalPiriformis };
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(scenarios).map(([name, value]) => [name, {
  masterCount: value.masterIds.length, status: value.stats.status,
  frontSartoriusOnlyMain: value.stats.frontSartoriusOnlyMain.length,
  D0: value.stats.display.D0, D1_initial: value.stats.display.D1_initial,
  D1_expanded: value.stats.display.D1_expanded,
  hiddenAdditional: value.stats.display.dominatedAdditionalTotal,
  invariants: value.invariants
}])), null, 2));
}

module.exports = { rank, masterFor, dominates, locations, sides, movementSets,
  originalMaster, axes, movementIndex, prior };
