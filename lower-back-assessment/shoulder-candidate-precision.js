(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckShoulderPrecision = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "shoulder-precision-v1-local-hypothesis";
  const MOVEMENTS = Object.freeze([
    ["front_raise", "腕を前から上げる時"],
    ["side_raise", "腕を横から上げる時"],
    ["external_rotation", "肘を体の横につけたまま、前腕を外へ開く時"],
    ["internal_rotation", "肘を体の横につけたまま、前腕を内側へ動かす時"],
    ["shoulder_shrug", "腕を上げずに、肩だけをすくめる時"]
  ]);
  const LOCATIONS = Object.freeze([
    ["shoulder_front", "肩の前"],
    ["shoulder_outer", "肩の横"],
    ["shoulder_top", "肩の上"],
    ["shoulder_back", "肩の後ろ"]
  ]);
  const SIDES = Object.freeze(["right", "left", "both", "center"]);
  const MOVEMENT_IDS = new Set(MOVEMENTS.map(([id]) => id));
  const LOCATION_IDS = new Set(LOCATIONS.map(([id]) => id));
  const CONFIG = Object.freeze({
    points: Object.freeze({ primary: 3, shared: 3, secondary: 2, stretch: 0, none: 0 }),
    decay: Object.freeze([1, 0.5, 0.25])
  });
  const MASTER = Object.freeze([
    ["shoulder_upper_trapezius", "僧帽筋上部", ["O", "S", "P", "S"], ["S", "S", "N", "N", "P"], ["MEDIUM", "MEDIUM", "REVIEW", "REVIEW", "HIGH"]],
    ["shoulder_deltoid", "三角筋", ["P", "P", "S", "P"], ["H", "H", "S", "S", "N"], ["HIGH", "HIGH", "REVIEW", "REVIEW", "REVIEW"]],
    ["shoulder_supraspinatus", "棘上筋", ["O", "P", "S", "S"], ["S", "H", "S", "N", "N"], ["REVIEW", "HIGH", "REVIEW", "REVIEW", "REVIEW"]],
    ["shoulder_subscapularis", "肩甲下筋", ["P", "S", "O", "O"], ["S", "S", "T", "H", "N"], ["REVIEW", "REVIEW", "REVIEW", "HIGH", "REVIEW"]],
    ["shoulder_infraspinatus_teres_minor_group", "棘下筋・小円筋", ["O", "S", "O", "P"], ["S", "S", "P", "T", "N"], ["MEDIUM", "MEDIUM", "HIGH", "REVIEW", "REVIEW"]],
    ["shoulder_pectoralis_major", "大胸筋", ["P", "O", "O", "O"], ["H", "N", "T", "H", "N"], ["HIGH", "REVIEW", "REVIEW", "MEDIUM", "REVIEW"]]
  ].map(([muscleId, displayName, locations, movements, confidence]) => Object.freeze({
    muscleId,
    displayName,
    imageId: displayName,
    model3dId: null,
    legacyImageAlias: displayName,
    locations: Object.freeze(locations),
    movements: Object.freeze(movements),
    confidence: Object.freeze(confidence)
  })));
  const LOCATION_RELATION = Object.freeze({ P: "primary", S: "secondary", O: "outside" });
  const MOVEMENT_RELATION = Object.freeze({ P: "primary", H: "shared", S: "secondary", T: "stretch", N: "none" });
  const DELTOID_TAGS = Object.freeze({
    front_raise: "anterior",
    side_raise: "middle",
    external_rotation: "posterior",
    internal_rotation: "anterior"
  });
  const OUTSIDE_MASTER_NOTES = Object.freeze({
    shoulder_shrug: Object.freeze({ name: "肩甲挙筋", note: "肩すくめにも関わるが、肩precision-v1の6候補には含めていない" })
  });

  function movementSets() {
    const sets = [["movement_unclear"]];
    const ids = MOVEMENTS.map(([id]) => id);
    for (let size = 1; size <= 3; size += 1) {
      const visit = (start, picked) => {
        if (picked.length === size) {
          sets.push([...picked]);
          return;
        }
        for (let index = start; index < ids.length; index += 1) visit(index + 1, [...picked, ids[index]]);
      };
      visit(0, []);
    }
    return sets;
  }

  function normalizedMovements(value) {
    const ids = [...new Set(Array.isArray(value) ? value : [])].filter((id) => MOVEMENT_IDS.has(id));
    return ids.sort().slice(0, 3);
  }

  function scoreEvidence(evidence, decay) {
    const strengths = evidence
      .filter(({ relation, confidence }) => CONFIG.points[relation] > 0 && confidence !== "REVIEW")
      .map(({ relation }) => CONFIG.points[relation])
      .sort((a, b) => b - a);
    return strengths.slice(0, 3).reduce((sum, points, index) => sum + points * decay[index], 0);
  }

  function rank(answers = {}, options = {}) {
    const location = LOCATION_IDS.has(answers.painLocation) ? answers.painLocation : "location_unclear";
    const selected = normalizedMovements(answers.situations);
    const locationIndex = LOCATIONS.findIndex(([id]) => id === location);
    const decay = options.simpleSum ? [1, 1, 1] : CONFIG.decay;
    const entries = MASTER.map((master) => {
      const locationRelation = locationIndex < 0 ? "unknown" : LOCATION_RELATION[master.locations[locationIndex]];
      const evidence = selected.map((motion) => {
        const index = MOVEMENTS.findIndex(([id]) => id === motion);
        return {
          motion,
          relation: MOVEMENT_RELATION[master.movements[index]],
          confidence: master.confidence[index],
          tag: master.muscleId === "shoulder_deltoid" ? DELTOID_TAGS[motion] || null : null
        };
      });
      const positive = evidence.filter(({ relation }) => ["primary", "shared", "secondary"].includes(relation));
      const strong = positive.filter(({ relation }) => relation === "primary" || relation === "shared");
      const hasLocation = locationRelation === "primary" || locationRelation === "secondary";
      const main = hasLocation && strong.length > 0;
      const additional = !main && (strong.length > 0 || (hasLocation && positive.length > 0));
      return {
        ...master,
        locationRelation,
        evidence,
        positiveEvidence: positive,
        displayGroup: main ? "Main" : additional ? "Additional" : "",
        score: scoreEvidence(evidence, decay)
      };
    });
    const main = entries.filter((entry) => entry.displayGroup === "Main");
    const additional = entries.filter((entry) => entry.displayGroup === "Additional");
    const stretches = entries.filter((entry) => entry.locationRelation !== "unknown"
      && entry.locationRelation !== "outside"
      && entry.evidence.some(({ relation, confidence }) => relation === "stretch" && confidence !== "REVIEW"));
    const hasTrustedMain = main.some((entry) => entry.score > 0);
    const hasValidLocation = locationIndex >= 0;
    const statusWithoutCandidates = hasValidLocation && selected.length && !main.length && !additional.length && stretches.length
      ? "stretch_only_reference"
      : "insufficient";
    if (!hasValidLocation || !selected.length || !main.length || !hasTrustedMain) {
      return {
        version: VERSION,
        status: statusWithoutCandidates,
        candidates: [],
        additionalCandidates: additional.map((entry) => entry.muscleId),
        referenceCandidates: statusWithoutCandidates === "stretch_only_reference" ? stretches.map((entry) => entry.displayName) : [],
        topTie: false,
        sourceOrderUsedForTop1: false
      };
    }

    const pool = [...main, ...additional].filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.muscleId.localeCompare(b.muscleId));
    const topScore = pool[0]?.score || 0;
    const topEntries = pool.filter((entry) => entry.score === topScore);
    // A movement-only Additional lead cannot be presented as a location-supported top muscle.
    if (!topEntries.some((entry) => entry.displayGroup === "Main")) {
      return {
        version: VERSION,
        status: "insufficient",
        candidates: [],
        additionalCandidates: additional.map((entry) => entry.muscleId),
        referenceCandidates: [],
        topTie: false,
        sourceOrderUsedForTop1: false
      };
    }
    const topTie = topEntries.length > 1;
    const candidates = pool.map((entry) => {
      const rankIndex = pool.findIndex((other) => other.score === entry.score);
      const tiedAtRank = pool.filter((other) => other.score === entry.score).length > 1;
      const matchedMotions = entry.positiveEvidence.map(({ motion }) => motion);
      return {
        name: entry.displayName,
        displayName: entry.displayName,
        muscleId: entry.muscleId,
        imageId: entry.imageId,
        model3dId: entry.model3dId,
        score: entry.score,
        rank: rankIndex + 1,
        tiedAtRank,
        displayGroup: entry.displayGroup,
        isAdditionalCandidate: entry.displayGroup === "Additional",
        locationRelation: entry.locationRelation,
        locationKnown: true,
        locationMatched: entry.locationRelation !== "outside",
        painLocationLabel: LOCATIONS[locationIndex]?.[1] || "",
        supportAxes: entry.locationRelation === "outside" ? ["動き"] : ["場所", "動き"],
        matchedMotions,
        matchedContexts: [],
        matchedSymptoms: [],
        evidence: entry.evidence,
        evidenceTags: entry.evidence.map(({ tag }) => tag).filter(Boolean),
        reasons: matchedMotions.slice(0, 2).map((motion) => `「${MOVEMENTS.find(([id]) => id === motion)?.[1]}」に関わる動きから候補として表示しています`)
      };
    });
    return {
      version: VERSION,
      status: topTie ? "tied" : "ranked",
      candidates,
      additionalCandidates: [],
      referenceCandidates: [],
      topTie,
      sourceOrderUsedForTop1: false
    };
  }

  return { VERSION, MASTER, MOVEMENTS, LOCATIONS, SIDES, CONFIG, OUTSIDE_MASTER_NOTES, movementSets, rank };
});
