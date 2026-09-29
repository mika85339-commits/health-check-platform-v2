const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const V2 = require(path.join(root, "neck-candidate-precision-v2.js"));
const V21 = require(path.join(root, "neck-candidate-precision-v2-1.js"));

assert.strictEqual(V21.VERSION, "neck-precision-v2.1-local-hypothesis");
assert.strictEqual(V21.MUSCLE_MASTER, V2.MUSCLE_MASTER, "v2.1 must reuse the unchanged v2 muscle master.");
assert.strictEqual(V21.SITUATION_OPTIONS, V2.SITUATION_OPTIONS, "v2.1 must reuse the unchanged v2 question definitions.");
assert.strictEqual(V21.LOCATION_OPTIONS, V2.LOCATION_OPTIONS, "v2.1 must reuse the unchanged v2 location definitions.");
assert.strictEqual(V21.LOCATION_ELIGIBILITY, V2.LOCATION_ELIGIBILITY, "v2.1 must reuse the unchanged v2 location eligibility table.");
assert.strictEqual(V21.relationFor, V2.relationFor, "v2.1 must reuse the exact v2 relation function.");
assert.deepStrictEqual(V21.DEFAULT_CONFIG, V2.DEFAULT_CONFIG);

const nck004 = V21.rank({ painLocation: "neck_side", side: "left", situations: ["turn_left"] });
assert.strictEqual(nck004.status, "tied");
assert.deepStrictEqual(
  nck004.candidates.filter((candidate) => candidate.rank === 1).map((candidate) => candidate.muscleId).sort(),
  ["neck_levator_scapulae", "neck_scalenes"]
);
assert.strictEqual(nck004.candidates.find((candidate) => candidate.muscleId === "neck_splenius_capitis_cervicis").displayGroup, "secondary_additional");

const nck012 = V21.rank({ painLocation: "neck_side", side: "right", situations: ["turn_right"] });
assert.deepStrictEqual(
  nck012.candidates.filter((candidate) => candidate.rank === 1).map((candidate) => candidate.muscleId).sort(),
  ["neck_levator_scapulae", "neck_scalenes"]
);

const nck001 = V21.rank({ painLocation: "neck_front", side: "center", situations: ["look_down"] });
assert.strictEqual(nck001.status, "tied");
assert.deepStrictEqual(
  nck001.candidates.filter((candidate) => candidate.rank === 1).map((candidate) => candidate.muscleId).sort(),
  ["neck_deep_flexors", "neck_sternocleidomastoid"]
);

const nck003 = V21.rank({ painLocation: "neck_side", side: "right", situations: ["look_down"] });
assert.strictEqual(nck003.status, "tied");
assert.deepStrictEqual(
  nck003.candidates.filter((candidate) => candidate.rank === 1).map((candidate) => candidate.muscleId).sort(),
  ["neck_scalenes", "neck_sternocleidomastoid"]
);

const stretchOnly = V21.rank({ painLocation: "neck_back_upper", side: "center", situations: ["look_down"] });
assert.strictEqual(stretchOnly.status, "stretch_only_reference");
assert.strictEqual(stretchOnly.candidates.length, 0);
assert(stretchOnly.referenceCandidates.length > 0);
assert(stretchOnly.referenceCandidates.every((candidate) => candidate.onlyStretch));

const noEligible = V21.rank({ painLocation: "neck_front", side: "right", situations: ["shoulder_shrug"] });
assert.strictEqual(noEligible.status, "insufficient");
assert.strictEqual(noEligible.insufficientReason, "no_eligible_candidate");

const secondaryAllowed = V21.rank({ painLocation: "neck_back_upper", side: "right", situations: ["shoulder_shrug"] });
assert.strictEqual(secondaryAllowed.status, "tied");
assert(secondaryAllowed.candidates.every((candidate) => candidate.locationEligibility === "secondary"));
assert(secondaryAllowed.candidates.every((candidate) => candidate.rank === 1));

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

const movements = V2.SITUATION_OPTIONS.map(([id]) => id);
const movementSets = [...combinations(movements, 1, 3), [V2.UNCLEAR_SITUATION]];
const locations = [...V2.LOCATION_OPTIONS.map(([id]) => id), V2.UNCLEAR_LOCATION];
const sides = ["right", "left", "both", "center"];
const status = { ranked: 0, tied: 0, insufficient: 0, stretch_only_reference: 0 };
const distribution = { zero: 0, one: 0, twoToThree: 0, fourPlus: 0 };
let evaluated = 0;
let sourceOrderOnly = 0;
let secondaryTakeover = 0;
let primaryEvidenceMissing = 0;
let noneRanked = 0;
let stretchOnlyRanked = 0;

for (const painLocation of locations) {
  for (const side of sides) {
    for (const situations of movementSets) {
      const answers = { painLocation, side, situations };
      const v2 = V2.rank(answers);
      const v21 = V21.rank(answers);
      evaluated += 1;
      status[v21.status] += 1;
      assert.deepStrictEqual(
        v21.candidatePool.map((candidate) => candidate.muscleId),
        v2.candidatePool.map((candidate) => candidate.muscleId),
        `Candidate-pool membership changed for ${painLocation}/${side}/${situations.join("+")}`
      );
      for (const muscle of V2.MUSCLE_MASTER) {
        for (const motion of movements) {
          assert.strictEqual(V21.relationFor(muscle.muscleId, motion, side), V2.relationFor(muscle.muscleId, motion, side));
        }
      }
      if (v21.status === "ranked" || v21.status === "tied") {
        const count = v21.candidates.length;
        if (count === 0) distribution.zero += 1;
        else if (count === 1) distribution.one += 1;
        else if (count <= 3) distribution.twoToThree += 1;
        else distribution.fourPlus += 1;
        const top = v21.candidates.filter((candidate) => candidate.rank === 1);
        if (v21.primaryEvidenceGroup.length && top.every((candidate) => candidate.locationEligibility === "secondary")) secondaryTakeover += 1;
        if (v21.primaryEvidenceGroup.length && !v21.candidates.some((candidate) => candidate.displayGroup === "primary_evidence")) primaryEvidenceMissing += 1;
        if (v21.candidates.some((candidate) => candidate.allSelectedRelationsNone)) noneRanked += 1;
        if (v21.candidates.some((candidate) => candidate.onlyStretch)) stretchOnlyRanked += 1;
      }
      if (v21.sourceOrderUsedForTop1) sourceOrderOnly += 1;
    }
  }
}

assert.strictEqual(evaluated, 1860);
assert.deepStrictEqual(status, { ranked: 824, tied: 586, insufficient: 392, stretch_only_reference: 58 });
assert.deepStrictEqual(distribution, { zero: 0, one: 62, twoToThree: 436, fourPlus: 912 });
assert.strictEqual(sourceOrderOnly, 0);
assert.strictEqual(secondaryTakeover, 0);
assert.strictEqual(primaryEvidenceMissing, 0);
assert.strictEqual(noneRanked, 0);
assert.strictEqual(stretchOnlyRanked, 0);

console.log("Neck precision-v2.1 structural checks passed (1,860 patterns).");
