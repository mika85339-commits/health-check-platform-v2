(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckBackPrecisionV1 = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const VERSION = "back-precision-v1-local-hypothesis";
  const LOCATIONS = Object.freeze([
    ["back_upper", "背中の上側"],
    ["back_scapular_medial", "肩甲骨の内側"],
    ["back_scapular_inferior", "肩甲骨の下側"],
    ["back_thoracic_midline", "背骨に沿った中央"],
    ["back_lateral_ribs", "背中の横側・肋骨まわり"],
    ["back_lower_ribs", "背中の下側（肋骨がある範囲）"]
  ]);
  const MOVEMENTS = Object.freeze([
    ["bend_forward", "前かがみ"],
    ["extend_back", "後ろへ反る"],
    ["twist_body", "体をひねる"],
    ["shoulder_retract", "肩を軽く後ろへ引く"],
    ["arm_raise", "腕を上げる"],
    ["arm_pull_back", "腕を体の横から後ろへ引く"],
    ["deep_breath", "普段の深呼吸"],
    ["neck_move", "首を動かす"]
  ]);
  const MASTER = Object.freeze([
    { id: "back_scapular_retractors", name: "肩甲骨を内側へ寄せる筋群",
      constituents: ["僧帽筋中部", "菱形筋群"],
      constituentIds: ["back_middle_trapezius", "back_rhomboid_group"], maximumGroup: "Main" },
    { id: "back_thoracic_paraspinals", name: "胸椎を支える・反らす筋群",
      constituents: ["脊柱起立筋", "多裂筋"],
      constituentIds: ["back_erector_spinae", "back_multifidus"], maximumGroup: "Main" },
    { id: "back_lower_trapezius", name: "僧帽筋下部",
      constituents: ["僧帽筋下部"], constituentIds: ["back_lower_trapezius"], maximumGroup: "Additional" },
    { id: "back_latissimus_dorsi", name: "広背筋",
      constituents: ["広背筋"], constituentIds: ["back_latissimus_dorsi"], maximumGroup: "Additional" },
    { id: "back_upper_trapezius", name: "僧帽筋上部",
      constituents: ["僧帽筋上部"], constituentIds: ["back_upper_trapezius"], maximumGroup: "Related" },
    { id: "back_intercostal_group", name: "肋間筋群",
      constituents: ["肋間筋群"], constituentIds: ["back_intercostal_group"], maximumGroup: "Reference" }
  ].map((item) => Object.freeze({ ...item,
    constituents: Object.freeze(item.constituents), constituentIds: Object.freeze(item.constituentIds) })));
  const FALLBACK = Object.freeze({
    back_upper: ["back_upper_trapezius"],
    back_scapular_medial: ["back_scapular_retractors"],
    back_scapular_inferior: ["back_lower_trapezius", "back_latissimus_dorsi"],
    back_thoracic_midline: ["back_thoracic_paraspinals"],
    back_lateral_ribs: ["back_latissimus_dorsi"],
    back_lower_ribs: ["back_thoracic_paraspinals", "back_latissimus_dorsi"],
    location_unclear: []
  });
  const GROUP_PRIORITY = Object.freeze({ Related: 1, Reference: 2, Additional: 3, Main: 4 });
  const ids = (rows) => rows.map((row) => row.id).sort();
  const byId = (rows) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

  function normalize(raw) {
    const location = raw.location || raw.painLocation;
    const movements = raw.movements || raw.situations;
    if (![...LOCATIONS.map(([id]) => id), "location_unclear"].includes(location)) {
      throw new Error("Invalid back location");
    }
    if (!Array.isArray(movements) || movements.length < 1 || movements.length > 3 ||
      new Set(movements).size !== movements.length ||
      movements.some((id) => id !== "movement_unclear" && !MOVEMENTS.some(([motion]) => motion === id)) ||
      (movements.includes("movement_unclear") && movements.length !== 1)) {
      throw new Error("Invalid back movements");
    }
    return { location, movements: [...movements].sort() };
  }

  function rank(raw, master = MASTER) {
    const input = normalize(raw);
    const location = input.location;
    const selected = new Set(input.movements);
    const groups = new Map();
    const matched = new Map();
    const put = (id, group, movement) => {
      if (!groups.has(id) || GROUP_PRIORITY[group] > GROUP_PRIORITY[groups.get(id)]) {
        groups.set(id, group);
        matched.set(id, movement ? [movement] : []);
      } else if (groups.get(id) === group && movement) {
        matched.set(id, [...new Set([...(matched.get(id) || []), movement])].sort());
      }
    };
    for (const id of FALLBACK[location]) put(id, "Related");

    if (selected.has("shoulder_retract")) {
      if (location === "back_scapular_medial") put("back_scapular_retractors", "Main", "shoulder_retract");
      else if (["back_upper", "back_scapular_inferior", "back_thoracic_midline"].includes(location)) {
        put("back_scapular_retractors", "Additional", "shoulder_retract");
      }
    }
    if (selected.has("extend_back")) {
      if (location === "back_thoracic_midline") put("back_thoracic_paraspinals", "Main", "extend_back");
      else if (["back_scapular_medial", "back_scapular_inferior", "back_lower_ribs"].includes(location)) {
        put("back_thoracic_paraspinals", "Additional", "extend_back");
      }
    }
    if (selected.has("arm_raise") && ["back_scapular_medial", "back_scapular_inferior"].includes(location)) {
      put("back_lower_trapezius", "Additional", "arm_raise");
    }
    if (selected.has("arm_pull_back") &&
      ["back_scapular_inferior", "back_lateral_ribs", "back_lower_ribs"].includes(location)) {
      put("back_latissimus_dorsi", "Additional", "arm_pull_back");
    }
    if (selected.has("twist_body") &&
      ["back_thoracic_midline", "back_scapular_inferior", "back_lower_ribs"].includes(location)) {
      put("back_thoracic_paraspinals", "Related", "twist_body");
    }
    if (selected.has("bend_forward") && ["back_thoracic_midline", "back_lower_ribs"].includes(location)) {
      put("back_thoracic_paraspinals", "Reference", "bend_forward");
    }
    if (selected.has("deep_breath") && location === "back_lateral_ribs") {
      put("back_intercostal_group", "Reference", "deep_breath");
    }

    const rows = byId(master);
    const groupRows = (group) => rows.filter((row) => groups.get(row.id) === group);
    const main = groupRows("Main");
    const additional = groupRows("Additional");
    const related = groupRows("Related");
    const reference = groupRows("Reference");
    const neckBoundary = selected.has("neck_move") &&
      ["back_upper", "back_scapular_medial"].includes(location);
    const conflict = main.length > 0 && additional.length > 0;
    const status = main.length === 1 && !conflict && !neckBoundary ? "ranked"
      : main.length > 1 && !conflict && !neckBoundary ? "tied" : "insufficient";
    const reason = location === "location_unclear" ? "location_unclear"
      : selected.has("movement_unclear") ? "movement_unclear"
        : neckBoundary ? "neck_boundary" : conflict ? "cross_group_guard"
          : status === "ranked" ? "main_evidence" : status === "tied" ? "main_tie"
            : "no_main_evidence";
    const top = status === "insufficient" ? [] : main;
    const toCandidate = (row, displayGroup) => ({
      muscleId: row.id, name: row.name, imageId: row.name, displayGroup,
      constituents: [...row.constituents], isAdditionalCandidate: displayGroup === "Additional",
      folded: false, locationMatched: displayGroup === "Main",
      matchedMotions: [...(matched.get(row.id) || [])], matchedContexts: [], matchedSymptoms: [],
      supportAxes: displayGroup === "Main" ? ["場所", "動き"]
        : displayGroup === "Related" ? ["場所"] : ["動き"],
      reasons: [displayGroup === "Main" ? "選んだ位置と動きが重なる表示単位です。"
        : displayGroup === "Additional" ? "動きから追加で考えられる表示単位です。"
          : displayGroup === "Related" ? "選んだ場所の近くにある筋肉として表示しています。症状の原因を示すものではありません。"
            : "伸ばされる方向としての参考です。症状の原因を示すものではありません。"]
    });
    const candidates = [
      ...main.map((row) => toCandidate(row, "Main")),
      ...additional.map((row) => toCandidate(row, "Additional")),
      ...related.map((row) => toCandidate(row, "Related")),
      ...reference.map((row) => toCandidate(row, "Reference"))
    ];
    return { version: VERSION, input, status, reason, statusReason: reason,
      main: ids(main), additional: ids(additional), related: ids(related),
      reference: ids(reference), frontier: ids(top), top: ids(top),
      visible: ids([...main, ...additional, ...related, ...reference]),
      candidates, referenceCandidates: reference.map((row) => toCandidate(row, "Reference")),
      topTie: status === "tied", sourceOrderUsedForTop1: false,
      crossGroupConflict: conflict, neckBoundary };
  }

  return { VERSION, MASTER, LOCATIONS, MOVEMENTS, rank };
});
