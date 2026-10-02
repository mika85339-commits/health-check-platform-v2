(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckLowbackPrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "lowback-precision-v1-local-hypothesis";
  const AXES = ["sagittal", "frontal", "transverse"];
  const GRADES = ["N", "H", "P"];
  const MOVEMENT_AXIS = Object.freeze({
    bend_forward: "sagittal", extend_back: "sagittal",
    side_bend_right: "frontal", side_bend_left: "frontal",
    rotate_right: "transverse", rotate_left: "transverse"
  });
  const MOVEMENTS = Object.freeze([
    ["bend_forward", "前に曲げる時"], ["extend_back", "後ろに反る時"],
    ["side_bend_right", "右へ横に倒す時"], ["side_bend_left", "左へ横に倒す時"],
    ["rotate_right", "上半身を右へ向けるようにひねる時"],
    ["rotate_left", "上半身を左へ向けるようにひねる時"]
  ]);
  const LOCATIONS = Object.freeze([
    ["lowback_center", "腰の中央"], ["lowback_side", "腰の横"],
    ["lowback_pelvis_top", "腰の下（骨盤の上）"]
  ]);
  const relation = (grade, confidence) => ({ grade, confidence });
  const M = relation("P", "MEDIUM");
  const S = relation("S", "MEDIUM");
  const SR = relation("S", "REVIEW");
  const RR = relation("R", "REVIEW");
  const U = relation("U", null);
  const HH = relation("H", "HIGH");
  const HM = relation("H", "MEDIUM");
  const PM = relation("P", "MEDIUM");
  const TR = relation("T", "REVIEW");
  const MASTER = Object.freeze([
    {
      id: "lowback_erector_spinae", name: "脊柱起立筋",
      location: { lowback_center: M, lowback_side: S, lowback_pelvis_top: S, location_unclear: U },
      relation: { bend_forward: TR, extend_back: HH, side_bend_right: HM, side_bend_left: HM, rotate_right: SR, rotate_left: SR }
    },
    {
      id: "lowback_multifidus", name: "多裂筋",
      location: { lowback_center: M, lowback_side: SR, lowback_pelvis_top: SR, location_unclear: U },
      relation: { bend_forward: TR, extend_back: HH, side_bend_right: SR, side_bend_left: SR, rotate_right: SR, rotate_left: SR }
    },
    {
      id: "lowback_quadratus_lumborum", name: "腰方形筋",
      location: { lowback_center: RR, lowback_side: M, lowback_pelvis_top: M, location_unclear: U },
      relation: { bend_forward: SR, extend_back: SR, side_bend_right: HM, side_bend_left: HM, rotate_right: SR, rotate_left: SR }
    },
    {
      id: "lowback_oblique_group", name: "腹斜筋群",
      location: { lowback_center: RR, lowback_side: SR, lowback_pelvis_top: SR, location_unclear: U },
      relation: { bend_forward: SR, extend_back: TR, side_bend_right: HM, side_bend_left: HM, rotate_right: PM, rotate_left: PM }
    }
  ]);

  const ids = (items) => items.map((item) => item.id).sort();
  const stronger = (a, b) => GRADES.indexOf(a) > GRADES.indexOf(b);

  function normalize(input) {
    const location = input.location || input.painLocation;
    const side = input.side;
    const movements = input.movements || input.situations || [];
    if (![...LOCATIONS.map(([id]) => id), "location_unclear"].includes(location)) throw new Error("Invalid lowback location");
    if (!["right", "left", "both", "center"].includes(side)) throw new Error("Invalid lowback side");
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 || new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !MOVEMENT_AXIS[id]) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) throw new Error("Invalid lowback movements");
    return { location, side, movements: [...movements] };
  }

  function evidenceFor(muscle, input) {
    const strength = Object.fromEntries(AXES.map((axis) => [axis, "N"]));
    const weak = [];
    const stretch = [];
    const matchedMotions = [];
    for (const movement of input.movements) {
      if (movement === "movement_unclear") continue;
      const cell = muscle.relation[movement];
      const trusted = ["HIGH", "MEDIUM"].includes(cell.confidence) && ["P", "H"].includes(cell.grade);
      if (trusted) {
        const axis = MOVEMENT_AXIS[movement];
        if (stronger(cell.grade, strength[axis])) strength[axis] = cell.grade;
        matchedMotions.push(movement);
      }
      if (cell.grade === "S" && cell.confidence === "REVIEW") weak.push(movement);
      if (cell.grade === "T" && cell.confidence === "REVIEW") stretch.push(movement);
    }
    const location = muscle.location[input.location];
    const trusted = AXES.some((axis) => strength[axis] !== "N");
    const main = trusted && ["P", "S"].includes(location.grade) && location.confidence === "MEDIUM";
    const additional = !main && (trusted || weak.length > 0 || stretch.length > 0);
    return { id: muscle.id, name: muscle.name, location, strength, trusted, weak, stretch,
      matchedMotions, main, additional, trustedAdditional: additional && trusted,
      referenceOnly: additional && !trusted };
  }

  function compare(a, b) {
    const greater = AXES.some((axis) => stronger(a.strength[axis], b.strength[axis]));
    const less = AXES.some((axis) => stronger(b.strength[axis], a.strength[axis]));
    if (greater && less) return "incomparable";
    if (greater) return "greater";
    if (less) return "less";
    return "equal";
  }

  function frontier(items) {
    return items.filter((item) => !items.some((other) => other.id !== item.id && compare(other, item) === "greater"));
  }

  function rank(rawInput, master = MASTER) {
    const input = normalize(rawInput);
    const evidence = master.map((muscle) => evidenceFor(muscle, input));
    const main = evidence.filter((item) => item.main);
    const trustedAdditional = evidence.filter((item) => item.trustedAdditional);
    const mainFrontier = frontier(main);
    const unionFrontier = frontier([...main, ...trustedAdditional]);
    const unionMain = unionFrontier.filter((item) => item.main);
    const unionAdditional = unionFrontier.filter((item) => item.trustedAdditional);
    const movementUnclear = input.movements.includes("movement_unclear");
    const locationUnclear = input.location === "location_unclear";
    let preStatus = "insufficient";
    if (!movementUnclear && !locationUnclear) {
      if (main.length) preStatus = mainFrontier.length === 1 ? "ranked" : "tied";
      else if (!evidence.some((item) => item.trusted) && evidence.some((item) => item.stretch.length)) preStatus = "stretch_only_reference";
    }
    const frontierCategory = !main.length ? "main_zero" : !unionAdditional.length ? "main_only"
      : !unionMain.length ? "additional_only" : "main_and_additional";
    let status = preStatus;
    let reason = movementUnclear ? "movement_unclear" : locationUnclear ? "location_unclear"
      : preStatus === "stretch_only_reference" ? "stretch_only_reference" : "no_main_evidence";
    let crossRelations = [];
    if (!movementUnclear && !locationUnclear && main.length) {
      if (frontierCategory === "additional_only") {
        status = "insufficient";
        reason = "cross_group_additional_dominates";
      } else if (frontierCategory === "main_and_additional") {
        status = "tied";
        crossRelations = unionMain.flatMap((m) => unionAdditional.map((a) => compare(m, a)));
        reason = crossRelations.includes("incomparable") ? "cross_group_incomparable" : "cross_group_equal";
      } else {
        status = unionMain.length === 1 ? "ranked" : "tied";
        reason = status === "ranked" ? "ranked_unique_main" : "main_tie";
      }
    }
    const reference = status === "stretch_only_reference"
      ? evidence.filter((item) => item.referenceOnly && item.stretch.length > 0) : [];
    const display = { main: ids(main), additional: ids(trustedAdditional), reference: ids(reference),
      all: ids([...main, ...trustedAdditional, ...reference]) };
    const byId = Object.fromEntries(master.map((muscle) => [muscle.id, muscle]));
    const toCandidate = (item, group) => ({
      muscleId: item.id, name: item.name, displayGroup: group, isAdditionalCandidate: group === "Additional",
      locationKnown: input.location !== "location_unclear", locationMatched: group === "Main",
      painLocationLabel: LOCATIONS.find(([id]) => id === input.location)?.[1] || "場所ははっきり分からない",
      matchedMotions: item.matchedMotions, matchedContexts: [], matchedSymptoms: [],
      supportAxes: ["動き", ...(group === "Main" ? ["場所"] : [])],
      reasons: item.matchedMotions.length ? ["選んだ動きに関わる候補です"] : ["伸ばされる方向としての参考です"]
    });
    const candidates = [
      ...main.sort((a, b) => a.id.localeCompare(b.id)).map((item) => toCandidate(item, "Main")),
      ...trustedAdditional.sort((a, b) => a.id.localeCompare(b.id)).map((item) => toCandidate(item, "Additional")),
      ...reference.sort((a, b) => a.id.localeCompare(b.id)).map((item) => toCandidate(item, "Reference"))
    ];
    if (status === "ranked") candidates.sort((a, b) =>
      Number(b.muscleId === unionMain[0]?.id) - Number(a.muscleId === unionMain[0]?.id) ||
      (a.displayGroup === "Main" ? 0 : 1) - (b.displayGroup === "Main" ? 0 : 1) || a.muscleId.localeCompare(b.muscleId));
    return { version: VERSION, input, preStatus, status, statusReason: reason, frontierCategory,
      main: ids(main), trustedAdditional: ids(trustedAdditional), mainFrontier: ids(mainFrontier),
      unionFrontier: ids(unionFrontier), unionMain: ids(unionMain), unionAdditional: ids(unionAdditional),
      crossRelationKinds: [...new Set(crossRelations)].sort(), display, candidates,
      referenceCandidates: reference.map((item) => byId[item.id].name),
      topTie: status === "tied", sourceOrderUsedForTop1: false,
      evidence: Object.fromEntries(evidence.map((item) => [item.id, {
        location: item.location, strength: item.strength, trusted: item.trusted, weak: item.weak,
        stretch: item.stretch, main: item.main, additional: item.additional,
        trustedAdditional: item.trustedAdditional, referenceOnly: item.referenceOnly
      }])) };
  }

  return { VERSION, MASTER, MOVEMENTS, LOCATIONS, MOVEMENT_AXIS, rank };
});
