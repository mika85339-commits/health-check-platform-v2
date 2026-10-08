(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckWristPrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "wrist-precision-v1-local-hypothesis";
  const LOCATIONS = Object.freeze([
    ["wrist_palm", "手首の手のひら側"],
    ["wrist_back", "手首の手の甲側"],
    ["wrist_thumb", "手首の親指側"],
    ["wrist_little", "手首の小指側"]
  ]);
  const MOVEMENTS = Object.freeze([
    ["wrist_bend_palm", "手首を手のひら側へ曲げる時"],
    ["wrist_bend_back", "手首を手の甲側へ反らす時"],
    ["wrist_thumb_side", "手首を親指側へ傾ける時"],
    ["wrist_little_side", "手首を小指側へ傾ける時"],
    ["finger_flex", "人差し指〜小指を曲げる時"],
    ["finger_extend", "人差し指〜小指を伸ばす時"],
    ["thumb_open_extend", "親指を外側へ開く・反らす時"]
  ]);
  const RELATION_ORDER = Object.freeze([
    ...MOVEMENTS.map(([id]) => id), "wrist_grip", "wrist_twist", "wrist_type", "wrist_support"
  ]);
  const MASTER = Object.freeze([
    { id: "wrist_flexors_except_fcu", name: "手首を曲げる筋肉（小指側を除く）", anatomy: ["FCR", "PL"], location: "PHHN", radialEvidenceBasis: "FCR, not PL alone", movement: "TSTNWNNBRRR" },
    { id: "wrist_extensors_except_ecu", name: "手首を反らす筋肉（小指側を除く）", anatomy: ["ECRL", "ECRB"], location: "NPHN", movement: "STTNBWWBRRR" },
    { id: "wrist_finger_flexors", name: "指の屈筋群", anatomy: ["FDS", "FDP"], location: "PNNN", movement: "WNNNTNNBRRN" },
    { id: "wrist_finger_extensors", name: "指の伸筋群", anatomy: ["ED", "EDM", "EI"], location: "NPNN", movement: "NWNNNTNNNRR" },
    { id: "wrist_thumb_abductor_extensors", name: "親指を開く・伸ばす筋群", anatomy: ["APL", "EPB", "EPL"], location: "NNPN", movement: "NNWNNNTRRRN" },
    { id: "wrist_fcu", name: "尺側手根屈筋", anatomy: ["FCU"], location: "HNNP", movement: "TSSTWNNBRRN" },
    { id: "wrist_ecu", name: "尺側手根伸筋", anatomy: ["ECU"], location: "NHNP", movement: "STSTBWNBRRR" }
  ]);
  const LOCATION_IDS = LOCATIONS.map(([id]) => id);
  const MOVEMENT_IDS = MOVEMENTS.map(([id]) => id);
  const sortedIds = (rows) => rows.map(({ id }) => id).sort();
  const byId = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

  function normalize(raw, historical) {
    const location = raw.location || raw.painLocation;
    const movements = raw.movements || raw.situations;
    const allowed = historical ? RELATION_ORDER : MOVEMENT_IDS;
    if (![...LOCATION_IDS, "location_unclear"].includes(location)) throw new Error("Invalid wrist location");
    if (!["right", "left", "both", "center"].includes(raw.side)) throw new Error("Invalid wrist side");
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 ||
      new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !allowed.includes(id)) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) {
      throw new Error("Invalid wrist movements");
    }
    return { location, side: raw.side, movements: [...movements].sort() };
  }

  function dominates(left, right) {
    return right.t.every((axis) => left.t.includes(axis)) && left.t.length > right.t.length;
  }

  function frontier(rows) {
    return rows.filter((row) => !rows.some((other) => other.id !== row.id && dominates(other, row)));
  }

  function calculate(raw, master, historical) {
    const input = normalize(raw, historical);
    const unknownLocation = input.location === "location_unclear";
    const unknownMovement = input.movements.includes("movement_unclear");
    const rows = master.map((muscle) => {
      const locationClass = unknownLocation ? "?" : muscle.location[LOCATION_IDS.indexOf(input.location)];
      const relations = input.movements.map((movement) => [movement,
        movement === "movement_unclear" ? "N" : muscle.movement[RELATION_ORDER.indexOf(movement)]]);
      const byRelation = (code) => relations.filter(([, relation]) => relation === code)
        .map(([movement]) => movement).sort();
      return { id: muscle.id, name: muscle.name, anatomy: muscle.anatomy,
        locationClass, t: byRelation("T"), b: byRelation("B"), w: byRelation("W"),
        r: byRelation("R"), s: byRelation("S") };
    });
    const main = unknownMovement ? [] : rows.filter((row) => row.locationClass === "P" && row.t.length);
    const additional = unknownMovement ? [] : rows.filter((row) => row.locationClass !== "P" && row.t.length);
    const activeIds = new Set(sortedIds([...main, ...additional]));
    const reference = unknownMovement ? [] : rows.filter((row) => !activeIds.has(row.id) &&
      row.s.length && !row.b.length && !row.w.length && !row.r.length && row.locationClass !== "N");
    const referenceIds = new Set(sortedIds(reference));
    const related = unknownMovement ? [] : rows.filter((row) => !activeIds.has(row.id) &&
      !referenceIds.has(row.id) &&
      (row.b.length || row.w.length || row.r.length || row.locationClass === "P"));
    const mainFront = frontier(main);
    const guard = additional.filter((row) => row.t.length &&
      !mainFront.some((candidate) => dominates(candidate, row)));
    const crossFront = mainFront.length ? frontier([...mainFront, ...guard]) : [];
    let top = crossFront;
    let reason = "main_evidence";
    if (unknownLocation) { top = []; reason = "location_unclear"; }
    else if (unknownMovement) { top = []; reason = "movement_unclear"; }
    else if (!main.length) {
      top = [];
      reason = !additional.length && reference.length && !related.length
        ? "stretch_only_reference" : "no_main_discriminatory_evidence";
    } else if (mainFront.length && !crossFront.some((row) => main.some((candidate) => candidate.id === row.id))) {
      top = [];
      reason = "additional_dominates_main";
    } else if (crossFront.some((row) => additional.some((candidate) => candidate.id === row.id))) {
      reason = "cross_group_guard";
    } else if (mainFront.length > 1) {
      reason = "main_tie";
    }
    const status = !top.length ? "insufficient" : top.length === 1 ? "ranked" : "tied";
    const toCandidate = (row, group) => ({
      muscleId: row.id, name: row.name, imageId: row.name, displayGroup: group,
      isAdditionalCandidate: group === "Additional", folded: group === "Related",
      locationMatched: group === "Main",
      matchedMotions: [...(group === "Reference" ? row.s :
        group === "Related" ? [...row.b, ...row.w, ...row.r] : row.t)].sort(),
      matchedContexts: [], matchedSymptoms: [],
      supportAxes: group === "Main" ? ["場所", "動き"] : ["動き"],
      reasons: [group === "Main" ? "選んだ位置と動きが重なる候補です" :
        group === "Additional" ? "動きから追加で考えられる候補です" :
          group === "Related" ? "回答との関係が限定的なため順位を付けずに表示しています" :
            "伸ばされる方向としての参考です。原因を示すものではありません"]
    });
    const candidates = [
      ...byId(main).map((row) => toCandidate(row, "Main")),
      ...byId(additional).map((row) => toCandidate(row, "Additional")),
      ...byId(related).map((row) => toCandidate(row, "Related")),
      ...byId(reference).map((row) => toCandidate(row, "Reference"))
    ];
    return { version: VERSION, input, status, reason, statusReason: reason,
      main: sortedIds(main), additional: sortedIds(additional), related: sortedIds(related),
      reference: sortedIds(reference), frontier: sortedIds(top), top: sortedIds(top),
      guard: sortedIds(guard), visible: sortedIds([...main, ...additional, ...related, ...reference]),
      candidates, referenceCandidates: byId(reference).map((row) => toCandidate(row, "Reference")),
      topTie: status === "tied", sourceOrderUsedForTop1: false,
      evidence: Object.fromEntries(rows.map((row) => [row.id, {
        id: row.id, locationClass: row.locationClass, trustedDiscriminatory: row.t,
        trustedBroad: row.b, weak: row.w, review: row.r, stretch: row.s
      }])) };
  }

  function rank(raw, master = MASTER) { return calculate(raw, master, false); }
  function rankHistorical(raw, master = MASTER) { return calculate(raw, master, true); }

  return { VERSION, MASTER, LOCATIONS, MOVEMENTS, rank, rankHistorical };
});
