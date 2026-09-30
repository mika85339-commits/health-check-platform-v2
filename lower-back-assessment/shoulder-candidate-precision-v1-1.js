(function (root, factory) {
  const base = root?.HealthCheckShoulderPrecision || (typeof require === "function" ? require("./shoulder-candidate-precision") : null);
  const api = factory(base);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckShoulderPrecisionV11 = api;
})(typeof window !== "undefined" ? window : globalThis, function (base) {
  "use strict";

  if (!base) throw new Error("Shoulder precision-v1 must load before precision-v1.1");

  const VERSION = "shoulder-precision-v1.1-local-hypothesis";
  const { MASTER, LOCATIONS, MOVEMENTS, SIDES, CONFIG } = base;
  const locationIndex = Object.fromEntries(LOCATIONS.map(([id], index) => [id, index]));
  const movementIndex = Object.fromEntries(MOVEMENTS.map(([id], index) => [id, index]));
  const locationRelation = { P: "primary", S: "secondary", O: "outside" };
  const movementRelation = { P: "primary", H: "shared", S: "secondary", T: "stretch", N: "none" };
  const deltoidTags = { front_raise: "anterior", side_raise: "middle", external_rotation: "posterior", internal_rotation: "anterior" };

  function selectedMovements(value) {
    return [...new Set(Array.isArray(value) ? value : [])]
      .filter((id) => Object.hasOwn(movementIndex, id))
      .sort()
      .slice(0, 3);
  }

  function scoreEvidence(evidence, decay) {
    return evidence
      .filter(({ relation, confidence }) => CONFIG.points[relation] > 0 && confidence !== "REVIEW")
      .map(({ relation }) => CONFIG.points[relation])
      .sort((a, b) => b - a)
      .slice(0, 3)
      .reduce((sum, points, index) => sum + points * decay[index], 0);
  }

  function rank(answers = {}, options = {}) {
    const location = Object.hasOwn(locationIndex, answers.painLocation) ? answers.painLocation : "location_unclear";
    const motions = selectedMovements(answers.situations);
    const locIndex = locationIndex[location];
    const decay = options.simpleSum ? [1, 1, 1] : CONFIG.decay;
    const entries = MASTER.map((master) => {
      const locRelation = locIndex === undefined ? "unknown" : locationRelation[master.locations[locIndex]];
      const evidence = motions.map((motion) => {
        const index = movementIndex[motion];
        return {
          motion,
          relation: movementRelation[master.movements[index]],
          confidence: master.confidence[index],
          tag: master.muscleId === "shoulder_deltoid" ? deltoidTags[motion] || null : null
        };
      });
      const positiveEvidence = evidence.filter(({ relation }) => ["primary", "shared", "secondary"].includes(relation));
      const strong = positiveEvidence.some(({ relation }) => relation === "primary" || relation === "shared");
      const hasLocation = locRelation === "primary" || locRelation === "secondary";
      const main = hasLocation && strong;
      const additional = !main && (strong || (hasLocation && positiveEvidence.length > 0));
      return {
        ...master,
        locationRelation: locRelation,
        evidence,
        positiveEvidence,
        displayGroup: main ? "Main" : additional ? "Additional" : "",
        score: scoreEvidence(evidence, decay)
      };
    });
    const mainPool = entries.filter((entry) => entry.displayGroup === "Main");
    const additionalPool = entries.filter((entry) => entry.displayGroup === "Additional");
    const candidatePool = entries.filter((entry) => entry.positiveEvidence.length).map((entry) => entry.muscleId);
    const stretches = entries.filter((entry) => entry.locationRelation !== "unknown"
      && entry.locationRelation !== "outside"
      && entry.evidence.some(({ relation, confidence }) => relation === "stretch" && confidence !== "REVIEW"));
    const reason = locIndex === undefined ? "location_unclear"
      : !motions.length ? "movement_unclear"
      : !candidatePool.length ? "no_candidate"
      : !mainPool.length ? "no_main_candidate"
      : !mainPool.some((entry) => entry.score > 0) ? "main_not_trusted"
      : "";

    if (reason) {
      const stretchOnly = locIndex !== undefined && motions.length && !mainPool.length && !additionalPool.length && stretches.length;
      return {
        version: VERSION,
        status: stretchOnly ? "stretch_only_reference" : "insufficient",
        insufficientReason: stretchOnly ? "" : reason,
        candidates: [],
        mainCandidates: [],
        additionalCandidateDetails: [],
        additionalCandidates: additionalPool.map((entry) => entry.muscleId),
        candidatePool,
        referenceCandidates: stretchOnly ? stretches.map((entry) => entry.displayName) : [],
        topTie: false,
        sourceOrderUsedForTop1: false
      };
    }

    function candidate(entry, rankIndex) {
      const matchedMotions = entry.positiveEvidence.map(({ motion }) => motion);
      return {
        name: entry.displayName,
        displayName: entry.displayName,
        muscleId: entry.muscleId,
        imageId: entry.imageId,
        model3dId: entry.model3dId,
        score: entry.score,
        rank: rankIndex,
        tiedAtRank: false,
        displayGroup: entry.displayGroup,
        isAdditionalCandidate: entry.displayGroup === "Additional",
        locationRelation: entry.locationRelation,
        locationKnown: true,
        locationMatched: entry.locationRelation !== "outside",
        painLocationLabel: LOCATIONS[locIndex]?.[1] || "",
        supportAxes: entry.locationRelation === "outside" ? ["動き"] : ["場所", "動き"],
        matchedMotions,
        matchedContexts: [],
        matchedSymptoms: [],
        evidence: entry.evidence,
        evidenceTags: entry.evidence.map(({ tag }) => tag).filter(Boolean),
        reasons: matchedMotions.slice(0, 2).map((motion) => `「${MOVEMENTS[movementIndex[motion]]?.[1]}」に関わる動きから候補として表示しています`)
      };
    }

    const rankedMain = mainPool.filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.muscleId.localeCompare(b.muscleId));
    const mainCandidates = rankedMain.map((entry) => {
      const rankIndex = rankedMain.findIndex((other) => other.score === entry.score) + 1;
      return { ...candidate(entry, rankIndex), tiedAtRank: rankedMain.some((other) => other !== entry && other.score === entry.score) };
    });
    const additionalCandidateDetails = additionalPool
      .sort((a, b) => b.score - a.score || a.muscleId.localeCompare(b.muscleId))
      .map((entry) => candidate(entry, null));
    const topScore = rankedMain[0].score;
    const topTie = rankedMain.filter((entry) => entry.score === topScore).length > 1;
    return {
      version: VERSION,
      status: topTie ? "tied" : "ranked",
      insufficientReason: "",
      candidates: [...mainCandidates, ...additionalCandidateDetails],
      mainCandidates,
      additionalCandidateDetails,
      additionalCandidates: additionalCandidateDetails.map((entry) => entry.muscleId),
      candidatePool,
      referenceCandidates: [],
      topTie,
      sourceOrderUsedForTop1: false
    };
  }

  return { VERSION, MASTER, LOCATIONS, MOVEMENTS, SIDES, CONFIG, OUTSIDE_MASTER_NOTES: base.OUTSIDE_MASTER_NOTES, movementSets: base.movementSets, rank };
});
