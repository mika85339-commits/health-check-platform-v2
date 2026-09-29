(function (root, factory) {
  const precisionV21 = typeof module === "object" && module.exports
    ? require("./neck-candidate-precision-v2-1.js")
    : root?.HealthCheckNeckPrecisionV21;
  const api = factory(precisionV21);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckNeckPrecisionV22 = api;
})(typeof window !== "undefined" ? window : globalThis, function (PrecisionV21) {
  "use strict";

  if (!PrecisionV21) throw new Error("neck-candidate-precision-v2-2 requires precision-v2.1");

  const VERSION = "neck-precision-v2.2-local-hypothesis";
  const MAX_BASE_MOVEMENTS = 3;

  function groupKey(muscleIds) {
    return [...new Set(muscleIds || [])].sort().join("|");
  }

  const ADAPTIVE_QUESTION_RULES = Object.freeze([
    Object.freeze({
      ruleId: "levator_vs_scm",
      groupKey: groupKey(["neck_levator_scapulae", "neck_sternocleidomastoid"]),
      movement: "shoulder_shrug",
      question: "肩をすくめると気になりますか？",
      allowedSides: null
    }),
    Object.freeze({
      ruleId: "levator_scalenes_scm",
      groupKey: groupKey(["neck_levator_scapulae", "neck_scalenes", "neck_sternocleidomastoid"]),
      movement: "shoulder_shrug",
      question: "肩をすくめると気になりますか？",
      allowedSides: null
    }),
    Object.freeze({
      ruleId: "deep_flexors_vs_scm_bilateral",
      groupKey: groupKey(["neck_deep_flexors", "neck_sternocleidomastoid"]),
      movement: "chin_tuck",
      question: "あごを軽く引くと気になりますか？",
      allowedSides: Object.freeze(["both", "center"])
    })
  ]);

  function topMuscleIds(result) {
    return (result?.candidates || [])
      .filter((candidate) => candidate.rank === 1)
      .map((candidate) => candidate.muscleId)
      .sort();
  }

  function questionFor(answers = {}, result = PrecisionV21.rank(answers), options = {}) {
    if (options.questionAlreadyAsked) return null;
    if (result.status !== "tied" || !result.topTie) return null;

    const movements = [...new Set(result.movements || [])];
    if (movements.length >= MAX_BASE_MOVEMENTS) return null;

    const side = answers.side || result.side || "center";
    const key = groupKey(topMuscleIds(result));
    const rule = ADAPTIVE_QUESTION_RULES.find((candidate) => candidate.groupKey === key
      && (!candidate.allowedSides || candidate.allowedSides.includes(side))
      && !movements.includes(candidate.movement));
    if (!rule) return null;

    return Object.freeze({
      ruleId: rule.ruleId,
      groupKey: rule.groupKey,
      movement: rule.movement,
      question: rule.question
    });
  }

  function withAdaptiveMetadata(baseResult, adaptive) {
    return {
      ...baseResult,
      version: VERSION,
      baseVersion: PrecisionV21.VERSION,
      adaptive
    };
  }

  function rank(answers = {}, overrides = {}) {
    const baseResult = PrecisionV21.rank(answers, overrides);
    const question = questionFor(answers, baseResult);
    return withAdaptiveMetadata(baseResult, {
      eligible: Boolean(question),
      question,
      answered: false,
      answer: null,
      evidenceAdded: false,
      effectiveSituations: [...(baseResult.movements || [])],
      nextQuestion: null
    });
  }

  function answerAdaptive(answers = {}, answer, overrides = {}) {
    if (answer !== true && answer !== false && answer !== "yes" && answer !== "no") {
      throw new TypeError("answerAdaptive expects true/false or yes/no");
    }

    const isYes = answer === true || answer === "yes";
    const baseResult = PrecisionV21.rank(answers, overrides);
    const question = questionFor(answers, baseResult);
    if (!question) return rank(answers, overrides);

    if (!isYes) {
      return withAdaptiveMetadata(baseResult, {
        eligible: true,
        question,
        answered: true,
        answer: "no",
        evidenceAdded: false,
        effectiveSituations: [...(baseResult.movements || [])],
        nextQuestion: null
      });
    }

    const situations = [...new Set(Array.isArray(answers.situations) ? answers.situations : [])];
    const effectiveSituations = situations.includes(question.movement)
      ? situations
      : [...situations, question.movement];
    const recalculated = PrecisionV21.rank({ ...answers, situations: effectiveSituations }, overrides);
    return withAdaptiveMetadata(recalculated, {
      eligible: true,
      question,
      answered: true,
      answer: "yes",
      evidenceAdded: true,
      effectiveSituations: [...(recalculated.movements || [])],
      nextQuestion: questionFor(
        { ...answers, situations: effectiveSituations },
        recalculated,
        { questionAlreadyAsked: true }
      )
    });
  }

  return Object.freeze({
    VERSION,
    MAX_BASE_MOVEMENTS,
    ADAPTIVE_QUESTION_RULES,
    DEFAULT_CONFIG: PrecisionV21.DEFAULT_CONFIG,
    SITUATION_OPTIONS: PrecisionV21.SITUATION_OPTIONS,
    LOCATION_OPTIONS: PrecisionV21.LOCATION_OPTIONS,
    LOCATION_ELIGIBILITY: PrecisionV21.LOCATION_ELIGIBILITY,
    PENDING_CITATIONS: PrecisionV21.PENDING_CITATIONS,
    MUSCLE_MASTER: PrecisionV21.MUSCLE_MASTER,
    MOVEMENT_IDS: PrecisionV21.MOVEMENT_IDS,
    UNCLEAR_SITUATION: PrecisionV21.UNCLEAR_SITUATION,
    UNCLEAR_LOCATION: PrecisionV21.UNCLEAR_LOCATION,
    groupKey,
    topMuscleIds,
    questionFor,
    rank,
    answerAdaptive,
    relationFor: PrecisionV21.relationFor,
    locationEligibility: PrecisionV21.locationEligibility,
    movementScore: PrecisionV21.movementScore
  });
});
