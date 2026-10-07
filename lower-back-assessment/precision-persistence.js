(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HealthCheckPrecisionPersistence = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const BODY_PARTS = new Set(["neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip",
    "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"]);
  const STATUSES = new Set(["ranked", "tied", "insufficient", "stretch_only_reference"]);
  const SIDES = new Set(["right", "left", "both", "center", "unknown"]);
  const STABLE_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
  const MAX_BYTES = 4096;

  function fail(code) { throw new Error(`invalid_precision_data:${code}`); }
  function plain(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  }
  function exactKeys(value, keys, label) {
    if (!plain(value) || Object.keys(value).length !== keys.length ||
      keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) fail(label);
  }
  function stableId(value, label) {
    if (typeof value !== "string" || value.length > 80 || !STABLE_ID.test(value)) fail(label);
  }
  function ids(values, label, max = 24) {
    if (!Array.isArray(values) || values.length > max) fail(label);
    for (const value of values) stableId(value, label);
    if (new Set(values).size !== values.length) fail(`${label}_duplicate`);
  }
  function isPrecisionVersion(version) {
    return typeof version === "string" && version.includes("_precision_");
  }

  function validatePrecisionData(value, bodyPart, diagnosisVersion) {
    let serialized;
    try { serialized = JSON.stringify(value); } catch { fail("json"); }
    if (typeof serialized !== "string" || new TextEncoder().encode(serialized).length > MAX_BYTES) fail("size");
    exactKeys(value, ["persistenceVersion", "answers", "result", "safety"], "root");
    if (value.persistenceVersion !== 1 && value.persistenceVersion !== 2) fail("persistence_version");
    if (!BODY_PARTS.has(bodyPart)) fail("body_part");
    if (typeof diagnosisVersion !== "string" ||
      !new RegExp(`^${bodyPart}_precision_v[0-9]+(?:_[0-9]+)*$`).test(diagnosisVersion)) fail("diagnosis_version");

    const answers = value.answers;
    exactKeys(answers, ["location", "side", "movements"], "answers");
    stableId(answers.location, "location");
    if (answers.location !== "location_unclear" && !answers.location.startsWith(`${bodyPart}_`)) fail("location_part");
    if (!SIDES.has(answers.side)) fail("side");
    ids(answers.movements, "movements", 6);
    if (!answers.movements.length) fail("movements_empty");

    const result = value.result;
    exactKeys(result, ["status", "reason", "mainMuscleIds", "additionalMuscleIds",
      ...(value.persistenceVersion === 2 ? ["relatedMuscleIds"] : []),
      "frontierMuscleIds", "referenceMuscleIds"], "result");
    if (!STATUSES.has(result.status)) fail("status");
    stableId(result.reason, "reason");
    for (const key of ["mainMuscleIds", "additionalMuscleIds",
      ...(value.persistenceVersion === 2 ? ["relatedMuscleIds"] : []),
      "frontierMuscleIds", "referenceMuscleIds"]) {
      ids(result[key], key);
      if (result[key].some((id) => !id.startsWith(`${bodyPart}_`))) fail(`${key}_part`);
    }
    const groupIds = [...result.mainMuscleIds, ...result.additionalMuscleIds,
      ...(value.persistenceVersion === 2 ? result.relatedMuscleIds : []), ...result.referenceMuscleIds];
    if (new Set(groupIds).size !== groupIds.length) fail("group_overlap");
    if (result.frontierMuscleIds.some((id) =>
      !result.mainMuscleIds.includes(id) && !result.additionalMuscleIds.includes(id))) fail("frontier_membership");

    exactKeys(value.safety, ["numbness", "weakness", "limbSpread"], "safety");
    if (Object.values(value.safety).some((answer) => answer !== null && typeof answer !== "boolean")) fail("safety_value");
    return JSON.parse(serialized);
  }

  function serializePrecisionResult({ bodyPart, diagnosisVersion, answers, result, safety }) {
    const value = {
      persistenceVersion: 1,
      answers: { location: answers.location, side: answers.side, movements: [...answers.movements] },
      result: {
        status: result.status,
        reason: result.reason,
        mainMuscleIds: [...result.mainMuscleIds],
        additionalMuscleIds: [...result.additionalMuscleIds],
        frontierMuscleIds: [...result.frontierMuscleIds],
        referenceMuscleIds: [...result.referenceMuscleIds]
      },
      safety: { numbness: safety.numbness, weakness: safety.weakness, limbSpread: safety.limbSpread }
    };
    return validatePrecisionData(value, bodyPart, diagnosisVersion);
  }

  function serializePrecisionResultV2({ bodyPart, diagnosisVersion, answers, result, safety }) {
    const value = {
      persistenceVersion: 2,
      answers: { location: answers.location, side: answers.side, movements: [...answers.movements] },
      result: {
        status: result.status,
        reason: result.reason,
        mainMuscleIds: [...result.mainMuscleIds],
        additionalMuscleIds: [...result.additionalMuscleIds],
        relatedMuscleIds: [...result.relatedMuscleIds],
        frontierMuscleIds: [...result.frontierMuscleIds],
        referenceMuscleIds: [...result.referenceMuscleIds]
      },
      safety: { numbness: safety.numbness, weakness: safety.weakness, limbSpread: safety.limbSpread }
    };
    return validatePrecisionData(value, bodyPart, diagnosisVersion);
  }

  function hydratePrecisionHistory(row, muscleNames = {}) {
    const data = validatePrecisionData(row.precision_data, row.body_part, row.diagnosis_version);
    const muscles = [
      ...data.result.mainMuscleIds.map((muscleId) => ({ muscleId, displayGroup: "Main" })),
      ...data.result.additionalMuscleIds.map((muscleId) => ({ muscleId, displayGroup: "Additional" })),
      ...(data.persistenceVersion === 2
        ? data.result.relatedMuscleIds.map((muscleId) => ({ muscleId, displayGroup: "Related" })) : []),
      ...data.result.referenceMuscleIds.map((muscleId) => ({ muscleId, displayGroup: "Reference" }))
    ].map((item) => ({ ...item,
      name: typeof muscleNames[item.muscleId] === "string" && muscleNames[item.muscleId]
        ? muscleNames[item.muscleId] : "名称未登録の候補" }));
    return {
      diagnosisId: row.diagnosis_id,
      diagnosisVersion: row.diagnosis_version,
      diagnosisDate: row.diagnosis_date,
      regionId: row.body_part,
      leftRight: data.answers.side,
      symptomScore: null,
      answers: { painLocation: data.answers.location, side: data.answers.side,
        situations: [...data.answers.movements] },
      topMuscles: muscles,
      candidateStatus: data.result.status,
      candidateStatusReason: data.result.reason,
      precisionData: data
    };
  }

  return { MAX_BYTES, isPrecisionVersion, validatePrecisionData, serializePrecisionResult,
    serializePrecisionResultV2,
    hydratePrecisionHistory };
});
