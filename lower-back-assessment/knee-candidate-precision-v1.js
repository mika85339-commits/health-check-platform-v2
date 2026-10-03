(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckKneePrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "knee-precision-v1-local-hypothesis";
  const LOCATIONS = Object.freeze([
    ["knee_front", "膝の前"],
    ["knee_inner", "膝の内側"],
    ["knee_outer", "膝の外側"],
    ["knee_back", "膝の後ろ"]
  ]);
  const MOVEMENTS = Object.freeze([
    ["extend", "膝を伸ばす時"],
    ["flex", "膝を曲げる時"],
    ["heel_raise", "かかとを上げる時"]
  ]);
  const MASTER = Object.freeze([
    { id: "knee_quadriceps", name: "大腿四頭筋", imageId: "大腿四頭筋", confidence: "MEDIUM", location: "PHHN", movement: "PSNNT" },
    { id: "knee_hamstrings", name: "ハムストリングス", imageId: "ハムストリングス", confidence: "MEDIUM", location: "NHHP", movement: "SPTTN" },
    { id: "knee_popliteus", name: "膝窩筋", imageId: "膝窩筋", confidence: "REVIEW", location: "NNHP", movement: "THHTN" },
    { id: "knee_gastrocnemius", name: "腓腹筋", imageId: "腓腹筋", confidence: "MEDIUM", location: "NHHP", movement: "SHNNP" }
  ]);
  const LOCATION_IDS = LOCATIONS.map(([id]) => id);
  const MOVEMENT_IDS = MOVEMENTS.map(([id]) => id);
  const AXES = ["sagittal", "rotation", "ankle"];
  const MOVEMENT_AXIS = Object.freeze({ extend: "sagittal", flex: "sagittal", heel_raise: "ankle" });
  const RELATION_INDEX = Object.freeze({ extend: 0, flex: 1, heel_raise: 4 });
  const ids = (items) => items.map((item) => item.id).sort();

  function normalize(input) {
    const location = input.location || input.painLocation;
    const movements = input.movements || input.situations;
    if (![...LOCATION_IDS, "location_unclear"].includes(location)) throw new Error("Invalid knee location");
    if (!["right", "left", "both", "center"].includes(input.side)) throw new Error("Invalid knee side");
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 ||
      new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !MOVEMENT_IDS.includes(id)) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) {
      throw new Error("Invalid knee movements");
    }
    return { location, side: input.side, movements: [...movements].sort((a, b) =>
      MOVEMENT_IDS.indexOf(a) - MOVEMENT_IDS.indexOf(b)) };
  }

  function evidenceFor(muscle, input) {
    const location = input.location === "location_unclear" ? "?" :
      muscle.location[LOCATION_IDS.indexOf(input.location)];
    const vector = { sagittal: 0, rotation: 0, ankle: 0 };
    const matchedMotions = [];
    const references = [];
    for (const movement of input.movements) {
      if (movement === "movement_unclear") continue;
      const relation = muscle.movement[RELATION_INDEX[movement]];
      if (relation === "P" || relation === "H") {
        const axis = MOVEMENT_AXIS[movement];
        vector[axis] = Math.max(vector[axis], relation === "P" ? 2 : 1);
        matchedMotions.push(movement);
      } else if (relation === "S" || relation === "T") {
        references.push({ movement, relation });
      }
    }
    return { id: muscle.id, name: muscle.name, imageId: muscle.imageId,
      confidence: muscle.confidence, location, vector, matchedMotions, references,
      max: Math.max(...Object.values(vector)) };
  }

  function dominates(left, right) {
    return AXES.every((axis) => left.vector[axis] >= right.vector[axis]) &&
      AXES.some((axis) => left.vector[axis] > right.vector[axis]);
  }

  function frontier(items) {
    return items.filter((item) => !items.some((other) => other.id !== item.id && dominates(other, item)));
  }

  function rank(rawInput, master = MASTER) {
    const input = normalize(rawInput);
    const hasInput = input.location !== "location_unclear" && !input.movements.includes("movement_unclear");
    const evidence = master.map((muscle) => evidenceFor(muscle, input));
    const main = hasInput ? evidence.filter((item) => item.location === "P" && item.max > 0) : [];
    const additional = hasInput ? evidence.filter((item) => item.location === "H" && item.max > 0) : [];
    const activeIds = new Set([...main, ...additional].map((item) => item.id));
    const reference = hasInput ? evidence.filter((item) => !activeIds.has(item.id) &&
      item.location !== "N" && item.references.some(({ relation }) => relation === "S")) : [];
    const referenceIds = new Set(reference.map((item) => item.id));
    const reviewOnly = hasInput ? evidence.filter((item) => !activeIds.has(item.id) &&
      !referenceIds.has(item.id) && (item.references.some(({ relation }) => relation === "T") ||
        (item.location === "N" && item.max > 0))) : [];
    const mainFrontier = frontier(main);
    const additionalFrontier = frontier(additional);
    const unionFrontier = frontier([...main, ...additional]);
    const challengers = mainFrontier.length === 1 ? additional.filter((item) =>
      item.confidence !== "REVIEW" && !dominates(mainFrontier[0], item)) : [];
    const weakUnique = mainFrontier.length === 1 && mainFrontier[0].max < 2;

    let status = "insufficient";
    let statusReason = input.location === "location_unclear" ? "location_unclear"
      : input.movements.includes("movement_unclear") ? "movement_unclear" : "no_main_evidence";
    if (hasInput && mainFrontier.length > 1) {
      status = "tied";
      statusReason = "main_tie";
    } else if (hasInput && mainFrontier.length === 1) {
      if (weakUnique) statusReason = "weak_unique_main";
      else if (challengers.length) statusReason = "cross_group_additional_challenge";
      else {
        status = "ranked";
        statusReason = "ranked_unique_main";
      }
    } else if (hasInput && !additional.length && reference.length) {
      status = "stretch_only_reference";
      statusReason = "stretch_only_reference";
    }

    const toCandidate = (item, group, folded = false) => ({
      muscleId: item.id, name: item.name, imageId: item.imageId,
      displayGroup: group, isAdditionalCandidate: group === "Additional", folded,
      locationMatched: group === "Main", matchedMotions: [...item.matchedMotions],
      matchedContexts: [], matchedSymptoms: [],
      supportAxes: group === "Main" ? ["場所", "動き"] : ["動き"],
      reasons: group === "Main" ? ["選んだ位置と動きが重なる候補です"]
        : group === "Additional" ? ["選んだ動きから追加で考えられる候補です"]
          : ["伸ばされる方向としての参考です"]
    });
    const byId = (items) => [...items].sort((a, b) => a.id.localeCompare(b.id));
    const additionalFrontierIds = new Set(additionalFrontier.map((item) => item.id));
    const collapsed = additional.filter((item) => !additionalFrontierIds.has(item.id));
    const candidates = [
      ...byId(main).map((item) => toCandidate(item, "Main")),
      ...byId(additionalFrontier).map((item) => toCandidate(item, "Additional")),
      ...byId(collapsed).map((item) => toCandidate(item, "Additional", true)),
      ...byId(reference).map((item) => toCandidate(item, "Reference"))
    ];
    return { version: VERSION, input, status, statusReason,
      main: ids(main), additional: ids(additional), reference: ids(reference),
      reviewOnly: ids(reviewOnly), frontier: ids(mainFrontier), unionFrontier: ids(unionFrontier),
      challengers: ids(challengers), weakUnique,
      visible: ids([...main, ...additionalFrontier, ...reference]), collapsed: ids(collapsed),
      display: { initial: ids([...main, ...additionalFrontier]), expanded: ids([...main, ...additional]) },
      candidates, referenceCandidates: reference.map((item) => item.name),
      topTie: status === "tied", sourceOrderUsedForTop1: false,
      evidence: Object.fromEntries(evidence.map((item) => [item.id, {
        location: item.location, vector: item.vector, matchedMotions: item.matchedMotions,
        references: item.references, confidence: item.confidence
      }])) };
  }

  return { VERSION, MASTER, LOCATIONS, MOVEMENTS, MOVEMENT_AXIS, rank };
});
