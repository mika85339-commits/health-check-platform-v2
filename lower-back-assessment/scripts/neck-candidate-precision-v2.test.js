const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "..");
const PrecisionV2 = require(path.join(root, "neck-candidate-precision-v2.js"));

assert.strictEqual(PrecisionV2.VERSION, "neck-precision-v2-local-hypothesis");
assert.strictEqual(PrecisionV2.MUSCLE_MASTER.length, 7);
assert.deepStrictEqual(PrecisionV2.DEFAULT_CONFIG.relationPoints, {
  primary: 8,
  secondary: 5,
  shared: 3,
  stretch: 1,
  none: 0
});
assert.deepStrictEqual(PrecisionV2.DEFAULT_CONFIG.diminishingFactors, [1, 0.5, 0.25]);
assert(!PrecisionV2.MUSCLE_MASTER.some((muscle) => muscle.sources.some((source) => String(source).includes("23916077"))));
assert.strictEqual(PrecisionV2.PENDING_CITATIONS.trapeziusNuance.status, "citation_pending_not_used_by_precision_v2");

const nck002 = PrecisionV2.rank({ painLocation: "neck_front", side: "left", situations: ["turn_right"] });
assert.strictEqual(nck002.status, "ranked");
assert.strictEqual(nck002.candidates[0].muscleId, "neck_sternocleidomastoid");
assert(!nck002.candidates.some((candidate) => candidate.muscleId === "neck_deep_flexors"), "A none relation must not survive on location alone.");
assert(nck002.candidates.every((candidate) => candidate.positiveEvidence.length > 0));
assert(nck002.candidates.every((candidate) => candidate.motionEvidence.some((evidence) => evidence.relation !== "none")));

const deepFlexion = PrecisionV2.rank({ painLocation: "neck_front", side: "center", situations: ["look_down"] });
const deepFlexor = deepFlexion.candidates.find((candidate) => candidate.muscleId === "neck_deep_flexors");
assert(deepFlexor);
assert.strictEqual(deepFlexor.motionEvidence[0].relation, "secondary");

assert.strictEqual(
  PrecisionV2.relationFor("neck_levator_scapulae", "turn_right", "right"),
  "secondary"
);

assert.strictEqual(
  PrecisionV2.relationFor("neck_splenius_capitis_cervicis", "side_bend_right", "right"),
  "secondary"
);

assert.strictEqual(
  PrecisionV2.movementScore([{ points: 8 }, { points: 8 }, { points: 8 }], { aggregation: "diminishing", diminishingFactors: [1, 0.5, 0.25] }),
  14
);
assert.strictEqual(
  PrecisionV2.movementScore([{ points: 8 }, { points: 8 }, { points: 8 }], { aggregation: "simple", diminishingFactors: [1, 0.5, 0.25] }),
  24
);

[
  { painLocation: "location_unclear", side: "right", situations: ["turn_right"], reason: "location_unclear" },
  { painLocation: "neck_side", side: "right", situations: ["movement_unclear"], reason: "movement_unclear" },
  { painLocation: "neck_side", side: "right", situations: [], reason: "no_valid_directional_movement" },
  { painLocation: "neck_back", side: "right", situations: ["look_up"], reason: "legacy_location_not_supported" }
].forEach((input) => {
  const result = PrecisionV2.rank(input);
  assert.strictEqual(result.status, "insufficient");
  assert.strictEqual(result.insufficientReason, input.reason);
  assert.strictEqual(result.candidates.length, 0);
});

const tied = PrecisionV2.rank({ painLocation: "neck_side", side: "right", situations: ["look_down"] });
assert.strictEqual(tied.status, "tied");
assert.strictEqual(tied.topTie, true);
assert(tied.candidates.filter((candidate) => candidate.rank === 1).length > 1);
assert.strictEqual(tied.sourceOrderUsedForTop1, false);

const clean = PrecisionV2.rank({ painLocation: "neck_side", side: "right", situations: ["side_bend_right"] });
const noisy = PrecisionV2.rank({
  painLocation: "neck_side",
  side: "right",
  situations: ["side_bend_right", "morning", "desk_work"],
  symptoms: ["numbness", "weakness"],
  timing: "continuous",
  spread: "limb"
});
const compact = (result) => result.candidates.map(({ muscleId, score, rank }) => ({ muscleId, score, rank }));
assert.deepStrictEqual(compact(clean), compact(noisy), "Legacy contexts and symptom descriptions must not alter precision-v2 ranking.");

console.log("Neck precision-v2 structural checks passed.");
