(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckSolePrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "sole-precision-v1-local-hypothesis";
  const LOCATIONS = Object.freeze([
    ["sole_heel", "かかと側"], ["sole_inner", "土踏まずの内側"],
    ["sole_center", "足裏の中央"], ["sole_outer", "足裏の外側"],
    ["sole_forefoot", "足指の付け根"]
  ]);
  const MOVEMENTS = Object.freeze([
    ["toe_curl", "足指を下へ曲げる"], ["toes_extend", "足指を上へ反らす"],
    ["heel_raise", "つま先立ちする"]
  ]);
  const MASTER = Object.freeze([
    { id: "sole_flexor_digitorum_brevis", name: "短趾屈筋", role: "KEEP", location: "HHPHH", movement: "TNTSW" },
    { id: "sole_flexor_hallucis_brevis", name: "短母趾屈筋", role: "KEEP", location: "NHHNP", movement: "TTNSW" },
    { id: "sole_extrinsic_toe_flexors", name: "足趾屈筋群（下腿由来）", role: "GROUP", location: "HHHHH", movement: "TTTNN" },
    { id: "sole_extrinsic_toe_extensors", name: "足趾伸筋群（下腿由来）", role: "GROUP", location: "NNNNH", movement: "NNNTN" },
    { id: "sole_gastrocnemius", name: "腓腹筋", role: "GROUP", location: "HNNNN", movement: "NNNNT" },
    { id: "sole_soleus", name: "ヒラメ筋", role: "GROUP", location: "HNNNN", movement: "NNNNT" },
    { id: "sole_abductor_hallucis", name: "母趾外転筋", role: "RELATED_ONLY", location: "HPHNH", movement: "WWNNW" },
    { id: "sole_abductor_digiti_minimi", name: "小趾外転筋", role: "RELATED_ONLY", location: "HNHPH", movement: "WNWNW" },
    { id: "sole_quadratus_plantae", name: "足底方形筋", role: "RELATED_ONLY", location: "HHPHH", movement: "WNWNN" },
    { id: "sole_flexor_digiti_minimi_brevis", name: "短小趾屈筋", role: "RELATED_ONLY", location: "NNHPH", movement: "WNWNN" },
    { id: "sole_adductor_hallucis", name: "母趾内転筋", role: "RELATED_ONLY", location: "NHHNP", movement: "WWNNN" },
    { id: "sole_lumbricals_interossei", name: "虫様筋・骨間筋群", role: "INACTIVE_IN_V1", location: "NNHHP", movement: "RRRRN" },
    { id: "sole_tibialis_posterior", name: "後脛骨筋", role: "RELATED_ONLY", location: "NHHNH", movement: "NNNNW" },
    { id: "sole_fibularis_group", name: "腓骨筋群", role: "RELATED_ONLY", location: "NNHHH", movement: "NNNNW" },
    { id: "sole_tibialis_anterior", name: "前脛骨筋", role: "INACTIVE_IN_V1", location: "NHNNN", movement: "NNNNS" }
  ]);
  const LOCATION_IDS = LOCATIONS.map(([id]) => id);
  const MOVEMENT_IDS = MOVEMENTS.map(([id]) => id);
  const SIGNATURE_MOVEMENT_IDS = ["toe_curl", "hallux_curl", "other_toes_curl", "toes_extend", "heel_raise"];
  const AXES = ["toe_flex", "toe_extend", "ankle_plantarflex"];
  const MOVEMENT_AXIS = Object.freeze({
    toe_curl: "toe_flex", toes_extend: "toe_extend", heel_raise: "ankle_plantarflex"
  });
  const DISPLAY_GROUPS = Object.freeze([{
    id: "sole_calf_display_group", name: "腓腹筋・ヒラメ筋",
    memberIds: ["sole_gastrocnemius", "sole_soleus"]
  }]);
  const byId = Object.fromEntries(MASTER.map((row) => [row.id, row]));
  const sorted = (ids) => [...ids].sort();

  function normalize(raw) {
    const location = raw.location || raw.painLocation;
    const movements = raw.movements || raw.situations;
    if (![...LOCATION_IDS, "location_unclear"].includes(location)) throw new Error("Invalid sole location");
    if (!["right", "left", "both", "center"].includes(raw.side)) throw new Error("Invalid sole side");
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 ||
      new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !MOVEMENT_IDS.includes(id)) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) {
      throw new Error("Invalid sole movements");
    }
    return { location, side: raw.side, movements: sorted(movements) };
  }

  function axisProfile(id, movements) {
    return { id, axis: Object.fromEntries(AXES.map((axis) => [axis,
      movements.some((movement) => MOVEMENT_AXIS[movement] === axis &&
        byId[id].movement[SIGNATURE_MOVEMENT_IDS.indexOf(movement)] === "T")])) };
  }
  function dominates(left, right) {
    return AXES.every((axis) => Number(left.axis[axis]) >= Number(right.axis[axis])) &&
      AXES.some((axis) => Number(left.axis[axis]) > Number(right.axis[axis]));
  }
  function frontier(rows) {
    return rows.filter((row) => !rows.some((other) => other.id !== row.id && dominates(other, row)));
  }
  function displayCandidates(result) {
    const items = [];
    const calf = DISPLAY_GROUPS[0];
    for (const category of ["main", "additional", "related", "reference"]) {
      const ids = result[category];
      for (const id of ids) {
        if (calf.memberIds.includes(id) && calf.memberIds.every((member) => ids.includes(member))) {
          if (!items.some((item) => item.displayId === calf.id)) {
            items.push({ displayId: calf.id, name: calf.name, category, memberIds: [...calf.memberIds] });
          }
        } else items.push({ displayId: id, name: byId[id].name, category, memberIds: [id] });
      }
    }
    return items;
  }

  function rank(raw, master = MASTER) {
    const input = normalize(raw);
    const result = { main: [], additional: [], related: [], reference: [],
      status: "insufficient", reason: "no_trusted_evidence", frontier: [] };
    const noMovement = input.movements.includes("movement_unclear");
    const noLocation = input.location === "location_unclear";
    if (!noMovement) for (const row of master) {
      const location = noLocation ? "?" : row.location[LOCATION_IDS.indexOf(input.location)];
      const selected = input.movements.map((movement) =>
        row.movement[SIGNATURE_MOVEMENT_IDS.indexOf(movement)]);
      const rankable = row.role === "KEEP" || row.role === "GROUP";
      if (rankable && selected.includes("T")) {
        result[location === "P" ? "main" : "additional"].push(row.id);
      } else if (rankable && location !== "N" && selected.includes("S")) {
        result.reference.push(row.id);
      } else if ((rankable || row.role === "RELATED_ONLY") && location !== "N" &&
        selected.includes("W")) result.related.push(row.id);
    }
    for (const key of ["main", "additional", "related", "reference"]) result[key] = sorted(result[key]);
    if (noLocation) result.reason = "location_unclear";
    else if (noMovement) result.reason = "movement_unclear";
    else if (!result.main.length) result.reason = result.additional.length ?
      "no_main_location_support" : result.reference.length ?
        "stretch_only_reference" : "no_trusted_evidence";
    else {
      const mainFront = frontier(result.main.map((id) => axisProfile(id, input.movements)));
      const challengers = result.additional.map((id) => axisProfile(id, input.movements))
        .filter((candidate) => mainFront.some((item) => !dominates(item, candidate)));
      if (challengers.some((candidate) => mainFront.some((item) => dominates(candidate, item)))) {
        result.reason = "additional_dominates_main";
      } else {
        result.frontier = sorted(frontier([...mainFront, ...challengers]).map((item) => item.id));
        if (challengers.length && result.frontier.length === 1) {
          result.frontier = [];
          result.reason = "cross_group_uncertain";
        } else {
          result.status = result.frontier.length === 1 ? "ranked" : "tied";
          result.reason = challengers.length ? "cross_group_guard" : "main_evidence";
        }
      }
    }
    const display = displayCandidates(result);
    const candidates = display.map((item) => {
      const displayGroup = { main: "Main", additional: "Additional", related: "Related",
        reference: "Reference" }[item.category];
      const matchedMotions = input.movements.filter((movement) => item.memberIds.some((id) => {
        const code = byId[id].movement[SIGNATURE_MOVEMENT_IDS.indexOf(movement)];
        return code === (displayGroup === "Reference" ? "S" : displayGroup === "Related" ? "W" : "T");
      }));
      return { muscleId: item.displayId, memberIds: [...item.memberIds], name: item.name,
        imageId: item.displayId === DISPLAY_GROUPS[0].id ? "腓腹筋" :
          item.name === "足趾屈筋群（下腿由来）" ? "長趾屈筋・長母趾屈筋" :
            item.name === "足趾伸筋群（下腿由来）" ? "長趾伸筋" : item.name,
        displayGroup, isAdditionalCandidate: displayGroup === "Additional",
        locationMatched: displayGroup === "Main", folded: false,
        matchedMotions, matchedContexts: [], matchedSymptoms: [],
        supportAxes: displayGroup === "Main" ? ["場所", "動き"] : ["動き"],
        reasons: [displayGroup === "Main" ? "選んだ位置と動きが重なる候補です" :
          displayGroup === "Additional" ? "動きから追加で考えられる候補です" :
            displayGroup === "Related" ? "回答との関係は限定的なため順位を付けずに表示しています" :
              "伸ばされる方向としての参考です。原因を示すものではありません"] };
    });
    return { version: VERSION, input, ...result, displayCandidates: display, candidates,
      referenceCandidates: candidates.filter((item) => item.displayGroup === "Reference"),
      top: result.frontier, topTie: result.status === "tied", sourceOrderUsedForTop1: false };
  }

  return { VERSION, LOCATIONS, MOVEMENTS, MASTER, DISPLAY_GROUPS, MOVEMENT_AXIS, rank };
});
