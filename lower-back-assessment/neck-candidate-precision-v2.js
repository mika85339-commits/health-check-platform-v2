(function (root, factory) {
  const base = typeof module === "object" && module.exports
    ? require("./neck-candidate-precision.js")
    : root?.HealthCheckNeckPrecision;
  const api = factory(base);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckNeckPrecisionV2 = api;
})(typeof window !== "undefined" ? window : globalThis, function (BasePrecision) {
  "use strict";

  if (!BasePrecision) throw new Error("neck-candidate-precision-v2 requires precision-v1 metadata");

  const VERSION = "neck-precision-v2-local-hypothesis";
  const UNCLEAR_SITUATION = "movement_unclear";
  const UNCLEAR_LOCATION = "location_unclear";
  const LEGACY_LOCATION = "neck_back";

  const DEFAULT_CONFIG = Object.freeze({
    relationPoints: Object.freeze({
      primary: 8,
      secondary: 5,
      shared: 3,
      stretch: 1,
      none: 0
    }),
    diminishingFactors: Object.freeze([1, 0.5, 0.25]),
    aggregation: "diminishing",
    locationPriority: Object.freeze({ primary: 2, secondary: 1, outside: 0 })
  });

  const MOVEMENT_IDS = new Set([
    "look_down",
    "look_up",
    "turn_right",
    "turn_left",
    "side_bend_right",
    "side_bend_left",
    "shoulder_shrug",
    "chin_tuck"
  ]);

  const SITUATION_OPTIONS = Object.freeze([
    ["look_down", "下を向く時"],
    ["look_up", "上を向く時"],
    ["turn_right", "右を向く時"],
    ["turn_left", "左を向く時"],
    ["side_bend_right", "首を右へ倒す時"],
    ["side_bend_left", "首を左へ倒す時"],
    ["shoulder_shrug", "肩をすくめる時"],
    ["chin_tuck", "あごを軽く引く時"]
  ].map((item) => Object.freeze(item)));

  const LOCATION_OPTIONS = BasePrecision.LOCATION_OPTIONS;
  const LABELS = Object.freeze(Object.fromEntries([
    ...SITUATION_OPTIONS,
    [UNCLEAR_SITUATION, "特定の動きが分からない"]
  ]));

  const LOCATION_ELIGIBILITY = Object.freeze({
    neck_sternocleidomastoid: Object.freeze({ neck_front: "primary", neck_side: "primary" }),
    neck_deep_flexors: Object.freeze({ neck_front: "primary" }),
    neck_scalenes: Object.freeze({ neck_side: "primary", neck_front: "secondary" }),
    neck_suboccipitals: Object.freeze({ neck_back_upper: "primary", neck_back_lower: "secondary" }),
    neck_splenius_capitis_cervicis: Object.freeze({ neck_back_upper: "primary", neck_back_lower: "primary", neck_side: "secondary" }),
    neck_upper_trapezius: Object.freeze({ neck_back_lower: "primary", neck_back_upper: "secondary", neck_side: "secondary" }),
    neck_levator_scapulae: Object.freeze({ neck_side: "primary", neck_back_lower: "primary", neck_back_upper: "secondary" })
  });

  const PENDING_CITATIONS = Object.freeze({
    trapeziusNuance: Object.freeze({
      previousPubmedId: "23916077",
      status: "citation_pending_not_used_by_precision_v2"
    })
  });

  const MUSCLE_MASTER = Object.freeze(BasePrecision.MUSCLE_MASTER.map((muscle) => Object.freeze({
    ...muscle,
    sources: Object.freeze((muscle.sources || []).filter((source) => !String(source).includes("23916077"))),
    precisionV2CitationStatus: muscle.muscleId === "neck_upper_trapezius"
      ? PENDING_CITATIONS.trapeziusNuance.status
      : "reviewed_source_list_carried_from_precision_v1"
  })));

  function directionOf(motion) {
    if (motion.endsWith("_right")) return "right";
    if (motion.endsWith("_left")) return "left";
    return "";
  }

  function sideRelation(side, direction, sameRelation, oppositeRelation, nonLateralRelation = "shared") {
    if (!direction || !["right", "left"].includes(side)) return nonLateralRelation;
    return side === direction ? sameRelation : oppositeRelation;
  }

  function relationFor(muscleId, motion, side) {
    if (!MOVEMENT_IDS.has(motion)) return "none";
    const direction = directionOf(motion);

    if (muscleId === "neck_sternocleidomastoid") {
      if (motion.startsWith("turn_")) return sideRelation(side, direction, "stretch", "primary");
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "primary", "stretch");
      if (motion === "look_down" || motion === "chin_tuck") return "secondary";
      if (motion === "look_up") return "stretch";
      return "none";
    }
    if (muscleId === "neck_deep_flexors") {
      if (motion === "chin_tuck") return "primary";
      if (motion === "look_down") return "secondary";
      if (motion === "look_up") return "stretch";
      return "none";
    }
    if (muscleId === "neck_scalenes") {
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "primary", "stretch");
      if (motion.startsWith("turn_")) return sideRelation(side, direction, "secondary", "stretch");
      if (motion === "look_down") return "secondary";
      return "none";
    }
    if (muscleId === "neck_suboccipitals") {
      if (motion.startsWith("turn_")) return sideRelation(side, direction, "primary", "stretch");
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "secondary", "stretch");
      if (motion === "look_up") return "primary";
      if (motion === "chin_tuck" || motion === "look_down") return "stretch";
      return "none";
    }
    if (muscleId === "neck_splenius_capitis_cervicis") {
      if (motion.startsWith("turn_")) return sideRelation(side, direction, "primary", "stretch");
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "secondary", "stretch");
      if (motion === "look_up") return "primary";
      if (motion === "look_down" || motion === "chin_tuck") return "stretch";
      return "none";
    }
    if (muscleId === "neck_upper_trapezius") {
      if (motion === "shoulder_shrug") return "primary";
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "secondary", "stretch");
      if (motion === "look_up") return "secondary";
      if (motion === "look_down") return "stretch";
      if (motion.startsWith("turn_")) return "shared";
      return "none";
    }
    if (muscleId === "neck_levator_scapulae") {
      if (motion === "shoulder_shrug") return "primary";
      if (motion.startsWith("turn_") || motion.startsWith("side_bend_")) {
        return sideRelation(side, direction, "secondary", "stretch");
      }
      if (motion === "look_up") return "secondary";
      if (motion === "look_down" || motion === "chin_tuck") return "stretch";
      return "none";
    }
    return "none";
  }

  function locationEligibility(muscleId, location) {
    if (!location || location === UNCLEAR_LOCATION || location === LEGACY_LOCATION) return "outside";
    return LOCATION_ELIGIBILITY[muscleId]?.[location] || "outside";
  }

  function mergeConfig(overrides = {}) {
    return {
      relationPoints: { ...DEFAULT_CONFIG.relationPoints, ...(overrides.relationPoints || {}) },
      diminishingFactors: Array.isArray(overrides.diminishingFactors)
        ? [...overrides.diminishingFactors]
        : [...DEFAULT_CONFIG.diminishingFactors],
      aggregation: overrides.aggregation === "simple" ? "simple" : DEFAULT_CONFIG.aggregation,
      locationPriority: { ...DEFAULT_CONFIG.locationPriority, ...(overrides.locationPriority || {}) }
    };
  }

  function movementScore(evidence, config) {
    const sortedPoints = evidence.map((item) => item.points).sort((a, b) => b - a);
    if (config.aggregation === "simple") return sortedPoints.reduce((sum, points) => sum + points, 0);
    return sortedPoints.reduce((sum, points, index) => sum + points * (config.diminishingFactors[index] || 0), 0);
  }

  function relationReason(relation, motion) {
    const label = LABELS[motion] || motion;
    if (relation === "primary") return `「${label}」と主な作用方向が重なります`;
    if (relation === "secondary") return `「${label}」に補助的に関わります`;
    if (relation === "shared") return `「${label}」に関わり得る動きです`;
    return `「${label}」で伸ばされる方向と重なります`;
  }

  function unranked(reason, details) {
    return {
      version: VERSION,
      status: "insufficient",
      insufficientReason: reason,
      topTie: false,
      sourceOrderUsedForTop1: false,
      candidatePool: [],
      displayRanking: [],
      candidates: [],
      ...details
    };
  }

  function rank(answers = {}, overrides = {}) {
    const config = mergeConfig(overrides);
    const painLocation = answers.painLocation || UNCLEAR_LOCATION;
    const side = answers.side || "center";
    const situations = [...new Set(Array.isArray(answers.situations) ? answers.situations : [])];
    const hasUnclearMovement = situations.includes(UNCLEAR_SITUATION);
    const movements = situations.filter((id) => MOVEMENT_IDS.has(id));
    const common = {
      config,
      painLocation,
      side,
      movements,
      ignoredInputs: {
        situations: situations.filter((id) => !MOVEMENT_IDS.has(id) && id !== UNCLEAR_SITUATION),
        symptoms: Array.isArray(answers.symptoms) ? [...answers.symptoms] : [],
        timing: answers.timing || "",
        spread: answers.spread || ""
      }
    };

    if (painLocation === LEGACY_LOCATION) return unranked("legacy_location_not_supported", common);
    if (!painLocation || painLocation === UNCLEAR_LOCATION) return unranked("location_unclear", common);
    if (hasUnclearMovement) return unranked("movement_unclear", common);
    if (!movements.length) return unranked("no_valid_directional_movement", common);

    const candidatePool = MUSCLE_MASTER.map((muscle) => {
      const eligibility = locationEligibility(muscle.muscleId, painLocation);
      const motionEvidence = movements.map((motion) => {
        const relation = relationFor(muscle.muscleId, motion, side);
        return {
          motion,
          relation,
          points: config.relationPoints[relation] || 0
        };
      });
      const positiveEvidence = motionEvidence.filter((item) => item.relation !== "none" && item.points > 0);
      const simpleMovementPoints = movementScore(positiveEvidence, { ...config, aggregation: "simple" });
      const movementPoints = movementScore(positiveEvidence, config);
      const hasMovementEvidence = positiveEvidence.length > 0;
      const locationQualified = eligibility === "primary" || (eligibility === "secondary" && hasMovementEvidence);
      const relationCounts = positiveEvidence.reduce((counts, item) => {
        counts[item.relation] = (counts[item.relation] || 0) + 1;
        return counts;
      }, { primary: 0, secondary: 0, shared: 0, stretch: 0 });
      return {
        muscleId: muscle.muscleId,
        model3dId: muscle.model3dId,
        name: muscle.name,
        locationEligibility: eligibility,
        locationPriority: config.locationPriority[eligibility] || 0,
        locationQualified,
        motionEvidence,
        positiveEvidence,
        relationCounts,
        bestRelationPoints: Math.max(0, ...positiveEvidence.map((item) => item.points)),
        movementPoints,
        simpleMovementPoints,
        onlyStretch: positiveEvidence.length > 0 && positiveEvidence.every((item) => item.relation === "stretch"),
        allSelectedRelationsNone: positiveEvidence.length === 0
      };
    }).filter((item) => item.locationQualified && !item.allSelectedRelationsNone);

    if (!candidatePool.length) return unranked("no_eligible_candidate", { ...common, candidatePool: [] });

    const strongestRelationPoints = Math.max(...candidatePool.map((item) => item.bestRelationPoints));
    const displayPool = candidatePool.filter((item) => item.bestRelationPoints === strongestRelationPoints
      || item.movementPoints >= strongestRelationPoints);
    const displayRanking = displayPool
      .map((item) => ({ ...item }))
      .sort((a, b) => b.movementPoints - a.movementPoints
        || b.locationPriority - a.locationPriority
        || a.name.localeCompare(b.name, "ja"));

    let previous = null;
    let previousRank = 0;
    const locationLabel = LOCATION_OPTIONS.find(([id]) => id === painLocation)?.[1] || painLocation;
    displayRanking.forEach((item, index) => {
      const tieKey = `${item.movementPoints}|${item.locationPriority}`;
      const rankNumber = tieKey === previous ? previousRank : index + 1;
      previous = tieKey;
      previousRank = rankNumber;
      item.rank = rankNumber;
      item.tiedAtRank = false;
      item.score = item.movementPoints;
      item.locationKnown = true;
      item.locationMatched = true;
      item.painLocationLabel = locationLabel;
      item.relation = `回答との一致：場所・動き・左右`;
      item.reasons = [
        `「${locationLabel}」は${item.locationEligibility === "primary" ? "主な位置" : "関連し得る位置"}です`,
        ...item.positiveEvidence.slice(0, 3).map((evidence) => relationReason(evidence.relation, evidence.motion))
      ];
      item.matchedMotions = item.positiveEvidence.map((evidence) => evidence.motion);
      item.matchedContexts = [];
      item.matchedSymptoms = [];
      item.supportAxes = ["場所", "動き・左右"];
    });

    const countsByRank = displayRanking.reduce((counts, item) => {
      counts.set(item.rank, (counts.get(item.rank) || 0) + 1);
      return counts;
    }, new Map());
    displayRanking.forEach((item) => {
      item.tiedAtRank = (countsByRank.get(item.rank) || 0) > 1;
    });

    const topTie = displayRanking.filter((item) => item.rank === 1).length > 1;
    return {
      ...common,
      version: VERSION,
      status: topTie ? "tied" : "ranked",
      insufficientReason: "",
      topTie,
      sourceOrderUsedForTop1: false,
      candidatePool,
      displayRanking,
      candidates: displayRanking
    };
  }

  return Object.freeze({
    VERSION,
    UNCLEAR_SITUATION,
    UNCLEAR_LOCATION,
    DEFAULT_CONFIG,
    SITUATION_OPTIONS,
    LOCATION_OPTIONS,
    LOCATION_ELIGIBILITY,
    PENDING_CITATIONS,
    MUSCLE_MASTER,
    MOVEMENT_IDS,
    rank,
    relationFor,
    locationEligibility,
    movementScore
  });
});
