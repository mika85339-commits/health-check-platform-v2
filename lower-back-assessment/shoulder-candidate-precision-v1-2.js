(function (root, factory) {
  const previous = root?.HealthCheckShoulderPrecisionV11 || (typeof require === "function" ? require("./shoulder-candidate-precision-v1-1") : null);
  const api = factory(previous);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckShoulderPrecisionV12 = api;
})(typeof window !== "undefined" ? window : globalThis, function (previous) {
  "use strict";

  if (!previous) throw new Error("Shoulder precision-v1.1 must load before precision-v1.2");

  const VERSION = "shoulder-precision-v1.2-local-hypothesis";
  const positiveRelations = new Set(["primary", "shared", "secondary"]);
  const trustedConfidence = new Set(["HIGH", "MEDIUM"]);

  function rank(answers = {}, options = {}) {
    const baseline = previous.rank(answers, options);
    const result = { ...baseline, version: VERSION, statusReason: baseline.status === "tied" ? "main_tie" : "" };
    // Preserve existing Main ties; this guard only revises a unique Main leader.
    if (baseline.status !== "ranked") return result;

    const mainTopScore = baseline.mainCandidates[0]?.score;
    const trustedAdditional = baseline.additionalCandidateDetails.filter((candidate) => candidate.score > 0
      && candidate.evidence.some(({ relation, confidence }) => positiveRelations.has(relation) && trustedConfidence.has(confidence)));
    const additionalTopScore = Math.max(0, ...trustedAdditional.map((candidate) => candidate.score));
    if (additionalTopScore > mainTopScore) {
      return { ...result, status: "insufficient", statusReason: "cross_group_additional_stronger", insufficientReason: "cross_group_additional_stronger" };
    }
    if (additionalTopScore === mainTopScore) {
      return { ...result, status: "tied", statusReason: "cross_group_equal_evidence" };
    }
    return result;
  }

  return {
    VERSION,
    MASTER: previous.MASTER,
    LOCATIONS: previous.LOCATIONS,
    MOVEMENTS: previous.MOVEMENTS,
    SIDES: previous.SIDES,
    CONFIG: previous.CONFIG,
    OUTSIDE_MASTER_NOTES: previous.OUTSIDE_MASTER_NOTES,
    movementSets: previous.movementSets,
    rank
  };
});
