(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthCheckNeckPrecision = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "neck-precision-v1-local-review";
  const UNCLEAR_SITUATION = "movement_unclear";
  const UNCLEAR_LOCATION = "location_unclear";

  const SITUATION_OPTIONS = [
    ["look_down", "下を向く時"],
    ["look_up", "上を向く時"],
    ["turn_right", "右を向く時"],
    ["turn_left", "左を向く時"],
    ["side_bend_right", "首を右へ倒す時"],
    ["side_bend_left", "首を左へ倒す時"],
    ["chin_tuck", "あごを軽く引く時"],
    ["shoulder_shrug", "肩をすくめる時"],
    ["look_back", "振り向く時"],
    ["phone_long", "長時間スマートフォンを見る時"],
    ["desk_work", "デスクワーク中"],
    ["morning", "朝起きた時"]
  ];

  const LOCATION_OPTIONS = [
    ["neck_front", "首の前", ["胸鎖乳突筋", "頸部深層屈筋群"]],
    ["neck_side", "首の横", ["胸鎖乳突筋", "斜角筋", "肩甲挙筋"]],
    ["neck_back_upper", "首の後ろ・上（後頭部のすぐ下）", ["後頭下筋群", "頭板状筋・頸板状筋"]],
    ["neck_back_lower", "首の後ろ・下（肩に近い側）", ["頭板状筋・頸板状筋", "僧帽筋上部", "肩甲挙筋"]]
  ];

  const RELATION_POINTS = Object.freeze({
    primary: 8,
    secondary: 5,
    stretch: 3,
    shared: 4,
    none: 0
  });

  const LOCATION_POINTS = Object.freeze({
    neck_sternocleidomastoid: Object.freeze({ neck_front: 10, neck_side: 9, neck_back_upper: 0, neck_back_lower: 0, neck_back: 0 }),
    neck_deep_flexors: Object.freeze({ neck_front: 14, neck_side: 1, neck_back_upper: 0, neck_back_lower: 0, neck_back: 0 }),
    neck_scalenes: Object.freeze({ neck_front: 2, neck_side: 14, neck_back_upper: 0, neck_back_lower: 0, neck_back: 0 }),
    neck_suboccipitals: Object.freeze({ neck_front: 0, neck_side: 1, neck_back_upper: 14, neck_back_lower: 2, neck_back: 9 }),
    neck_splenius_capitis_cervicis: Object.freeze({ neck_front: 0, neck_side: 3, neck_back_upper: 10, neck_back_lower: 9, neck_back: 10 }),
    neck_upper_trapezius: Object.freeze({ neck_front: 0, neck_side: 3, neck_back_upper: 4, neck_back_lower: 13, neck_back: 9 }),
    neck_levator_scapulae: Object.freeze({ neck_front: 0, neck_side: 9, neck_back_upper: 4, neck_back_lower: 13, neck_back: 9 })
  });

  const SOURCES = Object.freeze({
    neckMovement: "https://www.ncbi.nlm.nih.gov/sites/books/NBK557555/",
    sternocleidomastoid: "https://www.ncbi.nlm.nih.gov/sites/books/NBK532881/",
    prevertebral: "https://www.ncbi.nlm.nih.gov/books/NBK560569/",
    scalenes: "https://www.ncbi.nlm.nih.gov/books/NBK519058/",
    scaleneRotation: "https://pubmed.ncbi.nlm.nih.gov/12403200/",
    suboccipitals: "https://www.ncbi.nlm.nih.gov/books/NBK567762/",
    splenius: "https://www.ncbi.nlm.nih.gov/sites/books/NBK537074/",
    trapezius: "https://www.ncbi.nlm.nih.gov/books/NBK518994/",
    trapeziusNuance: "https://pubmed.ncbi.nlm.nih.gov/23916077/",
    levatorScapulae: "https://www.ncbi.nlm.nih.gov/books/NBK553120/",
    deepFlexorMri: "https://pubmed.ncbi.nlm.nih.gov/20534315/"
  });

  const MUSCLE_MASTER = Object.freeze([
    {
      muscleId: "neck_sternocleidomastoid",
      name: "胸鎖乳突筋",
      model3dId: "hcl.neck.sternocleidomastoid.{side}",
      detailedLocations: ["neck_front", "neck_side"],
      primaryActions: ["同側側屈", "反対側回旋"],
      assistingActions: ["両側での頭頸部屈曲", "頭頸部姿勢保持", "吸気補助"],
      rotationDirection: "片側収縮では反対側回旋",
      lateralFlexionDirection: "同側側屈",
      flexionExtension: "両側作用は頸部位置により屈曲・上位頸椎伸展へ関与",
      stretchDirections: ["反対側側屈", "同側回旋"],
      symptomSideRelationship: "症状側と回旋・側屈方向を組み合わせる。右症状だけでは右筋へ加点しない。",
      scoringQuestions: ["painLocation", "situations", "side"],
      weakConditions: ["look_down", "look_up", "look_back"],
      excludedFromRanking: ["phone_long", "desk_work", "morning", "symptoms", "timing", "spread"],
      exclusionCandidate: "後面のみで、前面・外側の位置根拠がない場合は低順位",
      sources: [SOURCES.sternocleidomastoid, SOURCES.neckMovement]
    },
    {
      muscleId: "neck_deep_flexors",
      name: "頸部深層屈筋群",
      model3dId: "hcl.neck.deep_flexors.bilateral",
      detailedLocations: ["neck_front"],
      primaryActions: ["頭頸部屈曲", "頸椎分節の制御"],
      assistingActions: ["頭頸部姿勢保持"],
      rotationDirection: "この試作では順位づけに使用しない",
      lateralFlexionDirection: "片側作用の可能性はあるが、この試作では主要識別に使用しない",
      flexionExtension: "屈曲・頭蓋頸椎屈曲",
      stretchDirections: ["頸部伸展"],
      symptomSideRelationship: "主に両側性候補として扱い、片側回答だけで左右を確定しない。",
      scoringQuestions: ["painLocation", "situations"],
      weakConditions: ["look_down"],
      excludedFromRanking: ["phone_long", "desk_work", "morning", "symptoms", "timing", "side", "spread"],
      exclusionCandidate: "前面以外では低順位",
      sources: [SOURCES.prevertebral, SOURCES.deepFlexorMri]
    },
    {
      muscleId: "neck_scalenes",
      name: "斜角筋",
      model3dId: "hcl.neck.scalenes.{side}",
      detailedLocations: ["neck_side"],
      primaryActions: ["頸部側屈", "頸部屈曲", "第1・第2肋骨挙上"],
      assistingActions: ["頸部回旋", "吸気補助", "姿勢保持"],
      rotationDirection: "文献差があるため弱い関係として扱う。試作では同側回旋を候補関係に採用。",
      lateralFlexionDirection: "同側側屈",
      flexionExtension: "両側作用で頸部屈曲",
      stretchDirections: ["反対側側屈", "反対側回旋の可能性"],
      symptomSideRelationship: "症状側と側屈方向を組み合わせ、回旋は側屈より弱く扱う。",
      scoringQuestions: ["painLocation", "situations", "side"],
      weakConditions: ["look_down", "turn_right", "turn_left"],
      excludedFromRanking: ["phone_long", "desk_work", "morning", "symptoms", "timing", "spread"],
      exclusionCandidate: "後面のみでは低順位。しびれは筋候補加点にしない。",
      sources: [SOURCES.scalenes, SOURCES.scaleneRotation]
    },
    {
      muscleId: "neck_suboccipitals",
      name: "後頭下筋群",
      model3dId: "hcl.neck.suboccipitals.{side}",
      detailedLocations: ["neck_back_upper"],
      primaryActions: ["上位頸椎伸展", "同側回旋"],
      assistingActions: ["頭部の微細な姿勢調整", "一部筋の側屈"],
      rotationDirection: "同側回旋",
      lateralFlexionDirection: "一部筋が同側側屈",
      flexionExtension: "伸展",
      stretchDirections: ["頭蓋頸椎屈曲", "反対側回旋"],
      symptomSideRelationship: "後面上部の位置と回旋・小さな屈伸方向を組み合わせる。",
      scoringQuestions: ["painLocation", "situations", "side"],
      weakConditions: ["chin_tuck", "look_down"],
      excludedFromRanking: ["phone_long", "desk_work", "morning", "symptoms", "timing", "spread"],
      exclusionCandidate: "前面のみでは低順位。肩すくめ単独は根拠にしない。",
      sources: [SOURCES.suboccipitals, SOURCES.neckMovement]
    },
    {
      muscleId: "neck_splenius_capitis_cervicis",
      name: "頭板状筋・頸板状筋",
      model3dId: "hcl.neck.splenius_capitis_cervicis.{side}",
      detailedLocations: ["neck_back_upper", "neck_back_lower"],
      primaryActions: ["両側での頭頸部伸展", "同側回旋"],
      assistingActions: ["同側側屈", "姿勢保持"],
      rotationDirection: "同側回旋",
      lateralFlexionDirection: "同側側屈",
      flexionExtension: "伸展",
      stretchDirections: ["頸部屈曲", "反対側回旋・側屈"],
      symptomSideRelationship: "後面位置と、症状側に対する回旋・側屈方向を組み合わせる。",
      scoringQuestions: ["painLocation", "situations", "side"],
      weakConditions: ["chin_tuck", "look_down"],
      excludedFromRanking: ["phone_long", "desk_work", "morning", "symptoms", "timing", "spread"],
      exclusionCandidate: "前面のみでは低順位",
      sources: [SOURCES.splenius, SOURCES.neckMovement]
    },
    {
      muscleId: "neck_upper_trapezius",
      name: "僧帽筋上部",
      model3dId: "hcl.neck.upper_trapezius.{side}",
      detailedLocations: ["neck_back_lower"],
      primaryActions: ["肩甲帯の挙上・上方回旋", "頸部伸展"],
      assistingActions: ["頸部側屈", "頭部回旋", "姿勢保持"],
      rotationDirection: "資料上の単純化に注意し、この試作では弱い関係に留める",
      lateralFlexionDirection: "肩甲帯固定時の同側側屈",
      flexionExtension: "伸展",
      stretchDirections: ["肩甲帯下制", "反対側側屈"],
      symptomSideRelationship: "首後面下部の位置と肩すくめ回答を主に組み合わせる。",
      scoringQuestions: ["painLocation", "situations", "side"],
      weakConditions: ["look_up", "side_bend_right", "side_bend_left"],
      excludedFromRanking: ["phone_long", "desk_work", "morning", "symptoms", "timing", "spread"],
      exclusionCandidate: "前面・後頭部直下のみでは低順位。肩すくめだけで肩甲挙筋と断定的に分けない。",
      sources: [SOURCES.trapezius, SOURCES.trapeziusNuance]
    },
    {
      muscleId: "neck_levator_scapulae",
      name: "肩甲挙筋",
      model3dId: "hcl.neck.levator_scapulae.{side}",
      detailedLocations: ["neck_side", "neck_back_lower"],
      primaryActions: ["肩甲骨挙上", "頸部伸展・同側回旋・側屈"],
      assistingActions: ["肩甲骨下方回旋", "頸部と肩甲帯の連結"],
      rotationDirection: "同側回旋",
      lateralFlexionDirection: "同側側屈",
      flexionExtension: "伸展補助",
      stretchDirections: ["頸部屈曲", "反対側回旋", "肩甲骨下制"],
      symptomSideRelationship: "症状側と回旋・側屈方向、肩すくめを組み合わせる。",
      scoringQuestions: ["painLocation", "situations", "side"],
      weakConditions: ["look_up", "look_down", "look_back"],
      excludedFromRanking: ["phone_long", "desk_work", "morning", "symptoms", "timing", "spread"],
      exclusionCandidate: "前面のみでは低順位。朝という場面だけで単独候補にしない。",
      sources: [SOURCES.levatorScapulae, SOURCES.neckMovement]
    }
  ].map((item) => Object.freeze(item)));

  const MASTER_BY_ID = new Map(MUSCLE_MASTER.map((item) => [item.muscleId, item]));
  const MOVEMENT_IDS = new Set(SITUATION_OPTIONS.slice(0, 9).map(([id]) => id));
  const CONTEXT_IDS = new Set(["phone_long", "desk_work", "morning"]);
  const LABELS = Object.freeze(Object.fromEntries([
    ...SITUATION_OPTIONS,
    [UNCLEAR_SITUATION, "特定の動き・場面は分からない"]
  ]));

  function directionOf(motion) {
    if (motion.endsWith("_right")) return "right";
    if (motion.endsWith("_left")) return "left";
    return "";
  }

  function sideRelation(side, direction, sameRelation, oppositeRelation, unknownRelation = "shared") {
    if (!direction || !["right", "left"].includes(side)) return unknownRelation;
    return side === direction ? sameRelation : oppositeRelation;
  }

  function relationFor(muscleId, motion, side) {
    const direction = directionOf(motion);
    if (!MOVEMENT_IDS.has(motion)) return "none";

    if (muscleId === "neck_sternocleidomastoid") {
      if (motion.startsWith("turn_")) return sideRelation(side, direction, "stretch", "primary", "shared");
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "primary", "stretch", "shared");
      if (motion === "look_down") return "secondary";
      if (motion === "look_up") return "stretch";
      if (motion === "chin_tuck" || motion === "look_back") return "secondary";
      return "none";
    }
    if (muscleId === "neck_deep_flexors") {
      if (motion === "chin_tuck") return "primary";
      if (motion === "look_down") return "primary";
      if (motion === "look_up") return "stretch";
      return "none";
    }
    if (muscleId === "neck_scalenes") {
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "primary", "stretch", "shared");
      if (motion.startsWith("turn_")) return sideRelation(side, direction, "secondary", "stretch", "shared");
      if (motion === "look_down") return "secondary";
      if (motion === "look_back") return "shared";
      return "none";
    }
    if (muscleId === "neck_suboccipitals") {
      if (motion.startsWith("turn_")) return sideRelation(side, direction, "primary", "stretch", "shared");
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "secondary", "stretch", "shared");
      if (motion === "look_up") return "primary";
      if (motion === "chin_tuck") return "stretch";
      if (motion === "look_down") return "stretch";
      if (motion === "look_back") return "primary";
      return "none";
    }
    if (muscleId === "neck_splenius_capitis_cervicis") {
      if (motion.startsWith("turn_")) return sideRelation(side, direction, "primary", "stretch", "shared");
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "primary", "stretch", "shared");
      if (motion === "look_up" || motion === "look_back") return "primary";
      if (motion === "look_down" || motion === "chin_tuck") return "stretch";
      return "none";
    }
    if (muscleId === "neck_upper_trapezius") {
      if (motion === "shoulder_shrug") return "primary";
      if (motion.startsWith("side_bend_")) return sideRelation(side, direction, "secondary", "stretch", "shared");
      if (motion === "look_up") return "secondary";
      if (motion === "look_down") return "stretch";
      if (motion.startsWith("turn_") || motion === "look_back") return "shared";
      return "none";
    }
    if (muscleId === "neck_levator_scapulae") {
      if (motion === "shoulder_shrug") return "primary";
      if (motion.startsWith("turn_") || motion.startsWith("side_bend_")) {
        return sideRelation(side, direction, "primary", "stretch", "shared");
      }
      if (motion === "look_up" || motion === "look_back") return "secondary";
      if (motion === "look_down" || motion === "chin_tuck") return "stretch";
      return "none";
    }
    return "none";
  }

  function locationScore(muscleId, location) {
    if (!location || location === UNCLEAR_LOCATION) return 0;
    const configured = LOCATION_POINTS[muscleId] || {};
    const raw = configured[location];
    return Number.isFinite(raw) ? raw : -8;
  }

  function relationReason(relation, motion) {
    const label = LABELS[motion] || motion;
    if (relation === "primary") return `「${label}」と、この筋肉の主な作用方向が重なります`;
    if (relation === "secondary") return `「${label}」に、この筋肉が補助的に関わります`;
    if (relation === "stretch") return `「${label}」で、この筋肉が伸ばされる方向と重なります`;
    return `「${label}」は、この筋肉も関わり得る動きです`;
  }

  function rank(answers = {}) {
    const painLocation = answers.painLocation || UNCLEAR_LOCATION;
    const side = answers.side || "center";
    const situations = [...new Set(Array.isArray(answers.situations) ? answers.situations : [])];
    const movements = situations.filter((id) => MOVEMENT_IDS.has(id));
    const ignoredContexts = situations.filter((id) => CONTEXT_IDS.has(id));
    const locationKnown = painLocation !== UNCLEAR_LOCATION;

    const allRows = MUSCLE_MASTER.map((muscle) => {
      const locationPoints = locationScore(muscle.muscleId, painLocation);
      const motionEvidence = movements.map((motion) => {
        const relation = relationFor(muscle.muscleId, motion, side);
        return { motion, relation, points: RELATION_POINTS[relation] || 0 };
      }).filter((item) => item.points > 0);
      const movementPoints = motionEvidence.reduce((sum, item) => sum + item.points, 0);
      const score = locationPoints + movementPoints;
      return {
        muscleId: muscle.muscleId,
        model3dId: muscle.model3dId,
        name: muscle.name,
        score,
        locationPoints,
        movementPoints,
        motionEvidence,
        locationKnown,
        locationMatched: locationPoints >= 7,
        ignoredContexts
      };
    });

    const noDiscriminatingInput = !locationKnown && movements.length === 0;
    let candidates;
    if (noDiscriminatingInput) {
      candidates = allRows.map((item) => ({ ...item, score: 0 }));
    } else {
      const plausibleRows = locationKnown
        ? allRows.filter((item) => item.locationPoints >= 4
          || (item.locationPoints >= 2 && item.motionEvidence.some((evidence) => evidence.relation === "primary")))
        : allRows;
      const rankingRows = plausibleRows.length ? plausibleRows : allRows;
      const topScore = Math.max(...rankingRows.map((item) => item.score));
      candidates = rankingRows.filter((item) => item.score > 0 && item.score >= topScore - 5);
      if (!candidates.length) candidates = rankingRows.filter((item) => item.score === topScore);
    }

    candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ja"));
    let priorScore = null;
    let priorRank = 0;
    candidates = candidates.map((item, index) => {
      const rankNumber = priorScore === item.score ? priorRank : index + 1;
      priorScore = item.score;
      priorRank = rankNumber;
      const locationLabel = LOCATION_OPTIONS.find(([id]) => id === painLocation)?.[1]
        || (painLocation === "neck_back" ? "首の後ろ" : "場所ははっきり分からない");
      const reasons = [];
      if (item.locationPoints > 0 && locationKnown) reasons.push(`「${locationLabel}」という位置との重なりがあります`);
      item.motionEvidence.slice(0, 3).forEach((evidence) => reasons.push(relationReason(evidence.relation, evidence.motion)));
      if (!reasons.length) reasons.push("位置や方向付き動作だけでは、まだ十分に絞り込めません");
      const axes = [];
      if (item.locationPoints > 0 && locationKnown) axes.push("場所");
      if (item.motionEvidence.length) axes.push("動き・左右");
      return {
        ...item,
        rank: rankNumber,
        tiedAtRank: false,
        relation: axes.length ? `回答との一致：${axes.join("・")}` : "絞り込み情報が不足",
        reasons,
        matchedMotions: item.motionEvidence.map((evidence) => evidence.motion),
        matchedContexts: [],
        matchedSymptoms: [],
        painLocationLabel: locationLabel,
        supportAxes: axes
      };
    });

    const countsByRank = candidates.reduce((map, item) => map.set(item.rank, (map.get(item.rank) || 0) + 1), new Map());
    candidates = candidates.map((item) => ({ ...item, tiedAtRank: (countsByRank.get(item.rank) || 0) > 1 }));
    const topTie = candidates.filter((item) => item.rank === 1).length > 1;
    const status = noDiscriminatingInput ? "insufficient" : topTie ? "tied" : "ranked";

    return {
      version: VERSION,
      status,
      topTie,
      sourceOrderUsedForTop1: false,
      locationKnown,
      movements,
      ignoredInputs: {
        contexts: ignoredContexts,
        symptoms: Array.isArray(answers.symptoms) ? [...answers.symptoms] : [],
        timing: answers.timing || "",
        spread: answers.spread || ""
      },
      candidates
    };
  }

  return Object.freeze({
    VERSION,
    UNCLEAR_SITUATION,
    UNCLEAR_LOCATION,
    SITUATION_OPTIONS,
    LOCATION_OPTIONS,
    RELATION_POINTS,
    LOCATION_POINTS,
    SOURCES,
    MUSCLE_MASTER,
    rank,
    relationFor,
    locationScore
  });
});
