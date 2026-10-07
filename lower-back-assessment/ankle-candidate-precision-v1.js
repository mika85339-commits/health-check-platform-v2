(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckAnklePrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "ankle-precision-v1-local-hypothesis";
  const LOCATIONS = Object.freeze([
    ["ankle_front", "足首の前"], ["ankle_inner", "足首の内側"],
    ["ankle_outer", "足首の外側"], ["ankle_back", "足首の後ろ"]
  ]);
  const MOVEMENTS = Object.freeze([
    ["ankle_up", "つま先を上げる"], ["ankle_down", "つま先を下げる"],
    ["foot_in", "足首から足裏を内側へ傾ける"],
    ["foot_out", "足首から足裏を外側へ傾ける"],
    ["toes_up", "足指を上へ反らす"], ["toes_down", "足指を下へ曲げる"]
  ]);
  const MASTER = Object.freeze([
    { id: "ankle_tibialis_anterior", name: "前脛骨筋", imageId: "前脛骨筋", location: "PHNN", movement: "TSWNNN" },
    { id: "ankle_toe_extensors", name: "足趾伸筋群", imageId: "長趾伸筋", location: "PNHN", movement: "TNNNTN" },
    { id: "ankle_gastrocnemius", name: "腓腹筋", imageId: "腓腹筋", location: "NHHP", movement: "STNNNN" },
    { id: "ankle_soleus", name: "ヒラメ筋", imageId: "ヒラメ筋", location: "NHHP", movement: "STNNNN" },
    { id: "ankle_tibialis_posterior", name: "後脛骨筋", imageId: "後脛骨筋", location: "NPNH", movement: "NWTNNW" },
    { id: "ankle_toe_flexors", name: "足趾屈筋群", imageId: "長趾屈筋・長母趾屈筋", location: "NPNH", movement: "NWTNNT" },
    { id: "ankle_fibularis_group", name: "腓骨筋群", imageId: "腓骨筋群", location: "HNPH", movement: "NWNTNN" }
  ]);
  const LOCATION_IDS = LOCATIONS.map(([id]) => id);
  const MOVEMENT_IDS = MOVEMENTS.map(([id]) => id);
  const AXES = ["ankle_sagittal", "ankle_frontal", "toes"];
  const MOVEMENT_AXIS = Object.freeze({
    ankle_up: "ankle_sagittal", ankle_down: "ankle_sagittal",
    foot_in: "ankle_frontal", foot_out: "ankle_frontal",
    toes_up: "toes", toes_down: "toes"
  });
  const sortedIds = (rows) => rows.map((row) => row.id).sort();
  const byId = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

  function normalize(raw) {
    const location = raw.location || raw.painLocation;
    const movements = raw.movements || raw.situations;
    if (![...LOCATION_IDS, "location_unclear"].includes(location)) throw new Error("Invalid ankle location");
    if (!["right", "left", "both", "center"].includes(raw.side)) throw new Error("Invalid ankle side");
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 ||
      new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !MOVEMENT_IDS.includes(id)) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) {
      throw new Error("Invalid ankle movements");
    }
    return { location, side: raw.side, movements: [...movements].sort() };
  }

  function evidenceFor(muscle, input) {
    const location = input.location === "location_unclear" ? "?" :
      muscle.location[LOCATION_IDS.indexOf(input.location)];
    const trusted = [], weak = [], reference = [], review = [];
    const axis = Object.fromEntries(AXES.map((id) => [id, false]));
    for (const movement of input.movements) {
      if (movement === "movement_unclear") continue;
      const code = muscle.movement[MOVEMENT_IDS.indexOf(movement)];
      if (code === "T") { trusted.push(movement); axis[MOVEMENT_AXIS[movement]] = true; }
      else if (code === "W") weak.push(movement);
      else if (code === "S") reference.push(movement);
      else if (code === "R") review.push(movement);
    }
    return { id: muscle.id, name: muscle.name, imageId: muscle.imageId, location,
      trusted: trusted.sort(), weak: weak.sort(), reference: reference.sort(), review: review.sort(), axis };
  }

  function dominates(left, right) {
    return AXES.every((axis) => Number(left.axis[axis]) >= Number(right.axis[axis])) &&
      AXES.some((axis) => Number(left.axis[axis]) > Number(right.axis[axis]));
  }
  function frontier(rows) {
    return rows.filter((row) => !rows.some((other) => other.id !== row.id && dominates(other, row)));
  }
  function relation(main, additional) {
    if (dominates(additional, main)) return "ADDITIONAL_DOMINATES";
    if (dominates(main, additional)) return "MAIN_DOMINATES";
    if (AXES.every((axis) => main.axis[axis] === additional.axis[axis])) return "EQUAL";
    return "INCOMPARABLE";
  }

  function rank(raw, master = MASTER) {
    const input = normalize(raw);
    const noMovement = input.movements.includes("movement_unclear");
    const noLocation = input.location === "location_unclear";
    const rows = master.map((item) => evidenceFor(item, input));
    const main = noMovement ? [] : rows.filter((row) => row.location === "P" && row.trusted.length);
    const additional = noMovement ? [] : rows.filter((row) => row.location !== "P" && row.trusted.length);
    const activeIds = new Set([...main, ...additional].map((row) => row.id));
    const reference = noMovement ? [] : rows.filter((row) => row.location !== "N" &&
      row.reference.length && !activeIds.has(row.id));
    const referenceIds = new Set(reference.map((row) => row.id));
    const related = noMovement ? [] : rows.filter((row) => row.weak.length &&
      !activeIds.has(row.id) && !referenceIds.has(row.id));
    const mainFrontier = frontier(main);
    const pairRelations = mainFrontier.flatMap((mainRow) => additional.map((other) => ({
      main: mainRow.id, additional: other.id, class: relation(mainRow, other)
    })));
    let top = [];
    let reason = noLocation ? "location_unclear" : noMovement ? "movement_unclear" : "no_trusted_evidence";
    if (!noLocation && !noMovement && main.length) {
      top = mainFrontier;
      reason = "main_evidence";
      const challengerIds = new Set(pairRelations.filter((pair) => pair.class !== "MAIN_DOMINATES")
        .map((pair) => pair.additional));
      const challengers = additional.filter((row) => challengerIds.has(row.id));
      if (pairRelations.some((pair) => pair.class === "ADDITIONAL_DOMINATES")) {
        top = [];
        reason = "additional_dominates_main";
      } else if (challengers.length) {
        top = frontier([...mainFrontier, ...challengers]);
        if (top.length === 1) { top = []; reason = "cross_group_uncertain"; }
        else reason = "cross_group_guard";
      }
    } else if (!noLocation && !noMovement && additional.length) {
      reason = "no_main_location_support";
    }
    const status = !top.length ? "insufficient" : top.length === 1 ? "ranked" : "tied";
    const toCandidate = (item, displayGroup) => ({
      muscleId: item.id, name: item.name, imageId: item.imageId, displayGroup,
      isAdditionalCandidate: displayGroup === "Additional", folded: displayGroup === "Related",
      locationMatched: displayGroup === "Main",
      matchedMotions: [...(displayGroup === "Reference" ? item.reference :
        displayGroup === "Related" ? item.weak : item.trusted)],
      matchedContexts: [], matchedSymptoms: [],
      supportAxes: displayGroup === "Main" ? ["場所", "動き"] : ["動き"],
      reasons: [displayGroup === "Main" ? "選んだ位置と動きが重なる候補です" :
        displayGroup === "Additional" ? "動きから追加で考えられる候補です" :
          displayGroup === "Related" ? "弱い手がかりのため順位を付けずに表示しています" :
            "伸ばされる方向としての参考です。原因を示すものではありません"]
    });
    const candidates = [
      ...byId(main).map((item) => toCandidate(item, "Main")),
      ...byId(additional).map((item) => toCandidate(item, "Additional")),
      ...byId(related).map((item) => toCandidate(item, "Related")),
      ...byId(reference).map((item) => toCandidate(item, "Reference"))
    ];
    return {
      version: VERSION, input, status, statusReason: reason, reason,
      main: sortedIds(main), additional: sortedIds(additional), related: sortedIds(related),
      reference: sortedIds(reference), frontier: sortedIds(top), visible: sortedIds([...main, ...additional, ...related, ...reference]),
      top: sortedIds(top), mainFrontier: sortedIds(mainFrontier), pairRelations,
      candidates, referenceCandidates: byId(reference).map((item) => toCandidate(item, "Reference")),
      topTie: status === "tied", sourceOrderUsedForTop1: false,
      evidence: Object.fromEntries(rows.map((item) => [item.id, item]))
    };
  }

  return { VERSION, MASTER, LOCATIONS, MOVEMENTS, MOVEMENT_AXIS, rank };
});
