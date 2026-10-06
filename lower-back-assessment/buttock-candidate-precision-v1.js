(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckButtockPrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "buttock-precision-v1-local-hypothesis";
  const LOCATIONS = Object.freeze([
    ["buttock_upper_outer", "お尻の上・外側"],
    ["buttock_center", "お尻の中央"],
    ["buttock_lower", "お尻の下（太ももの付け根・座ると当たる骨の近く）"]
  ]);
  const MOVEMENTS = Object.freeze([
    ["stand_up", "立ち上がる時"],
    ["leg_back", "脚を後ろへ動かす時"],
    ["leg_side", "脚を横へ開く時"],
    ["knee_bend", "膝を曲げる時"]
  ]);
  const MASTER = Object.freeze([
    { id: "buttock_gluteus_maximus", name: "大臀筋", imageId: "大臀筋", location: "HPH", movement: "PPHN", active: true },
    { id: "buttock_gluteus_medius", name: "中臀筋", imageId: "中臀筋", location: "PHN", movement: "HTPN", active: true },
    { id: "buttock_gluteus_minimus", name: "小臀筋", imageId: "小臀筋", location: "PHN", movement: "HTPN", active: true },
    { id: "buttock_piriformis", name: "梨状筋", imageId: "梨状筋", location: "NPN", movement: "NNTN", active: false },
    { id: "buttock_hamstrings", name: "ハムストリングス", imageId: "ハムストリングス", location: "NNP", movement: "HPNP", active: true }
  ]);
  const LOCATION_IDS = LOCATIONS.map(([id]) => id);
  const MOVEMENT_IDS = MOVEMENTS.map(([id]) => id);
  const EXPLORATORY_ALIASES = Object.freeze({ stairs_up: "stand_up", single_leg: "leg_side" });
  const AXES = ["extension", "lateral", "knee"];
  const MOVEMENT_AXIS = Object.freeze({
    stand_up: "extension", leg_back: "extension", leg_side: "lateral", knee_bend: "knee"
  });
  const STRENGTH = { N: 0, T: 0, H: 1, P: 2 };
  const ids = (items) => items.map((item) => item.id).sort();
  const byId = (items) => [...items].sort((a, b) => a.id.localeCompare(b.id));

  function normalize(raw) {
    const location = raw.location || raw.painLocation;
    const movements = raw.movements || raw.situations;
    if (![...LOCATION_IDS, "location_unclear"].includes(location)) throw new Error("Invalid buttock location");
    if (!["right", "left", "both", "center"].includes(raw.side)) throw new Error("Invalid buttock side");
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 ||
      new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !MOVEMENT_IDS.includes(id) && !EXPLORATORY_ALIASES[id]) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) {
      throw new Error("Invalid buttock movements");
    }
    return { location, side: raw.side, movements: [...movements].sort() };
  }

  function evidenceFor(muscle, input) {
    const location = input.location === "location_unclear" ? "?" :
      muscle.location[LOCATION_IDS.indexOf(input.location)];
    const vector = { extension: 0, lateral: 0, knee: 0 };
    const matchedMotions = [];
    const reviewMovements = [];
    for (const movement of input.movements) {
      if (movement === "movement_unclear") continue;
      const normalizedMovement = EXPLORATORY_ALIASES[movement] || movement;
      const relation = muscle.movement[MOVEMENT_IDS.indexOf(normalizedMovement)];
      if (relation === "P" || relation === "H") {
        const axis = MOVEMENT_AXIS[normalizedMovement];
        vector[axis] = Math.max(vector[axis], STRENGTH[relation]);
        matchedMotions.push(movement);
      } else if (relation === "T") reviewMovements.push(movement);
    }
    return {
      id: muscle.id, name: muscle.name, imageId: muscle.imageId, location, vector,
      trusted: AXES.some((axis) => vector[axis] === 2),
      active: AXES.some((axis) => vector[axis] > 0),
      matchedMotions, reviewMovements
    };
  }

  function dominates(left, right) {
    return AXES.every((axis) => left.vector[axis] >= right.vector[axis]) &&
      AXES.some((axis) => left.vector[axis] > right.vector[axis]);
  }
  function equalVector(left, right) {
    return AXES.every((axis) => left.vector[axis] === right.vector[axis]);
  }
  function incomparable(left, right) {
    return !dominates(left, right) && !dominates(right, left) && !equalVector(left, right);
  }
  function pareto(items) {
    return items.filter((item) => !items.some((other) => other.id !== item.id && dominates(other, item)));
  }

  function rank(rawInput, master = MASTER) {
    const input = normalize(rawInput);
    const hasInput = input.location !== "location_unclear" && !input.movements.includes("movement_unclear");
    const evidence = master.filter((muscle) => muscle.active).map((muscle) => evidenceFor(muscle, input));
    const main = hasInput ? evidence.filter((item) => item.location === "P" && item.trusted) : [];
    const trustedMain = main.filter((item) => item.trusted);
    const additional = hasInput ? evidence.filter((item) => item.location !== "P" && item.trusted) : [];
    const related = hasInput ? evidence.filter((item) => item.active && !item.trusted) : [];
    const reviewOnly = hasInput ? evidence.filter((item) => !item.active && item.reviewMovements.length && item.location !== "N") : [];
    const mainFrontier = pareto(trustedMain);
    const challenging = additional.filter((extra) => mainFrontier.length &&
      !mainFrontier.every((primary) => dominates(primary, extra)));
    const additionalDominatesAll = challenging.some((extra) => mainFrontier.every((primary) =>
      dominates(extra, primary)));
    const crossEquality = challenging.some((extra) => mainFrontier.some((primary) =>
      equalVector(extra, primary)));
    const crossIncomparable = challenging.some((extra) => mainFrontier.some((primary) =>
      incomparable(extra, primary)));

    let status = "insufficient";
    let statusReason = "no_trusted_main";
    let top = [];
    if (!hasInput) statusReason = input.location === "location_unclear" ? "location_unclear" : "movement_unclear";
    else if (mainFrontier.length) {
      top = mainFrontier;
      status = mainFrontier.length === 1 ? "ranked" : "tied";
      statusReason = status === "ranked" ? "unique_trusted_main" : "main_tie";
      if (challenging.length) {
        if (additionalDominatesAll) {
          status = "insufficient";
          statusReason = "additional_dominates_main";
          top = [];
        } else {
          status = "tied";
          statusReason = crossIncomparable ? "cross_group_incomparable" :
            crossEquality ? "cross_group_equal" : "cross_group_review";
          top = [...mainFrontier, ...challenging];
        }
      }
    } else if (additional.length) statusReason = "additional_without_main";
    else if (reviewOnly.length) statusReason = "review_only";

    const toCandidate = (item, displayGroup) => ({
      muscleId: item.id, name: item.name, imageId: item.imageId, displayGroup,
      isAdditionalCandidate: displayGroup === "Additional", folded: displayGroup === "Related",
      locationMatched: displayGroup === "Main", matchedMotions: [...item.matchedMotions],
      matchedContexts: [], matchedSymptoms: [],
      supportAxes: displayGroup === "Main" ? ["場所", "動き"] : ["動き"],
      reasons: displayGroup === "Main" ? ["選んだ位置と動きが重なる候補です"]
        : displayGroup === "Additional" ? ["選んだ動きから追加で考えられる候補です"]
          : ["回答との関係は限定的なため、順位を付けずに表示しています"]
    });
    const candidates = [
      ...byId(main).map((item) => toCandidate(item, "Main")),
      ...byId(additional).map((item) => toCandidate(item, "Additional")),
      ...byId([...related, ...reviewOnly]).map((item) => toCandidate(item, "Related"))
    ];
    return {
      version: VERSION, input, status, statusReason, reason: statusReason,
      top: ids(top), main: ids(main), trustedMain: ids(trustedMain), additional: ids(additional),
      related: ids(related), reviewOnly: ids(reviewOnly), reference: [],
      mainFrontier: ids(mainFrontier), frontier: ids([...mainFrontier, ...challenging]),
      display: ids([...main, ...additional, ...related, ...reviewOnly]),
      challengingAdditional: ids(challenging), crossEquality, crossIncomparable, additionalDominatesAll,
      candidates, referenceCandidates: [], topTie: status === "tied", sourceOrderUsedForTop1: false,
      evidence: Object.fromEntries(evidence.map((item) => [item.id, {
        location: item.location, vector: item.vector, matchedMotions: item.matchedMotions,
        reviewMovements: item.reviewMovements, trusted: item.trusted
      }]))
    };
  }

  return { VERSION, MASTER, LOCATIONS, MOVEMENTS, MOVEMENT_AXIS, rank };
});
