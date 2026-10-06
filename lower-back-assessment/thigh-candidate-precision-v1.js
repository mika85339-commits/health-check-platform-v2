(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckThighPrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "thigh-precision-v1-local-hypothesis";
  const LOCATIONS = Object.freeze([
    ["thigh_front", "太ももの前"],
    ["thigh_back", "太ももの後ろ"],
    ["thigh_inner", "太ももの内側"],
    ["thigh_outer", "太ももの外側"]
  ]);
  const MOVEMENTS = Object.freeze([
    ["knee_extend", "膝を伸ばす時"],
    ["knee_bend", "膝を曲げる時"],
    ["hip_extend", "脚を後ろへ動かす時"],
    ["hip_adduct", "脚を内側へ寄せる時"],
    ["hip_abduct", "脚を外側へ開く時"]
  ]);
  const MASTER = Object.freeze([
    { id: "thigh_quadriceps", name: "大腿四頭筋", imageId: "大腿四頭筋", location: "PNNH", movement: "PSNNN", active: true },
    { id: "thigh_hamstrings", name: "ハムストリングス", imageId: "ハムストリングス", location: "NPNN", movement: "SPPNN", active: true },
    { id: "thigh_adductors", name: "内転筋群", imageId: "内転筋", location: "NNPN", movement: "NNPPS", active: true },
    { id: "thigh_tfl", name: "大腿筋膜張筋", imageId: "大腿筋膜張筋", location: "HNNN", movement: "NNNSP", active: true },
    { id: "thigh_sartorius", name: "縫工筋", imageId: "縫工筋", location: "HNHN", movement: "NHNNH", active: false }
  ]);
  const LOCATION_IDS = LOCATIONS.map(([id]) => id);
  const MOVEMENT_IDS = MOVEMENTS.map(([id]) => id);
  const AXES = ["knee", "hip", "frontal"];
  const MOVEMENT_AXIS = Object.freeze({
    knee_extend: "knee", knee_bend: "knee", hip_extend: "hip",
    hip_adduct: "frontal", hip_abduct: "frontal"
  });
  const sortedIds = (items) => items.map((item) => item.id).sort();
  const byId = (items) => [...items].sort((left, right) => left.id.localeCompare(right.id));

  function normalize(raw) {
    const location = raw.location || raw.painLocation;
    const movements = raw.movements || raw.situations;
    if (![...LOCATION_IDS, "location_unclear"].includes(location)) throw new Error("Invalid thigh location");
    if (!["right", "left", "both", "center"].includes(raw.side)) throw new Error("Invalid thigh side");
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 ||
      new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !MOVEMENT_IDS.includes(id)) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) {
      throw new Error("Invalid thigh movements");
    }
    return { location, side: raw.side, movements: [...movements].sort() };
  }

  function evidenceFor(muscle, input) {
    const location = input.location === "location_unclear" ? "?" :
      muscle.location[LOCATION_IDS.indexOf(input.location)];
    const vector = { knee: 0, hip: 0, frontal: 0 };
    const trusted = [], weak = [], reference = [], review = [];
    for (const movement of input.movements) {
      if (movement === "movement_unclear") continue;
      const relation = muscle.movement[MOVEMENT_IDS.indexOf(movement)];
      if (relation === "P") {
        vector[MOVEMENT_AXIS[movement]] = 1;
        trusted.push(movement);
      } else if (relation === "H") weak.push(movement);
      else if (relation === "S") reference.push(movement);
      else if (relation === "T") review.push(movement);
    }
    return { id: muscle.id, name: muscle.name, imageId: muscle.imageId,
      location, vector, trusted, weak, reference, review, active: muscle.active };
  }

  function dominates(left, right) {
    return AXES.every((axis) => left.vector[axis] >= right.vector[axis]) &&
      AXES.some((axis) => left.vector[axis] > right.vector[axis]);
  }

  function frontier(items) {
    return items.filter((item) => !items.some((other) =>
      other.id !== item.id && dominates(other, item)));
  }

  function rank(raw, master = MASTER) {
    const input = normalize(raw);
    const complete = input.location !== "location_unclear" && !input.movements.includes("movement_unclear");
    const evidenceRows = master.map((muscle) => evidenceFor(muscle, input));
    const eligible = complete ? evidenceRows.filter((item) => item.active && item.trusted.length) : [];
    const main = eligible.filter((item) => item.location === "P");
    const additional = eligible.filter((item) => item.location !== "P");
    const reference = complete ? evidenceRows.filter((item) => item.reference.length &&
      item.location !== "N" && !eligible.some((other) => other.id === item.id)) : [];
    const related = complete ? evidenceRows.filter((item) => item.weak.length &&
      !eligible.some((other) => other.id === item.id) &&
      !reference.some((other) => other.id === item.id)) : [];
    const relatedDisplayed = related.filter((item) => item.location === "P" || item.location === "H");
    const mainFrontier = frontier(main);
    const unionFrontier = frontier([...main, ...additional]);
    let top = [];
    let reason = input.location === "location_unclear" ? "location_unclear" :
      input.movements.includes("movement_unclear") ? "movement_unclear" : "no_trusted_evidence";
    if (complete) {
      top = frontier(main.length ? main : additional);
      if (top.length) reason = main.length ? "main_evidence" : "additional_only";
      if (main.length) {
        const challengers = additional.filter((item) =>
          mainFrontier.some((primary) => !dominates(primary, item)));
        if (challengers.length && mainFrontier.length === 1 &&
          challengers.some((item) => dominates(item, mainFrontier[0]))) {
          top = [];
          reason = "additional_dominates_main";
        } else if (challengers.length) {
          top = [...mainFrontier, ...frontier(challengers)];
          reason = "cross_group_guard";
        }
      } else if (additional.length) {
        top = [];
        reason = "no_main_location_support";
      }
    }
    const status = !top.length ? "insufficient" : top.length === 1 ? "ranked" : "tied";
    const toCandidate = (item, displayGroup) => {
      const motions = displayGroup === "Reference" ? item.reference :
        displayGroup === "Related" ? item.weak : item.trusted;
      const subgroupEvidence = item.id === "thigh_adductors" && motions.includes("hip_extend");
      return {
        muscleId: item.id, name: item.name, imageId: item.imageId, displayGroup,
        isAdditionalCandidate: displayGroup === "Additional", folded: displayGroup === "Related",
        locationMatched: displayGroup === "Main", matchedMotions: [...motions],
        matchedContexts: [], matchedSymptoms: [],
        supportAxes: displayGroup === "Main" ? ["場所", "動き"] : ["動き"],
        reasons: subgroupEvidence
          ? ["内転筋群の一部（大内転筋を含む）が脚を後ろへ動かす働きに関係します。群の全筋に共通する作用ではありません"]
          : displayGroup === "Main" ? ["選んだ位置と動きが重なる候補です"]
            : displayGroup === "Additional" ? ["動きから追加で考えられる候補です"]
              : displayGroup === "Related" ? ["弱い手がかりのため順位を付けずに表示しています"]
                : ["伸ばされる方向としての参考です。原因を示すものではありません"]
      };
    };
    const candidates = [
      ...byId(main).map((item) => toCandidate(item, "Main")),
      ...byId(additional).map((item) => toCandidate(item, "Additional")),
      ...byId(relatedDisplayed).map((item) => toCandidate(item, "Related")),
      ...byId(reference).map((item) => toCandidate(item, "Reference"))
    ];
    return {
      version: VERSION, input, status, statusReason: reason, reason,
      main: sortedIds(main), additional: sortedIds(additional), related: sortedIds(related),
      relatedDisplayed: sortedIds(relatedDisplayed), reference: sortedIds(reference),
      top: sortedIds(top), mainFrontier: sortedIds(mainFrontier), unionFrontier: sortedIds(unionFrontier),
      display: { initial: sortedIds([...main, ...additional]), main: sortedIds(main),
        additional: sortedIds(additional), related: sortedIds(relatedDisplayed), reference: sortedIds(reference) },
      candidates, referenceCandidates: byId(reference).map((item) => toCandidate(item, "Reference")),
      topTie: status === "tied", sourceOrderUsedForTop1: false,
      evidence: Object.fromEntries(byId(evidenceRows).map((item) => [item.id, {
        location: item.location, vector: item.vector, trusted: item.trusted,
        weak: item.weak, reference: item.reference, review: item.review
      }]))
    };
  }

  return { VERSION, MASTER, LOCATIONS, MOVEMENTS, MOVEMENT_AXIS, rank };
});
