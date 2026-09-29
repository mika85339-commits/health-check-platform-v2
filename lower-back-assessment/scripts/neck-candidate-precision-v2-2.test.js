const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = {
  v1: path.join(root, "neck-candidate-precision.js"),
  v2: path.join(root, "neck-candidate-precision-v2.js"),
  v21: path.join(root, "neck-candidate-precision-v2-1.js")
};
const expectedHashes = {
  v1: "32fffb08354fa1af532f7cd185af5611c9c044e3d4d794c4d54ff23cc7339a51",
  v2: "3d606f7545cd6bb2d36a4db874ec58461e7cc3c689c8c4b7f740c6faeb8774b6",
  v21: "d02848ea5af40df81390a9190bdff358c310d7eed4ce0f6b665c8b070d704cd1"
};
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
Object.entries(files).forEach(([key, file]) => {
  assert.strictEqual(sha256(file), expectedHashes[key], `${key} changed during precision-v2.2 work.`);
});

const V21 = require(files.v21);
const V22 = require(path.join(root, "neck-candidate-precision-v2-2.js"));

assert.strictEqual(V22.VERSION, "neck-precision-v2.2-local-hypothesis");
assert.strictEqual(V22.DEFAULT_CONFIG, V21.DEFAULT_CONFIG);
assert.strictEqual(V22.LOCATION_ELIGIBILITY, V21.LOCATION_ELIGIBILITY);
assert.strictEqual(V22.MUSCLE_MASTER, V21.MUSCLE_MASTER);
assert.strictEqual(V22.relationFor, V21.relationFor);
assert.strictEqual(V22.locationEligibility, V21.locationEligibility);
assert.strictEqual(V22.movementScore, V21.movementScore);

const movements = V21.SITUATION_OPTIONS.map(([id]) => id);
const locations = [...V21.LOCATION_OPTIONS.map(([id]) => id), V21.UNCLEAR_LOCATION];
const sides = ["right", "left", "both", "center"];

