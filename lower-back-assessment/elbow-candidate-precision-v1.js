(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckElbowPrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "elbow-precision-v1-local-hypothesis";
  const LOCATIONS = Object.freeze([
    ["elbow_front", "肘の前"], ["elbow_inner", "肘の内側"],
    ["elbow_outer", "肘の外側"], ["elbow_back", "肘の後ろ"]
  ]);
  const MOVEMENTS = Object.freeze([
    ["elbow_flex", "肘を曲げる"], ["elbow_extend", "肘を伸ばす"],
    ["forearm_supinate", "手のひらを上へ向ける"],
    ["forearm_pronate", "手のひらを下へ向ける"]
  ]);
  const MASTER = Object.freeze([
    { id: "elbow_biceps_brachii", name: "上腕二頭筋", location: "PHNN", movement: "BSTN", role: "KEEP" },
    { id: "elbow_brachialis", name: "上腕筋", location: "PHNN", movement: "BSNN", role: "KEEP" },
    { id: "elbow_brachioradialis", name: "腕橈骨筋", location: "HNPN", movement: "BSNN", role: "KEEP" },
    { id: "elbow_triceps_brachii", name: "上腕三頭筋", location: "NNHP", movement: "SBNN", role: "KEEP" },
    { id: "elbow_anconeus", name: "肘筋", location: "NNHP", movement: "SBNN", role: "KEEP" },
    { id: "elbow_forearm_flexor_pronator_group", name: "前腕屈筋・回内筋群", location: "HPNN", movement: "NNRT", role: "GROUP" },
    { id: "elbow_forearm_extensor_supinator_group", name: "前腕伸筋・回外筋群", location: "HNPN", movement: "NNTR", role: "GROUP" }
  ]);
  const LOCATION_IDS = LOCATIONS.map(([id]) => id);
  const MOVEMENT_IDS = MOVEMENTS.map(([id]) => id);
  const sortedIds = (rows) => rows.map(({ id }) => id).sort();
  const byId = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

  function normalize(raw) {
    const location = raw.location || raw.painLocation;
    const movements = raw.movements || raw.situations;
    if (![...LOCATION_IDS, "location_unclear"].includes(location)) throw new Error("Invalid elbow location");
    if (!["right", "left", "both", "center"].includes(raw.side)) throw new Error("Invalid elbow side");
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 ||
      new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !MOVEMENT_IDS.includes(id)) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) {
      throw new Error("Invalid elbow movements");
    }
    return { location, side: raw.side, movements: [...movements].sort() };
  }

  function dominates(left, right, field) {
    const a = new Set(left[field]);
    const b = new Set(right[field]);
    return [...b].every((axis) => a.has(axis)) && [...a].some((axis) => !b.has(axis));
  }

  function frontier(rows, field) {
    return rows.filter((row) => !rows.some((other) => other.id !== row.id && dominates(other, row, field)));
  }

  function evidenceFor(muscle, input) {
    const location = input.location === "location_unclear" ? "?" :
      muscle.location[LOCATION_IDS.indexOf(input.location)];
    const active = [], broad = [], discriminatory = [], weak = [], review = [], stretch = [];
    for (const action of input.movements) {
      if (action === "movement_unclear") continue;
      const relation = muscle.movement[MOVEMENT_IDS.indexOf(action)];
      if (relation === "T" || relation === "B") {
        active.push(action);
        (relation === "T" ? discriminatory : broad).push(action);
      } else if (relation === "W") weak.push(action);
      else if (relation === "R") review.push(action);
      else if (relation === "S") stretch.push(action);
    }
    return { id: muscle.id, name: muscle.name, location,
      active: active.sort(), broad: broad.sort(), discriminatory: discriminatory.sort(),
      weak: weak.sort(), review: review.sort(), stretch: stretch.sort(),
      activeAxes: [...new Set(active)].sort(),
      discriminatoryAxes: [...new Set(discriminatory)].sort() };
  }

  function rank(raw, master = MASTER) {
    const input = normalize(raw);
    const unknownLocation = input.location === "location_unclear";
    const unknownMovement = input.movements.includes("movement_unclear");
    const rows = master.map((muscle) => evidenceFor(muscle, input));
    const main = unknownMovement ? [] : rows.filter((row) => row.location === "P" && row.active.length);
    const additional = unknownMovement ? [] : rows.filter((row) => row.location !== "P" && row.active.length);
    const activeIds = new Set(sortedIds([...main, ...additional]));
    const reference = unknownMovement ? [] : rows.filter((row) => row.location !== "N" &&
      row.stretch.length && !activeIds.has(row.id));
    const referenceIds = new Set(sortedIds(reference));
    const related = unknownMovement ? [] : rows.filter((row) => row.location === "P" &&
      !activeIds.has(row.id) && !referenceIds.has(row.id));
    let top = [], guardConsidered = [], guardChallengers = [];
    let reason = unknownLocation ? "location_unclear" : unknownMovement ? "movement_unclear" :
      reference.length && !main.length && !additional.length ? "stretch_only_reference" :
        "no_trusted_evidence";
    if (!unknownLocation && !unknownMovement && (main.length || additional.length)) {
      if (!main.length) reason = "no_main_location_support";
      else {
        const mainFront = frontier(main, "activeAxes");
        top = mainFront;
        reason = "main_evidence";
        guardConsidered = additional.filter((row) => row.discriminatory.length);
        guardChallengers = guardConsidered.filter((row) =>
          mainFront.some((item) => !dominates(item, row, "activeAxes")));
        if (guardChallengers.some((row) => mainFront.some((item) =>
          dominates(row, item, "activeAxes")))) {
          top = [];
          reason = "additional_dominates_main";
        } else if (guardChallengers.length) {
          top = frontier([...mainFront, ...guardChallengers], "activeAxes");
          reason = top.length > 1 ? "cross_group_guard" : "cross_group_uncertain";
          if (top.length === 1) top = [];
        }
        const excludedByBroadOnly = guardConsidered.filter((row) =>
          !guardChallengers.some((challenger) => challenger.id === row.id) &&
          mainFront.some((item) => dominates(item, row, "activeAxes") &&
            !dominates(item, row, "discriminatoryAxes")));
        const protectedPeers = top.length ? excludedByBroadOnly.filter((row) =>
          !top.some((item) => dominates(item, row, "discriminatoryAxes"))) : [];
        if (protectedPeers.length) {
          if (protectedPeers.some((row) => top.some((item) =>
            dominates(row, item, "discriminatoryAxes")))) {
            top = [];
            reason = "additional_dominates_main";
          } else {
            top = [...top, ...protectedPeers];
            guardChallengers = [...guardChallengers, ...protectedPeers];
            reason = "cross_group_guard";
          }
        }
        if (top.length === 1 && !top[0].discriminatory.length) {
          top = [];
          reason = "no_discriminatory_evidence";
        }
      }
    }
    const status = !top.length ? "insufficient" : top.length === 1 ? "ranked" : "tied";
    const toCandidate = (item, group) => ({
      muscleId: item.id, name: item.name, imageId: item.name, displayGroup: group,
      isAdditionalCandidate: group === "Additional", folded: group === "Related",
      locationMatched: group === "Main",
      matchedMotions: [...(group === "Reference" ? item.stretch :
        group === "Related" ? [...item.weak, ...item.review] : item.active)],
      matchedContexts: [], matchedSymptoms: [],
      supportAxes: group === "Main" ? ["場所", "動き"] : ["動き"],
      reasons: [group === "Main" ? "選んだ位置と動きが重なる候補です" :
        group === "Additional" ? "動きから追加で考えられる候補です" :
          group === "Related" ? "回答との関係が限定的なため順位を付けずに表示しています" :
            "伸ばされる方向としての参考です。原因を示すものではありません"]
    });
    const candidates = [
      ...byId(main).map((item) => toCandidate(item, "Main")),
      ...byId(additional).map((item) => toCandidate(item, "Additional")),
      ...byId(related).map((item) => toCandidate(item, "Related")),
      ...byId(reference).map((item) => toCandidate(item, "Reference"))
    ];
    return { version: VERSION, input, status, reason, statusReason: reason,
      main: sortedIds(main), additional: sortedIds(additional), related: sortedIds(related),
      reference: sortedIds(reference), frontier: sortedIds(top), top: sortedIds(top),
      visible: sortedIds([...main, ...additional, ...related, ...reference]),
      guardConsidered: sortedIds(guardConsidered), guardChallengers: sortedIds(guardChallengers),
      candidates, referenceCandidates: byId(reference).map((item) => toCandidate(item, "Reference")),
      topTie: status === "tied", sourceOrderUsedForTop1: false,
      evidence: Object.fromEntries(rows.map((item) => [item.id, item])) };
  }

  return { VERSION, MASTER, LOCATIONS, MOVEMENTS, rank };
});
