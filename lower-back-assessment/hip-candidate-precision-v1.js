(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckHipPrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "hip-precision-v1-local-hypothesis";
  const AXES = ["sagittal", "frontal"];
  const GRADES = ["N", "H", "P"];
  const MOVEMENT_AXIS = Object.freeze({
    flex: "sagittal", extend: "sagittal", abduct: "frontal", adduct: "frontal"
  });
  const MOVEMENTS = Object.freeze([
    ["flex", "股関節を曲げる時（脚を前へ）"],
    ["extend", "股関節を伸ばす時（脚を後ろへ）"],
    ["abduct", "脚を外側へ開く時"],
    ["adduct", "脚を内側へ寄せる時"]
  ]);
  const LOCATIONS = Object.freeze([
    ["hip_front_groin", "股関節の前（脚の付け根）"],
    ["hip_outer", "股関節の横"],
    ["hip_back", "股関節の後ろ"],
    ["hip_inner", "股関節の内側（内ももの付け根）"]
  ]);
  const LOCATION_IDS = LOCATIONS.map(([id]) => id);
  const MOVEMENT_IDS = MOVEMENTS.map(([id]) => id);

  // Order of each matrix follows LOCATIONS and MOVEMENTS; S1 changes only sartorius' first location cell.
  const MASTER = Object.freeze([
    { id: "hip_iliopsoas", name: "腸腰筋", location: "PNNN", movement: "PSNN" },
    { id: "hip_sartorius", name: "縫工筋", location: "HHNH", movement: "HNHN" },
    { id: "hip_tfl", name: "大腿筋膜張筋", location: "HPNN", movement: "HNPS" },
    { id: "hip_gluteus_medius", name: "中臀筋", location: "NPPN", movement: "TTPT" },
    { id: "hip_gluteus_minimus", name: "小臀筋", location: "NPHN", movement: "TTPT" },
    { id: "hip_gluteus_maximus", name: "大臀筋", location: "NHPN", movement: "SPHN" },
    { id: "hip_adductors", name: "内転筋群", location: "HNNP", movement: "TNSP" }
  ]);
  const AMBIGUOUS_N = Object.freeze({
    hip_iliopsoas: ["hip_inner"],
    hip_gluteus_medius: ["hip_front_groin"],
    hip_gluteus_minimus: ["hip_front_groin"]
  });
  const ids = (items) => items.map((item) => item.id).sort();
  const grade = (value) => GRADES.indexOf(value);

  function normalize(input) {
    const location = input.location || input.painLocation;
    const movements = input.movements || input.situations;
    if (![...LOCATION_IDS, "location_unclear"].includes(location)) throw new Error("Invalid hip location");
    if (!["right", "left", "both", "center"].includes(input.side)) throw new Error("Invalid hip side");
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 ||
      new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !MOVEMENT_IDS.includes(id)) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) {
      throw new Error("Invalid hip movements");
    }
    return { location, side: input.side, movements: [...movements] };
  }

  function evidenceFor(muscle, input) {
    const location = input.location === "location_unclear" ? "?" :
      muscle.location[LOCATION_IDS.indexOf(input.location)];
    const strength = { sagittal: "N", frontal: "N" };
    const matchedMotions = [];
    const references = [];
    for (const movement of input.movements) {
      if (movement === "movement_unclear") continue;
      const relation = muscle.movement[MOVEMENT_IDS.indexOf(movement)];
      if (relation === "P" || relation === "H") {
        const axis = MOVEMENT_AXIS[movement];
        if (grade(relation) > grade(strength[axis])) strength[axis] = relation;
        matchedMotions.push(movement);
      } else if (relation === "S" || relation === "T") {
        references.push({ movement, relation });
      }
    }
    return { id: muscle.id, name: muscle.name, location, strength, matchedMotions, references,
      active: AXES.some((axis) => strength[axis] !== "N") };
  }

  function compare(left, right) {
    const greater = AXES.some((axis) => grade(left.strength[axis]) > grade(right.strength[axis]));
    const less = AXES.some((axis) => grade(left.strength[axis]) < grade(right.strength[axis]));
    return greater && less ? "incomparable" : greater ? "greater" : less ? "less" : "equal";
  }

  function frontier(items) {
    return items.filter((item) => !items.some((other) => other.id !== item.id &&
      compare(other, item) === "greater"));
  }

  function rank(rawInput, master = MASTER) {
    const input = normalize(rawInput);
    const hasInput = input.location !== "location_unclear" &&
      !input.movements.includes("movement_unclear");
    const evidence = master.map((muscle) => evidenceFor(muscle, input));
    const main = hasInput ? evidence.filter((item) => item.location === "P" && item.active) : [];
    const additional = hasInput ? evidence.filter((item) =>
      (item.location === "H" || item.location === "N") && item.active) : [];
    const activeIds = new Set([...main, ...additional].map((item) => item.id));
    const reference = hasInput ? evidence.filter((item) => !activeIds.has(item.id) &&
      item.references.some(({ relation }) => relation === "S") &&
      (item.location === "P" || item.location === "H" ||
        AMBIGUOUS_N[item.id]?.includes(input.location))) : [];
    const mainFrontier = frontier(main);
    const unionFrontier = frontier([...main, ...additional]);
    const unionIds = new Set(unionFrontier.map((item) => item.id));
    const unionMain = unionFrontier.filter((item) => main.some((m) => m.id === item.id));
    const unionAdditional = unionFrontier.filter((item) => additional.some((a) => a.id === item.id));
    const dominatedAdditional = additional.filter((item) => !unionIds.has(item.id));
    let status = "insufficient";
    let reason = input.location === "location_unclear" ? "location_unclear"
      : input.movements.includes("movement_unclear") ? "movement_unclear" : "no_main_evidence";
    if (hasInput && main.length) {
      if (!unionMain.length) {
        reason = "cross_group_additional_dominates";
      } else if (unionAdditional.length) {
        const cross = unionMain.flatMap((m) => unionAdditional.map((a) => compare(m, a)));
        status = "tied";
        reason = cross.includes("incomparable") ? "cross_group_incomparable" : "cross_group_equal";
      } else {
        status = unionMain.length === 1 ? "ranked" : "tied";
        reason = status === "ranked" ? "ranked_unique_main" : "main_tie";
      }
    } else if (hasInput && !additional.length && reference.length) {
      status = "stretch_only_reference";
      reason = "stretch_only_reference";
    }

    const toCandidate = (item, group, folded = false) => ({
      muscleId: item.id, name: item.name, displayGroup: group,
      isAdditionalCandidate: group === "Additional", folded,
      locationMatched: group === "Main", matchedMotions: [...item.matchedMotions],
      matchedContexts: [], matchedSymptoms: [],
      supportAxes: group === "Main" ? ["場所", "動き"] : ["動き"],
      reasons: group === "Main" ? ["選んだ位置と動きが重なる候補です"]
        : ["選んだ動きから追加で考えられる候補です"]
    });
    const sorted = (items) => [...items].sort((a, b) => a.id.localeCompare(b.id));
    const candidates = [
      ...sorted(main).map((item) => toCandidate(item, "Main")),
      ...sorted(unionAdditional).map((item) => toCandidate(item, "Additional")),
      ...sorted(dominatedAdditional).map((item) => toCandidate(item, "Additional", true)),
      ...sorted(reference).map((item) => toCandidate(item, "Reference"))
    ];
    return { version: VERSION, input, status, statusReason: reason,
      main: ids(main), additional: ids(additional), reference: ids(reference),
      mainFrontier: ids(mainFrontier), unionFrontier: ids(unionFrontier),
      unionMain: ids(unionMain), unionAdditional: ids(unionAdditional),
      dominatedAdditional: ids(dominatedAdditional),
      frontierCategory: !main.length ? "main0" : !unionAdditional.length ? "main_only" :
        !unionMain.length ? "additional_only" : "mixed",
      display: { initial: ids([...main, ...unionAdditional]),
        expanded: ids([...main, ...additional]) },
      candidates, referenceCandidates: reference.map((item) => item.name),
      topTie: status === "tied", sourceOrderUsedForTop1: false,
      evidence: Object.fromEntries(evidence.map((item) => [item.id, {
        location: item.location, strength: item.strength, matchedMotions: item.matchedMotions,
        references: item.references
      }])) };
  }

  return { VERSION, MASTER, LOCATIONS, MOVEMENTS, MOVEMENT_AXIS, rank };
});
