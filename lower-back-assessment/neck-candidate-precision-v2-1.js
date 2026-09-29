(function (root, factory) {
  const precisionV2 = typeof module === "object" && module.exports
    ? require("./neck-candidate-precision-v2.js")
    : root?.HealthCheckNeckPrecisionV2;
  const api = factory(precisionV2);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckNeckPrecisionV21 = api;
})(typeof window !== "undefined" ? window : globalThis, function (PrecisionV2) {
  "use strict";

  if (!PrecisionV2) throw new Error("neck-candidate-precision-v2-1 requires precision-v2");

  const VERSION = "neck-precision-v2.1-local-hypothesis";
  const NON_STRETCH_RELATIONS = new Set(["primary", "secondary", "shared"]);

  function hasNonStretchEvidence(candidate) {
    return candidate.positiveEvidence.some((item) => NON_STRETCH_RELATIONS.has(item.relation));
  }

  function movementLabel(motion) {
    return PrecisionV2.SITUATION_OPTIONS.find(([id]) => id === motion)?.[1] || motion;
  }

  function relationReason(relation, motion) {
    const label = movementLabel(motion);
    if (relation === "primary") return `「${label}」と主な作用方向が重なります`;
    if (relation === "secondary") return `「${label}」に補助的に関わります`;
    if (relation === "shared") return `「${label}」に関わり得る動きです`;
    return `「${label}」で伸ばされる方向と重なります`;
  }

  function decorate(candidate, painLocation, displayGroup, rank, tiedAtRank) {
    const locationLabel = PrecisionV2.LOCATION_OPTIONS.find(([id]) => id === painLocation)?.[1] || painLocation;
    return {
      ...candidate,
      rank,
      tiedAtRank,
      score: candidate.movementPoints,
      displayGroup,
      isAdditionalCandidate: displayGroup === "secondary_additional",
      locationKnown: true,
      locationMatched: true,
      painLocationLabel: locationLabel,
      relation: "回答との一致：場所・動き・左右",
      reasons: [
        `「${locationLabel}」は${candidate.locationEligibility === "primary" ? "主な位置" : "関連し得る位置"}です`,
        ...candidate.positiveEvidence.slice(0, 3).map((item) => relationReason(item.relation, item.motion))
      ],
      matchedMotions: candidate.positiveEvidence.map((item) => item.motion),
      matchedContexts: [],
      matchedSymptoms: [],
      supportAxes: ["場所", "動き・左右"]
    };
  }

  function sortByMovementEvidence(candidates) {
    return [...candidates].sort((a, b) => b.movementPoints - a.movementPoints
      || a.name.localeCompare(b.name, "ja"));
  }

  function rankGroup(candidates, painLocation, displayGroup, offset) {
    const sorted = sortByMovementEvidence(candidates);
    let previousScore = null;
    let previousRank = offset + 1;
    const ranked = sorted.map((candidate, index) => {
      const rank = candidate.movementPoints === previousScore ? previousRank : offset + index + 1;
      previousScore = candidate.movementPoints;
      previousRank = rank;
      return decorate(candidate, painLocation, displayGroup, rank, false);
    });
    const counts = ranked.reduce((map, candidate) => {
      map.set(candidate.rank, (map.get(candidate.rank) || 0) + 1);
      return map;
    }, new Map());
    return ranked.map((candidate) => ({
      ...candidate,
      tiedAtRank: (counts.get(candidate.rank) || 0) > 1
    }));
  }

  function rank(answers = {}, overrides = {}) {
    const base = PrecisionV2.rank(answers, overrides);
    if (base.status === "insufficient") {
      return {
        ...base,
        version: VERSION,
        displayCandidates: [],
        referenceCandidates: [],
        primaryEvidenceGroup: [],
        secondaryEvidenceGroup: []
      };
    }

    const candidatePool = base.candidatePool.map((candidate) => ({ ...candidate }));
    const nonStretchPool = candidatePool.filter(hasNonStretchEvidence);
    const stretchReferenceCandidates = candidatePool.filter((candidate) => !hasNonStretchEvidence(candidate));

    if (!nonStretchPool.length) {
      return {
        ...base,
        version: VERSION,
        status: "stretch_only_reference",
        insufficientReason: "stretch_only_evidence",
        topTie: false,
        sourceOrderUsedForTop1: false,
        candidatePool,
        displayRanking: [],
        displayCandidates: [],
        candidates: [],
        referenceCandidates: sortByMovementEvidence(stretchReferenceCandidates),
        primaryEvidenceGroup: [],
        secondaryEvidenceGroup: []
      };
    }

    const primaryEvidenceGroup = nonStretchPool.filter((candidate) => candidate.locationEligibility === "primary");
    const secondaryEvidenceGroup = nonStretchPool.filter((candidate) => candidate.locationEligibility === "secondary");
    const primaryDisplay = primaryEvidenceGroup.length
      ? rankGroup(primaryEvidenceGroup, base.painLocation, "primary_evidence", 0)
      : [];
    const secondaryDisplay = rankGroup(
      secondaryEvidenceGroup,
      base.painLocation,
      primaryEvidenceGroup.length ? "secondary_additional" : "secondary_evidence",
      primaryDisplay.length
    );
    const displayRanking = [...primaryDisplay, ...secondaryDisplay];
    const topTie = displayRanking.filter((candidate) => candidate.rank === 1).length > 1;

    return {
      ...base,
      version: VERSION,
      status: topTie ? "tied" : "ranked",
      insufficientReason: "",
      topTie,
      sourceOrderUsedForTop1: false,
      candidatePool,
      displayRanking,
      displayCandidates: displayRanking,
      candidates: displayRanking,
      referenceCandidates: stretchReferenceCandidates,
      primaryEvidenceGroup,
      secondaryEvidenceGroup,
      hierarchyApplied: primaryEvidenceGroup.length > 0
    };
  }

  return Object.freeze({
    VERSION,
    NON_STRETCH_RELATIONS,
    DEFAULT_CONFIG: PrecisionV2.DEFAULT_CONFIG,
    SITUATION_OPTIONS: PrecisionV2.SITUATION_OPTIONS,
    LOCATION_OPTIONS: PrecisionV2.LOCATION_OPTIONS,
    LOCATION_ELIGIBILITY: PrecisionV2.LOCATION_ELIGIBILITY,
    PENDING_CITATIONS: PrecisionV2.PENDING_CITATIONS,
    MUSCLE_MASTER: PrecisionV2.MUSCLE_MASTER,
    MOVEMENT_IDS: PrecisionV2.MOVEMENT_IDS,
    UNCLEAR_SITUATION: PrecisionV2.UNCLEAR_SITUATION,
    UNCLEAR_LOCATION: PrecisionV2.UNCLEAR_LOCATION,
    rank,
    relationFor: PrecisionV2.relationFor,
    locationEligibility: PrecisionV2.locationEligibility,
    movementScore: PrecisionV2.movementScore
  });
});