function combinations(values, min, max) {
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

const movementSets = [...combinations(movements, 1, 3), [V21.UNCLEAR_SITUATION]];
assert.strictEqual(locations.length * sides.length * movementSets.length, 1860);

function v21Projection(result) {
  const { baseVersion, adaptive, ...projected } = result;
  return { ...projected, version: V21.VERSION };
}

function topIds(result) {
  return result.candidates
    .filter((candidate) => candidate.rank === 1)
    .map((candidate) => candidate.muscleId)
    .sort();
}

const expectedGroupCounts = {
  [V22.groupKey(["neck_levator_scapulae", "neck_sternocleidomastoid"])]: 10,
  [V22.groupKey(["neck_levator_scapulae", "neck_scalenes", "neck_sternocleidomastoid"])]: 20,
  [V22.groupKey(["neck_deep_flexors", "neck_sternocleidomastoid"])]: 6
};
const keepTieGroups = new Set([
  V22.groupKey(["neck_splenius_capitis_cervicis", "neck_suboccipitals"]),
  V22.groupKey(["neck_levator_scapulae", "neck_upper_trapezius"]),
  V22.groupKey(["neck_levator_scapulae", "neck_splenius_capitis_cervicis", "neck_upper_trapezius"])
]);
const relationReviewGroups = new Set([
  V22.groupKey(["neck_scalenes", "neck_sternocleidomastoid"]),
  V22.groupKey(["neck_levator_scapulae", "neck_scalenes"])
]);

const metrics = {
  patterns: 0,
  adaptive: 0,
  byMovement: { shoulder_shrug: 0, chin_tuck: 0 },
  byGroup: {},
  yesStatus: {},
  yesUniqueTop: 0,
  yesStillTied: 0,
  noTiePreserved: 0,
  noAlternateTop: 0,
  secondQuestion: 0,
  maxedQuestion: 0,
  keepTieQuestion: 0,
  relationReviewQuestion: 0,
  excludedGroupOccurrences: {},
  sourceOrderTop1: 0,
  noneRanked: 0,
  stretchOnlyNormallyRanked: 0,
  status: {}
};
const adaptiveCases = [];

for (const painLocation of locations) {
  for (const side of sides) {
    for (const situations of movementSets) {
      const answers = { painLocation, side, situations };
      const v21 = V21.rank(answers);
      const v22 = V22.rank(answers);
      metrics.patterns += 1;
      metrics.status[v22.status] = (metrics.status[v22.status] || 0) + 1;
      assert.deepStrictEqual(v21Projection(v22), v21, "Pre-answer v2.2 result must equal v2.1.");

      for (const muscle of V21.MUSCLE_MASTER) {
        for (const movement of movements) {
          for (const relationSide of sides) {
            assert.strictEqual(
              V22.relationFor(muscle.muscleId, movement, relationSide),
              V21.relationFor(muscle.muscleId, movement, relationSide)
            );
          }
        }
        for (const location of locations) {
          assert.strictEqual(
            V22.locationEligibility(muscle.muscleId, location),
            V21.locationEligibility(muscle.muscleId, location)
          );
        }
      }

      if (v22.sourceOrderUsedForTop1) metrics.sourceOrderTop1 += 1;
      if ((v22.candidates || []).some((candidate) => candidate.allSelectedRelationsNone)) metrics.noneRanked += 1;
      if (["ranked", "tied"].includes(v22.status)
        && (v22.candidates || []).some((candidate) => candidate.onlyStretch)) {
        metrics.stretchOnlyNormallyRanked += 1;
      }

      const initialGroup = V22.groupKey(topIds(v21));
      if (keepTieGroups.has(initialGroup) || relationReviewGroups.has(initialGroup)) {
        metrics.excludedGroupOccurrences[initialGroup] = (metrics.excludedGroupOccurrences[initialGroup] || 0) + 1;
      }
      if (keepTieGroups.has(initialGroup) && v22.adaptive.question) metrics.keepTieQuestion += 1;
      if (relationReviewGroups.has(initialGroup) && v22.adaptive.question) metrics.relationReviewQuestion += 1;
      if (!v22.adaptive.question) continue;

      metrics.adaptive += 1;
      metrics.byMovement[v22.adaptive.question.movement] += 1;
      metrics.byGroup[initialGroup] = (metrics.byGroup[initialGroup] || 0) + 1;
      if (situations.length >= 3) metrics.maxedQuestion += 1;

      const noResult = V22.answerAdaptive(answers, false);
      const yesResult = V22.answerAdaptive(answers, true);
      assert.deepStrictEqual(v21Projection(noResult), v21, "NO must preserve the exact v2.1 result.");
      if (JSON.stringify(topIds(noResult)) === JSON.stringify(topIds(v21))) metrics.noTiePreserved += 1;
      else metrics.noAlternateTop += 1;
      if (yesResult.adaptive.nextQuestion) metrics.secondQuestion += 1;
      assert.strictEqual(yesResult.adaptive.evidenceAdded, true);
      assert.strictEqual(noResult.adaptive.evidenceAdded, false);
      assert.strictEqual(yesResult.movements.length, v21.movements.length + 1);
      assert(yesResult.movements.includes(v22.adaptive.question.movement));
      assert.strictEqual(
        V22.questionFor({ ...answers, situations: yesResult.movements }, yesResult),
        null,
        "An already answered adaptive movement must not be asked again."
      );

      metrics.yesStatus[yesResult.status] = (metrics.yesStatus[yesResult.status] || 0) + 1;
      if (topIds(yesResult).length === 1 && yesResult.status === "ranked") metrics.yesUniqueTop += 1;
      if (yesResult.status === "tied") metrics.yesStillTied += 1;
      adaptiveCases.push({ answers, initial: v21, yes: yesResult, no: noResult });
    }
  }
}

assert.strictEqual(metrics.patterns, 1860);
assert.deepStrictEqual(metrics.status, { ranked: 824, tied: 586, insufficient: 392, stretch_only_reference: 58 });
assert.strictEqual(metrics.adaptive, 36);
assert.deepStrictEqual(metrics.byMovement, { shoulder_shrug: 30, chin_tuck: 6 });
assert.deepStrictEqual(metrics.byGroup, expectedGroupCounts);
assert.strictEqual(metrics.noTiePreserved, 36);
assert.strictEqual(metrics.noAlternateTop, 0);
assert.strictEqual(metrics.secondQuestion, 0);
assert.strictEqual(metrics.maxedQuestion, 0);
assert.strictEqual(metrics.keepTieQuestion, 0);
assert.strictEqual(metrics.relationReviewQuestion, 0);
for (const key of [...keepTieGroups, ...relationReviewGroups]) {
  assert((metrics.excludedGroupOccurrences[key] || 0) > 0, `Expected excluded tie group was not exercised: ${key}`);
}
assert.strictEqual(metrics.sourceOrderTop1, 0);
assert.strictEqual(metrics.noneRanked, 0);
assert.strictEqual(metrics.stretchOnlyNormallyRanked, 0);

const nck001Answers = { painLocation: "neck_front", side: "center", situations: ["look_down"] };
const nck001Initial = V22.rank(nck001Answers);
assert.strictEqual(nck001Initial.adaptive.question?.movement, "chin_tuck");
assert.deepStrictEqual(topIds(nck001Initial), ["neck_deep_flexors", "neck_sternocleidomastoid"]);
const nck001Yes = V22.answerAdaptive(nck001Answers, true);
const nck001No = V22.answerAdaptive(nck001Answers, false);
assert.deepStrictEqual(topIds(nck001Yes), ["neck_deep_flexors"]);
assert(nck001Yes.candidatePool.some((candidate) => candidate.muscleId === "neck_sternocleidomastoid"));
assert.deepStrictEqual(topIds(nck001No), topIds(nck001Initial));
assert.strictEqual(
  V22.rank({ ...nck001Answers, side: "right" }).adaptive.question,
  null,
  "The deep-flexor + SCM adaptive question must not appear for a unilateral side."
);

const levatorScmCase = adaptiveCases.find((item) => V22.groupKey(topIds(item.initial))
  === V22.groupKey(["neck_levator_scapulae", "neck_sternocleidomastoid"]));
assert(levatorScmCase, "A levator + SCM adaptive benchmark is required.");
assert.strictEqual(levatorScmCase.initial.adaptive, undefined);
assert.strictEqual(levatorScmCase.yes.adaptive.question.movement, "shoulder_shrug");
assert.deepStrictEqual(topIds(levatorScmCase.yes), ["neck_levator_scapulae"]);
assert.deepStrictEqual(topIds(levatorScmCase.no), topIds(levatorScmCase.initial));

const tripleCase = adaptiveCases.find((item) => V22.groupKey(topIds(item.initial))
  === V22.groupKey(["neck_levator_scapulae", "neck_scalenes", "neck_sternocleidomastoid"]));
assert(tripleCase, "A levator + scalenes + SCM adaptive benchmark is required.");
assert.strictEqual(tripleCase.yes.adaptive.question.movement, "shoulder_shrug");
assert.deepStrictEqual(topIds(tripleCase.yes), ["neck_levator_scapulae"]);
assert.deepStrictEqual(topIds(tripleCase.no), topIds(tripleCase.initial));
assert(tripleCase.yes.candidatePool.some((candidate) => candidate.muscleId === "neck_upper_trapezius"));

console.log(JSON.stringify(metrics));
console.log("Neck precision-v2.2 exhaustive checks passed (1,860 initial patterns + all adaptive YES/NO branches).");
