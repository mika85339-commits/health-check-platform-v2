const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const NeckPrecision = require(path.join(root, "neck-candidate-precision.js"));

assert.strictEqual(NeckPrecision.VERSION, "neck-precision-v1-local-review");
assert.strictEqual(NeckPrecision.MUSCLE_MASTER.length, 7);
assert.strictEqual(new Set(NeckPrecision.MUSCLE_MASTER.map((item) => item.muscleId)).size, 7);
NeckPrecision.MUSCLE_MASTER.forEach((item) => {
  assert(item.muscleId.startsWith("neck_"), `${item.name} needs a stable neck muscleId.`);
  assert(item.model3dId, `${item.name} needs a future-safe model3dId.`);
  assert(item.scoringQuestions.includes("painLocation"), `${item.name} must use detailed location.`);
  assert(item.sources.length > 0, `${item.name} needs traceable anatomy sources.`);
});

function compact(result) {
  return result.candidates.map(({ muscleId, score, rank, tiedAtRank }) => ({ muscleId, score, rank, tiedAtRank }));
}

const base = {
  painLocation: "neck_side",
  situations: ["turn_left", "side_bend_right"],
  symptoms: ["tight"],
  timing: "middle",
  side: "right",
  spread: "local"
};
const noisy = {
  ...base,
  situations: [...base.situations, "phone_long"],
  symptoms: ["sharp", "numbness", "better_rest"],
  timing: "continuous",
  spread: "limb"
};
assert.deepStrictEqual(compact(NeckPrecision.rank(base)), compact(NeckPrecision.rank(noisy)), "Context, feeling, timing and spread must not rank neck muscles in precision-v1.");

const scmContract = NeckPrecision.rank({ painLocation: "neck_front", situations: ["turn_left"], side: "right" });
const scmRow = scmContract.candidates.find((item) => item.muscleId === "neck_sternocleidomastoid");
assert(scmRow, "Right SCM should remain a candidate for left rotation with right-sided symptoms.");
assert.strictEqual(scmRow.motionEvidence[0].relation, "primary");
assert.strictEqual(scmRow.movementPoints, NeckPrecision.RELATION_POINTS.primary, "One answer must receive one relation-class score only.");

const scmStretch = NeckPrecision.rank({ painLocation: "neck_front", situations: ["turn_right"], side: "right" });
assert.strictEqual(scmStretch.candidates.find((item) => item.muscleId === "neck_sternocleidomastoid").motionEvidence[0].relation, "stretch");

const unclear = NeckPrecision.rank({
  painLocation: "location_unclear",
  situations: ["movement_unclear", "morning"],
  symptoms: ["heavy"],
  timing: "unclear",
  side: "both",
  spread: "local"
});
assert.strictEqual(unclear.status, "insufficient");
assert.strictEqual(unclear.candidates.length, 7);
assert(unclear.candidates.every((item) => item.rank === 1 && item.tiedAtRank), "Insufficient input must remain an explicit all-candidate tie.");
assert.strictEqual(unclear.sourceOrderUsedForTop1, false);

const posteriorUpper = NeckPrecision.rank({ painLocation: "neck_back_upper", situations: ["chin_tuck"], side: "center" });
assert(posteriorUpper.candidates.slice(0, 2).some((item) => item.muscleId === "neck_suboccipitals"));
assert(!posteriorUpper.candidates.some((item) => item.muscleId === "neck_deep_flexors"), "Posterior-upper location must prevent an anterior-only muscle from surfacing on chin tuck alone.");

const shrug = NeckPrecision.rank({ painLocation: "neck_back_lower", situations: ["shoulder_shrug"], side: "right" });
assert(shrug.candidates.slice(0, 3).some((item) => item.muscleId === "neck_upper_trapezius"));
assert(shrug.candidates.slice(0, 3).some((item) => item.muscleId === "neck_levator_scapulae"));

const situations = NeckPrecision.SITUATION_OPTIONS.map(([id]) => id);
const locations = [...NeckPrecision.LOCATION_OPTIONS.map(([id]) => id), "location_unclear"];
const sides = ["right", "left", "both", "center"];
let evaluated = 0;
for (const painLocation of locations) {
  for (const situation of situations) {
    for (const side of sides) {
      const result = NeckPrecision.rank({ painLocation, situations: [situation], side });
      assert(result.candidates.length > 0, `No candidates for ${painLocation}/${situation}/${side}`);
      assert.strictEqual(result.sourceOrderUsedForTop1, false);
      evaluated += 1;
    }
  }
}

console.log(`Neck precision regression checks passed (${evaluated} single-motion states).`);
