(function () {
  const VERSION = "bodycheck-v10-reviewed-movement-mapping";
  const MAX_SELECTION = 3;
  const UNCLEAR_SITUATION = "movement_unclear";
  const UNCLEAR_SITUATION_OPTION = [UNCLEAR_SITUATION, "特定の動き・場面は分からない"];
  const NECK_PRECISION_UNCLEAR_SITUATION_OPTION = [UNCLEAR_SITUATION, "特定の動きが分からない"];
  const NECK_PRECISION_UI_SITUATION_IDS = new Set([
    "look_down",
    "look_up",
    "turn_right",
    "turn_left",
    "side_bend_right",
    "side_bend_left",
    "shoulder_shrug",
    "chin_tuck"
  ]);
  const UNCLEAR_LOCATION = "location_unclear";
  const UNCLEAR_LOCATION_OPTION = [UNCLEAR_LOCATION, "場所ははっきり分からない", []];
  const RANKABLE_SYMPTOMS = new Set(["sharp", "heavy", "tight", "limited", "catching"]);
  const CHANGE_SYMPTOMS = new Set(["better_move", "better_rest", "no_change"]);

  function isLocalPreview() {
    return Boolean(window.__HCL_LOCAL_PREVIEW__) || ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  }

  const partOrder = ["neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip", "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"];
  const legacyPartAliases = { scapula: "shoulder", calf: "lowerleg", foot: "sole" };
  const parts = {
    neck: { label: "首", adjacent: ["shoulder", "back"], icon: "Ne", care: ["首を大きく回さず、下を向く時間を短くする", "痛みやしびれが増える方向へ無理に動かさない"] },
    shoulder: { label: "肩", adjacent: ["neck", "elbow", "back"], icon: "Sh", care: ["肩をすくめず、小さく腕を回す", "痛みが強い角度で無理に上げない"] },
    elbow: { label: "肘", adjacent: ["shoulder", "wrist"], icon: "El", care: ["繰り返しの握り動作を少し減らす", "肘を強く曲げ伸ばしせず楽な範囲で動かす"] },
    wrist: { label: "手首", adjacent: ["elbow"], icon: "Wr", care: ["手首を反らしたまま使い続けない", "握る力を弱め、短い休憩を挟む"] },
    back: { label: "背中", adjacent: ["neck", "shoulder", "lowback"], icon: "Bk", care: ["深呼吸で背中を広げる", "反る動きは小さく確認する"] },
    lowback: { label: "腰", adjacent: ["back", "hip", "buttock"], icon: "Lb", care: ["同じ姿勢を続けず、短い歩行を挟む", "強く丸める・反らす動きは避ける"] },
    hip: { label: "股関節", adjacent: ["lowback", "buttock", "thigh"], icon: "Hp", care: ["股関節前側を無理なく動かす", "脚を開く動きは痛みの手前で止める"] },
    buttock: { label: "お尻", adjacent: ["lowback", "hip", "thigh"], icon: "Bt", care: ["座りっぱなしを避け、短い歩行を挟む", "お尻を軽く締める運動を10回"] },
    thigh: { label: "太もも", adjacent: ["hip", "buttock", "knee"], icon: "Th", care: ["太もも前後を反動なしで動かす", "急な痛みや腫れがある時は強く伸ばさない"] },
    knee: { label: "膝", adjacent: ["thigh", "lowerleg"], icon: "Kn", care: ["椅子からゆっくり立ち座りを5回", "深くしゃがむ動きは痛みの手前まで"] },
    lowerleg: { label: "すね・ふくらはぎ", adjacent: ["knee", "ankle"], icon: "Ll", care: ["足首をゆっくり上下に動かす", "片脚の腫れや熱感がある時は揉まない"] },
    ankle: { label: "足首", adjacent: ["lowerleg", "sole"], icon: "An", care: ["足首を上下にゆっくり10回", "片脚立ちは支えを使って確認する"] },
    sole: { label: "足裏", adjacent: ["ankle"], icon: "So", care: ["足指を小さく曲げ伸ばしする", "朝の一歩目は急がず荷重をかける"] }
  };

  const bodyPartGroups = {
    neck: { label: "首", entryPart: "neck", detailParts: ["neck"], views: ["front", "back"] },
    shoulder: { label: "肩", entryPart: "shoulder", detailParts: ["shoulder"], views: ["front", "back"] },
    elbow: { label: "肘", entryPart: "elbow", detailParts: ["elbow"], views: ["front", "back"] },
    wrist: { label: "手首", entryPart: "wrist", detailParts: ["wrist"], views: ["front", "back"] },
    back: { label: "背中", entryPart: "back", detailParts: ["back"], views: ["back"] },
    lowback: { label: "腰", entryPart: "lowback", detailParts: ["lowback"], views: ["back"] },
    hip: { label: "股関節", entryPart: "hip", detailParts: ["hip"], views: ["front"] },
    buttock: { label: "お尻", entryPart: "buttock", detailParts: ["buttock"], views: ["back"] },
    thigh: { label: "太もも", entryPart: "thigh", detailParts: ["thigh"], views: ["front", "back"] },
    knee: { label: "膝", entryPart: "knee", detailParts: ["knee"], views: ["front", "back"] },
    lowerleg: { label: "すね・ふくらはぎ", entryPart: "lowerleg", detailParts: ["lowerleg"], views: ["front", "back"] },
    ankle: { label: "足首", entryPart: "ankle", detailParts: ["ankle"], views: ["front", "back"] },
    sole: { label: "足裏", entryPart: "sole", detailParts: ["sole"], views: ["front", "back"] }
  };

  const situationByPart = {
    neck: [["look_down", "下を向く時"], ["look_up", "上を向く時"], ["turn_right", "右を向く時"], ["turn_left", "左を向く時"], ["look_back", "振り向く時"], ["phone_long", "長時間スマートフォンを見る時"], ["desk_work", "デスクワーク中"], ["morning", "朝起きた時"]],
    shoulder: [["front_raise", "腕を前から上げる時"], ["side_raise", "腕を横から上げる時"], ["hand_back", "後ろに手を回す時"], ["change_clothes", "服を着替える時"], ["tie_hair", "髪を結ぶ時"], ["carry_heavy", "重い物を持つ時"], ["side_sleep", "横向きで寝る時"], ["night_sleep", "夜寝ている時"]],
    elbow: [["elbow_bend", "肘を曲げる時"], ["elbow_extend", "肘を伸ばす時"], ["elbow_lift", "物を持ち上げる時"], ["elbow_grip", "物を強く握る時"], ["elbow_palm_up", "手のひらを上へ返す時"], ["elbow_palm_down", "手のひらを下へ返す時"], ["elbow_push", "手で押す時"], ["elbow_repeat", "同じ腕の動作を繰り返す時"]],
    wrist: [["wrist_bend_palm", "手首を手のひら側へ曲げる時"], ["wrist_bend_back", "手首を手の甲側へ反らす時"], ["wrist_thumb_side", "手首を親指側へ動かす時"], ["wrist_little_side", "手首を小指側へ動かす時"], ["wrist_grip", "物を握る時"], ["wrist_twist", "ふたやドアノブを回す時"], ["wrist_type", "スマートフォンやキーボードを使う時"], ["wrist_support", "手をついて身体を支える時"]],
    back: [["bend_forward", "前かがみになる時"], ["extend_back", "後ろへ反る時"], ["twist_body", "体をひねる時"], ["side_bend", "横に倒す時"], ["deep_breath", "深呼吸する時"], ["long_sitting", "長時間座る時"], ["turn_over", "寝返りする時"]],
    lowback: [["bend_forward", "前に曲げる時"], ["extend_back", "後ろに反る時"], ["twist_body", "体をひねる時"], ["side_bend", "横に倒す時"], ["stand_up", "立ち上がる時"], ["sit_down", "座る時"], ["walking", "歩く時"], ["long_sitting", "長時間座る時"], ["turn_over", "寝返りする時"], ["morning", "朝起きる時"]],
    buttock: [["walking", "歩く時"], ["single_leg", "片脚で立つ時"], ["stairs_up", "階段を上る時"], ["stairs_down", "階段を下りる時"], ["stand_up", "立ち上がる時"], ["long_sitting", "長時間座る時"], ["side_sleep", "横向きで寝る時"], ["cross_leg", "脚を組む時"]],
    hip: [["walking", "歩く時"], ["stairs_up", "階段を上る時"], ["stairs_down", "階段を下りる時"], ["squat", "しゃがむ時"], ["wear_socks", "靴下を履く時"], ["car_inout", "車へ乗り降りする時"], ["cross_leg_sit", "あぐらをかく時"], ["open_leg", "脚を開く時"]],
    thigh: [["walking", "歩く時"], ["running", "走る時"], ["stairs_up", "階段を上る時"], ["stairs_down", "階段を下りる時"], ["squat", "しゃがむ時"], ["extend_knee", "膝を伸ばす時"], ["bend_knee", "膝を曲げる時"], ["long_sitting", "長時間座る時"]],
    knee: [["walking", "歩く時"], ["stairs_up", "階段を上る時"], ["stairs_down", "階段を下りる時"], ["stand_up", "立ち上がる時"], ["squat", "しゃがむ時"], ["seiza", "正座する時"], ["extend_knee", "膝を伸ばす時"], ["bend_knee", "膝を曲げる時"]],
    lowerleg: [["walking", "歩く時"], ["running", "走る時"], ["stairs_up", "階段を上る時"], ["toe_stand", "つま先立ちする時"], ["raise_toes", "つま先を上げる時"], ["long_standing", "立ち続ける時"], ["after_exercise", "運動後"], ["sleeping", "寝ている時"]],
    ankle: [["start_walk", "歩き始め"], ["long_walk", "長く歩く時"], ["running", "走る時"], ["stairs", "階段を使う時"], ["toe_stand", "つま先立ちする時"], ["single_leg", "片脚で立つ時"], ["first_step", "朝の一歩目"], ["wear_shoes", "靴を履いている時"]],
    sole: [["start_walk", "歩き始め"], ["long_walk", "長く歩く時"], ["running", "走る時"], ["stairs", "階段を使う時"], ["toe_stand", "つま先立ちする時"], ["single_leg", "片脚で立つ時"], ["first_step", "朝の一歩目"], ["wear_shoes", "靴を履いている時"]]
  };

  const symptomOptions = [
    ["sharp", "鋭く痛む"], ["heavy", "重だるい"], ["tight", "張る、突っ張る"], ["limited", "動かしにくい"], ["catching", "引っかかる"],
    ["weakness", "力が入りにくい"], ["numbness", "しびれる"], ["better_move", "動くと楽になる"], ["better_rest", "休むと楽になる"], ["no_change", "特に変化しない"]
  ];
  const symptomDisplayGroups = [
    {
      title: "感じ方・動かしにくさ",
      lead: "痛み、重さ、張り、動かしにくさなどから近いものを選びます。",
      ids: ["sharp", "heavy", "tight", "limited", "catching", "weakness", "numbness"]
    },
    {
      title: "動いたり休んだりした後の変化",
      lead: "動くと楽になる、休むと楽になるなどの変化も選べます。",
      ids: ["better_move", "better_rest", "no_change"]
    }
  ];
  const timingOptions = [
    ["start", "動き始め"],
    ["middle", "動いている間"],
    ["end", "動き終わる頃"],
    ["after", "動いた後"],
    ["rest", "じっとしていても気になる"],
    ["continuous", "ほぼずっと気になる"],
    ["unclear", "日によって違う・よく分からない"]
  ];
  const sideOptions = [["right", "右側"], ["left", "左側"], ["both", "両側"], ["center", "中央"]];
  const spreadOptions = [["local", "選択した部位だけ"], ["near", "近くの部位まで広がる"], ["limb", "腕や脚まで広がる"]];
  const painLocationByPart = {
    neck: [
      ["neck_front", "首の前", ["胸鎖乳突筋", "頸部深層屈筋群"]],
      ["neck_side", "首の横", ["胸鎖乳突筋", "斜角筋", "肩甲挙筋"]],
      ["neck_back", "首の後ろ", ["後頭下筋群", "頭板状筋・頸板状筋", "僧帽筋上部", "肩甲挙筋"]]
    ],
    shoulder: [
      ["shoulder_front", "肩の前", ["三角筋", "肩甲下筋", "大胸筋"]],
      ["shoulder_outer", "肩の横", ["三角筋", "棘上筋", "棘下筋・小円筋"]],
      ["shoulder_top", "肩の上", ["僧帽筋上部", "棘上筋", "三角筋"]],
      ["shoulder_back", "肩の後ろ", ["三角筋", "棘上筋", "棘下筋・小円筋"]]
    ],
    elbow: [
      ["elbow_front", "肘の前", ["上腕二頭筋", "上腕筋", "腕橈骨筋"]],
      ["elbow_inner", "肘の内側", ["前腕屈筋・回内筋群"]],
      ["elbow_outer", "肘の外側", ["前腕伸筋・回外筋群", "腕橈骨筋"]],
      ["elbow_back", "肘の後ろ", ["上腕三頭筋", "肘筋"]]
    ],
    wrist: [
      ["wrist_palm", "手首の手のひら側", ["手首の屈筋群", "指の屈筋群"]],
      ["wrist_back", "手首の手の甲側", ["手首の伸筋群", "指の伸筋群"]],
      ["wrist_thumb", "手首の親指側", ["親指を開く・伸ばす筋群", "手首の伸筋群"]],
      ["wrist_little", "手首の小指側", ["尺側手根屈筋", "尺側手根伸筋"]]
    ],
    back: [
      ["back_upper", "背中の上", ["僧帽筋上部", "僧帽筋中部"]],
      ["back_center", "背中の中央", ["僧帽筋中部", "僧帽筋下部", "脊柱起立筋", "多裂筋"]],
      ["back_side", "背中の横", ["広背筋", "脊柱起立筋", "肋間筋群"]],
      ["back_lower", "背中の下", ["広背筋", "脊柱起立筋", "多裂筋"]]
    ],
    lowback: [
      ["lowback_center", "腰の中央", ["脊柱起立筋", "多裂筋"]],
      ["lowback_side", "腰の横", ["腰方形筋", "腹斜筋群"]],
      ["lowback_pelvis_top", "腰の下（骨盤の上）", ["腰方形筋", "脊柱起立筋", "多裂筋"]]
    ],
    buttock: [
      ["buttock_upper_outer", "お尻の上・外側", ["中臀筋", "小臀筋", "大臀筋"]],
      ["buttock_center", "お尻の中央", ["大臀筋", "梨状筋"]],
      ["buttock_lower", "お尻の下", ["大臀筋", "ハムストリングス"]]
    ],
    hip: [
      ["hip_front_groin", "股関節の前（脚の付け根）", ["腸腰筋", "縫工筋"]],
      ["hip_outer", "股関節の横", ["中臀筋", "小臀筋", "大腿筋膜張筋"]],
      ["hip_back", "股関節の後ろ", ["大臀筋", "中臀筋", "梨状筋"]],
      ["hip_inner", "股関節の内側（内ももの付け根）", ["内転筋"]]
    ],
    thigh: [
      ["thigh_front", "太ももの前", ["大腿四頭筋", "大腿筋膜張筋", "縫工筋"]],
      ["thigh_back", "太ももの後ろ", ["ハムストリングス"]],
      ["thigh_inner", "太ももの内側", ["内転筋", "縫工筋"]],
      ["thigh_outer", "太ももの外側", ["大腿筋膜張筋", "大腿四頭筋"]]
    ],
    knee: [
      ["knee_front", "膝の前", ["大腿四頭筋"]],
      ["knee_inner", "膝の内側", ["大腿四頭筋", "ハムストリングス"]],
      ["knee_outer", "膝の外側", ["大腿四頭筋", "ハムストリングス", "膝窩筋"]],
      ["knee_back", "膝の後ろ", ["膝窩筋", "ハムストリングス", "腓腹筋"]]
    ],
    lowerleg: [
      ["lowerleg_front", "すね側（前）", ["前脛骨筋", "長趾伸筋", "長母趾伸筋"]],
      ["lowerleg_back", "ふくらはぎ側（後ろ）", ["腓腹筋", "ヒラメ筋"]],
      ["lowerleg_inner", "すね・ふくらはぎの内側", ["後脛骨筋", "長趾屈筋・長母趾屈筋"]],
      ["lowerleg_outer", "すね・ふくらはぎの外側", ["腓骨筋群", "長趾伸筋"]]
    ],
    ankle: [
      ["ankle_front", "足首の前", ["前脛骨筋", "長趾伸筋", "長母趾伸筋"]],
      ["ankle_inner", "足首の内側", ["後脛骨筋", "長趾屈筋・長母趾屈筋"]],
      ["ankle_outer", "足首の外側", ["腓骨筋群"]],
      ["ankle_back", "足首の後ろ", ["腓腹筋", "ヒラメ筋"]]
    ],
    sole: [
      ["sole_heel", "かかと側", ["短趾屈筋", "母趾外転筋", "小趾外転筋"]],
      ["sole_inner", "土踏まずの内側", ["母趾外転筋", "短母趾屈筋", "短趾屈筋"]],
      ["sole_center", "足裏の中央", ["短趾屈筋", "足底方形筋"]],
      ["sole_outer", "足裏の外側", ["小趾外転筋", "短小趾屈筋"]],
      ["sole_forefoot", "足指の付け根", ["短母趾屈筋", "母趾内転筋", "虫様筋・骨間筋群"]]
    ]
  };

  const aiDeepDiveByPart = {
    neck: {
      followUp: "首を前・後ろ・横へ動かした時の違い、頭痛やめまい、腕のしびれ・力の入りにくさを区別する",
      comparison: "首だけの動きと、肩・腕を動かした時の変化を比べる",
      stretch: "反動をつけた首回しや強いひねりは避け、腕へ症状が広がる動きは中止する",
      safety: "強い頭痛、めまい、歩きにくさ、急な手足のしびれ・脱力、外傷後の症状があれば運動提案より医療相談を優先する"
    },
    shoulder: {
      followUp: "腕を前・横へ上げる、背中へ回す、横向きで寝る場面を分け、首を動かした時にも変化するか確認する",
      comparison: "肩の前・横・上・後ろのどこかと、腕を上げられる範囲や実際の力の入り方を比べる",
      stretch: "痛みが強い角度や頭上で無理に止めず、小さく楽に動かせる範囲から提案する",
      safety: "転倒などの外傷、変形や強い腫れ、発熱・熱感、腕を動かせない状態、消えないしびれがあれば運動提案より医療相談を優先する"
    },
    elbow: {
      followUp: "肘の曲げ伸ばし、握る動作、手のひらを返す動作を分け、外傷・腫れ・握力低下・指へのしびれを確認する",
      comparison: "肘の前・内側・外側・後ろの位置と、肘だけの動きまたは手首や握る動作での変化を比べる",
      stretch: "強い握りや反復動作をいったん減らし、痛みが増えない範囲の肘と前腕の軽い動きだけを提案する",
      safety: "大きな外傷、変形、強い腫れ・熱感、肘を曲げ伸ばしできない、手のしびれや力の入りにくさが続く場合は医療相談を優先する"
    },
    wrist: {
      followUp: "手首を曲げる・反らす・左右へ動かす場面と、握る・回す・手をつく場面を分け、指のしびれや握力低下を確認する",
      comparison: "手首の手のひら側・手の甲側・親指側・小指側の位置と、手首だけの動きまたは指を使う動作での変化を比べる",
      stretch: "痛みが強い方向へ手首を押し込まず、握る力を抜いた状態で小さく動かせる範囲だけを提案する",
      safety: "外傷後の変形や強い腫れ、指の感覚低下、急な握力低下、赤み・熱感が続く場合は運動提案より医療相談を優先する"
    },
    back: {
      followUp: "前屈・反る・ひねる動きと、深呼吸や寝返りでの変化を分け、胸部症状や外傷の有無も確認する",
      comparison: "背中の上・中央・横・下の位置と、呼吸または体幹の動きのどちらで強く変化するかを比べる",
      stretch: "呼吸を止めず、小さい範囲の体幹運動から提案し、鋭い痛みが増す方向へ押し込まない",
      safety: "胸痛や息苦しさ、発熱、強い外傷、急な手足のしびれ・脱力があれば運動提案より医療相談を優先する"
    },
    lowback: {
      followUp: "前屈・反る・立ち上がり・寝返り・朝の動き始めを分け、脚への広がりと排尿・排便の変化を確認する",
      comparison: "腰の中央・横・骨盤の上の位置と、座った後や歩行時の変化を比べる",
      stretch: "腰を強く丸める・反らす動きを決め打ちせず、楽になる方向を小さい範囲で確認してから提案する",
      safety: "排尿・排便の急な変化、股の周囲の感覚低下、両脚のしびれ・脱力、発熱や大きな外傷があれば運動提案より緊急の医療相談を優先する"
    },
    buttock: {
      followUp: "座位・歩行・片脚立ち・階段での違いを分け、腰や股関節を動かした時と脚への広がりも確認する",
      comparison: "お尻の上外側・中央・下の位置と、体重をかけた時または長く座った時の変化を比べる",
      stretch: "強いしびれや脚への放散がなければ、臀部と股関節を小さい範囲で動かす方法から提案する",
      safety: "急な脚の脱力、広がるしびれ、体重をかけられない状態、外傷や発熱があれば運動提案より医療相談を優先する"
    },
    hip: {
      followUp: "歩行・立ち上がり・階段・靴下を履く動作を分け、体重をかけられるかと引っかかりの有無を確認する",
      comparison: "股関節の前・横・後ろ・内側の位置と、動かした時または横向きで圧がかかった時の変化を比べる",
      stretch: "深く曲げる、強く開く、ひねる動きを決め打ちせず、引っかかりや鋭い痛みが出ない範囲だけ提案する",
      safety: "転倒後に体重をかけられない、変形、強い腫れ・熱感、発熱、急な脚のしびれ・脱力があれば運動提案より医療相談を優先する"
    },
    thigh: {
      followUp: "歩行・走行・階段・膝の曲げ伸ばしを分け、急な受傷、腫れや内出血、力の入りにくさを確認する",
      comparison: "太ももの前・後ろ・内側・外側の位置と、筋肉を使う時または伸ばす時のどちらで変化するかを比べる",
      stretch: "急な受傷や腫れがなければ反動なしの軽い動きから提案し、鋭い痛みが出る伸ばし方は避ける",
      safety: "大きな外傷、急な腫れ・内出血、歩けない状態、片脚だけの強い腫れ・熱感があれば運動提案より医療相談を優先する"
    },
    knee: {
      followUp: "階段の上り・下り、立ち上がり、歩き始め、曲げ伸ばしを分け、腫れ・引っかかり・膝崩れを確認する",
      comparison: "膝の前・内側・外側・後ろの位置と、体重をかけた時または曲げ伸ばしだけでの変化を比べる",
      stretch: "深く曲げる動きや強い荷重を避け、腫れや引っかかりがない範囲の軽い運動から提案する",
      safety: "膝が伸びないほどのロック、強い腫れ・熱感、繰り返す膝崩れ、大きな外傷、体重をかけられない状態があれば運動提案より医療相談を優先する"
    },
    lowerleg: {
      followUp: "歩行・走行・つま先立ち・つま先上げ・運動後・睡眠中を分け、片脚だけの腫れ・赤み・熱感の有無を最初に確認する",
      comparison: "すね側・ふくらはぎ側・内側・外側の位置と、動いた時または安静時のどちらで変化するかを比べる",
      stretch: "片脚の腫れ・赤み・熱感がなく、外傷直後でなければ、膝を曲げた場合と伸ばした場合を無理なく分けて提案する",
      safety: "片脚だけの腫れ・赤み・熱感、原因不明の強い痛み、胸痛や息苦しさがあればストレッチやマッサージを提案せず、速やかな医療相談を優先する"
    },
    ankle: {
      followUp: "受傷の有無、歩き始め・長歩き・階段・片脚立ちでの違いを分け、腫れと体重をかけられるかを確認する",
      comparison: "足首の前・内側・外側・後ろの位置と、上下運動または体重をかけた時の変化を比べる",
      stretch: "急な外傷や強い腫れがなければ、荷重をかけない小さい上下運動から提案する",
      safety: "変形、強い腫れ、受傷時の音、歩けない状態、発熱を伴う赤み・熱感があれば運動提案より医療相談を優先する"
    },
    sole: {
      followUp: "朝の一歩目・歩き始め・長歩き・靴を履いた時を分け、傷・腫れ・しびれと体重をかけられるかを確認する",
      comparison: "かかと側・土踏まず・足裏中央・外側・足指の付け根の位置と、最初の数歩または歩き続けた時の変化を比べる",
      stretch: "傷や強い腫れ、急な外傷がなければ、足指や足首を荷重なしで小さく動かす方法から提案する",
      safety: "変形、歩けない状態、発熱を伴う赤み・熱感、感覚低下、治りにくい傷があれば運動提案より医療相談を優先する"
    }
  };

  const aiSymptomGuidance = {
    sharp: "鋭い痛みが突然始まったか、特定の角度だけか、外傷があったかを確認する",
    heavy: "重だるさが姿勢や時間帯、休息でどう変わるかを確認する",
    tight: "張り・突っ張りが筋肉を使う時と伸ばす時のどちらで強いかを確認する",
    limited: "痛くて動かせないのか、硬さや怖さで動かしにくいのかを区別する",
    catching: "音だけか、実際に動きが止まる・抜ける・ロックする感じがあるかを確認する",
    weakness: "急に始まったか、物を持てない・立てないなど実際の機能低下があるかを最優先で確認し、それまでは運動を提案しない",
    numbness: "しびれる範囲、持続時間、悪化、感覚低下や力の入りにくさを最優先で確認し、それまでは運動を提案しない",
    better_move: "何分または何回ほど動くと楽になるか、その後に悪化しないかを確認する",
    better_rest: "どの姿勢で何分ほど休むと楽になるか、安静時や夜間にも続かないかを確認する",
    no_change: "動作や休息で変わらない場合は、発症時期、持続時間、生活への影響を優先して確認する"
  };

  const aiTimingGuidance = {
    start: "動き始めの数回だけか、動き続けても残るかを確認する",
    middle: "どのくらいの時間・回数で気になり始め、続けると増えるかを確認する",
    end: "可動域の最後だけか、力を入れ続けた終盤かを確認する",
    after: "動作直後か数時間後か、どのくらい続くかを確認する",
    rest: "安静時の姿勢、夜間や睡眠への影響、動くと変化するかを確認する",
    continuous: "いつから続き、強さの波、睡眠や日常生活への影響があるかを確認する",
    unclear: "一日の中で起きやすい場面を1つ探し、短い記録から傾向を整理する"
  };

  const aiSpreadGuidance = {
    local: "選択した場所の中で一点か広い範囲かを確認する",
    near: "どの隣接部位まで、同時にまたは順番に広がるかを確認する",
    limb: "腕や脚のどこまで広がるか、しびれ・感覚低下・力の入りにくさを伴うかを最優先で確認する"
  };

  const aiSideGuidance = {
    right: "右だけに出るか、反対側でも同じ動きをすると違いがあるかを確認する",
    left: "左だけに出るか、反対側でも同じ動きをすると違いがあるかを確認する",
    both: "左右が同時か交互か、強い側があるかを確認する",
    center: "中央の一点か左右へ広がるかを確認する"
  };

  const muscleRules = [
    { name: "胸鎖乳突筋", primary: ["neck"], related: ["head", "shoulder"], motions: ["look_up", "turn_right", "turn_left", "look_back"], stretch: ["look_up", "turn_right", "turn_left"], symptoms: ["heavy", "tight"], bonus: ["phone_long", "desk_work"] },
    { name: "頸部深層屈筋群", primary: ["neck"], related: [], motions: ["look_down"], contraction: ["look_down"], symptoms: ["heavy", "tight", "limited"], bonus: ["phone_long", "desk_work"] },
    { name: "斜角筋", primary: ["neck"], related: ["shoulder"], motions: ["look_down", "turn_right", "turn_left"], symptoms: ["tight", "numbness", "heavy"], bonus: ["phone_long", "desk_work"] },
    { name: "後頭下筋群", primary: ["neck"], related: ["head"], motions: ["look_up", "turn_right", "turn_left"], stretch: ["look_down"], symptoms: ["heavy", "tight"], bonus: ["morning", "phone_long", "desk_work"] },
    { name: "頭板状筋・頸板状筋", primary: ["neck"], related: ["back", "shoulder"], motions: ["look_up", "turn_right", "turn_left", "look_back"], contraction: ["look_up", "turn_right", "turn_left"], symptoms: ["heavy", "tight", "limited"], bonus: ["morning", "phone_long", "desk_work"], expanded: true },
    { name: "僧帽筋上部", primary: ["neck", "shoulder", "back"], related: [], motions: ["look_up", "carry_heavy"], contraction: ["side_raise"], symptoms: ["heavy", "tight"], bonus: ["desk_work", "phone_long", "long_sitting"] },
    { name: "肩甲挙筋", primary: ["neck"], related: ["shoulder", "back"], motions: ["look_up", "turn_right", "turn_left", "carry_heavy"], stretch: ["look_down"], symptoms: ["heavy", "tight"], bonus: ["desk_work", "phone_long", "long_sitting", "morning"] },
    { name: "三角筋", primary: ["shoulder"], related: ["upper_arm"], motions: ["front_raise", "side_raise", "change_clothes", "carry_heavy"], contraction: ["front_raise", "side_raise"], symptoms: ["sharp", "limited", "weakness"] },
    { name: "棘上筋", primary: ["shoulder"], related: [], motions: ["side_raise", "change_clothes", "tie_hair"], contraction: ["side_raise"], symptoms: ["sharp", "limited", "catching"], bonus: ["side_sleep", "night_sleep"] },
    { name: "肩甲下筋", primary: ["shoulder"], related: [], motions: ["hand_back", "change_clothes", "carry_heavy"], contraction: ["hand_back"], symptoms: ["limited", "catching", "sharp"] },
    { name: "棘下筋・小円筋", primary: ["shoulder"], related: ["back"], motions: ["hand_back", "change_clothes", "tie_hair"], symptoms: ["sharp", "limited", "catching"], bonus: ["side_sleep", "night_sleep"], expanded: true },
    { name: "大胸筋", primary: ["shoulder"], related: ["chest"], motions: ["front_raise", "change_clothes", "carry_heavy", "hand_back"], contraction: ["front_raise", "carry_heavy"], stretch: ["hand_back"], symptoms: ["tight", "heavy", "limited"], expanded: true },
    { name: "上腕二頭筋", primary: ["elbow"], related: ["shoulder"], motions: ["elbow_bend", "elbow_lift", "elbow_palm_up", "elbow_grip"], contraction: ["elbow_bend", "elbow_palm_up"], symptoms: ["sharp", "heavy", "weakness"] },
    { name: "上腕筋", primary: ["elbow"], related: [], motions: ["elbow_bend", "elbow_lift"], contraction: ["elbow_bend"], symptoms: ["sharp", "heavy", "limited"] },
    { name: "腕橈骨筋", primary: ["elbow"], related: ["wrist"], motions: ["elbow_bend", "elbow_lift", "elbow_grip", "elbow_repeat"], contraction: ["elbow_bend"], symptoms: ["sharp", "heavy", "tight"] },
    { name: "上腕三頭筋", primary: ["elbow"], related: ["shoulder"], motions: ["elbow_extend", "elbow_push"], contraction: ["elbow_extend", "elbow_push"], symptoms: ["sharp", "weakness", "limited"] },
    { name: "肘筋", primary: ["elbow"], related: [], motions: ["elbow_extend", "elbow_push", "elbow_repeat"], contraction: ["elbow_extend"], symptoms: ["sharp", "tight", "limited"] },
    { name: "前腕屈筋・回内筋群", primary: ["elbow"], related: ["wrist"], motions: ["elbow_grip", "elbow_palm_down", "elbow_repeat"], contraction: ["elbow_grip", "elbow_palm_down"], symptoms: ["sharp", "tight", "heavy"] },
    { name: "前腕伸筋・回外筋群", primary: ["elbow"], related: ["wrist"], motions: ["elbow_grip", "elbow_palm_up", "elbow_repeat"], contraction: ["elbow_grip", "elbow_palm_up"], symptoms: ["sharp", "tight", "heavy"] },
    { name: "手首の屈筋群", primary: ["wrist"], related: ["elbow"], motions: ["wrist_bend_palm", "wrist_grip", "wrist_twist", "wrist_type"], contraction: ["wrist_bend_palm", "wrist_grip"], symptoms: ["sharp", "tight", "limited"] },
    { name: "手首の伸筋群", primary: ["wrist"], related: ["elbow"], motions: ["wrist_bend_back", "wrist_thumb_side", "wrist_type", "wrist_support"], contraction: ["wrist_bend_back", "wrist_support"], symptoms: ["sharp", "tight", "limited"] },
    { name: "指の屈筋群", primary: ["wrist"], related: ["hand"], motions: ["wrist_grip", "wrist_twist", "wrist_type"], contraction: ["wrist_grip"], symptoms: ["sharp", "tight", "weakness"] },
    { name: "指の伸筋群", primary: ["wrist"], related: ["hand"], motions: ["wrist_bend_back", "wrist_type", "wrist_support"], contraction: ["wrist_bend_back"], symptoms: ["sharp", "tight", "limited"] },
    { name: "親指を開く・伸ばす筋群", primary: ["wrist"], related: ["hand"], motions: ["wrist_thumb_side", "wrist_grip", "wrist_twist", "wrist_type"], contraction: ["wrist_thumb_side"], symptoms: ["sharp", "tight", "limited"] },
    { name: "尺側手根屈筋", primary: ["wrist"], related: ["elbow"], motions: ["wrist_bend_palm", "wrist_little_side", "wrist_grip"], contraction: ["wrist_bend_palm", "wrist_little_side"], symptoms: ["sharp", "tight", "limited"] },
    { name: "尺側手根伸筋", primary: ["wrist"], related: ["elbow"], motions: ["wrist_bend_back", "wrist_little_side", "wrist_support"], contraction: ["wrist_bend_back", "wrist_little_side"], symptoms: ["sharp", "tight", "limited"] },
    { name: "僧帽筋中部", primary: ["back"], related: ["shoulder"], motions: [], symptoms: ["heavy", "tight"], bonus: ["desk_work", "long_sitting"] },
    { name: "僧帽筋下部", primary: ["back"], related: ["shoulder"], motions: [], symptoms: ["heavy", "tight", "limited"], bonus: ["long_sitting"] },
    { name: "広背筋", primary: ["back"], related: ["shoulder", "lowback"], motions: [], symptoms: ["tight", "limited", "heavy"], locationOnly: true },
    { name: "肋間筋群", primary: ["back"], related: ["chest"], motions: ["deep_breath", "twist_body", "side_bend"], symptoms: ["sharp", "tight"], expanded: true },
    { name: "脊柱起立筋", primary: ["back", "lowback"], related: ["buttock"], motions: ["bend_forward", "extend_back", "stand_up", "long_sitting", "long_standing", "turn_over"], stretch: ["bend_forward"], symptoms: ["heavy", "tight"], bonus: ["morning", "sit_down"] },
    { name: "多裂筋", primary: ["lowback", "back"], related: ["buttock"], motions: ["extend_back", "twist_body", "turn_over", "stand_up"], contraction: ["extend_back", "twist_body"], symptoms: ["sharp", "catching", "limited"] },
    { name: "腰方形筋", primary: ["lowback"], related: ["back", "hip"], motions: ["side_bend", "long_sitting", "walking", "turn_over"], contraction: ["side_bend"], symptoms: ["heavy", "tight", "sharp"] },
    { name: "腹斜筋群", primary: ["lowback"], related: ["back", "hip"], motions: ["bend_forward", "twist_body", "side_bend", "turn_over"], contraction: ["twist_body", "side_bend"], symptoms: ["tight", "sharp", "limited"], expanded: true },
    { name: "腸腰筋", primary: ["hip"], related: ["lowback", "thigh"], motions: ["walking", "stairs_up", "wear_socks", "car_inout", "cross_leg_sit"], contraction: ["walking", "stairs_up"], symptoms: ["tight", "limited", "catching"] },
    { name: "大臀筋", primary: ["buttock", "hip"], related: ["thigh", "lowback"], motions: ["stand_up", "stairs_up", "squat", "walking"], contraction: ["stand_up", "stairs_up"], stretch: ["wear_socks"], symptoms: ["heavy", "weakness"], bonus: ["sit_down", "long_sitting"] },
    { name: "中臀筋", primary: ["buttock", "hip"], related: ["lowback", "knee"], motions: ["single_leg", "walking", "stairs_up", "stairs_down", "open_leg"], contraction: ["single_leg", "walking", "open_leg"], symptoms: ["heavy", "sharp", "weakness"], bonus: ["side_sleep"] },
    { name: "小臀筋", primary: ["buttock", "hip"], related: ["lowback", "knee"], motions: ["single_leg", "walking", "stairs_up", "stairs_down", "open_leg"], contraction: ["single_leg", "walking", "open_leg"], symptoms: ["heavy", "sharp", "weakness"], bonus: ["side_sleep"], expanded: true },
    { name: "梨状筋", primary: ["buttock", "hip"], related: ["thigh", "lowback"], motions: ["long_sitting", "cross_leg", "cross_leg_sit", "walking"], stretch: ["cross_leg", "cross_leg_sit"], symptoms: ["heavy", "numbness", "tight"] },
    { name: "内転筋", primary: ["hip", "thigh"], related: ["knee"], motions: ["walking", "running", "stairs_up", "stairs_down", "open_leg", "squat", "cross_leg_sit"], stretch: ["open_leg"], symptoms: ["tight", "sharp", "limited"] },
    { name: "大腿筋膜張筋", primary: ["hip", "thigh"], related: ["buttock", "knee"], motions: ["walking", "single_leg", "stairs_up", "stairs_down", "open_leg", "long_sitting"], contraction: ["walking", "single_leg", "open_leg"], symptoms: ["tight", "heavy", "limited"], expanded: true },
    { name: "縫工筋", primary: ["hip", "thigh"], related: ["knee"], motions: ["walking", "stairs_up", "wear_socks", "car_inout", "cross_leg_sit", "open_leg", "bend_knee"], contraction: ["wear_socks", "car_inout", "cross_leg_sit", "open_leg"], symptoms: ["tight", "sharp", "limited"], expanded: true },
    { name: "大腿四頭筋", primary: ["thigh", "knee"], related: ["hip"], motions: ["stairs_up", "stairs_down", "squat", "stand_up", "extend_knee", "seiza"], contraction: ["stairs_up", "stand_up", "extend_knee"], stretch: ["bend_knee", "seiza"], symptoms: ["heavy", "weakness", "sharp"] },
    { name: "ハムストリングス", primary: ["buttock", "thigh", "knee"], related: ["lowback"], motions: ["bend_forward", "walking", "running", "stairs_down", "extend_knee", "bend_knee", "long_sitting"], contraction: ["bend_knee"], stretch: ["bend_forward", "extend_knee"], symptoms: ["tight", "sharp"] },
    { name: "膝窩筋", primary: ["knee"], related: ["lowerleg"], motions: ["walking", "stairs_down", "squat", "extend_knee", "bend_knee"], contraction: ["bend_knee"], symptoms: ["catching", "sharp", "limited"], expanded: true },
    { name: "腓腹筋", primary: ["knee", "lowerleg", "ankle"], related: ["sole"], motions: ["walking", "running", "start_walk", "long_walk", "stairs_up", "stairs", "toe_stand", "long_standing", "after_exercise"], contraction: ["toe_stand", "stairs_up", "stairs"], stretch: ["squat"], symptoms: ["tight", "heavy", "sharp"], bonus: ["first_step", "sleeping"] },
    { name: "ヒラメ筋", primary: ["lowerleg", "ankle"], related: ["sole"], motions: ["walking", "start_walk", "long_walk", "stairs_up", "stairs", "toe_stand", "long_standing", "after_exercise"], contraction: ["toe_stand", "long_standing"], symptoms: ["tight", "heavy", "sharp"], bonus: ["first_step", "sleeping"], expanded: true },
    { name: "腓骨筋群", primary: ["lowerleg", "ankle"], related: ["sole"], motions: ["walking", "running", "single_leg", "long_walk", "stairs_up", "stairs", "toe_stand", "long_standing", "after_exercise", "wear_shoes"], contraction: ["single_leg", "long_walk"], symptoms: ["tight", "heavy", "limited"], expanded: true },
    { name: "前脛骨筋", primary: ["lowerleg", "ankle"], related: ["sole"], motions: ["walking", "running", "raise_toes", "start_walk", "long_walk", "stairs", "wear_shoes"], contraction: ["raise_toes", "start_walk"], symptoms: ["tight", "heavy", "limited"] },
    { name: "長趾伸筋", primary: ["lowerleg", "ankle"], related: ["sole"], motions: ["walking", "running", "raise_toes", "start_walk", "long_walk", "stairs"], contraction: ["raise_toes"], symptoms: ["tight", "heavy", "limited"] },
    { name: "長母趾伸筋", primary: ["lowerleg", "ankle"], related: ["sole"], motions: ["walking", "running", "raise_toes", "start_walk", "long_walk"], contraction: ["raise_toes"], symptoms: ["tight", "sharp", "limited"], expanded: true },
    { name: "後脛骨筋", primary: ["lowerleg", "ankle"], related: ["sole"], motions: ["walking", "single_leg", "long_walk", "stairs", "toe_stand", "long_standing"], contraction: ["single_leg", "toe_stand"], symptoms: ["heavy", "sharp", "limited"] },
    { name: "長趾屈筋・長母趾屈筋", primary: ["lowerleg", "ankle"], related: ["sole"], motions: ["walking", "running", "single_leg", "long_walk", "stairs", "toe_stand"], contraction: ["toe_stand", "single_leg"], symptoms: ["tight", "heavy", "sharp"], expanded: true },
    { name: "短趾屈筋", primary: ["sole"], related: ["ankle"], motions: ["first_step", "start_walk", "long_walk", "running", "stairs", "toe_stand", "single_leg", "wear_shoes"], contraction: ["toe_stand"], symptoms: ["sharp", "tight", "heavy"] },
    { name: "母趾外転筋", primary: ["sole"], related: ["ankle"], motions: ["first_step", "start_walk", "long_walk", "running", "stairs", "toe_stand", "single_leg", "wear_shoes"], contraction: ["toe_stand", "single_leg"], symptoms: ["sharp", "tight", "heavy"] },
    { name: "小趾外転筋", primary: ["sole"], related: ["ankle"], motions: ["first_step", "start_walk", "long_walk", "running", "stairs", "toe_stand", "single_leg", "wear_shoes"], contraction: ["toe_stand", "single_leg"], symptoms: ["sharp", "tight", "heavy"] },
    { name: "短母趾屈筋", primary: ["sole"], related: ["ankle"], motions: ["start_walk", "long_walk", "running", "stairs", "toe_stand", "single_leg"], contraction: ["toe_stand"], symptoms: ["sharp", "tight", "heavy"] },
    { name: "足底方形筋", primary: ["sole"], related: ["ankle"], motions: ["start_walk", "long_walk", "running", "stairs", "toe_stand"], contraction: ["toe_stand"], symptoms: ["sharp", "tight", "heavy"], expanded: true },
    { name: "短小趾屈筋", primary: ["sole"], related: ["ankle"], motions: ["start_walk", "long_walk", "running", "stairs", "toe_stand", "single_leg", "wear_shoes"], contraction: ["toe_stand"], symptoms: ["sharp", "tight", "heavy"], expanded: true },
    { name: "母趾内転筋", primary: ["sole"], related: ["ankle"], motions: ["start_walk", "long_walk", "running", "stairs", "toe_stand", "single_leg", "wear_shoes"], contraction: ["toe_stand"], symptoms: ["sharp", "tight", "heavy"], expanded: true },
    { name: "虫様筋・骨間筋群", primary: ["sole"], related: ["ankle"], motions: ["start_walk", "long_walk", "running", "stairs", "toe_stand", "single_leg", "wear_shoes"], contraction: ["toe_stand", "single_leg"], symptoms: ["sharp", "tight", "limited"], expanded: true }
  ];

  // Representative display positions for the existing front/back body assets.
  // These are orientation cues, not a map of injury or a medical diagnosis.
  const regionVisuals = {
    neck: { view: "front", x: [50], y: 14.8, width: 12, height: 8 },
    shoulder: { view: "front", x: [36.8, 63.2], y: 19.3, width: 12, height: 9 },
    elbow: { view: "front", x: [31.5, 68.5], y: 34, width: 9, height: 9 },
    wrist: { view: "front", x: [28.5, 71.5], y: 42.5, width: 8, height: 8 },
    back: { view: "back", x: [50], y: 32, width: 27, height: 22 },
    lowback: { view: "back", x: [50], y: 36.5, width: 22, height: 13 },
    hip: { view: "front", x: [40.5, 59.5], y: 47.5, width: 12, height: 12 },
    buttock: { view: "back", x: [42, 58], y: 47, width: 17, height: 13 },
    thigh: { view: "front", x: [42.5, 57.5], y: 56, width: 12, height: 20 },
    knee: { view: "front", x: [42.4, 57.6], y: 64.8, width: 11, height: 9 },
    lowerleg: { view: "front", x: [42.5, 57.5], y: 78, width: 11, height: 20 },
    ankle: { view: "front", x: [42.5, 57.5], y: 89, width: 10, height: 9 },
    sole: { view: "front", x: [42, 58], y: 94, width: 12, height: 8 }
  };

  const muscleVisuals = {
    "胸鎖乳突筋": { view: "front", x: [47, 53], y: 15.2, width: 7, height: 10, depth: "表層" },
    "頸部深層屈筋群": { view: "front", x: [48, 52], y: 16.4, width: 6, height: 9, depth: "深層" },
    "斜角筋": { view: "front", x: [47.5, 52.5], y: 16.2, width: 6, height: 9, depth: "深層" },
    "後頭下筋群": { view: "back", x: [47, 53], y: 13.7, width: 8, height: 6, depth: "深層" },
    "頭板状筋・頸板状筋": { view: "back", x: [46, 54], y: 17.5, width: 9, height: 13, depth: "表層〜中間層" },
    "僧帽筋上部": { view: "back", x: [50], y: 19.5, width: 29, height: 12, depth: "表層" },
    "肩甲挙筋": { view: "back", x: [43, 57], y: 21.5, width: 8, height: 13, depth: "深層" },
    "三角筋": { view: "front", x: [36.8, 63.2], y: 20.5, width: 11, height: 12, depth: "表層" },
    "棘上筋": { view: "back", x: [41.5, 58.5], y: 22.7, width: 12, height: 7, depth: "深層" },
    "肩甲下筋": { view: "front", x: [40, 60], y: 24, width: 11, height: 13, depth: "深層" },
    "棘下筋・小円筋": { view: "back", x: [40.5, 59.5], y: 25, width: 13, height: 10, depth: "深層" },
    "大胸筋": { view: "front", x: [43, 57], y: 25.5, width: 17, height: 15, depth: "表層" },
    "上腕二頭筋": { view: "front", x: [34.5, 65.5], y: 28.5, width: 8, height: 14, depth: "表層" },
    "上腕筋": { view: "front", x: [34, 66], y: 32, width: 7, height: 11, depth: "深層" },
    "腕橈骨筋": { view: "front", x: [31.5, 68.5], y: 36.5, width: 7, height: 17, depth: "表層" },
    "上腕三頭筋": { view: "back", x: [35, 65], y: 29, width: 9, height: 15, depth: "表層" },
    "肘筋": { view: "back", x: [31.5, 68.5], y: 35, width: 6, height: 7, depth: "深層" },
    "前腕屈筋・回内筋群": { view: "front", x: [30.5, 69.5], y: 38.5, width: 8, height: 17, depth: "表層" },
    "前腕伸筋・回外筋群": { view: "back", x: [30.5, 69.5], y: 38.5, width: 8, height: 17, depth: "表層" },
    "手首の屈筋群": { view: "front", x: [29.5, 70.5], y: 39, width: 8, height: 18, depth: "前腕前面" },
    "手首の伸筋群": { view: "back", x: [29.5, 70.5], y: 39, width: 8, height: 18, depth: "前腕後面" },
    "指の屈筋群": { view: "front", x: [30.5, 69.5], y: 39.5, width: 8, height: 18, depth: "前腕前面" },
    "指の伸筋群": { view: "back", x: [30.5, 69.5], y: 39.5, width: 8, height: 18, depth: "前腕後面" },
    "親指を開く・伸ばす筋群": { view: "back", x: [28.5, 71.5], y: 41, width: 7, height: 15, depth: "前腕外側" },
    "尺側手根屈筋": { view: "front", x: [31.5, 68.5], y: 39.5, width: 6, height: 18, depth: "前腕内側" },
    "尺側手根伸筋": { view: "back", x: [31.5, 68.5], y: 39.5, width: 6, height: 18, depth: "前腕内側" },
    "僧帽筋中部": { view: "back", x: [50], y: 25.5, width: 27, height: 12, depth: "表層" },
    "僧帽筋下部": { view: "back", x: [50], y: 31, width: 21, height: 18, depth: "表層" },
    "広背筋": { view: "back", x: [50], y: 33, width: 29, height: 22, depth: "表層" },
    "肋間筋群": { view: "back", x: [39.5, 60.5], y: 31, width: 9, height: 19, depth: "深層" },
    "脊柱起立筋": { view: "back", x: [46, 54], y: 34.5, width: 8, height: 31, depth: "表層" },
    "多裂筋": { view: "back", x: [48, 52], y: 36.5, width: 6, height: 24, depth: "深層" },
    "腰方形筋": { view: "back", x: [43.5, 56.5], y: 37.5, width: 9, height: 14, depth: "深層" },
    "腹斜筋群": { view: "front", x: [38.5, 61.5], y: 36, width: 10, height: 20, depth: "表層〜中間層" },
    "腸腰筋": { view: "front", x: [44, 56], y: 42.5, width: 8, height: 15, depth: "深層" },
    "大臀筋": { view: "back", x: [42.5, 57.5], y: 47, width: 18, height: 14, depth: "表層" },
    "中臀筋": { view: "back", x: [39.5, 60.5], y: 42.5, width: 11, height: 10, depth: "表層" },
    "小臀筋": { view: "back", x: [40, 60], y: 43.5, width: 10, height: 10, depth: "深層" },
    "梨状筋": { view: "back", x: [44, 56], y: 47, width: 9, height: 8, depth: "深層" },
    "内転筋": { view: "front", x: [46, 54], y: 55.5, width: 10, height: 21, depth: "表層" },
    "大腿筋膜張筋": { view: "front", x: [38.5, 61.5], y: 49, width: 8, height: 16, depth: "表層" },
    "縫工筋": { view: "front", x: [43, 57], y: 56, width: 7, height: 23, depth: "表層" },
    "大腿四頭筋": { view: "front", x: [42.5, 57.5], y: 56.5, width: 13, height: 22, depth: "表層" },
    "ハムストリングス": { view: "back", x: [42.5, 57.5], y: 58, width: 13, height: 22, depth: "表層" },
    "膝窩筋": { view: "back", x: [42.5, 57.5], y: 66.5, width: 10, height: 8, depth: "深層" },
    "腓腹筋": { view: "back", x: [42.5, 57.5], y: 77, width: 12, height: 17, depth: "表層" },
    "ヒラメ筋": { view: "back", x: [42.5, 57.5], y: 80, width: 11, height: 18, depth: "深層" },
    "腓骨筋群": { view: "front", x: [39.5, 60.5], y: 80, width: 7, height: 20, depth: "外側" },
    "前脛骨筋": { view: "front", x: [42.5, 57.5], y: 79, width: 8, height: 22, depth: "表層" },
    "後脛骨筋": { view: "back", x: [44, 56], y: 80, width: 7, height: 21, depth: "深層" },
    "長趾伸筋": { view: "front", x: [40.5, 59.5], y: 79.5, width: 7, height: 21, depth: "表層" },
    "長母趾伸筋": { view: "front", x: [44, 56], y: 80, width: 6, height: 20, depth: "深層" },
    "長趾屈筋・長母趾屈筋": { view: "back", x: [44, 56], y: 80.5, width: 7, height: 21, depth: "深層" },
    "短趾屈筋": { view: "front", x: [42, 58], y: 94, width: 10, height: 9, depth: "足底" },
    "母趾外転筋": { view: "front", x: [43, 57], y: 94, width: 7, height: 10, depth: "足底内側" },
    "小趾外転筋": { view: "front", x: [40.8, 59.2], y: 94, width: 7, height: 10, depth: "足底外側" },
    "短母趾屈筋": { view: "front", x: [43, 57], y: 95, width: 6, height: 7, depth: "足底内側" },
    "足底方形筋": { view: "front", x: [42, 58], y: 94, width: 8, height: 7, depth: "足底深層" },
    "短小趾屈筋": { view: "front", x: [40.8, 59.2], y: 95, width: 6, height: 7, depth: "足底外側" },
    "母趾内転筋": { view: "front", x: [43, 57], y: 95, width: 8, height: 6, depth: "足底深層" },
    "虫様筋・骨間筋群": { view: "front", x: [42, 58], y: 95.5, width: 10, height: 6, depth: "足底深層" }
  };

  function createBodyCheck(deps) {
    const { $, $$, STORAGE_KEY, copyText } = deps;
    const Platform = window.HealthCheckBodyPlatform;
    const PrecisionPersistence = window.HealthCheckPrecisionPersistence;
    const Sponsor = window.HealthCheckSponsor;
    const MuscleImages = window.HealthCheckMuscleImages;
    const NeckPrecisionV1 = window.HealthCheckNeckPrecision;
    const NeckPrecisionV2 = window.HealthCheckNeckPrecisionV2;
    const NeckPrecisionV21 = window.HealthCheckNeckPrecisionV21;
    const NeckPrecisionV22 = window.HealthCheckNeckPrecisionV22;
    const ShoulderPrecisionV1 = window.HealthCheckShoulderPrecision;
    const ShoulderPrecisionV11 = window.HealthCheckShoulderPrecisionV11;
    const ShoulderPrecisionV12 = window.HealthCheckShoulderPrecisionV12;
    const LowbackPrecisionV1 = window.HealthCheckLowbackPrecisionV1;
    const HipPrecisionV1 = window.HealthCheckHipPrecisionV1;
    const KneePrecisionV1 = window.HealthCheckKneePrecisionV1;
    const ButtockPrecisionV1 = window.HealthCheckButtockPrecisionV1;
    const ThighPrecisionV1 = window.HealthCheckThighPrecisionV1;
    const LowerlegPrecisionV1 = window.HealthCheckLowerlegPrecisionV1;
    const AnklePrecisionV1 = window.HealthCheckAnklePrecisionV1;
    const resultImagePreloads = new WeakMap();
    const aiHandoffContexts = new WeakMap();
    const muscleImageLoader = MuscleImages?.createLoader({
      runtime: window,
      onMetric: isLocalPreview() ? (metric) => {
        window.__HCL_MUSCLE_IMAGE_METRICS__ = window.__HCL_MUSCLE_IMAGE_METRICS__ || [];
        window.__HCL_MUSCLE_IMAGE_METRICS__.push(metric);
      } : null
    });
    let state = {};
    let lastTrackedStep = "";
    let resultTransitionPending = false;
    let muscleSelectionRequest = 0;

    function neckPrecisionMode() {
      const requested = new URLSearchParams(window.location.search).get("neck_logic");
      if (isLocalPreview()) {
        if (requested === "legacy") return "";
        if (requested === "precision-v2.2" && NeckPrecisionV22) return "precision-v2.2";
        if (requested === "precision-v2.1" && NeckPrecisionV21) return "precision-v2.1";
        if (requested === "precision-v2" && NeckPrecisionV2) return "precision-v2";
        if (requested === "precision-v1" && NeckPrecisionV1) return "precision-v1";
      }
      return NeckPrecisionV22 ? "precision-v2.2" : "";
    }

    function activeNeckPrecision() {
      if (neckPrecisionMode() === "precision-v2.2") return NeckPrecisionV22;
      if (neckPrecisionMode() === "precision-v2.1") return NeckPrecisionV21;
      return neckPrecisionMode() === "precision-v2" ? NeckPrecisionV2 : NeckPrecisionV1;
    }

    function usesNeckPrecisionPreview() {
      return Boolean(neckPrecisionMode());
    }

    function usesNeckPrecisionFlow() {
      return state.primaryPart === "neck" && usesNeckPrecisionPreview();
    }

    function shoulderPrecisionMode() {
      const requested = new URLSearchParams(window.location.search).get("shoulder_logic");
      if (isLocalPreview()) {
        if (requested === "legacy") return "";
        if (requested === "precision-v1.1" && ShoulderPrecisionV11) return "precision-v1.1";
        if (requested === "precision-v1" && ShoulderPrecisionV1) return "precision-v1";
      }
      return ShoulderPrecisionV12 ? "precision-v1.2" : "";
    }

    function activeShoulderPrecision() {
      if (shoulderPrecisionMode() === "precision-v1.2") return ShoulderPrecisionV12;
      return shoulderPrecisionMode() === "precision-v1.1" ? ShoulderPrecisionV11 : ShoulderPrecisionV1;
    }

    function usesShoulderPrecisionFlow() {
      return state.primaryPart === "shoulder" && Boolean(shoulderPrecisionMode());
    }

    function usesLowbackPrecisionFlow() {
      if (state.primaryPart !== "lowback" || !LowbackPrecisionV1) return false;
      return !isLocalPreview()
        || new URLSearchParams(window.location.search).get("lowback_logic") === "precision-v1";
    }

    function usesHipPrecisionFlow() {
      if (state.primaryPart !== "hip" || !HipPrecisionV1) return false;
      return !isLocalPreview()
        || new URLSearchParams(window.location.search).get("hip_logic") === "precision-v1";
    }

    function usesKneePrecisionFlow() {
      if (state.primaryPart !== "knee" || !KneePrecisionV1) return false;
      return !isLocalPreview()
        || new URLSearchParams(window.location.search).get("knee_logic") === "precision-v1";
    }

    function usesButtockPrecisionFlow() {
      if (state.primaryPart !== "buttock" || !ButtockPrecisionV1) return false;
      return !isLocalPreview()
        || new URLSearchParams(window.location.search).get("buttock_logic") === "precision-v1";
    }

    function usesThighPrecisionFlow() {
      if (state.primaryPart !== "thigh" || !ThighPrecisionV1) return false;
      return !isLocalPreview()
        || new URLSearchParams(window.location.search).get("thigh_logic") === "precision-v1";
    }

    function usesLowerlegPrecisionFlow() {
      if (state.primaryPart !== "lowerleg" || !LowerlegPrecisionV1) return false;
      return !isLocalPreview()
        || new URLSearchParams(window.location.search).get("lowerleg_logic") !== "legacy";
    }

    function usesAnklePrecisionFlow() {
      if (state.primaryPart !== "ankle" || !AnklePrecisionV1) return false;
      return !isLocalPreview()
        || new URLSearchParams(window.location.search).get("ankle_logic") === "precision-v1";
    }

    function usesPrecisionFlow() {
      return usesNeckPrecisionFlow() || usesShoulderPrecisionFlow()
        || usesLowbackPrecisionFlow() || usesHipPrecisionFlow() || usesKneePrecisionFlow()
        || usesButtockPrecisionFlow() || usesThighPrecisionFlow() || usesLowerlegPrecisionFlow()
        || usesAnklePrecisionFlow();
    }

    function landingSelection() {
      const params = new URLSearchParams(window.location.search);
      const normalizePartId = (id) => legacyPartAliases[id] || id;
      const requestedPart = normalizePartId(params.get("part") || "");
      const requestedParts = String(params.get("parts") || "").split(",").map(normalizePartId);
      const selectedParts = [...new Set([requestedPart, ...requestedParts].filter((id) => parts[id]))].slice(0, MAX_SELECTION);
      return {
        primaryPart: parts[requestedPart] ? requestedPart : selectedParts[0] || "",
        selectedParts
      };
    }

    function reset(options = {}) {
      const landing = options.useLandingPart ? landingSelection() : { primaryPart: "", selectedParts: [] };
      state = {
        stepIndex: 0,
        entryPart: landing.primaryPart,
        showAllParts: !landing.selectedParts.length,
        selectedParts: landing.selectedParts,
        primaryPart: landing.primaryPart,
        situations: [],
        symptoms: [],
        painLocation: "",
        timing: "",
        side: "",
        spread: "",
        adaptiveQuestion: null,
        adaptiveAnswer: "",
        latest: null,
        calculating: false,
        limitMessage: ""
      };
      lastTrackedStep = "";
      emit("diagnosis_started", { questionId: "part_select" });
    }

    function applyLocalResultPreview() {
      const params = new URLSearchParams(window.location.search);
      if (!isLocalPreview() || params.get("preview_result") !== "1" || !state.primaryPart) return false;
      const situation = situationOptionsForPart(state.primaryPart).find(([id]) => id !== UNCLEAR_SITUATION);
      const locationOption = painLocationOptionsForPart(state.primaryPart).find(([id]) => id !== UNCLEAR_LOCATION);
      if (!situation || !locationOption) return false;

      state.situations = [situation[0]];
      state.painLocation = locationOption[0];
      state.side = sideOptions[0][0];
      state.symptoms = usesPrecisionFlow() ? [] : ["heavy"];
      state.timing = usesPrecisionFlow() ? "" : timingOptions[0][0];
      state.spread = usesPrecisionFlow() ? "" : spreadOptions[0][0];
      calculate();
      state.stepIndex = currentSteps().length - 1;
      return true;
    }

    function emit(eventName, detail = {}) {
      document.dispatchEvent(new CustomEvent("hcl:diagnosis-event", { detail: { eventName, diagnosisVersion: VERSION, ...detail } }));
    }

    const label = (id) => parts[legacyPartAliases[id] || id]?.label || id;
    const optionLabel = (options, id) => options.find((item) => item[0] === id)?.[1] || id;
    const esc = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
    const currentSteps = () => {
      const steps = state.showAllParts || !state.selectedParts.length ? ["parts"] : [];
      if (state.selectedParts.length > 1) steps.push("primary");
      if (usesPrecisionFlow()) {
        steps.push("precision_location", "precision_side", "situations");
        if (state.adaptiveQuestion) steps.push("adaptive");
        steps.push("result");
        return steps;
      }
      steps.push("situations", "symptoms");
      if (needsSupplement()) steps.push("supplement");
      steps.push("result");
      return steps;
    };
    const progressSteps = () => {
      const steps = state.showAllParts || !state.selectedParts.length ? ["parts"] : [];
      if (state.selectedParts.length > 1) steps.push("primary");
      if (usesPrecisionFlow()) {
        steps.push("precision_location", "precision_side", "situations");
        if (state.adaptiveQuestion) steps.push("adaptive");
        steps.push("result");
        return steps;
      }
      steps.push("situations", "symptoms", "supplement", "result");
      return steps;
    };
    const currentStepId = () => currentSteps()[state.stepIndex] || (state.selectedParts.length ? "situations" : "parts");
    const questionNumber = () => state.stepIndex + 1;
    const totalQuestions = () => progressSteps().length;
    const hasNerveFlag = () => state.symptoms.includes("numbness") || state.symptoms.includes("weakness");
    const needsSupplement = () => Boolean(state.primaryPart && state.situations.length && state.symptoms.length);
    const situationOptionsForPart = (partId) => [
      ...(partId === "shoulder" && usesShoulderPrecisionFlow()
        ? activeShoulderPrecision().MOVEMENTS
        : partId === "lowback" && usesLowbackPrecisionFlow()
        ? LowbackPrecisionV1.MOVEMENTS
        : partId === "hip" && usesHipPrecisionFlow()
        ? HipPrecisionV1.MOVEMENTS
        : partId === "knee" && usesKneePrecisionFlow()
        ? KneePrecisionV1.MOVEMENTS
        : partId === "buttock" && usesButtockPrecisionFlow()
        ? ButtockPrecisionV1.MOVEMENTS
        : partId === "thigh" && usesThighPrecisionFlow()
        ? ThighPrecisionV1.MOVEMENTS
        : partId === "lowerleg" && usesLowerlegPrecisionFlow()
        ? LowerlegPrecisionV1.MOVEMENTS
        : partId === "ankle" && usesAnklePrecisionFlow()
        ? AnklePrecisionV1.MOVEMENTS
        : partId === "neck" && usesNeckPrecisionPreview()
        ? [...NECK_PRECISION_UI_SITUATION_IDS]
          .map((id) => activeNeckPrecision().SITUATION_OPTIONS.find(([optionId]) => optionId === id))
          .filter(Boolean)
        : situationByPart[partId] || []),
      ((partId === "neck" && usesNeckPrecisionFlow()) || (partId === "shoulder" && usesShoulderPrecisionFlow())
        || (partId === "lowback" && usesLowbackPrecisionFlow()) || (partId === "hip" && usesHipPrecisionFlow()))
        || (partId === "knee" && usesKneePrecisionFlow())
        || (partId === "buttock" && usesButtockPrecisionFlow())
        || (partId === "thigh" && usesThighPrecisionFlow())
        || (partId === "lowerleg" && usesLowerlegPrecisionFlow())
        || (partId === "ankle" && usesAnklePrecisionFlow())
        ? NECK_PRECISION_UNCLEAR_SITUATION_OPTION
        : UNCLEAR_SITUATION_OPTION
    ];
    const painLocationOptionsForPart = (partId) => [
      ...(partId === "shoulder" && usesShoulderPrecisionFlow()
        ? activeShoulderPrecision().LOCATIONS
        : partId === "lowback" && usesLowbackPrecisionFlow()
        ? LowbackPrecisionV1.LOCATIONS
        : partId === "hip" && usesHipPrecisionFlow()
        ? HipPrecisionV1.LOCATIONS
        : partId === "knee" && usesKneePrecisionFlow()
        ? KneePrecisionV1.LOCATIONS
        : partId === "buttock" && usesButtockPrecisionFlow()
        ? ButtockPrecisionV1.LOCATIONS
        : partId === "thigh" && usesThighPrecisionFlow()
        ? ThighPrecisionV1.LOCATIONS
        : partId === "lowerleg" && usesLowerlegPrecisionFlow()
        ? LowerlegPrecisionV1.LOCATIONS
        : partId === "ankle" && usesAnklePrecisionFlow()
        ? AnklePrecisionV1.LOCATIONS
        : partId === "neck" && usesNeckPrecisionPreview()
        ? activeNeckPrecision().LOCATION_OPTIONS
        : painLocationByPart[partId] || []),
      UNCLEAR_LOCATION_OPTION
    ];
    const selectedSituations = () => situationOptionsForPart(state.primaryPart);

    function precisionAnswers() {
      return {
        painLocation: state.painLocation,
        situations: state.situations,
        symptoms: state.symptoms,
        timing: state.timing,
        side: state.side,
        spread: state.spread
      };
    }

    function clearAdaptiveAnswer() {
      state.adaptiveQuestion = null;
      state.adaptiveAnswer = "";
    }

    function pendingAdaptiveQuestion() {
      if (neckPrecisionMode() !== "precision-v2.2" || !NeckPrecisionV22) return null;
      return NeckPrecisionV22.rank(precisionAnswers()).adaptive?.question || null;
    }

    function precisionCandidatesForState() {
      if (usesShoulderPrecisionFlow()) return activeShoulderPrecision().rank(precisionAnswers());
      if (!usesNeckPrecisionFlow()) return null;
      if (neckPrecisionMode() === "precision-v2.2" && state.adaptiveQuestion && state.adaptiveAnswer) {
        return NeckPrecisionV22.answerAdaptive(precisionAnswers(), state.adaptiveAnswer);
      }
      return activeNeckPrecision().rank(precisionAnswers());
    }

    function getPartMeta() {
      return partOrder.map((id) => {
        const parent = Object.entries(bodyPartGroups).find(([, group]) => group.detailParts.includes(id))?.[0] || "";
        return {
          id,
          label: label(id),
          parent,
          view: regionVisuals[id]?.view || "",
          questions: situationOptionsForPart(id).map(([questionId]) => questionId),
          painLocations: painLocationOptionsForPart(id).map(([locationId]) => locationId)
        };
      });
    }

    function selectableCard({ id, text, selected, disabled, name, multi = true, kindLabel = "選ぶ" }) {
      return `<button class="diagnosis-option ${selected ? "selected" : ""}" type="button" data-choice="${id}" data-name="${name}" data-multi="${multi}" aria-pressed="${selected}" ${disabled ? "disabled" : ""}>
        <span class="option-check" aria-hidden="true">${selected ? "✓" : ""}</span><span class="node-label">${selected ? "選択中" : esc(kindLabel)}</span><strong>${esc(text)}</strong>
      </button>`;
    }

    function hiddenAnalyticsInputs() {
      return `
        ${state.selectedParts.map((id) => `<input type="checkbox" name="selectedPart" value="${id}" checked hidden />`).join("")}
        ${state.primaryPart ? `<input type="radio" name="primaryPart" value="${state.primaryPart}" checked hidden />` : ""}
      `;
    }

    function renderProgress() {
      const total = totalQuestions();
      const pct = Math.round((questionNumber() / total) * 100);
      const step = currentStepId();
      const answerTotal = Math.max(total - 1, 1);
      return `<div class="diagnosis-progress">
        <div class="progress-meta">
          <span>${step === "result" ? "すべての質問に回答しました" : `質問 ${Math.min(questionNumber(), answerTotal)} / ${answerTotal}`}</span>
          <strong>${step === "result" ? "確認完了" : `${stepLabel(step)}を回答中`}</strong>
        </div>
        <div class="progress-track"><span style="width:${pct}%"></span></div>
        <div class="progress body-trace-steps" style="--step-count:${total}">${progressSteps().map((item, index) => `<span class="${index < state.stepIndex ? "complete" : ""} ${index === state.stepIndex ? "active" : ""}"><em>${index + 1}</em><strong>${stepLabel(item)}</strong></span>`).join("")}</div>
      </div>`;
    }

    function stepLabel(id) {
      if (usesLowbackPrecisionFlow() || usesHipPrecisionFlow() || usesKneePrecisionFlow() || usesButtockPrecisionFlow() || usesThighPrecisionFlow() || usesLowerlegPrecisionFlow() || usesAnklePrecisionFlow()) {
        return { parts: "部位", primary: "主な部位", precision_location: "詳しい場所", precision_side: "左右", situations: "動作", result: "結果" }[id] || id;
      }
      if (usesShoulderPrecisionFlow()) {
        return { parts: "部位", primary: "主な部位", precision_location: "詳しい場所", precision_side: "左右", situations: "動作", result: "結果" }[id] || id;
      }
      if (usesNeckPrecisionFlow()) {
        return { parts: "部位", primary: "主な部位", precision_location: "詳しい場所", precision_side: "左右", situations: "動作", adaptive: "追加確認", result: "結果" }[id] || id;
      }
      return { parts: "部位", primary: "主な部位", situations: "動き・場面", symptoms: "感じ方", supplement: "症状の特徴", result: "結果" }[id] || id;
    }

    function stepHeadline(id) {
      if (usesAnklePrecisionFlow()) {
        return {
          parts: "気になる場所を選んでください",
          primary: "今、最も気になる場所はどこですか？",
          precision_location: "足首の前・内側・外側・後ろのどこが気になりますか？",
          precision_side: "どちら側が気になりますか？",
          situations: "どの動きで気になりますか？"
        }[id] || "身体のサインをたどります";
      }
      if (usesLowerlegPrecisionFlow()) {
        return {
          parts: "気になる場所を選んでください",
          primary: "今、最も気になる場所はどこですか？",
          precision_location: "すね・ふくらはぎの前・後ろ・内側・外側のどこが気になりますか？",
          precision_side: "どちら側が気になりますか？",
          situations: "どの動きで気になりますか？"
        }[id] || "身体のサインをたどります";
      }
      if (usesThighPrecisionFlow()) {
        return {
          parts: "気になる場所を選んでください",
          primary: "今、最も気になる場所はどこですか？",
          precision_location: "太ももの前・後ろ・内側・外側のどこが気になりますか？",
          precision_side: "どちら側が気になりますか？",
          situations: "どの動きで気になりますか？"
        }[id] || "身体のサインをたどります";
      }
      if (usesButtockPrecisionFlow()) {
        return {
          parts: "気になる場所を選んでください",
          primary: "今、最も気になる場所はどこですか？",
          precision_location: "お尻の上・中央・下のどこが気になりますか？",
          precision_side: "どちら側が気になりますか？",
          situations: "どの動きで気になりますか？"
        }[id] || "身体のサインをたどります";
      }
      if (usesKneePrecisionFlow()) {
        return {
          parts: "気になる場所を選んでください",
          primary: "今、最も気になる場所はどこですか？",
          precision_location: "膝の前・内側・外側・後ろのどこが気になりますか？",
          precision_side: "どちら側が気になりますか？",
          situations: "どの動きで気になりますか？"
        }[id] || "身体のサインをたどります";
      }
      if (usesHipPrecisionFlow()) {
        return {
          parts: "気になる場所を選んでください",
          primary: "今、最も気になる場所はどこですか？",
          precision_location: "股関節の前・横・後ろ・内側のどこが気になりますか？",
          precision_side: "どちら側が気になりますか？",
          situations: "どの動きで気になりますか？"
        }[id] || "身体のサインをたどります";
      }
      if (usesLowbackPrecisionFlow()) {
        return {
          parts: "気になる場所を選んでください",
          primary: "今、最も気になる場所はどこですか？",
          precision_location: "腰の中央・横・骨盤の上のどこが気になりますか？",
          precision_side: "どちら側が気になりますか？",
          situations: "どの動きで気になりますか？"
        }[id] || "身体のサインをたどります";
      }
      if (usesShoulderPrecisionFlow()) {
        return {
          parts: "気になる場所を選んでください",
          primary: "今、最も気になる場所はどこですか？",
          precision_location: "肩の前・横・上・後ろのどこが気になりますか？",
          precision_side: "どちら側が気になりますか？",
          situations: "どの動きで気になりますか？"
        }[id] || "身体のサインをたどります";
      }
      if (usesNeckPrecisionFlow()) {
        return {
          parts: "気になる場所を選んでください",
          primary: "今、最も気になる場所はどこですか？",
          precision_location: "首の前・横・後ろのどこが気になりますか？",
          precision_side: "どちら側が気になりますか？",
          situations: "どの動きで気になりますか？",
          adaptive: state.adaptiveQuestion?.question || "もう1つだけ確認します"
        }[id] || "身体のサインをたどります";
      }
      return { parts: "気になる場所を選んでください", primary: "今、最も気になる場所はどこですか？", situations: "気になる動き・場面はどれですか？", symptoms: "感じ方や変化で、近いものはどれですか？", supplement: "症状について、あと4つ教えてください" }[id] || "身体のサインをたどります";
    }

    function stepLead(id) {
      if (usesAnklePrecisionFlow()) {
        return {
          parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
          primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
          precision_location: "最も近い場所を1つ選んでください。はっきりしなくても回答できます。",
          precision_side: "右・左・両側・中央から選んでください。左右だけで候補は決めません。",
          situations: "足首について、当てはまる動きを1〜3つ選んでください。痛む動きを無理に試す必要はありません。"
        }[id] || "";
      }
      if (usesLowerlegPrecisionFlow()) {
        return {
          parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
          primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
          precision_location: "最も近い場所を1つ選んでください。はっきりしなくても回答できます。",
          precision_side: "右・左・両側・中央から選んでください。左右だけで候補は決めません。",
          situations: "すね・ふくらはぎについて、当てはまる動きを1〜3つ選んでください。痛む動きを無理に試す必要はありません。"
        }[id] || "";
      }
      if (usesThighPrecisionFlow()) {
        return {
          parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
          primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
          precision_location: "最も近い場所を1つ選んでください。はっきりしなくても回答できます。",
          precision_side: "右・左・両側・中央から選んでください。左右だけで候補は決めません。",
          situations: "太ももについて、当てはまる動きを1〜3つ選んでください。痛む動きを無理に試す必要はありません。"
        }[id] || "";
      }
      if (usesButtockPrecisionFlow()) {
        return {
          parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
          primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
          precision_location: "最も近い場所を1つ選んでください。はっきりしなくても回答できます。",
          precision_side: "右・左・両側・中央から選んでください。左右だけで候補は決めません。",
          situations: "お尻について、当てはまる動きを1〜3つ選んでください。痛む動きを無理に試す必要はありません。"
        }[id] || "";
      }
      if (usesKneePrecisionFlow()) {
        return {
          parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
          primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
          precision_location: "最も近い場所を1つ選んでください。はっきりしなくても回答できます。",
          precision_side: "右・左・両側・中央から選んでください。左右だけで候補は決めません。",
          situations: "膝について、当てはまる動きを1〜3つ選んでください。痛む動きを無理に試す必要はありません。"
        }[id] || "";
      }
      if (usesHipPrecisionFlow()) {
        return {
          parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
          primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
          precision_location: "最も近い場所を1つ選んでください。はっきりしなくても回答できます。",
          precision_side: "右・左・両側・中央から選んでください。左右だけで候補は決めません。",
          situations: "股関節について、当てはまる動きを1〜3つ選んでください。"
        }[id] || "";
      }
      if (usesLowbackPrecisionFlow()) {
        return {
          parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
          primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
          precision_location: "最も近い場所を1つ選んでください。はっきりしなくても回答できます。",
          precision_side: "右・左・両側・中央から選んでください。左右だけで候補は決めません。",
          situations: "当てはまる動きを1〜3つ選んでください。ひねる方向は上半身を向ける側です。"
        }[id] || "";
      }
      if (usesShoulderPrecisionFlow()) {
        return {
          parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
          primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
          precision_location: "最も近い場所を1つ選んでください。はっきりしない場合も回答できます。",
          precision_side: "右・左・両側・中央から、最も近いものを1つ選んでください。",
          situations: "肩について、当てはまる動きを1〜3つ選んでください。"
        }[id] || "";
      }
      if (usesNeckPrecisionFlow()) {
        return {
          parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
          primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
          precision_location: "最も近い場所を1つ選んでください。はっきりしない場合も、そのまま回答できます。",
          precision_side: "右・左・両側・中央から、最も近いものを1つ選んでください。",
          situations: "首について、当てはまる動きを1〜3つ選んでください。",
          adaptive: "当てはまるかを選ぶと、その回答を加えて候補を整理します。"
        }[id] || "";
      }
      return {
        parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
        primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
        situations: `${label(state.primaryPart)}について、当てはまるものを1〜3つ選んでください。`,
        symptoms: "今の感じ方と、動いたり休んだりした後の変化から、当てはまるものを1〜3つ選んでください。",
        supplement: "気になる場所、タイミング、左右、広がりを順に確認します。場所やタイミングが曖昧な場合も、そのまま回答できます。"
      }[id] || "";
    }

    function stepHeader(id) {
      return `<div class="diagnosis-step-head">
        <p class="diagnosis-step-label">${stepLabel(id)}</p>
        <h2>${stepHeadline(id)}</h2>
        <p>${stepLead(id)}</p>
      </div>`;
    }

    function renderContext(step) {
      const selectedLabels = state.selectedParts.map(label);
      const title = step === "result" && state.primaryPart
        ? `${label(state.primaryPart)}のセルフチェック結果`
        : selectedLabels.length === 1
          ? `${selectedLabels[0]}のセルフチェック`
          : selectedLabels.length > 1
            ? `${selectedLabels.join("・")}のセルフチェック`
            : "症状のセルフチェック";
      const lead = selectedLabels.length
        ? `${selectedLabels.join("・")}を選択済みです。この内容に合わせて質問します。`
        : "気になる部位を選び、動きや感じ方について順番に確認します。";
      return `<header class="diagnosis-context">
        <p>Health Check Lab</p>
        <h1>${esc(title)}</h1>
        <span>${esc(step === "result" ? "回答をもとに結果を整理しました。" : lead)}</span>
      </header>`;
    }

    function selectionFeedback(items, emptyText, options = {}) {
      const labels = (items || []).filter(Boolean);
      const max = Number(options.max) || 0;
      const noun = options.noun || "選択";
      const count = max ? `${labels.length} / ${max} ${noun}` : labels.length ? `${labels.length}件${noun}` : `未${noun}`;
      return `<p class="selection-feedback" aria-live="polite"><span>${count}</span><strong>${esc(labels.join("・") || emptyText)}</strong></p>`;
    }

    function renderParts() {
      const cards = partOrder.map((id) => {
        const selected = state.selectedParts.includes(id);
        const disabled = !selected && state.selectedParts.length >= MAX_SELECTION;
        return `<button class="body-part-card ${selected ? "selected" : ""}" type="button" data-part="${id}" aria-pressed="${selected}" ${disabled ? "disabled" : ""}>
          <span class="part-icon" aria-hidden="true"></span><span class="node-label">部位</span><strong>${parts[id].label}</strong><small>${selected ? "選択中" : "タップして選択"}</small>
        </button>`;
      }).join("");
      return `<section class="panel diagnosis-panel">
        ${stepHeader("parts")}
        ${selectionFeedback(state.selectedParts.map(label), "気になる場所を選んでください", { max: MAX_SELECTION })}
        <div class="body-part-grid">${cards}</div>
        ${state.limitMessage ? `<p class="form-hint limit-message">${state.limitMessage}</p>` : ""}
      </section>`;
    }

    function renderPrimary() {
      return `<section class="panel diagnosis-panel">
        ${stepHeader("primary")}
        ${selectionFeedback(state.primaryPart ? [label(state.primaryPart)] : [], "主な部位を選んでください", { max: 1 })}
        <div class="diagnosis-option-grid">${state.selectedParts.map((id) => selectableCard({ id, text: label(id), selected: state.primaryPart === id, name: "primaryPart", multi: false, kindLabel: "主な部位" })).join("")}</div>
      </section>`;
    }

    function renderSituations() {
      const precision = usesPrecisionFlow();
      return `<section class="panel diagnosis-panel">
        ${stepHeader("situations")}
        ${selectionFeedback(state.situations.map((id) => optionLabel(selectedSituations(), id)), precision ? "当てはまる動きを選んでください" : "当てはまる動き・場面を選んでください", { max: 3 })}
        <div class="diagnosis-option-grid answer-grid">${selectedSituations().map(([id, text]) => selectableCard({ id, text, selected: state.situations.includes(id), disabled: !state.situations.includes(id) && state.situations.length >= 3 && id !== UNCLEAR_SITUATION, name: "situations", kindLabel: precision ? "動作" : "動き・場面" })).join("")}</div>
        ${usesLowerlegPrecisionFlow() || usesAnklePrecisionFlow() ? '<p class="diagnosis-option-hint">足裏を内側・外側へ傾ける動きは、つま先の向きを変える動きではありません。</p>' : ""}
      </section>`;
    }

    function renderPrecisionLocation() {
      return `<section class="panel diagnosis-panel">
        ${stepHeader("precision_location")}
        ${selectionFeedback(state.painLocation ? [optionLabel(painLocationOptionsForPart(state.primaryPart), state.painLocation)] : [], "最も近い場所を選んでください", { max: 1, noun: "回答" })}
        <div class="diagnosis-option-grid answer-grid">${painLocationOptionsForPart(state.primaryPart).map(([id, text]) => selectableCard({ id, text, selected: state.painLocation === id, name: "painLocation", multi: false, kindLabel: "場所" })).join("")}</div>
      </section>`;
    }

    function renderPrecisionSide() {
      return `<section class="panel diagnosis-panel">
        ${stepHeader("precision_side")}
        ${selectionFeedback(state.side ? [optionLabel(sideOptions, state.side)] : [], "最も近い左右を選んでください", { max: 1, noun: "回答" })}
        <div class="diagnosis-option-grid answer-grid">${sideOptions.map(([id, text]) => selectableCard({ id, text, selected: state.side === id, name: "side", multi: false, kindLabel: "左右" })).join("")}</div>
      </section>`;
    }

    function renderAdaptiveQuestion() {
      const selected = state.adaptiveAnswer === "yes"
        ? "はい"
        : state.adaptiveAnswer === "no"
          ? "いいえ"
          : "";
      return `<section class="panel diagnosis-panel adaptive-question-panel">
        ${stepHeader("adaptive")}
        ${selectionFeedback(selected ? [selected] : [], "はい・いいえから選んでください", { max: 1, noun: "回答" })}
        <div class="diagnosis-option-grid answer-grid">
          ${selectableCard({ id: "yes", text: "はい、気になります", selected: state.adaptiveAnswer === "yes", name: "adaptiveAnswer", multi: false, kindLabel: "回答" })}
          ${selectableCard({ id: "no", text: "いいえ、気になりません", selected: state.adaptiveAnswer === "no", name: "adaptiveAnswer", multi: false, kindLabel: "回答" })}
        </div>
      </section>`;
    }

    function renderSymptoms() {
      const optionMap = new Map(symptomOptions);
      const replacesChangeChoice = (id) => id === "no_change"
        ? state.symptoms.some((selectedId) => selectedId === "better_move" || selectedId === "better_rest")
        : (id === "better_move" || id === "better_rest") && state.symptoms.includes("no_change");
      return `<section class="panel diagnosis-panel">
        ${stepHeader("symptoms")}
        ${selectionFeedback(state.symptoms.map((id) => optionLabel(symptomOptions, id)), "近い感じ方や変化を選んでください", { max: 3 })}
        <div class="diagnosis-choice-sections">${symptomDisplayGroups.map((group) => `<section class="diagnosis-choice-section"><div><h3>${group.title}</h3><p>${group.lead}</p></div><div class="diagnosis-option-grid answer-grid">${group.ids.map((id) => selectableCard({ id, text: optionMap.get(id), selected: state.symptoms.includes(id), disabled: !state.symptoms.includes(id) && state.symptoms.length >= 3 && !replacesChangeChoice(id), name: "symptoms", kindLabel: group.title === "動いたり休んだりした後の変化" ? "変化" : "感じ方" })).join("")}</div></section>`).join("")}</div>
        ${hasNerveFlag() ? `<div class="ai-caution">しびれや力の入りにくさは、筋肉だけでなく神経症状なども関係することがあります。強い症状や悪化がある場合は医療機関へ相談してください。</div>` : ""}
      </section>`;
    }

    function pillGroup(index, title, lead, name, options, selected) {
      return `<div class="supplement-group"><div class="supplement-group-heading"><span>${index} / 4</span><div><h3>${title}</h3><p>${lead}</p></div></div><div class="diagnosis-option-grid compact">${options.map(([id, text]) => selectableCard({ id, text, selected: selected === id, name, multi: false, kindLabel: "1つ選ぶ" })).join("")}</div></div>`;
    }

    function renderSupplement() {
      return `<section class="panel diagnosis-panel">
        ${stepHeader("supplement")}
        ${selectionFeedback([
          state.painLocation ? optionLabel(painLocationOptionsForPart(state.primaryPart), state.painLocation) : "",
          state.timing ? optionLabel(timingOptions, state.timing) : "",
          state.side ? optionLabel(sideOptions, state.side) : "",
          state.spread ? optionLabel(spreadOptions, state.spread) : ""
        ], "下の4問に1つずつ回答してください", { max: 4, noun: "回答" })}
        ${pillGroup(1, "気になる場所に一番近いのは？", "前・後ろ・横など、一番近い場所を選んでください。", "painLocation", painLocationOptionsForPart(state.primaryPart), state.painLocation)}
        ${pillGroup(2, "いつ気になりますか？", "動きとの関係がはっきりしなくても大丈夫です。最も近いものを選んでください。", "timing", timingOptions, state.timing)}
        ${pillGroup(3, "どちら側が気になりますか？", "右・左・両側・中央から選びます。", "side", sideOptions, state.side)}
        ${pillGroup(4, "気になる感じはどこまでありますか？", "選んだ部位だけか、周囲や腕・脚まで広がるかを選びます。", "spread", spreadOptions, state.spread)}
      </section>`;
    }

    function addScore(scoreMap, reasonMap, muscle, points, reason) {
      scoreMap.set(muscle, (scoreMap.get(muscle) || 0) + points);
      if (!reasonMap.has(muscle)) reasonMap.set(muscle, new Set());
      if (reason) reasonMap.get(muscle).add(reason);
    }

    function candidateLocationSupport(rule) {
      const option = painLocationOptionsForPart(state.primaryPart).find(([id]) => id === state.painLocation);
      const known = Boolean(option && state.painLocation !== UNCLEAR_LOCATION);
      const matched = Boolean(known && (option[2] || []).includes(rule.name));
      return { known, matched, label: option?.[1] || "" };
    }

    function candidateSupport(rule) {
      const primary = state.primaryPart;
      const primaryMatch = rule.primary.includes(primary);
      const relatedPrimary = rule.related.includes(primary);
      const secondaryParts = state.selectedParts.filter((partId) => partId !== primary && (rule.primary.includes(partId) || rule.related.includes(partId)));
      const movementEvidence = new Set([
        ...(rule.motions || []),
        ...(rule.contraction || []),
        ...(rule.stretch || [])
      ]);
      const matchedMotions = state.situations.filter((id) => movementEvidence.has(id));
      const matchedContexts = state.situations.filter((id) => (rule.bonus || []).includes(id));
      const matchedSymptoms = state.symptoms.filter((id) => RANKABLE_SYMPTOMS.has(id) && rule.symptoms.includes(id));
      const location = candidateLocationSupport(rule);
      const axes = [];
      if (primaryMatch || relatedPrimary || secondaryParts.length) axes.push("部位");
      if (location.matched) axes.push("場所");
      if (matchedMotions.length) axes.push("動き");
      if (matchedContexts.length) axes.push("場面");
      if (matchedSymptoms.length) axes.push("感じ方");
      return { primaryMatch, relatedPrimary, secondaryParts, matchedMotions, matchedContexts, matchedSymptoms, location, axes };
    }

    function candidateRelation(support) {
      if (support.axes.length >= 2) return `回答との一致：${support.axes.join("・")}`;
      if (support.axes[0] === "動き") return "動きから追加した候補";
      if (support.axes[0] === "部位") return "部位から追加した候補";
      return "回答から追加した候補";
    }

    function candidateReasons(rule, support) {
      const reasons = [];
      if (support.location.matched) reasons.push(`「${support.location.label}」という位置の回答から候補に含めています`);
      if (support.primaryMatch) reasons.push(`${label(state.primaryPart)}に関わる筋肉として候補範囲に含めています`);
      else if (support.relatedPrimary) reasons.push(`${label(state.primaryPart)}と連動する部位に関わる筋肉です`);
      else if (support.secondaryParts.length) reasons.push(`${support.secondaryParts.map(label).join("・")}とのつながりから候補に含めています`);
      support.matchedMotions.slice(0, 2).forEach((id) => reasons.push(`「${optionLabel(selectedSituations(), id)}」に関わる動きと回答が重なります`));
      support.matchedContexts.slice(0, 1).forEach((id) => reasons.push(`「${optionLabel(selectedSituations(), id)}」は場面情報として候補の順序を補助しています`));
      if (support.matchedSymptoms.length && reasons.length < 4) {
        reasons.push(`「${optionLabel(symptomOptions, support.matchedSymptoms[0])}」は候補の順序を補助する情報として使っています`);
      }
      return reasons.slice(0, 4);
    }

    function calculateLowbackPrecision() {
      const ranked = LowbackPrecisionV1.rank({
        location: state.painLocation,
        side: state.side,
        movements: state.situations
      });
      const result = {
        module: "BodyCheck",
        diagnosisVersion: VERSION,
        diagnosisId: Platform?.createId("diagnosis") || `diagnosis_${Date.now().toString(36)}`,
        savedAt: new Date().toISOString(),
        regionId: "lowback",
        regionLabel: label("lowback"),
        selectedParts: state.selectedParts.map(label),
        bodyType: "腰の筋肉候補を整理",
        topMuscles: ranked.candidates,
        candidateLogicVersion: ranked.version,
        candidateStatus: ranked.status,
        candidateStatusReason: ranked.statusReason,
        candidateTopTie: ranked.topTie,
        candidateSourceOrderUsedForTop1: false,
        candidateReferenceMuscles: ranked.referenceCandidates,
        hasDanger: false,
        dangerSigns: [],
        care: parts.lowback.care,
        answers: {
          selectedParts: [...state.selectedParts], primaryPart: "lowback",
          situations: [...state.situations], symptoms: [],
          painLocation: state.painLocation, timing: "", side: state.side, spread: ""
        }
      };
      if (PrecisionPersistence) {
        result.diagnosisVersion = "lowback_precision_v1";
        result.precisionData = PrecisionPersistence.serializePrecisionResult({
          bodyPart: "lowback",
          diagnosisVersion: result.diagnosisVersion,
          answers: { location: state.painLocation, side: state.side, movements: state.situations },
          result: {
            status: ranked.status,
            reason: ranked.statusReason,
            mainMuscleIds: ranked.main,
            additionalMuscleIds: ranked.trustedAdditional,
            frontierMuscleIds: ranked.unionFrontier,
            referenceMuscleIds: ranked.candidates.filter((item) => item.displayGroup === "Reference")
              .map((item) => item.muscleId)
          },
          safety: {
            numbness: null,
            weakness: null,
            limbSpread: null
          }
        });
      }
      aiHandoffContexts.set(result, { lowbackPrecision: ranked });
      state.latest = result;
      return result;
    }

    function calculateHipPrecision() {
      const ranked = HipPrecisionV1.rank({
        location: state.painLocation, side: state.side, movements: state.situations
      });
      const result = {
        module: "BodyCheck",
        diagnosisVersion: "hip_precision_v1",
        diagnosisId: Platform?.createId("diagnosis") || `diagnosis_${Date.now().toString(36)}`,
        savedAt: new Date().toISOString(),
        regionId: "hip",
        regionLabel: label("hip"),
        selectedParts: state.selectedParts.map(label),
        bodyType: "股関節の筋肉候補を整理",
        topMuscles: ranked.candidates,
        candidateLogicVersion: ranked.version,
        candidateStatus: ranked.status,
        candidateStatusReason: ranked.statusReason,
        candidateTopTie: ranked.topTie,
        candidateSourceOrderUsedForTop1: false,
        candidateReferenceMuscles: ranked.referenceCandidates,
        hasDanger: false,
        dangerSigns: [],
        care: parts.hip.care,
        answers: {
          selectedParts: [...state.selectedParts], primaryPart: "hip",
          situations: [...state.situations], symptoms: [],
          painLocation: state.painLocation, timing: "", side: state.side, spread: ""
        }
      };
      if (PrecisionPersistence) {
        result.precisionData = PrecisionPersistence.serializePrecisionResult({
          bodyPart: "hip", diagnosisVersion: result.diagnosisVersion,
          answers: { location: state.painLocation, side: state.side, movements: state.situations },
          result: {
            status: ranked.status, reason: ranked.statusReason,
            mainMuscleIds: ranked.main, additionalMuscleIds: ranked.additional,
            frontierMuscleIds: ranked.unionFrontier, referenceMuscleIds: ranked.reference
          },
          safety: { numbness: null, weakness: null, limbSpread: null }
        });
      }
      aiHandoffContexts.set(result, { hipPrecision: ranked });
      state.latest = result;
      return result;
    }

    function calculateKneePrecision() {
      const ranked = KneePrecisionV1.rank({
        location: state.painLocation, side: state.side, movements: state.situations
      });
      const result = {
        module: "BodyCheck",
        diagnosisVersion: "knee_precision_v1",
        diagnosisId: Platform?.createId("diagnosis") || `diagnosis_${Date.now().toString(36)}`,
        savedAt: new Date().toISOString(),
        regionId: "knee", regionLabel: label("knee"),
        selectedParts: state.selectedParts.map(label),
        bodyType: "膝の筋肉候補を整理",
        topMuscles: ranked.candidates,
        candidateLogicVersion: ranked.version,
        candidateStatus: ranked.status,
        candidateStatusReason: ranked.statusReason,
        candidateTopTie: ranked.topTie,
        candidateSourceOrderUsedForTop1: false,
        candidateReferenceMuscles: ranked.referenceCandidates,
        hasDanger: false, dangerSigns: [], care: parts.knee.care,
        answers: {
          selectedParts: [...state.selectedParts], primaryPart: "knee",
          situations: [...state.situations], symptoms: [],
          painLocation: state.painLocation, timing: "", side: state.side, spread: ""
        }
      };
      if (PrecisionPersistence) {
        result.precisionData = PrecisionPersistence.serializePrecisionResult({
          bodyPart: "knee", diagnosisVersion: result.diagnosisVersion,
          answers: { location: state.painLocation, side: state.side, movements: state.situations },
          result: {
            status: ranked.status, reason: ranked.statusReason,
            mainMuscleIds: ranked.main, additionalMuscleIds: ranked.additional,
            frontierMuscleIds: ranked.frontier, referenceMuscleIds: ranked.reference
          },
          safety: { numbness: null, weakness: null, limbSpread: null }
        });
      }
      aiHandoffContexts.set(result, { kneePrecision: ranked });
      state.latest = result;
      return result;
    }

    function calculateButtockPrecision() {
      const ranked = ButtockPrecisionV1.rank({
        location: state.painLocation, side: state.side, movements: state.situations
      });
      const result = {
        module: "BodyCheck",
        diagnosisVersion: "buttock_precision_v1",
        diagnosisId: Platform?.createId("diagnosis") || `diagnosis_${Date.now().toString(36)}`,
        savedAt: new Date().toISOString(),
        regionId: "buttock", regionLabel: label("buttock"),
        selectedParts: state.selectedParts.map(label),
        bodyType: "お尻の筋肉候補を整理",
        topMuscles: ranked.candidates,
        candidateLogicVersion: ranked.version,
        candidateStatus: ranked.status,
        candidateStatusReason: ranked.statusReason,
        candidateTopTie: ranked.topTie,
        candidateSourceOrderUsedForTop1: false,
        candidateReferenceMuscles: [],
        hasDanger: false, dangerSigns: [], care: parts.buttock.care,
        answers: {
          selectedParts: [...state.selectedParts], primaryPart: "buttock",
          situations: [...state.situations], symptoms: [],
          painLocation: state.painLocation, timing: "", side: state.side, spread: ""
        }
      };
      if (PrecisionPersistence) {
        result.precisionData = PrecisionPersistence.serializePrecisionResult({
          bodyPart: "buttock", diagnosisVersion: result.diagnosisVersion,
          answers: { location: state.painLocation, side: state.side, movements: state.situations },
          result: {
            status: ranked.status, reason: ranked.statusReason,
            mainMuscleIds: ranked.main, additionalMuscleIds: ranked.additional,
            frontierMuscleIds: ranked.frontier, referenceMuscleIds: ranked.reference
          },
          safety: { numbness: null, weakness: null, limbSpread: null }
        });
      }
      aiHandoffContexts.set(result, { buttockPrecision: ranked });
      state.latest = result;
      return result;
    }

    function calculateThighPrecision() {
      const ranked = ThighPrecisionV1.rank({
        location: state.painLocation, side: state.side, movements: state.situations
      });
      const result = {
        module: "BodyCheck",
        diagnosisVersion: "thigh_precision_v1",
        diagnosisId: Platform?.createId("diagnosis") || `diagnosis_${Date.now().toString(36)}`,
        savedAt: new Date().toISOString(),
        regionId: "thigh", regionLabel: label("thigh"),
        selectedParts: state.selectedParts.map(label),
        bodyType: "太ももの筋肉候補を整理",
        topMuscles: ranked.candidates,
        candidateLogicVersion: ranked.version,
        candidateStatus: ranked.status,
        candidateStatusReason: ranked.statusReason,
        candidateTopTie: ranked.topTie,
        candidateSourceOrderUsedForTop1: false,
        candidateReferenceMuscles: ranked.referenceCandidates.map((item) => item.name),
        hasDanger: false, dangerSigns: [], care: parts.thigh.care,
        answers: {
          selectedParts: [...state.selectedParts], primaryPart: "thigh",
          situations: [...state.situations], symptoms: [],
          painLocation: state.painLocation, timing: "", side: state.side, spread: ""
        }
      };
      if (PrecisionPersistence) {
        result.precisionData = PrecisionPersistence.serializePrecisionResult({
          bodyPart: "thigh", diagnosisVersion: result.diagnosisVersion,
          answers: { location: state.painLocation, side: state.side, movements: state.situations },
          result: {
            status: ranked.status, reason: ranked.statusReason,
            mainMuscleIds: ranked.main, additionalMuscleIds: ranked.additional,
            frontierMuscleIds: ranked.unionFrontier, referenceMuscleIds: ranked.reference
          },
          safety: { numbness: null, weakness: null, limbSpread: null }
        });
      }
      aiHandoffContexts.set(result, { thighPrecision: ranked });
      state.latest = result;
      return result;
    }

    function calculateLowerlegPrecision() {
      const ranked = LowerlegPrecisionV1.rank({
        location: state.painLocation, side: state.side, movements: state.situations
      });
      const result = {
        module: "BodyCheck",
        diagnosisVersion: "lowerleg_precision_v1",
        diagnosisId: Platform?.createId("diagnosis") || `diagnosis_${Date.now().toString(36)}`,
        savedAt: new Date().toISOString(),
        regionId: "lowerleg", regionLabel: label("lowerleg"),
        selectedParts: state.selectedParts.map(label),
        bodyType: "すね・ふくらはぎの筋肉候補を整理",
        topMuscles: ranked.candidates,
        candidateLogicVersion: ranked.version,
        candidateStatus: ranked.status,
        candidateStatusReason: ranked.reason,
        candidateTopTie: ranked.topTie,
        candidateSourceOrderUsedForTop1: false,
        candidateReferenceMuscles: ranked.referenceCandidates.map((item) => item.name),
        hasDanger: false, dangerSigns: [], care: parts.lowerleg.care,
        answers: {
          selectedParts: [...state.selectedParts], primaryPart: "lowerleg",
          situations: [...state.situations], symptoms: [],
          painLocation: state.painLocation, timing: "", side: state.side, spread: ""
        }
      };
      if (PrecisionPersistence) {
        result.precisionData = PrecisionPersistence.serializePrecisionResult({
          bodyPart: "lowerleg", diagnosisVersion: result.diagnosisVersion,
          answers: { location: state.painLocation, side: state.side, movements: state.situations },
          result: {
            status: ranked.status, reason: ranked.reason,
            mainMuscleIds: ranked.main, additionalMuscleIds: ranked.additional,
            frontierMuscleIds: ranked.frontier, referenceMuscleIds: ranked.reference
          },
          safety: { numbness: null, weakness: null, limbSpread: null }
        });
      }
      aiHandoffContexts.set(result, { lowerlegPrecision: ranked });
      state.latest = result;
      return result;
    }

    function calculateAnklePrecision() {
      const ranked = AnklePrecisionV1.rank({
        location: state.painLocation, side: state.side, movements: state.situations
      });
      const result = {
        module: "BodyCheck",
        diagnosisVersion: "ankle_precision_v1",
        diagnosisId: Platform?.createId("diagnosis") || `diagnosis_${Date.now().toString(36)}`,
        savedAt: new Date().toISOString(),
        regionId: "ankle", regionLabel: label("ankle"),
        selectedParts: state.selectedParts.map(label),
        bodyType: "足首の筋肉候補を整理",
        topMuscles: ranked.candidates,
        candidateLogicVersion: ranked.version,
        candidateStatus: ranked.status,
        candidateStatusReason: ranked.reason,
        candidateTopTie: ranked.topTie,
        candidateSourceOrderUsedForTop1: false,
        candidateReferenceMuscles: ranked.referenceCandidates.map((item) => item.name),
        hasDanger: false, dangerSigns: [], care: parts.ankle.care,
        answers: {
          selectedParts: [...state.selectedParts], primaryPart: "ankle",
          situations: [...state.situations], symptoms: [],
          painLocation: state.painLocation, timing: "", side: state.side, spread: ""
        }
      };
      if (PrecisionPersistence) {
        result.precisionData = PrecisionPersistence.serializePrecisionResult({
          bodyPart: "ankle", diagnosisVersion: result.diagnosisVersion,
          answers: { location: state.painLocation, side: state.side, movements: state.situations },
          result: {
            status: ranked.status, reason: ranked.reason,
            mainMuscleIds: ranked.main, additionalMuscleIds: ranked.additional,
            frontierMuscleIds: ranked.frontier, referenceMuscleIds: ranked.reference
          },
          safety: { numbness: null, weakness: null, limbSpread: null }
        });
      }
      aiHandoffContexts.set(result, { anklePrecision: ranked });
      state.latest = result;
      return result;
    }

    function calculate() {
      if (usesLowbackPrecisionFlow()) return calculateLowbackPrecision();
      if (usesHipPrecisionFlow()) return calculateHipPrecision();
      if (usesKneePrecisionFlow()) return calculateKneePrecision();
      if (usesButtockPrecisionFlow()) return calculateButtockPrecision();
      if (usesThighPrecisionFlow()) return calculateThighPrecision();
      if (usesLowerlegPrecisionFlow()) return calculateLowerlegPrecision();
      if (usesAnklePrecisionFlow()) return calculateAnklePrecision();
      const scores = new Map();
      const candidateScores = new Map();
      const reasons = new Map();
      const primary = state.primaryPart;
      const selectedSet = new Set(state.selectedParts);
      const addCandidateScore = (muscle, points) => candidateScores.set(muscle, (candidateScores.get(muscle) || 0) + points);

      muscleRules.forEach((rule) => {
        let matched = 0;
        let candidateMatched = 0;
        if (rule.primary.includes(primary)) {
          addScore(scores, reasons, rule.name, 26, `${label(primary)}が主な部位として選ばれています`);
          addCandidateScore(rule.name, 26);
          matched += 1;
          candidateMatched += 1;
        }
        state.selectedParts.forEach((partId) => {
          if (partId !== primary && (rule.primary.includes(partId) || rule.related.includes(partId))) {
            addScore(scores, reasons, rule.name, 7, `${label(partId)}にも気になる反応があります`);
            addCandidateScore(rule.name, 7);
            matched += 1;
            candidateMatched += 1;
          }
        });
        state.situations.forEach((id) => {
          if (rule.motions.includes(id)) {
            addScore(scores, reasons, rule.name, 12, `${optionLabel(selectedSituations(), id)}で負担が増えやすい傾向があります`);
            addCandidateScore(rule.name, 12);
            matched += 1;
            candidateMatched += 1;
          }
          if (rule.contraction?.includes(id)) {
            addScore(scores, reasons, rule.name, 5, "筋肉を使う動作で反応しやすい回答です");
            addCandidateScore(rule.name, 5);
            candidateMatched += 1;
          }
          if (rule.stretch?.includes(id)) {
            addScore(scores, reasons, rule.name, 5, "筋肉が伸ばされる動作で反応しやすい回答です");
            addCandidateScore(rule.name, 5);
            candidateMatched += 1;
          }
          if (rule.bonus?.includes(id)) {
            addScore(scores, reasons, rule.name, 4, "日常負荷の特徴と重なります");
            addCandidateScore(rule.name, 3);
            candidateMatched += 1;
          }
        });
        state.symptoms.forEach((id) => {
          if (rule.symptoms.includes(id)) {
            addScore(scores, reasons, rule.name, 8, `${optionLabel(symptomOptions, id)}という症状の性質と合います`);
            matched += 1;
            if (RANKABLE_SYMPTOMS.has(id)) {
              addCandidateScore(rule.name, 4);
              candidateMatched += 1;
            }
          }
        });
        const location = candidateLocationSupport(rule);
        if (location.known) addCandidateScore(rule.name, location.matched ? 8 : -4);
        if (state.timing === "start" && ["腸腰筋", "大臀筋", "中臀筋", "短趾屈筋", "母趾外転筋", "前脛骨筋"].includes(rule.name)) addScore(scores, reasons, rule.name, 4, "動き始めの反応が候補に影響します");
        if (state.timing === "end" && ["棘上筋", "多裂筋", "大腿四頭筋", "腓腹筋"].includes(rule.name)) addScore(scores, reasons, rule.name, 4, "最後まで動かした時の反応が候補に影響します");
        if (state.spread === "near" && rule.related.some((id) => selectedSet.has(id))) addScore(scores, reasons, rule.name, 5, "近くの部位まで広がる回答と関連します");
        if (state.spread === "limb" && ["斜角筋", "梨状筋", "腰方形筋"].includes(rule.name)) addScore(scores, reasons, rule.name, 5, "腕や脚まで広がる回答では注意して見ます");
        if (matched === 0) addScore(scores, reasons, rule.name, -8, "");
        if (candidateMatched === 0) addCandidateScore(rule.name, -8);
      });

      const selectedLocation = painLocationOptionsForPart(primary).find(([id]) => id === state.painLocation);
      const locationKnown = Boolean(selectedLocation && state.painLocation !== UNCLEAR_LOCATION);
      const allowedCandidateNames = new Set(locationKnown
        ? selectedLocation[2] || []
        : muscleRules.filter((rule) => rule.primary.includes(primary)).map((rule) => rule.name));
      const candidateEntries = muscleRules
        .map((rule, sourceIndex) => {
          const score = candidateScores.get(rule.name) || 0;
          const support = candidateSupport(rule);
          return { rule, sourceIndex, score, support };
        })
        .filter(({ rule, support }) => support.primaryMatch && allowedCandidateNames.has(rule.name));
      const hasConcreteSituation = state.situations.some((id) => id !== UNCLEAR_SITUATION);
      const answerMatchedEntries = candidateEntries.filter(({ support }) => support.matchedMotions.length || support.matchedContexts.length);
      const rankedCandidateEntries = hasConcreteSituation && answerMatchedEntries.length ? answerMatchedEntries : candidateEntries;
      const topMuscles = rankedCandidateEntries
        .sort((a, b) => Number(b.support.primaryMatch) - Number(a.support.primaryMatch)
          || Number(b.support.location.matched) - Number(a.support.location.matched)
          || b.support.matchedMotions.length - a.support.matchedMotions.length
          || b.score - a.score
          || b.support.matchedContexts.length - a.support.matchedContexts.length
          || b.support.matchedSymptoms.length - a.support.matchedSymptoms.length
          || a.sourceIndex - b.sourceIndex)
        .slice(0, 5)
        .map(({ rule, score, support }) => ({
          name: rule.name,
          score: Math.round(score),
          relation: candidateRelation(support),
          reasons: candidateReasons(rule, support),
          matchedMotions: support.matchedMotions,
          matchedContexts: support.matchedContexts,
          matchedSymptoms: support.matchedSymptoms,
          locationKnown: support.location.known,
          locationMatched: support.location.matched,
          painLocationLabel: support.location.label,
          supportAxes: support.axes
        }));

      if (!topMuscles.length) {
        muscleRules.filter((rule) => rule.primary.includes(primary) && allowedCandidateNames.has(rule.name)).slice(0, 5).forEach((rule, index) => {
          const support = candidateSupport(rule);
          topMuscles.push({ name: rule.name, score: 10 - index, relation: candidateRelation(support), reasons: candidateReasons(rule, support), matchedMotions: [], matchedContexts: [], matchedSymptoms: [], locationKnown: support.location.known, locationMatched: support.location.matched, painLocationLabel: support.location.label, supportAxes: support.axes });
        });
      }

      const precisionCandidates = usesShoulderPrecisionFlow()
        ? precisionCandidatesForState()
        : primary === "neck" && usesNeckPrecisionPreview()
        ? precisionCandidatesForState()
        : null;
      if (precisionCandidates) {
        topMuscles.splice(0, topMuscles.length, ...precisionCandidates.candidates.map((item) => ({
          name: item.name,
          muscleId: item.muscleId,
          ...(usesShoulderPrecisionFlow() ? { imageId: item.imageId || item.name } : {}),
          model3dId: item.model3dId,
          score: item.score,
          rank: item.rank,
          tiedAtRank: item.tiedAtRank,
          displayGroup: item.displayGroup || "",
          isAdditionalCandidate: Boolean(item.isAdditionalCandidate),
          relation: item.relation,
          reasons: item.reasons,
          matchedMotions: item.matchedMotions,
          matchedContexts: [],
          matchedSymptoms: [],
          locationKnown: item.locationKnown,
          locationMatched: item.locationMatched,
          painLocationLabel: item.painLocationLabel,
          supportAxes: item.supportAxes
        })));
      }

      const effectiveSituations = precisionCandidates?.adaptive?.effectiveSituations || state.situations;
      const legacyTopScore = muscleRules.filter((rule) => !rule.expanded).reduce((max, rule) => Math.max(max, scores.get(rule.name) || 0), 10);
      const scoredSituationCount = state.situations.filter((id) => id !== UNCLEAR_SITUATION).length;
      const burdenScore = Math.min(100, Math.max(10, Math.round(legacyTopScore + scoredSituationCount * 8 + state.symptoms.length * 7 + (hasNerveFlag() ? 12 : 0))));
      const painMotionScore = state.symptoms.includes("sharp") ? 10 : state.symptoms.includes("heavy") ? 6 : 0;
      const limitedScore = state.symptoms.includes("limited") || state.symptoms.includes("catching") || state.symptoms.includes("weakness") ? 10 : 0;
      const stiffnessScore = state.symptoms.includes("tight") || state.symptoms.includes("heavy") ? 10 : 0;
      const hasDanger = hasNerveFlag();
      const bodyType = hasDanger ? "神経症状も確認したいタイプ" : `${label(primary)}中心の筋肉負担タイプ`;
      const result = {
        module: "BodyCheck",
        diagnosisVersion: VERSION,
        diagnosisId: Platform?.createId("diagnosis") || `diagnosis_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
        savedAt: new Date().toISOString(),
        regionId: primary,
        regionLabel: label(primary),
        selectedParts: state.selectedParts.map(label),
        conditionLevel: burdenScore >= 75 ? 2 : burdenScore >= 45 ? 3 : 4,
        levelLabel: burdenScore >= 75 ? "高負担" : burdenScore >= 45 ? "中負担" : "軽負担",
        postureDamage: burdenScore,
        muscleAge: Math.min(85, Math.max(20, 24 + Math.round(burdenScore / 3))),
        futureRisk: hasDanger ? "医療相談も検討" : burdenScore >= 75 ? "高め" : burdenScore >= 45 ? "中程度" : "低め",
        painScore: painMotionScore,
        painMotionScore,
        limitedScore,
        stiffnessScore,
        totalScore: burdenScore,
        hasDanger,
        dangerSigns: hasDanger ? state.symptoms.filter((id) => ["numbness", "weakness"].includes(id)).map((id) => optionLabel(symptomOptions, id)) : [],
        bodyType,
        topMuscles,
        candidateLogicVersion: precisionCandidates?.version || VERSION,
        candidateStatus: precisionCandidates?.status || "legacy",
        candidateStatusReason: precisionCandidates?.statusReason || "",
        candidateTopTie: Boolean(precisionCandidates?.topTie),
        candidateSourceOrderUsedForTop1: Boolean(precisionCandidates?.sourceOrderUsedForTop1),
        candidateInsufficientReason: precisionCandidates?.insufficientReason || "",
        candidateReferenceMuscles: (precisionCandidates?.referenceCandidates || []).map((item) => typeof item === "string" ? item : item.name),
        ...(usesShoulderPrecisionFlow() ? {
          candidateAdditionalMuscles: (precisionCandidates?.additionalCandidates || [])
            .map((id) => activeShoulderPrecision().MASTER.find((item) => item.muscleId === id)?.displayName).filter(Boolean)
        } : {}),
        care: parts[primary].care,
        duration: state.timing || "unknown",
        durationLabel: state.timing ? optionLabel(timingOptions, state.timing) : "未選択",
        lifestyleTags: [primary, ...effectiveSituations, ...state.symptoms],
        motionResults: effectiveSituations.map((id) => ({ part: label(primary), label: optionLabel(selectedSituations(), id), answer: state.symptoms.map((symptom) => optionLabel(symptomOptions, symptom)).join(" / "), score: 1 })),
        lead: "",
        shareText: "",
        autoSaved: false,
        answers: {
          selectedParts: state.selectedParts,
          primaryPart: primary,
          situations: effectiveSituations,
          symptoms: state.symptoms,
          painLocation: state.painLocation,
          timing: state.timing,
          side: state.side,
          spread: state.spread
        }
      };
      if (precisionCandidates?.version === "neck-precision-v2.2-local-hypothesis") {
        const compactCandidate = (item) => ({
          muscleId: item.muscleId,
          name: item.name,
          rank: item.rank,
          tiedAtRank: Boolean(item.tiedAtRank),
          displayGroup: item.displayGroup || "",
          isAdditionalCandidate: Boolean(item.isAdditionalCandidate),
          locationEligibility: item.locationEligibility || "",
          positiveEvidence: (item.positiveEvidence || []).map(({ motion, relation }) => ({ motion, relation }))
        });
        aiHandoffContexts.set(result, {
          selectedSituations: [...state.situations],
          candidates: (precisionCandidates.candidates || []).map(compactCandidate),
          referenceCandidates: (precisionCandidates.referenceCandidates || []).map(compactCandidate),
          insufficientReason: precisionCandidates.insufficientReason || "",
          adaptive: precisionCandidates.adaptive?.answered
            ? {
                question: precisionCandidates.adaptive.question?.question || "",
                movement: precisionCandidates.adaptive.question?.movement || "",
                answer: precisionCandidates.adaptive.answer || state.adaptiveAnswer || "",
                evidenceAdded: Boolean(precisionCandidates.adaptive.evidenceAdded)
              }
            : null
        });
      } else if (precisionCandidates?.version === "shoulder-precision-v1.2-local-hypothesis") {
        aiHandoffContexts.set(result, {
          shoulderPrecision: precisionCandidates,
          selectedSituations: [...state.situations]
        });
      }
      result.lead = hasDanger
        ? "しびれや力の入りにくさが選ばれています。筋肉の負担だけでなく、神経症状なども含めて確認してください。"
        : `${label(primary)}を中心に、気になる位置・動作・症状の組み合わせから筋肉候補を整理しました。`;
      result.shareText = ["Health Check Lab / 全身筋肉チェック", `主な部位：${result.regionLabel}`, `気になる場所：${result.selectedParts.join(" / ")}`, `詳しい位置：${optionLabel(painLocationOptionsForPart(primary), state.painLocation) || "未選択"}`, `候補：${topMuscles.map((item) => item.name).join(" / ")}`, "※医療診断ではなくセルフチェックの参考情報です"].join("\n");
      state.latest = result;
      return result;
    }

    function localRecords() {
      if (Platform) return Platform.readRecords(localStorage, STORAGE_KEY);
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
    }
    function profileFromForm() {
      return {
        ageBand: $("#recordAgeBand")?.value || "",
        sex: $("#recordSex")?.value || "",
        region: $("#recordRegion")?.value || "",
        lifeImpact: $("#recordLifeImpact")?.value || "",
        symptomDuration: $("#recordDuration")?.value || ""
      };
    }
    function normalizedRecord(result, profile = {}) {
      if (!Platform) return result;
      const existing = localRecords();
      const relatedFirst = result.diagnosisVersion === "lowerleg_precision_v1" ||
        result.diagnosisVersion === "ankle_precision_v1";
      const saveOnlyResult = relatedFirst ? {
        ...result,
        topMuscles: ["Related", "Main", "Additional", "Reference"].flatMap((group) =>
          (result.topMuscles || []).filter((item) => item.displayGroup === group))
      } : result;
      const normalized = Platform.normalizeRecord(saveOnlyResult, {
        diagnosisId: result.diagnosisId,
        anonymousDeviceId: Platform.anonymousDeviceId(localStorage),
        anonymousSessionId: Platform.anonymousSessionId(sessionStorage),
        referralSource: Platform.referralSource(sessionStorage),
        repeatVisit: existing.some((item) => item.diagnosisId !== result.diagnosisId),
        profile
      });
      if (relatedFirst) normalized.topMuscles = result.topMuscles;
      return normalized;
    }
    function saveLocal(result) {
      if (Platform) return Platform.upsertRecord(localStorage, STORAGE_KEY, result);
      const records = localRecords(); records.push(result); localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-300))); return records;
    }
    async function submitSupabase(result, mode = "auto") {
      if (isLocalPreview()) {
        window.__HCL_LOCAL_REQUESTS__ = window.__HCL_LOCAL_REQUESTS__ || [];
        window.__HCL_LOCAL_REQUESTS__.push({ method: "POST", path: "/.netlify/functions/save-diagnosis-record", mode, mocked: true });
        return { ok: true, localPreview: true };
      }
      const response = await fetch("/.netlify/functions/save-diagnosis-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, record: result })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error("Anonymous record save failed");
      return data;
    }
    async function autoSave(result) {
      if (result.autoSaved) return;
      Object.assign(result, normalizedRecord(result));
      result.autoSaved = true;
      try {
        await submitSupabase(result, "auto");
      }
      catch {
        // The visible record remains an explicit device-only action even if aggregation is unavailable.
      }
    }
    async function saveAgain() {
      if (!state.latest) return;
      emit("diagnosis_save_click");
      const status = $("#saveStatus");
      const button = $("#saveBodyBtn");
      if (status) {
        status.hidden = false;
        status.textContent = "この端末へ記録しています...";
      }
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
      }
      const result = normalizedRecord(state.latest, profileFromForm());
      if (isLowbackPrecisionV1Result(state.latest) || isHipPrecisionV1Result(state.latest)
        || isKneePrecisionV1Result(state.latest) || isButtockPrecisionV1Result(state.latest)
        || isThighPrecisionV1Result(state.latest) || isLowerlegPrecisionV1Result(state.latest)
        || isAnklePrecisionV1Result(state.latest)) {
        const context = aiHandoffContexts.get(state.latest);
        if (context) aiHandoffContexts.set(result, context);
      }
      result.autoSaved = true;
      state.latest = result;
      saveLocal(result);
      const [remoteSave] = await Promise.allSettled([submitSupabase(result, "confirm")]);
      emit("diagnosis_save_complete");
      refreshRecordExperience(result);
      const refreshedStatus = $("#saveStatus");
      const nextDates = Platform?.recommendedDates(result.diagnosisDate || result.savedAt) || {};
      const nextDateLabel = formatRecordDate(nextDates.sevenDays);
      if (refreshedStatus) refreshedStatus.textContent = remoteSave.status === "fulfilled" && remoteSave.value.localPreview
        ? `次の確認目安：${nextDateLabel}（ローカル確認）`
        : remoteSave.status === "rejected" && (isLowbackPrecisionV1Result(result) || isHipPrecisionV1Result(result)
          || isKneePrecisionV1Result(result) || isButtockPrecisionV1Result(result)
          || isThighPrecisionV1Result(result) || isLowerlegPrecisionV1Result(result)
          || isAnklePrecisionV1Result(result))
          ? `この端末に記録しました。集計への保存は確認できませんでした。次の確認目安：${nextDateLabel}`
          : `次の確認目安：${nextDateLabel}`;
    }

    function formatRecordDate(value) {
      const date = new Date(value || Date.now());
      if (Number.isNaN(date.getTime())) return "日時不明";
      return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(date);
    }

    function movementLabels(result) {
      const options = situationOptionsForPart(result.regionId);
      return (result.answers?.situations || []).map((id) => optionLabel(options, id));
    }

    function muscleVisual(item, result) {
      return muscleVisuals[item.imageId || item.name] || regionVisuals[result.regionId] || regionVisuals.back;
    }

    function highlightXs(visual, side) {
      const xs = Array.isArray(visual.x) ? visual.x : [visual.x];
      if (xs.length < 2) return xs;
      if (side === "right") return [xs[0]];
      if (side === "left") return [xs[xs.length - 1]];
      if (side === "center") return [xs.reduce((sum, value) => sum + value, 0) / xs.length];
      return xs;
    }

    function renderMuscleHighlights(visual, side) {
      return highlightXs(visual, side).map((x) => `<span class="result-muscle-highlight" style="--highlight-x:${x}%;--highlight-y:${visual.y}%;--highlight-width:${visual.width}%;--highlight-height:${visual.height}%;"></span>`).join("");
    }

    function muscleSummary(item, result) {
      const answerAxes = (item.supportAxes || []).filter((axis) => axis !== "部位");
      if (answerAxes.length) return `${answerAxes.join("・")}が手がかり`;
      return `${result.regionLabel}に関わる候補筋`;
    }

    function muscleClues(item, result) {
      if (["lowback-precision-v1-local-hypothesis", "hip-precision-v1-local-hypothesis",
        "knee-precision-v1-local-hypothesis", "buttock-precision-v1-local-hypothesis",
        "thigh-precision-v1-local-hypothesis", "lowerleg-precision-v1-local-hypothesis",
        "ankle-precision-v1-local-hypothesis"].includes(result.candidateLogicVersion)) {
        if (item.displayGroup === "Reference") return [{ label: "参考", text: "この動きで伸ばされる方向として表示" }];
        if (item.displayGroup === "Related" && !item.matchedMotions?.length) {
          return [{ label: "関連", text: "回答だけでは順位の手がかりを確認できません" }];
        }
        const location = optionLabel(painLocationOptionsForPart(result.regionId), result.answers?.painLocation);
        const clues = [];
        if (item.displayGroup === "Main") clues.push({ label: "場所", text: `${location}との位置の重なり` });
        if (result.regionId === "ankle" && result.answers?.painLocation === "ankle_back" &&
          ["ankle_gastrocnemius", "ankle_soleus"].includes(item.muscleId)) {
          clues.push({ label: "位置", text: "足首後方を通る筋腱の経路が位置的な手がかりです" });
        }
        if (item.matchedMotions?.length) {
          const motions = result.regionId === "knee" ? item.matchedMotions : item.matchedMotions.slice(0, 1);
          clues.push({ label: "動き", text: `${motions.map((id) => optionLabel(situationOptionsForPart(result.regionId), id)).join("・")}に関わる` });
        }
        if (result.regionId === "thigh" && item.muscleId === "thigh_adductors" &&
          item.matchedMotions?.includes("hip_extend")) {
          clues.push({ label: "範囲", text: "内転筋群の一部（大内転筋を含む）が脚を後ろへ動かす働きに関係します" });
        }
        return clues;
      }
      const clues = [];
      const locationLabel = optionLabel(painLocationOptionsForPart(result.regionId), result.answers?.painLocation);
      const situationOptions = situationOptionsForPart(result.regionId);
      const movement = item.matchedMotions?.[0];
      const context = item.matchedContexts?.[0];
      const symptom = item.matchedSymptoms?.[0];

      if (item.locationMatched && locationLabel) clues.push({ label: "場所", text: `${locationLabel}と位置が近い` });
      if (movement) clues.push({ label: "動き", text: `${optionLabel(situationOptions, movement)}に関わる` });
      else if (context) clues.push({ label: "場面", text: `${optionLabel(situationOptions, context)}を補助情報に使用` });
      if (symptom) clues.push({ label: "感じ方", text: `「${optionLabel(symptomOptions, symptom)}」という回答` });
      if (!clues.length || !item.locationMatched) clues.unshift({ label: "部位", text: `${result.regionLabel}に関わる候補` });

      return clues.slice(0, 3);
    }

    function muscleVisualData(result, index) {
      const item = result.topMuscles[index] || result.topMuscles[0];
      const visual = muscleVisual(item, result);
      const side = result.answers?.side || "unknown";
      const sideLabel = optionLabel(sideOptions, side) || "左右未選択";
      const painLocationLabel = optionLabel(painLocationOptionsForPart(result.regionId), result.answers?.painLocation) || "詳しい場所は未選択";
      const movements = movementLabels(result);
      const viewLabel = visual.view === "back" ? "背面" : "正面";
      const muscleSource = muscleSourceForView(visual.view);
      return { item, visual, side, sideLabel, painLocationLabel, movements, viewLabel, muscleSource };
    }

    function muscleSourceForView(view) {
      return view === "front"
        ? "/assets/body-guide/body-muscles-front-face-1536.png"
        : "/assets/body-guide/body-muscles-back-1536.png";
    }

    function resultMuscleImageSources(result) {
      return [...new Set((result?.topMuscles || []).map((item, index) => muscleVisualData(result, index).muscleSource))];
    }

    function preloadResultMuscleImages(result) {
      if (!result || typeof result !== "object" || !muscleImageLoader) return null;
      const sources = resultMuscleImageSources(result);
      if (!sources.length) return null;
      if (!resultImagePreloads.has(result)) {
        resultImagePreloads.set(result, muscleImageLoader.loadInOrder(sources));
      }
      return resultImagePreloads.get(result);
    }

    function preloadPotentialResultImages() {
      if (!muscleImageLoader || !state.primaryPart) return null;
      const primaryView = regionVisuals[state.primaryPart]?.view === "back" ? "back" : "front";
      const secondaryView = primaryView === "front" ? "back" : "front";
      return muscleImageLoader.loadInOrder([muscleSourceForView(primaryView), muscleSourceForView(secondaryView)]);
    }

    function revealRenderedMuscleImage() {
      const image = $("#muscleVisualFigure .result-muscle-image");
      if (!image) return;
      const visual = image.closest(".result-muscle-visual");
      let settled = false;
      const reveal = (ready) => {
        if (settled) return;
        settled = true;
        visual?.classList.remove("is-loading");
        visual?.classList.toggle("is-error", !ready);
        image.classList.toggle("is-ready", ready);
      };
      const decode = async () => {
        if (!image.complete || !image.naturalWidth) return;
        try {
          if (typeof image.decode === "function") await image.decode();
          reveal(true);
        } catch {
          reveal(Boolean(image.complete && image.naturalWidth));
        }
      };
      if (image.complete) {
        if (image.naturalWidth) decode();
        else reveal(false);
      } else {
        image.addEventListener("load", decode, { once: true });
        image.addEventListener("error", () => reveal(false), { once: true });
      }
    }

    function renderMuscleFigure(result, index) {
      const { item, visual, side, viewLabel, muscleSource } = muscleVisualData(result, index);
      return `<figure class="muscle-result-figure" id="muscleVisualFigure">
        <div class="result-muscle-visual is-loading" aria-label="${esc(item.name)}の代表的な位置を${viewLabel}の筋肉人体で表示">
          <div class="muscle-image-placeholder" aria-hidden="true"></div>
          <img class="result-muscle-image" src="${muscleSource}" sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1100px) 520px, 600px" width="1024" height="1536" alt="筋肉人体 ${viewLabel}" loading="eager" fetchpriority="high" decoding="async" />
          ${renderMuscleHighlights(visual, side)}
          <span class="result-body-view">${viewLabel}</span>
        </div>
        <figcaption><strong>${esc(item.name)}</strong></figcaption>
      </figure>`;
    }

    function renderMuscleCopy(result, index) {
      const { item, sideLabel, painLocationLabel, movements } = muscleVisualData(result, index);
      const clues = muscleClues(item, result);
      const lead = ["lowback-precision-v1-local-hypothesis", "hip-precision-v1-local-hypothesis",
        "knee-precision-v1-local-hypothesis", "buttock-precision-v1-local-hypothesis",
        "thigh-precision-v1-local-hypothesis", "lowerleg-precision-v1-local-hypothesis",
        "ankle-precision-v1-local-hypothesis"].includes(result.candidateLogicVersion)
        ? item.displayGroup === "Main" ? "選んだ位置と動きが重なる候補です。"
          : item.displayGroup === "Additional" ? "動きから追加で考えられる候補です。"
            : item.displayGroup === "Related" ? "回答との関係は限定的なため、順位を付けずに表示しています。"
            : ["hip-precision-v1-local-hypothesis", "knee-precision-v1-local-hypothesis",
              "ankle-precision-v1-local-hypothesis"].includes(result.candidateLogicVersion)
              ? "伸ばされる方向としての参考です。原因を示すものではありません。"
              : "伸ばされる方向としての参考です。原因筋を示すものではありません。"
        : ["shoulder-precision-v1.1-local-hypothesis", "shoulder-precision-v1.2-local-hypothesis"].includes(result.candidateLogicVersion)
        ? item.isAdditionalCandidate
          ? "選んだ動きから追加で考えられる筋肉です。"
          : "選んだ位置と動きが重なる筋肉です。"
        : `${result.regionLabel}・${sideLabel}の回答から、関連する可能性がある筋肉として表示しています。`;
      return `<div class="muscle-result-copy" role="tabpanel" id="muscleVisualDetail" aria-live="polite">
        <h1 id="resultHeroTitle">${esc(item.name)}</h1>
        <p class="muscle-result-lead">${esc(lead)}</p>
        <dl class="result-quick-facts">
          <div><dt>選んだ部位・左右</dt><dd>${esc(result.regionLabel)}・${esc(sideLabel)}</dd></div>
          <div><dt>気になる詳しい場所</dt><dd>${esc(painLocationLabel)}</dd></div>
          <div><dt>気になった動作</dt><dd>${esc(compactAnswerList(movements))}</dd></div>
        </dl>
        <div class="muscle-match-story">
          <h2 class="muscle-match-heading">候補にした理由</h2>
          <div class="muscle-clue-list" aria-label="この筋肉を候補にした手がかり">
            ${clues.map((clue) => `<div><span>${esc(clue.label)}</span><strong>${esc(clue.text)}</strong></div>`).join("")}
          </div>
        </div>
      </div>`;
    }

    function renderCandidateRanking(result) {
      if (isHipPrecisionV1Result(result) || isKneePrecisionV1Result(result) ||
        isButtockPrecisionV1Result(result) || isThighPrecisionV1Result(result) ||
        isLowerlegPrecisionV1Result(result) || isAnklePrecisionV1Result(result)) {
        const hasRelatedPresentation = isThighPrecisionV1Result(result) ||
          isLowerlegPrecisionV1Result(result) || isAnklePrecisionV1Result(result);
        const candidateButton = (item, index) => `<button type="button" role="tab" class="result-candidate-card ${index === 0 ? "active" : ""} ${item.displayGroup !== "Main" ? "is-additional" : ""} ${hasRelatedPresentation && item.displayGroup === "Related" ? "is-related" : ""} is-unranked" data-muscle-candidate="${index}" aria-selected="${index === 0}" aria-controls="muscleVisualFigure muscleVisualDetail" aria-label="${esc(item.name)}を人体で見る"><div><strong>${esc(item.name)}</strong>${hasRelatedPresentation && item.displayGroup === "Related" ? "<small>順位なし・参考</small>" : ""}</div></button>`;
        const buttons = (predicate) => result.topMuscles.map((item, index) =>
          predicate(item) ? candidateButton(item, index) : "").join("");
        const main = buttons((item) => item.displayGroup === "Main");
        const additional = buttons((item) => item.displayGroup === "Additional" && !item.folded);
        const folded = buttons((item) => item.displayGroup === "Additional" && item.folded);
        const related = buttons((item) => item.displayGroup === "Related");
        const reference = buttons((item) => item.displayGroup === "Reference");
        const foldedCount = result.topMuscles.filter((item) => item.displayGroup === "Additional" && item.folded).length;
        const relatedItems = result.topMuscles.filter((item) => item.displayGroup === "Related");
        const relatedCount = relatedItems.length;
        const relatedNote = "今回の回答との関係は限定的なため、順位を付けず参考として表示しています。";
        const relatedSection = !related ? "" : !hasRelatedPresentation
          ? `<details class="hip-candidate-more"><summary>その他の関連候補（${relatedCount}）</summary><div class="hip-candidate-more-list">${related}</div></details>`
          : relatedCount <= 2
            ? `<p class="result-candidate-group-label is-additional-heading thigh-related-title" role="presentation">参考として関連する筋肉</p><p class="thigh-related-note">${relatedNote}</p>${related}`
            : `<details class="hip-candidate-more thigh-related-more"><summary><span>参考として関連する筋肉（${relatedCount}筋）</span><small>${esc(relatedItems.slice(0, 2).map((item) => item.name).join("・"))} ほか${relatedCount - 2}筋</small></summary><p class="thigh-related-note">${relatedNote}</p><div class="hip-candidate-more-list">${related}</div></details>`;
        return `<aside class="result-muscle-ranking is-shoulder-v11 is-hip-precision ${hasRelatedPresentation ? "is-thigh-precision" : ""}" aria-labelledby="resultCandidatesTitle">
          <div class="result-section-head"><h2 id="resultCandidatesTitle">${esc(result.regionLabel)}の筋肉候補</h2></div>
          <div class="result-candidate-list" role="tablist" aria-label="${esc(result.regionLabel)}の筋肉候補">
            ${main ? `<p class="result-candidate-group-label" role="presentation">選んだ位置と動きが重なる候補</p>${main}` : ""}
            ${additional ? `<p class="result-candidate-group-label is-additional-heading" role="presentation">動きから追加で考えられる候補</p>${additional}` : ""}
            ${folded ? `<details class="hip-candidate-more"><summary>その他の関連候補（${foldedCount}）</summary><div class="hip-candidate-more-list">${folded}</div></details>` : ""}
            ${relatedSection}
            ${reference ? `<p class="result-candidate-group-label is-additional-heading" role="presentation">伸ばされる方向としての参考</p>${reference}` : ""}
          </div>
        </aside>`;
      }
      if (result.candidateLogicVersion === "lowback-precision-v1-local-hypothesis") {
        const candidateButton = (item, index) => `<button type="button" role="tab" class="result-candidate-card ${index === 0 ? "active" : ""} ${item.displayGroup === "Additional" ? "is-additional" : ""} is-unranked" data-muscle-candidate="${index}" aria-selected="${index === 0}" aria-controls="muscleVisualFigure muscleVisualDetail" aria-label="${esc(item.name)}を人体で見る"><div><strong>${esc(item.name)}</strong></div></button>`;
        const group = (kind, title) => {
          const buttons = result.topMuscles.map((item, index) => item.displayGroup === kind ? candidateButton(item, index) : "").join("");
          return buttons ? `<p class="result-candidate-group-label ${kind !== "Main" ? "is-additional-heading" : ""}" role="presentation">${title}</p>${buttons}` : "";
        };
        return `<aside class="result-muscle-ranking is-shoulder-v11" aria-labelledby="resultCandidatesTitle">
          <div class="result-section-head"><h2 id="resultCandidatesTitle">腰の筋肉候補</h2></div>
          <div class="result-candidate-list" role="tablist" aria-label="腰の筋肉候補">
            ${group("Main", "選んだ位置と動きが重なる候補")}
            ${group("Additional", "動きから追加で考えられる候補")}
            ${group("Reference", "伸ばされる方向としての参考")}
          </div>
        </aside>`;
      }
      if (["shoulder-precision-v1.1-local-hypothesis", "shoulder-precision-v1.2-local-hypothesis"].includes(result.candidateLogicVersion)) {
        const isV12 = result.candidateLogicVersion === "shoulder-precision-v1.2-local-hypothesis";
        const suppressRank = isV12 && ["cross_group_equal_evidence", "cross_group_additional_stronger"].includes(result.candidateStatusReason);
        const candidateButton = (item, index) => {
          const unranked = item.isAdditionalCandidate || suppressRank;
          const name = unranked ? `${item.isAdditionalCandidate ? "追加" : "位置と動きが重なる"}候補 ${item.name}` : `${item.tiedAtRank ? "同率" : "順位"}${item.rank} ${item.name}`;
          return `<button type="button" role="tab" class="result-candidate-card ${index === 0 ? "active" : ""} ${item.isAdditionalCandidate ? "is-additional" : ""} ${unranked ? "is-unranked" : ""}" data-muscle-candidate="${index}" aria-selected="${index === 0}" aria-controls="muscleVisualFigure muscleVisualDetail" aria-label="${esc(name)}">${unranked ? "" : `<span>${item.tiedAtRank ? `=${item.rank}` : item.rank}</span>`}<div><strong>${esc(item.name)}</strong></div></button>`;
        };
        const mainButtons = result.topMuscles.map((item, index) => item.isAdditionalCandidate ? "" : candidateButton(item, index)).join("");
        const additionalButtons = result.topMuscles.map((item, index) => item.isAdditionalCandidate ? candidateButton(item, index) : "").join("");
        return `<aside class="result-muscle-ranking is-shoulder-v11" aria-labelledby="resultCandidatesTitle">
          <div class="result-section-head"><h2 id="resultCandidatesTitle">${esc(result.regionLabel)}の筋肉候補</h2></div>
          <div class="result-candidate-list" role="tablist" aria-label="${esc(result.regionLabel)}の筋肉候補">
            <p class="result-candidate-group-label" role="presentation">選んだ位置と動きが重なる候補</p>
            ${mainButtons}
            ${additionalButtons ? `<p class="result-candidate-group-label is-additional-heading" role="presentation">動きから追加で考えられる候補</p>${additionalButtons}` : ""}
          </div>
          ${isV12 && additionalButtons && !suppressRank ? '<p class="result-candidate-note">順位は選んだ位置と動きの重なりをもとに整理しています。</p>' : ""}
        </aside>`;
      }
      const unclearNote = result.answers?.situations?.includes(UNCLEAR_SITUATION)
        ? "動きが不明なため候補を広めに表示しています。"
        : "";
      const locationNote = result.answers?.painLocation && result.answers.painLocation !== UNCLEAR_LOCATION
        ? ""
        : "場所は順位に反映していません。";
      const notes = [locationNote, unclearNote].filter(Boolean);
      if (result.candidateStatus === "insufficient") notes.unshift("位置と方向付き動作だけでは絞り込み不足です。同率候補として表示しています。");
      return `<aside class="result-muscle-ranking" aria-labelledby="resultCandidatesTitle">
        <div class="result-section-head"><h2 id="resultCandidatesTitle">${esc(result.regionLabel)}の筋肉候補</h2></div>
        <div class="result-candidate-list" role="tablist" aria-label="${esc(result.regionLabel)}の筋肉候補ランキング">
          ${result.topMuscles.map((item, index) => `<button type="button" role="tab" class="result-candidate-card ${index === 0 ? "active" : ""} ${item.isAdditionalCandidate ? "is-additional" : ""}" data-muscle-candidate="${index}" aria-selected="${index === 0}" aria-controls="muscleVisualFigure muscleVisualDetail"><span>${item.tiedAtRank ? `=${item.rank}` : item.rank || index + 1}</span><div><strong>${esc(item.name)}</strong>${item.isAdditionalCandidate ? "<small>追加候補</small>" : ""}</div></button>`).join("")}
        </div>
        ${notes.length ? `<p class="result-candidate-note">${notes.map((note) => `<span>${note}</span>`).join("")}</p>` : ""}
      </aside>`;
    }

    function renderTopTieNotice(result) {
      if (!["neck-precision-v2.2-local-hypothesis", "shoulder-precision-v1-local-hypothesis", "shoulder-precision-v1.1-local-hypothesis", "shoulder-precision-v1.2-local-hypothesis"].includes(result.candidateLogicVersion) || result.candidateStatus !== "tied" || result.candidateStatusReason === "cross_group_equal_evidence") return "";
      const rankedCandidates = result.topMuscles.filter((item) => Number.isFinite(item.rank) && (!["shoulder-precision-v1.1-local-hypothesis", "shoulder-precision-v1.2-local-hypothesis"].includes(result.candidateLogicVersion) || item.displayGroup === "Main"));
      const topRank = rankedCandidates.length ? Math.min(...rankedCandidates.map((item) => item.rank)) : 0;
      const tiedCount = rankedCandidates.filter((item) => item.rank === topRank && item.tiedAtRank).length;
      if (tiedCount < 2) return "";
      return `<div class="result-tie-notice" role="status" aria-label="同率候補の案内">
        <span class="result-tie-symbol" aria-hidden="true">=</span>
        <p><strong>同じ順位の候補が${tiedCount}つあります</strong><span>候補を切り替えて確認できます</span></p>
      </div>`;
    }

    function renderShoulderBoundaryNotice(result) {
      if (result.candidateLogicVersion !== "shoulder-precision-v1.2-local-hypothesis") return "";
      const message = {
        cross_group_equal_evidence: ["位置と動きから複数の候補が残っています", "候補を切り替えて確認できます。"],
        cross_group_additional_stronger: ["順位をまだ決められません", "位置と動きの手がかりが、複数の候補に分かれています。"]
      }[result.candidateStatusReason];
      if (!message) return "";
      return `<div class="result-tie-notice" role="status"><span class="result-tie-symbol" aria-hidden="true">${result.candidateStatus === "tied" ? "=" : "?"}</span><p><strong>${message[0]}</strong><span>${message[1]}</span></p></div>`;
    }

    function renderLowbackPrecisionNotice(result) {
      if (result.candidateLogicVersion !== "lowback-precision-v1-local-hypothesis") return "";
      const message = {
        ranked_unique_main: "位置と動きの手がかりが最もまとまっている候補があります",
        main_tie: "複数の候補が並んでいます",
        cross_group_equal: "同じ程度の手がかりが複数の候補にあります",
        cross_group_incomparable: "異なる動きの手がかりが複数の候補に分かれています",
        cross_group_additional_dominates: "位置と動きの手がかりだけでは順位をまだ決められません",
        no_main_evidence: result.topMuscles.length ? "動きに関係する候補はありますが、位置との重なりだけでは順位を決められません" : "今回の回答だけでは候補を整理できません",
        location_unclear: "場所がはっきりしないため順位を決めていません",
        movement_unclear: "動きがはっきりしないため順位を決めていません",
        stretch_only_reference: "伸ばされる方向として参考になる筋があります"
      }[result.candidateStatusReason] || "回答をもとに筋肉候補を整理しました";
      const next = result.topMuscles.length > 1 ? "候補を切り替えて人体で確認できます。"
        : result.topMuscles.length === 1 ? "人体で位置を確認できます。" : "回答を見直すこともできます。";
      return `<div class="result-tie-notice lowback-precision-notice" role="status"><p><strong>${esc(message)}</strong><span>${next}原因や確率を示すものではありません。</span></p></div>`;
    }

    function renderHipPrecisionNotice(result) {
      if (!isHipPrecisionV1Result(result)) return "";
      const message = {
        ranked_unique_main: "現在の回答では、位置と動きの手がかりが1つの候補にまとまっています",
        main_tie: "複数の候補が並んでいます",
        cross_group_equal: "同じ程度の手がかりが複数の候補にあります",
        cross_group_incomparable: "異なる動きの手がかりが、複数の候補に分かれています",
        cross_group_additional_dominates: "位置と動きの手がかりだけでは、順位を決められません",
        no_main_evidence: "位置と動きが重なる候補を十分に絞れません",
        location_unclear: "場所がはっきりしないため、候補を十分に絞れません",
        movement_unclear: "動きがはっきりしないため、候補を十分に絞れません",
        stretch_only_reference: "伸ばされる方向として参考になる候補があります"
      }[result.candidateStatusReason] || "回答をもとに候補を整理しました";
      const next = result.topMuscles.length > 1 ? "候補を切り替えて確認できます。" : "";
      return `<div class="result-tie-notice hip-precision-notice" role="status"><p><strong>${esc(message)}</strong>${next ? `<span>${next}</span>` : ""}</p></div>`;
    }

    function renderKneePrecisionNotice(result) {
      if (!isKneePrecisionV1Result(result)) return "";
      const message = {
        ranked_unique_main: "現在の回答では、位置と動きの手がかりが1つの候補にまとまっています",
        main_tie: "異なる動きの手がかりが複数の候補に分かれています",
        weak_unique_main: "動きの手がかりだけでは、順位をまだ決められません",
        cross_group_additional_challenge: "位置と動きの手がかりだけでは、順位をまだ決められません",
        no_main_evidence: result.topMuscles.some((item) => item.displayGroup === "Additional")
          ? "位置と動きが重なる候補を絞れません。動きから関連する候補を表示しています"
          : "今回の回答だけでは候補を十分に絞れません",
        location_unclear: "場所がはっきりしないため、候補を十分に絞れません",
        movement_unclear: "動きがはっきりしないため、候補を十分に絞れません",
        stretch_only_reference: "伸ばされる方向として参考になる候補があります"
      }[result.candidateStatusReason] || "回答をもとに候補を整理しました";
      const next = result.topMuscles.length > 1 ? "候補を切り替えて確認できます。" : "";
      return `<div class="result-tie-notice hip-precision-notice" role="status"><p><strong>${esc(message)}</strong>${next ? `<span>${next}</span>` : ""}</p></div>`;
    }

    function renderButtockPrecisionNotice(result) {
      if (!isButtockPrecisionV1Result(result)) return "";
      const message = {
        unique_trusted_main: "位置と動きが重なる候補の中では、1つにまとまっています",
        main_tie: "位置と動きが重なる候補に同率のものがあります",
        cross_group_equal: "複数の候補に同じ手がかりがあります",
        cross_group_incomparable: "異なる動きの手がかりが複数の候補に分かれています",
        cross_group_review: "複数の候補が残り、順位は決めていません",
        additional_dominates_main: "位置と動きの手がかりだけでは順位を決められません",
        weak_main_only: "位置と重なる候補はありますが、動きの手がかりだけでは順位を決められません",
        additional_without_main: "今回の回答では、位置と動きが重なる候補は残りませんでした。動きに関係する候補を表示しています",
        review_only: "今回の回答だけでは候補を十分に絞れません",
        no_trusted_main: "今回の回答だけでは候補を十分に絞れません",
        location_unclear: "場所がはっきりしないため候補を十分に絞れません",
        movement_unclear: "動きがはっきりしないため候補を十分に絞れません"
      }[result.candidateStatusReason] || "回答をもとに候補を整理しました";
      const next = result.topMuscles.length > 1 ? "候補を切り替えて確認できます。" : "";
      return `<div class="result-tie-notice hip-precision-notice" role="status"><p><strong>${esc(message)}</strong>${next ? `<span>${next}</span>` : ""}</p></div>`;
    }

    function renderThighPrecisionNotice(result) {
      if (!isThighPrecisionV1Result(result)) return "";
      const message = {
        main_evidence: "位置と動きが重なる候補の中では、1つにまとまっています",
        cross_group_guard: "複数の候補に異なる動きの手がかりがあります",
        additional_dominates_main: "位置と動きの手がかりだけでは、順位を決められません",
        no_main_location_support: "位置と動きが重なる候補はありません。動きから関連する候補を表示しています",
        no_trusted_evidence: "今回の回答だけでは候補を十分に絞れません",
        location_unclear: "場所がはっきりしないため候補を十分に絞れません",
        movement_unclear: "動きがはっきりしないため候補を十分に絞れません"
      }[result.candidateStatusReason] || "回答をもとに候補を整理しました";
      const next = result.topMuscles.length > 1 ? "候補を切り替えて確認できます。" : "";
      return `<div class="result-tie-notice hip-precision-notice" role="status"><p><strong>${esc(message)}</strong>${next ? `<span>${next}</span>` : ""}</p></div>`;
    }

    function renderLowerlegPrecisionNotice(result) {
      if (!isLowerlegPrecisionV1Result(result)) return "";
      const message = {
        main_evidence: result.candidateStatus === "tied"
          ? "位置と動きが重なる複数の候補が並んでいます"
          : "位置と動きが重なる候補が1つにまとまっています",
        cross_group_guard: "複数の候補に異なる動きの手がかりがあります",
        additional_dominates_main: "位置と動きの手がかりだけでは順位を決められません",
        no_main_location_support: "位置と動きが重なる候補はありません。動きから関連する候補を表示しています",
        no_trusted_evidence: "今回の回答だけでは候補を十分に絞れません",
        location_unclear: "場所がはっきりしないため候補を十分に絞れません",
        movement_unclear: "動きがはっきりしないため候補を十分に絞れません"
      }[result.candidateStatusReason] || "回答をもとに候補を整理しました";
      const next = result.topMuscles.length > 1 ? "候補を切り替えて確認できます。" : "";
      return `<div class="result-tie-notice hip-precision-notice" role="status"><p><strong>${esc(message)}</strong>${next ? `<span>${next}</span>` : ""}</p></div>`;
    }

    function renderAnklePrecisionNotice(result) {
      if (!isAnklePrecisionV1Result(result)) return "";
      const message = {
        main_evidence: result.candidateStatus === "tied"
          ? "位置と動きが重なる複数の候補が並んでいます"
          : "位置と動きが重なる候補が1つにまとまっています",
        cross_group_guard: "複数の候補に異なる動きの手がかりがあります",
        cross_group_uncertain: "動きの手がかりだけでは順位を決められません",
        additional_dominates_main: "位置と動きの手がかりだけでは順位を決められません",
        no_main_location_support: "位置と動きが重なる候補はありません。動きから関連する候補を表示しています",
        no_trusted_evidence: "今回の回答だけでは候補を十分に絞れません",
        location_unclear: "場所がはっきりしないため候補を十分に絞れません",
        movement_unclear: "動きがはっきりしないため候補を十分に絞れません"
      }[result.candidateStatusReason] || "回答をもとに候補を整理しました";
      const next = result.topMuscles.length > 1 ? "候補を切り替えて確認できます。" : "";
      return `<div class="result-tie-notice hip-precision-notice" role="status"><p><strong>${esc(message)}</strong>${next ? `<span>${next}</span>` : ""}</p></div>`;
    }

    function renderBodyDiscovery(result) {
      if (!result.topMuscles.length) {
        const location = optionLabel(painLocationOptionsForPart(result.regionId), result.answers?.painLocation) || "未選択";
        const movements = movementLabels(result);
        const stretchOnly = result.candidateStatus === "stretch_only_reference";
        const referenceMuscles = stretchOnly
          ? [...new Set(result.candidateReferenceMuscles || [])]
          : [];
        const additionalMuscles = result.candidateLogicVersion === "shoulder-precision-v1-local-hypothesis"
          || result.candidateLogicVersion === "shoulder-precision-v1.1-local-hypothesis"
          || result.candidateLogicVersion === "shoulder-precision-v1.2-local-hypothesis"
          ? [...new Set(result.candidateAdditionalMuscles || [])]
          : [];
        const v11Reason = ["shoulder-precision-v1.1-local-hypothesis", "shoulder-precision-v1.2-local-hypothesis"].includes(result.candidateLogicVersion) ? {
          location_unclear: "場所がはっきりしないため、候補を十分に絞れませんでした。",
          movement_unclear: "気になる動きがはっきりしないため、候補を十分に絞れませんでした。",
          no_main_candidate: `選んだ位置と動きが重なる候補を十分に絞れませんでした。${additionalMuscles.length ? "動きから追加で考えられる筋肉を参考として表示します。" : ""}`,
          no_candidate: "今回の回答だけでは、筋肉候補を十分に整理できませんでした。",
          main_not_trusted: "今回の回答だけでは、筋肉候補の順位を十分に整理できませんでした。"
        }[result.candidateInsufficientReason] : "";
        return `<section class="result-muscle-stage" aria-labelledby="resultMuscleStageTitle">
          <div class="result-muscle-stage-head"><h2 id="resultMuscleStageTitle">${esc(result.regionLabel)}のセルフチェック結果</h2></div>
          ${renderLowbackPrecisionNotice(result)}
          ${renderHipPrecisionNotice(result)}
          ${renderKneePrecisionNotice(result)}
          ${renderButtockPrecisionNotice(result)}
          ${renderThighPrecisionNotice(result)}
          ${renderLowerlegPrecisionNotice(result)}
          ${renderAnklePrecisionNotice(result)}
          <div class="result-muscle-explorer muscle-result-hero is-insufficient">
            <div class="muscle-result-copy" aria-live="polite">
              <h1>${stretchOnly ? "筋肉候補の順位をまだ決められません" : "候補を十分に絞れません"}</h1>
              <p class="muscle-result-lead">${esc(stretchOnly ? "選んだ動きで伸ばされる方向として関係する筋肉はありますが、候補順位を決めるには情報が足りません。" : v11Reason || "詳しい場所と、方向の分かる動きを選ぶと筋肉候補を整理できます。")}</p>
              ${referenceMuscles.length ? `<div class="stretch-reference-list" aria-label="伸ばされる方向として関係する筋肉">${referenceMuscles.map((name) => `<span>${esc(name)}</span>`).join("")}</div>` : ""}
              ${additionalMuscles.length ? `<div class="stretch-reference-list" aria-label="動きからの順位なし参考候補">${additionalMuscles.map((name) => `<span>${esc(name)}</span>`).join("")}</div>` : ""}
              <dl class="result-quick-facts">
                <div><dt>気になる詳しい場所</dt><dd>${esc(location)}</dd></div>
                <div><dt>気になった動作</dt><dd>${esc(compactAnswerList(movements))}</dd></div>
              </dl>
            </div>
          </div>
        </section>`;
      }
      return `<section class="result-muscle-stage" aria-labelledby="resultMuscleStageTitle">
        <div class="result-muscle-stage-head"><h2 id="resultMuscleStageTitle">${esc(result.regionLabel)}のセルフチェック結果</h2></div>
        ${renderLowbackPrecisionNotice(result)}
        ${renderHipPrecisionNotice(result)}
        ${renderKneePrecisionNotice(result)}
        ${renderButtockPrecisionNotice(result)}
        ${renderThighPrecisionNotice(result)}
        ${renderLowerlegPrecisionNotice(result)}
        ${renderAnklePrecisionNotice(result)}
        ${renderShoulderBoundaryNotice(result)}
        ${renderTopTieNotice(result)}
        <div class="result-muscle-explorer muscle-result-hero">
          ${renderMuscleFigure(result, 0)}
          ${renderCandidateRanking(result)}
          ${renderMuscleCopy(result, 0)}
        </div>
      </section>`;
    }

    function bindMuscleExplorer() {
      $$('[data-muscle-candidate]').forEach((button) => button.addEventListener("click", async () => {
        if (!state.latest) return;
        const index = Number(button.dataset.muscleCandidate || 0);
        const requestId = ++muscleSelectionRequest;
        const { muscleSource } = muscleVisualData(state.latest, index);
        if (muscleImageLoader) await muscleImageLoader.load(muscleSource, { priority: "high" });
        if (requestId !== muscleSelectionRequest) return;
        const scrollPosition = window.scrollY;
        $$('[data-muscle-candidate]').forEach((candidate) => {
          const active = candidate === button;
          candidate.classList.toggle("active", active);
          candidate.setAttribute("aria-selected", String(active));
        });
        const figure = $("#muscleVisualFigure");
        if (figure) figure.outerHTML = renderMuscleFigure(state.latest, index);
        const detail = $("#muscleVisualDetail");
        if (detail) detail.outerHTML = renderMuscleCopy(state.latest, index);
        revealRenderedMuscleImage();
        window.scrollTo({ top: scrollPosition, behavior: "auto" });
      }));
    }

    function aiHandoffUrl(result) {
      const configuredSiteUrl = String(window.__HEALTH_CHECK_SITE_URL__ || "").trim();
      const siteUrl = /^https?:\/\//i.test(configuredSiteUrl)
        ? configuredSiteUrl.replace(/\/+$/, "")
        : location.origin;
      const url = new URL(`${siteUrl}/body-check`);
      url.searchParams.set("part", result.regionId);
      url.searchParams.set("utm_source", "ai_handoff");
      url.searchParams.set("utm_medium", "copied_result");
      url.searchParams.set("utm_campaign", "body_check");
      return url.toString();
    }

    function aiAdviceProfile(result) {
      const answers = result.answers || {};
      const profile = aiDeepDiveByPart[result.regionId] || aiDeepDiveByPart.back;
      const needsSafetyFirst = (answers.symptoms || []).some((id) => id === "numbness" || id === "weakness") || answers.spread === "limb";
      return { profile, needsSafetyFirst };
    }

    function isNeckPrecisionV22Result(result) {
      return result?.regionId === "neck"
        && result.candidateLogicVersion === "neck-precision-v2.2-local-hypothesis";
    }

    function isShoulderPrecisionV12Result(result) {
      return result?.regionId === "shoulder"
        && result.candidateLogicVersion === "shoulder-precision-v1.2-local-hypothesis";
    }

    function isLowbackPrecisionV1Result(result) {
      return result?.regionId === "lowback"
        && result.candidateLogicVersion === "lowback-precision-v1-local-hypothesis";
    }

    function isHipPrecisionV1Result(result) {
      return result?.regionId === "hip"
        && result.candidateLogicVersion === "hip-precision-v1-local-hypothesis";
    }

    function isKneePrecisionV1Result(result) {
      return result?.regionId === "knee"
        && result.candidateLogicVersion === "knee-precision-v1-local-hypothesis";
    }

    function isButtockPrecisionV1Result(result) {
      return result?.regionId === "buttock"
        && result.candidateLogicVersion === "buttock-precision-v1-local-hypothesis";
    }

    function isThighPrecisionV1Result(result) {
      return result?.regionId === "thigh"
        && result.candidateLogicVersion === "thigh-precision-v1-local-hypothesis";
    }

    function isLowerlegPrecisionV1Result(result) {
      return result?.regionId === "lowerleg"
        && result.candidateLogicVersion === "lowerleg-precision-v1-local-hypothesis";
    }

    function isAnklePrecisionV1Result(result) {
      return result?.regionId === "ankle"
        && result.candidateLogicVersion === "ankle-precision-v1-local-hypothesis";
    }

    function neckPrecisionV22StatusText(result) {
      const candidates = result.topMuscles || [];
      if (result.candidateStatus === "tied") {
        const topRank = Math.min(...candidates.map((item) => item.rank).filter(Number.isFinite));
        const tiedCount = candidates.filter((item) => item.rank === topRank).length;
        return `同じ順位の候補が${tiedCount}つあります`;
      }
      if (result.candidateStatus === "insufficient") return "候補を十分に絞れませんでした";
      if (result.candidateStatus === "stretch_only_reference") return "筋肉候補の順位をまだ決められません";
      return "候補順位あり";
    }

    function neckPrecisionV22CandidateBlock(result, context) {
      const candidates = result.topMuscles || [];
      if (result.candidateStatus === "insufficient") {
        const reason = {
          location_unclear: "詳しい場所が未確定",
          movement_unclear: "方向の分かる動作が未確定",
          no_valid_directional_movement: "方向の分かる動作が未選択",
          no_eligible_candidate: "選択した位置と動作の組み合わせでは、順位づけに必要な候補情報がそろわない",
          legacy_location_not_supported: "現在の詳細位置区分へ置き換えられない旧回答"
        }[context.insufficientReason] || "位置または方向付き動作の情報が不足";
        return [
          "候補筋：なし",
          `情報不足の理由：${reason}${context.insufficientReason ? `（内部コード：${context.insufficientReason}）` : ""}`
        ];
      }

      if (result.candidateStatus === "stretch_only_reference") {
        const references = context.referenceCandidates.length
          ? context.referenceCandidates
          : (result.candidateReferenceMuscles || []).map((name) => ({ name, positiveEvidence: [] }));
        return [
          "参考候補（選んだ動きで伸ばされる方向に関係し、通常の候補・順位とは別）：",
          ...(references.length ? references.map((item) => `- ${item.name}`) : ["- なし"])
        ];
      }

      const topRank = Math.min(...candidates.map((item) => item.rank).filter(Number.isFinite));
      const topCandidates = candidates.filter((item) => item.rank === topRank);
      const otherCandidates = candidates.filter((item) => item.rank !== topRank);
      const heading = result.candidateStatus === "tied" ? "同率候補：" : "主な候補：";
      const rankedLine = (item) => `${item.tiedAtRank ? `=${item.rank}` : `${item.rank}.`} ${item.name}`;
      return [
        heading,
        ...topCandidates.map((item) => `- ${rankedLine(item)}`),
        ...(otherCandidates.length ? ["その他の候補：", ...otherCandidates.map((item) => `- ${rankedLine(item)}`)] : [])
      ];
    }

    function neckPrecisionV22ReasonBlocks(result, context) {
      if (!["ranked", "tied", "stretch_only_reference"].includes(result.candidateStatus)) return [];
      const location = optionLabel(painLocationOptionsForPart(result.regionId), result.answers?.painLocation) || "未選択";
      const details = result.candidateStatus === "stretch_only_reference"
        ? context.referenceCandidates
        : context.candidates;
      const byId = new Map(details.map((item) => [item.muscleId, item]));
      const movementLabel = (id) => optionLabel(situationOptionsForPart(result.regionId), id);
      const displayItems = result.candidateStatus === "stretch_only_reference"
        ? context.referenceCandidates
        : result.topMuscles;
      return displayItems.flatMap((item) => {
        const detail = byId.get(item.muscleId) || {};
        const group = result.candidateStatus === "stretch_only_reference"
          ? "Reference（伸ばされる方向としての参考）"
          : item.isAdditionalCandidate
            ? "Additional（動きから追加で考えられる候補）"
            : "Main（選んだ位置と動きが重なる候補）";
        const locationRelation = detail.locationEligibility
          ? `${location}（内部区分：${detail.locationEligibility} location）`
          : location;
        const evidence = (detail.positiveEvidence || []).map(({ motion, relation }) => `  - ${movementLabel(motion)}（内部relation：${relation}）`);
        return [
          `${item.name}`,
          `- 分類：${group}`,
          `- 選択位置：${locationRelation}`,
          "- 選択動作との関係：",
          ...(evidence.length ? evidence : ["  - 該当情報なし"])
        ];
      });
    }

    function aiCandidateExplanationRequestLines() {
      return [
        "■AIへのお願い",
        "Health Check Labは原因筋や病気を診断していません。上記の固定結果にある筋肉だけを、初心者にも分かる日本語で説明してください。",
        "Mainは位置と動きの手がかりが重なった候補、Additionalは別の手がかりから残った追加候補です。医学的な確率順位ではありません。その他の関連候補と参考候補も、それぞれの区分を保ってください。",
        "候補筋の追加・削除・入れ替え、独自の順位付け、Main/Additionalや結果状態の変更は禁止です。同率や順位保留を推測で埋めないでください。候補がない場合も筋肉を補完しないでください。",
        "原因筋・損傷・病名を断定せず、実際に傷めていると決めつけないでください。存在しない点数や確率を作らず、内部コードや判定用語を一般向け回答に出さないでください。",
        "追加質問はせず、各候補筋について次の3項目を説明してください。今回の結果だけでは分からないことも短く添えてください。",
        "1. 筋肉の説明：身体のどこにあり、主に何をし、どんな日常動作で使われるか。",
        "2. 負担がかかったり傷めたりした場合に起こることがある症状：痛みや違和感が出ることのある場所、気になりやすい動き、日常生活で困ることの例。今回その状態だとは断定しないでください。",
        "3. 今回の回答との関係：選んだ詳しい場所・左右・動きと、その筋肉の位置や働きがどう関わりうるか。結びつけられない点は無理に説明しないでください。",
        "参考候補は通常の候補と区別して説明してください。"
      ];
    }

    function neckPrecisionV22AiHandoffText(result) {
      const context = aiHandoffContexts.get(result) || {
        selectedSituations: [...(result.answers?.situations || [])],
        candidates: [],
        referenceCandidates: [],
        insufficientReason: "",
        adaptive: null
      };
      const side = optionLabel(sideOptions, result.answers?.side) || "未選択";
      const painLocation = optionLabel(painLocationOptionsForPart(result.regionId), result.answers?.painLocation) || "未選択";
      const selectedMovements = context.selectedSituations
        .map((id) => optionLabel(situationOptionsForPart(result.regionId), id))
        .filter(Boolean);
      const adaptive = context.adaptive;
      const adaptiveLines = adaptive
        ? [
            "",
            "■追加確認",
            `質問：${adaptive.question}`,
            `回答：${adaptive.answer === "yes" ? "YES" : "NO"}`,
            adaptive.evidenceAdded
              ? `扱い：YES回答を「${optionLabel(situationOptionsForPart(result.regionId), adaptive.movement)}」のmovement evidenceとして結果へ反映`
              : "扱い：NO回答は他の筋肉を支持する証拠にせず、追加質問前の候補関係を維持"
          ]
        : [];
      const statusInstruction = {
        ranked: "表示された候補順位を維持し、原因筋・診断・確定とは表現しないでください。",
        tied: "同率候補のどれかを独自に1位へ変更せず、それぞれの位置・働き・今回の回答との関係を比較してください。",
        insufficient: "情報不足のため特定の筋肉を推測で上位にせず、今回の回答だけでは候補を絞りにくい理由を説明してください。",
        stretch_only_reference: "列挙した筋肉を原因筋として扱わず、選択した動作で伸ばされる方向に関係する参考情報として説明してください。"
      }[result.candidateStatus] || "表示された候補だけを説明してください。";
      const reasonBlocks = neckPrecisionV22ReasonBlocks(result, context);

      return [
        "【Health Check Lab｜セルフチェック結果】",
        "Health Check Labは、身体の位置と動きから、関連する可能性のある筋肉候補を固定質問・固定ロジックで整理する健康情報サービスです。",
        `結果ページ：${aiHandoffUrl(result)}`,
        "※これは医療診断ではありません。",
        "",
        "■今回の回答",
        `対象部位：${result.regionLabel}`,
        `詳しい場所：${painLocation}`,
        `左右：${side}`,
        "気になる動き：",
        ...(selectedMovements.length ? selectedMovements.map((item) => `- ${item}`) : ["- 未選択"]),
        ...adaptiveLines,
        "",
        "■結果",
        `result status：${result.candidateStatus}`,
        `結果状態：${neckPrecisionV22StatusText(result)}`,
        ...neckPrecisionV22CandidateBlock(result, context),
        ...(reasonBlocks.length
          ? ["", result.candidateStatus === "stretch_only_reference" ? "■伸ばされる方向としてのコード上の情報" : "■候補になったコード上の理由", ...reasonBlocks]
          : []),
        "",
        ...aiCandidateExplanationRequestLines(),
        statusInstruction,
        "筋肉の硬さ、損傷、病名、緊急性は今回の情報だけでは確認できません。"
      ].join("\n");
    }

    function shoulderPrecisionV12AiHandoffText(result) {
      const answers = result.answers || {};
      const context = aiHandoffContexts.get(result);
      const fixed = context?.shoulderPrecision || ShoulderPrecisionV12.rank(answers);
      const movementLabels = {
        front_raise: "腕を前から上げる",
        side_raise: "腕を横から上げる",
        external_rotation: "肘を体の横につけて前腕を外へ開く",
        internal_rotation: "肘を体の横につけて前腕を内側へ動かす",
        shoulder_shrug: "腕を上げず肩だけをすくめる",
        movement_unclear: "特定の動きが分からない"
      };
      const selected = (context?.selectedSituations || answers.situations || [])
        .map((id) => movementLabels[id]).filter(Boolean);
      const location = optionLabel(painLocationOptionsForPart("shoulder"), answers.painLocation) || "未選択";
      const side = optionLabel(sideOptions, answers.side) || "未選択";
      const main = fixed.mainCandidates || [];
      const additionalDetails = fixed.additionalCandidateDetails || [];
      const muscleNames = new Map(ShoulderPrecisionV12.MASTER.map((item) => [item.muscleId, item.displayName]));
      const additional = [...new Set(fixed.additionalCandidates || [])].map((id) =>
        additionalDetails.find((item) => item.muscleId === id) || {
          muscleId: id,
          name: muscleNames.get(id),
          evidence: []
        }).filter((item) => item.name);
      const candidateReason = (item, group) => {
        const motions = [...new Set((item.evidence || [])
          .filter(({ relation, confidence }) =>
            ["primary", "shared", "secondary"].includes(relation) && confidence !== "REVIEW")
          .map(({ motion }) => movementLabels[motion]).filter(Boolean))];
        if (!motions.length) return "動きとの関係は参考情報にとどまり、順位の根拠にはしていません。";
        const movementText = motions.map((motion) => `「${motion}」`).join("、");
        return group === "Main"
          ? `選んだ「${location}」という位置と${movementText}の動きが候補整理の手がかりです。`
          : `${movementText}の動きから追加で考えられる候補です。選んだ位置と筋肉の場所が一致するとは限りません。`;
      };
      const mainLines = main.map((item) =>
        `- Main内${item.tiedAtRank ? "同率" : ""}${item.rank}位：${item.name}。 ${candidateReason(item, "Main")}`);
      const additionalLines = additional.map((item) =>
        `- ${item.name}。 ${candidateReason(item, "Additional")}`);
      const byRank = new Map();
      main.forEach((item) => byRank.set(item.rank, [...(byRank.get(item.rank) || []), item.name]));
      const mainTies = [...byRank].filter(([, names]) => names.length > 1)
        .map(([rank, names]) => `${rank}位に${names.length}筋（${names.join("・")}）`);
      const topRank = main[0]?.rank;
      const mainTop = main.filter((item) => item.rank === topRank);
      const crossEqual = result.candidateStatusReason === "cross_group_equal_evidence"
        ? additionalDetails.filter((item) => item.score === main[0]?.score).map((item) => item.name)
        : [];
      const reason = result.candidateStatusReason || fixed.insufficientReason || result.candidateInsufficientReason;
      const statusLabel = {
        ranked: "順位あり（ranked）",
        tied: "同率あり（tied）",
        insufficient: "順位を保留（insufficient）",
        stretch_only_reference: "順位を保留"
      }[result.candidateStatus] || "未確定";
      const statusReason = {
        main_tie: `選んだ位置と動きから、同じ順位の候補が${mainTop.length}つ残っています。Main内では順位を分けられません。`,
        cross_group_equal_evidence: `位置と動きが重なるMain候補とは別に、動きから同程度の手がかりを持つAdditional候補（${crossEqual.join("・")}）があります。現在の回答だけでは一つだけを上位として扱う根拠が十分ではありません。`,
        cross_group_additional_stronger: "位置の手がかりと動きの手がかりが異なる候補に分かれているため、現在の回答だけでは順位を決めていません。",
        location_unclear: "場所がはっきりしないため、候補を十分に絞れていません。Additionalは順位を付けない参考候補です。",
        movement_unclear: "気になる動きがはっきりしないため、候補を十分に整理できていません。位置だけで筋肉を推測しません。",
        no_candidate: "今回の回答だけでは、筋肉候補を十分に整理できませんでした。",
        no_main_candidate: "選んだ位置と動きの両方が重なる候補がなく、順位を決めていません。",
        main_not_trusted: "候補の順位を決めるだけの手がかりがそろっていません。"
      }[reason] || (result.candidateStatus === "ranked"
        ? "この順位はHealth Check Labの固定ルールによる整理結果です。"
        : "現在の回答だけでは、候補を一つに決められません。");

      return [
        "【Health Check Lab｜肩のセルフチェック結果】",
        "Health Check Labは固定質問・固定ルールで、関連する可能性のある筋肉候補を整理しています。AIはその結果の説明役です。",
        `結果ページ：${aiHandoffUrl(result)}`,
        "※医療診断ではありません。",
        "",
        "■今回の回答",
        "部位：肩",
        `詳しい場所：${location}`,
        `左右：${side}`,
        "選んだ動き：",
        ...(selected.length ? selected.map((item) => `- ${item}`) : ["- 未選択"]),
        "",
        "■Health Check Labの固定結果",
        `結果状態：${statusLabel}`,
        `順位を整理した理由：${statusReason}`,
        "Main：選んだ位置と動きが重なる候補",
        ...(mainLines.length ? mainLines : ["- なし"]),
        `Main内の同率：${mainTies.length ? mainTies.join("／") : "なし"}`,
        "Additional：動きから追加で考えられる候補（無順位）",
        ...(additionalLines.length ? additionalLines : ["- なし"]),
        "MainとAdditionalは原因である可能性の高低を示しません。",
        ...(!(fixed.candidatePool || []).length ? ["今回の回答だけでは、筋肉候補を十分に整理できませんでした。AIが補完して追加しないでください。"] : []),
        "",
        ...aiCandidateExplanationRequestLines(),
        "Main内の同率候補へ独自に順位を付けず、AdditionalをMainより上位と断定しないでください。"
      ].join("\n");
    }

    function lowbackPrecisionV1AiHandoffText(result) {
      const fixed = aiHandoffContexts.get(result)?.lowbackPrecision;
      if (!fixed) return "今回の固定結果を確認できません。セルフチェックを最初からやり直してください。";
      const names = new Map(LowbackPrecisionV1.MASTER.map((item) => [item.id, item.name]));
      const muscleList = (ids) => ids.map((id) => names.get(id)).filter(Boolean);
      const lines = (ids) => muscleList(ids).map((name) => `- ${name}`);
      const answers = result.answers || {};
      const movementNames = {
        bend_forward: "前に曲げる", extend_back: "後ろに反る",
        side_bend_right: "右へ横に倒す", side_bend_left: "左へ横に倒す",
        rotate_right: "上半身を右へひねる", rotate_left: "上半身を左へひねる",
        movement_unclear: "特定の動きが分からない"
      };
      const movements = (answers.situations || []).map((id) => movementNames[id]).filter(Boolean);
      const reasonText = {
        ranked_unique_main: "現在の回答では、位置と動きの手がかりが1つの候補にまとまっています。",
        main_tie: "選んだ位置と動きから、複数の候補が同じように残っています。選んだ位置と動きが重なる候補内では順位を分けていません。",
        cross_group_equal: "位置と動きが重なる候補とは別に、動きから同じ程度の手がかりを持つ候補があります。医学的な確率が等しいという意味ではありません。",
        cross_group_incomparable: "異なる動きの手がかりが複数の候補に分かれているため、一つの候補だけを上位にはしていません。同率とだけ説明しないでください。",
        cross_group_additional_dominates: "動きから強い手がかりを持つ追加候補がありますが、位置との重なりを含めると現在の回答だけでは順位を決めていません。追加候補を単独の最上位にしないでください。",
        no_main_evidence: "動きに関係する候補はありますが、選んだ位置との重なりだけでは順位を決められません。",
        location_unclear: "気になる位置がはっきりしないため、現在の回答だけでは順位を付けていません。動きからの追加候補があれば順位を付けずに説明してください。",
        movement_unclear: "気になる動きがはっきりしないため、筋肉候補を十分に整理できませんでした。位置だけで筋肉を推測しないでください。",
        stretch_only_reference: "この動きでは、伸ばされる方向として参考になる筋がありますが、原因筋を示す結果ではありません。"
      }[fixed.statusReason] || "現在の回答だけでは候補の順位を決めていません。";
      const statusText = {
        ranked: "順位を整理できた", tied: "複数の候補が並ぶ",
        insufficient: "順位を決めない", stretch_only_reference: "伸ばされる方向の参考のみ"
      }[fixed.status] || "順位を決めない";
      const safetyAnswers = result.precisionData?.safety || {};
      const safety = [
        ["numbness", "しびれ"],
        ["weakness", "力が入りにくい"],
        ["limbSpread", "脚への広がり"]
      ].flatMap(([key, title]) => typeof safetyAnswers[key] === "boolean"
        ? [`${title}：${safetyAnswers[key] ? "選択あり" : "選択なし"}`] : []);
      const hasSafetyAnswers = safety.length > 0;
      const reference = fixed.status === "stretch_only_reference" ? result.candidateReferenceMuscles || [] : [];
      return [
        "【Health Check Lab｜腰のセルフチェック結果】",
        "Health Check Labは固定質問・固定ルールで筋肉候補と結果状態を整理しました。AIはこの固定結果を説明してください。医療診断ではありません。",
        `結果ページ：${aiHandoffUrl(result)}`,
        "",
        "■今回の回答",
        "部位：腰",
        `詳しい位置：${optionLabel(painLocationOptionsForPart("lowback"), answers.painLocation) || "未選択"}`,
        `左右：${optionLabel(sideOptions, answers.side) || "未選択"}`,
        "選んだ動き：",
        ...(movements.length ? movements.map((name) => `- ${name}`) : ["- 未選択"]),
        "",
        "■固定結果",
        `結果状態：${statusText}`,
        `その理由：${reasonText}`,
        "Main（選んだ位置と動きが重なる候補）：",
        ...(fixed.status === "stretch_only_reference" ? ["- なし"] : lines(fixed.main).length ? lines(fixed.main) : ["- なし"]),
        "Additional（動きから追加で考えられる候補・順位なし）：",
        ...(fixed.status === "stretch_only_reference" ? ["- なし"] : lines(fixed.trustedAdditional).length ? lines(fixed.trustedAdditional) : ["- なし"]),
        ...(reference.length ? ["参考候補（伸ばされる方向の情報。通常の候補・順位とは別）：", ...reference.map((name) => `- ${name}`)] : []),
        "比較して残る候補（この一覧自体は順位ではありません）：",
        ...(fixed.status === "stretch_only_reference" ? ["- なし"] : lines(fixed.unionFrontier).length ? lines(fixed.unionFrontier) : ["- なし"]),
        ...(fixed.status === "ranked" && fixed.unionMain.length === 1
          ? [`今回の表示上の先頭候補：${muscleList(fixed.unionMain)[0]}`] : []),
        "MainとAdditionalは医学的な可能性の高低を示しません。",
        "",
        ...(hasSafetyAnswers ? [
          "■安全確認（筋肉候補の順位には使っていません）",
          ...safety,
          `注意案内：${result.hasDanger ? "表示あり" : "表示なし"}`,
          ...(result.hasDanger ? ["強い、急に出た、または悪化している場合は、医療機関への相談を優先してください。"] : []),
          ""
        ] : []),
        ...aiCandidateExplanationRequestLines(),
        "AdditionalをMainより医学的に低い候補と扱わず、単独の最上位へ昇格させないでください。",
        ...(hasSafetyAnswers && result.hasDanger
          ? ["安全確認の回答は筋肉候補の根拠ではありません。上の注意案内に沿って医療機関への相談目安を説明してください。"] : [])
      ].join("\n");
    }

    function hipPrecisionV1AiHandoffText(result) {
      const fixed = aiHandoffContexts.get(result)?.hipPrecision;
      if (!fixed) return "今回の固定結果を確認できません。セルフチェックを最初からやり直してください。";
      const names = new Map(HipPrecisionV1.MASTER.map((item) => [item.id, item.name]));
      const lines = (ids) => ids.length ? ids.map((id) => names.get(id)).filter(Boolean).map((name) => `- ${name}`) : ["- なし"];
      const reasonText = {
        ranked_unique_main: "現在の回答では、位置と動きの手がかりが1つの候補にまとまっています。",
        main_tie: "複数の候補が並んでいます。",
        cross_group_equal: "同じ程度の手がかりが複数の候補にあります。医学的な確からしさが同じという意味ではありません。",
        cross_group_incomparable: "異なる動きの手がかりが、複数の候補に分かれています。1筋へ無理に順位を付けません。",
        cross_group_additional_dominates: "位置と動きの手がかりだけでは、順位を決められません。動きからの候補を単独の先頭にしません。",
        no_main_evidence: "選んだ位置と動きが重なる候補を十分に絞れません。",
        location_unclear: "場所がはっきりしないため順位を決めません。",
        movement_unclear: "動きがはっきりしないため順位を決めません。",
        stretch_only_reference: "伸ばされる方向としての参考はありますが、順位は決めません。"
      }[fixed.statusReason] || "今回の回答だけでは順位を決めません。";
      const statusText = {
        ranked: "1つの候補に整理", tied: "複数の候補が並ぶ",
        insufficient: "順位を決めない", stretch_only_reference: "伸ばされる方向の参考のみ"
      }[fixed.status];
      return [
        "【Health Check Lab｜股関節セルフチェック】",
        "以下はHealth Check Labの固定ルールで整理した結果です。医療上の判断ではありません。",
        "",
        "■回答",
        `詳しい場所：${optionLabel(painLocationOptionsForPart("hip"), result.answers?.painLocation)}`,
        `左右：${optionLabel(sideOptions, result.answers?.side)}`,
        `動作：${(result.answers?.situations || []).map((id) => optionLabel(situationOptionsForPart("hip"), id)).join("・")}`,
        "",
        "■固定結果",
        `結果状態：${statusText}`,
        `その理由：${reasonText}`,
        "Main（選んだ位置と動きが重なる候補）：",
        ...lines(fixed.main),
        "Additional（動きから追加で考えられる候補・順位なし）：",
        ...lines(fixed.additional),
        "初期表示する候補：",
        ...lines(fixed.display.initial),
        ...(fixed.dominatedAdditional.length ? ["その他の関連候補（Additionalの一部・初期表示では折りたたみ）：",
          ...lines(fixed.dominatedAdditional)] : []),
        ...(fixed.reference.length ? ["参考候補（通常の候補・順位とは別）：", ...lines(fixed.reference)] : []),
        "MainとAdditionalは医学的な可能性の高低を示しません。",
        "",
        ...aiCandidateExplanationRequestLines(),
        "上の固定状態・理由・候補所属を維持し、順位を計算し直さないでください。同じ順位に独自の順位を付けないでください。",
        "AdditionalをMainへ移したり、単独の先頭候補にしたりしないでください。",
        "その他の関連候補はAdditionalの一部です。別の候補として重複計上せず、折りたたまれた区分のまま説明してください。"
      ].join("\n");
    }

    function kneePrecisionV1AiHandoffText(result) {
      const fixed = aiHandoffContexts.get(result)?.kneePrecision;
      if (!fixed) return "今回の固定結果を確認できません。セルフチェックを最初からやり直してください。";
      const names = new Map(KneePrecisionV1.MASTER.map((item) => [item.id, item.name]));
      const lines = (ids) => ids.length ? ids.map((id) => names.get(id)).filter(Boolean).map((name) => `- ${name}`) : ["- なし"];
      const reasonText = {
        ranked_unique_main: "位置と動きの手がかりが1つの候補にまとまっています。",
        main_tie: "異なる動きの手がかりが複数の候補に分かれています。",
        weak_unique_main: "動きの手がかりが弱いため、一意の順位を決めません。",
        cross_group_additional_challenge: "MainとAdditionalの根拠が競合するため、一意の順位を決めません。",
        no_main_evidence: "選んだ位置と動きが重なる候補を十分に絞れません。Additionalは位置による順位づけではありません。",
        location_unclear: "場所がはっきりしないため順位を決めません。",
        movement_unclear: "動きがはっきりしないため順位を決めません。",
        stretch_only_reference: "伸ばされる方向としての参考はありますが、順位は決めません。"
      }[fixed.statusReason] || "今回の回答だけでは順位を決めません。";
      const statusText = {
        ranked: "1つの候補に整理", tied: "複数の候補が並ぶ",
        insufficient: "順位を決めない", stretch_only_reference: "伸ばされる方向の参考のみ"
      }[fixed.status];
      const candidateEvidence = fixed.candidates.map((item) => {
        const movement = item.matchedMotions.length
          ? item.matchedMotions.map((id) => optionLabel(situationOptionsForPart("knee"), id)).join("・")
          : "伸ばされる方向としての参考";
        const group = item.displayGroup === "Main" ? "位置と動き" :
          item.displayGroup === "Additional" ? "動き" : "参考";
        return `- ${item.name}（${group}）：${movement}`;
      });
      return [
        "【Health Check Lab｜膝セルフチェック】",
        "以下はHealth Check Labの固定ルールで整理した結果です。医療上の判断ではありません。",
        "",
        "■回答",
        `詳しい場所：${optionLabel(painLocationOptionsForPart("knee"), result.answers?.painLocation)}`,
        `左右：${optionLabel(sideOptions, result.answers?.side)}`,
        `動作：${(result.answers?.situations || []).map((id) => optionLabel(situationOptionsForPart("knee"), id)).join("・")}`,
        "",
        "■固定結果",
        `結果状態：${statusText}（${fixed.status}）`,
        `その理由：${reasonText}（${fixed.statusReason}）`,
        "Main（選んだ位置と動きが重なる候補）：",
        ...lines(fixed.main),
        "Additional（動きから追加で考えられる候補・順位なし）：",
        ...lines(fixed.additional),
        "初期表示する候補：",
        ...lines(fixed.display.initial),
        ...(fixed.collapsed.length ? ["その他の関連候補（Additionalの一部・折りたたみ）：",
          ...lines(fixed.collapsed)] : []),
        ...(fixed.reference.length ? ["参考候補（伸ばされる方向の情報。通常の候補・順位とは別）：",
          ...lines(fixed.reference)] : []),
        ...(candidateEvidence.length ? ["候補になった回答上の手がかり：", ...candidateEvidence] : []),
        "MainとAdditionalは医学的な可能性の高低を示しません。",
        "",
        ...aiCandidateExplanationRequestLines(),
        "上の固定状態・理由・候補所属を維持し、筋肉の追加・削除・独自の順位変更をしないでください。",
        "AdditionalをMainへ移したり、単独の先頭候補にしたりしないでください。",
        "その他の関連候補はAdditionalの一部です。別候補として重複計上しないでください。"
      ].join("\n");
    }

    function buttockPrecisionV1AiHandoffText(result) {
      const fixed = aiHandoffContexts.get(result)?.buttockPrecision;
      if (!fixed) return "今回の固定結果を確認できません。セルフチェックを最初からやり直してください。";
      const names = new Map(ButtockPrecisionV1.MASTER.map((item) => [item.id, item.name]));
      const lines = (ids) => ids.length ? ids.map((id) => `- ${names.get(id)}`).filter(Boolean) : ["- なし"];
      const statusText = { ranked: "1つの候補に整理", tied: "複数の候補が並ぶ", insufficient: "順位を決めない" }[fixed.status];
      const reasonText = {
        unique_trusted_main: "位置と動きが重なる候補の中では、1つにまとまっています。Additionalとは別の区分です。",
        main_tie: "位置と動きが重なる候補に同率のものがあります。",
        cross_group_equal: "複数の候補に同じ手がかりがあります。医学的な確率が等しいという意味ではありません。",
        cross_group_incomparable: "異なる動きの手がかりが複数の候補に分かれています。",
        cross_group_review: "複数の候補が残り、順位は決めていません。",
        additional_dominates_main: "動きに関係する追加候補がありますが、現在の回答だけでは順位を決めていません。",
        weak_main_only: "位置と重なる候補はありますが、動きの手がかりだけでは順位を決めません。",
        additional_without_main: "位置と動きが重なる候補を絞れません。動きに関係する候補を順位なしで示します。",
        review_only: "今回の回答だけでは候補を十分に絞れません。",
        no_trusted_main: "今回の回答だけでは候補を十分に絞れません。",
        location_unclear: "場所がはっきりしないため候補を十分に絞れません。",
        movement_unclear: "動きがはっきりしないため候補を十分に絞れません。"
      }[fixed.statusReason];
      const candidateEvidence = fixed.candidates.map((item) => {
        const group = item.displayGroup === "Main" ? "位置と動き" :
          item.displayGroup === "Additional" ? "動き" : "限定的な関連";
        const motions = item.matchedMotions.map((id) => optionLabel(situationOptionsForPart("buttock"), id)).join("・");
        return `- ${item.name}（${group}）：${motions || "順位を決める手がかりなし"}`;
      });
      return [
        "【Health Check Lab｜お尻のセルフチェック】",
        "以下は固定ルールで整理した結果です。医療上の判断ではありません。",
        "",
        "■回答",
        `詳しい場所：${optionLabel(painLocationOptionsForPart("buttock"), result.answers?.painLocation)}`,
        `左右：${optionLabel(sideOptions, result.answers?.side)}`,
        `動作：${(result.answers?.situations || []).map((id) => optionLabel(situationOptionsForPart("buttock"), id)).join("・")}`,
        "",
        "■固定結果",
        `結果状態：${statusText}`,
        `その理由：${reasonText}`,
        "Main（選んだ位置と動きが重なる候補）：", ...lines(fixed.main),
        "Additional（動きから追加で考えられる候補・順位なし）：", ...lines(fixed.additional),
        "その他の関連候補（順位なし）：", ...lines([...fixed.related, ...fixed.reviewOnly].sort()),
        ...(candidateEvidence.length ? ["候補になった回答上の手がかり：", ...candidateEvidence] : []),
        "MainとAdditionalは医学的な可能性の高低を示しません。",
        "",
        ...aiCandidateExplanationRequestLines(),
        "固定された候補所属と順位保留を維持し、筋肉の追加・削除・独自の順位変更をしないでください。",
        "その他の関連候補をMainやAdditionalへ昇格させないでください。"
      ].join("\n");
    }

    function thighPrecisionV1AiHandoffText(result) {
      const fixed = aiHandoffContexts.get(result)?.thighPrecision;
      if (!fixed) return "今回の固定結果を確認できません。セルフチェックを最初からやり直してください。";
      const names = new Map(ThighPrecisionV1.MASTER.map((item) => [item.id, item.name]));
      const lines = (ids) => ids.length ? ids.map((id) => `- ${names.get(id)}`) : ["- なし"];
      const statusText = { ranked: "1つの候補に整理", tied: "複数の候補が並ぶ", insufficient: "順位を決めない" }[fixed.status];
      const reasonText = {
        main_evidence: "位置と動きが重なる候補の中では、1つにまとまっています。",
        cross_group_guard: "MainとAdditionalの動きの手がかりが並ぶため、独自の順位を決めません。",
        additional_dominates_main: "追加候補の動きの手がかりも強く、今回の回答だけでは順位を決めません。",
        no_main_location_support: "位置と動きが重なる候補はありません。Additionalは動きからの候補です。",
        no_trusted_evidence: "今回の回答だけでは候補を十分に絞れません。",
        location_unclear: "場所がはっきりしないため順位を決めません。",
        movement_unclear: "動きがはっきりしないため順位を決めません。"
      }[fixed.statusReason];
      const evidence = fixed.candidates.map((item) => {
        const group = item.displayGroup === "Main" ? "位置と動き" :
          item.displayGroup === "Additional" ? "動き" :
            item.displayGroup === "Reference" ? "伸ばされる方向の参考" : "弱い関連・順位なし";
        const motions = item.matchedMotions.map((id) =>
          optionLabel(situationOptionsForPart("thigh"), id)).join("・");
        const scope = item.muscleId === "thigh_adductors" && item.matchedMotions.includes("hip_extend")
          ? "。脚を後ろへ動かす働きは大内転筋を含む群の一部の根拠であり、群の全筋に共通しません" : "";
        return `- ${item.name}（${group}）：${motions || "順位を決める手がかりなし"}${scope}`;
      });
      return [
        "【Health Check Lab｜太もものセルフチェック】",
        "以下は固定ルールで整理した結果です。医療上の診断や原因の確定ではありません。",
        "",
        "■回答",
        `詳しい場所：${optionLabel(painLocationOptionsForPart("thigh"), result.answers?.painLocation)}`,
        `左右：${optionLabel(sideOptions, result.answers?.side)}`,
        `動作：${(result.answers?.situations || []).map((id) => optionLabel(situationOptionsForPart("thigh"), id)).join("・")}`,
        "",
        "■固定結果",
        `結果状態：${statusText}`,
        `その理由：${reasonText}`,
        "Main（選んだ位置と動きが重なる候補）：", ...lines(fixed.main),
        "Additional（動きから追加で考えられる候補・順位なし）：", ...lines(fixed.additional),
        "その他の関連候補（弱い手がかり・順位なし）：", ...lines(fixed.relatedDisplayed),
        "Reference（伸ばされる方向としての参考・原因候補とは別）：", ...lines(fixed.reference),
        ...(evidence.length ? ["候補になった回答上の手がかり：", ...evidence] : []),
        "MainとAdditionalは医学的な可能性の高低を示しません。",
        "",
        ...aiCandidateExplanationRequestLines(),
        "固定された結果状態と候補所属を維持し、筋肉の追加・削除・独自の順位変更をしないでください。",
        "弱い関連・参考候補をMainやAdditionalへ昇格させないでください。"
      ].join("\n");
    }

    function lowerlegPrecisionV1AiHandoffText(result) {
      const fixed = aiHandoffContexts.get(result)?.lowerlegPrecision;
      if (!fixed) return "今回の固定結果を確認できません。セルフチェックを最初からやり直してください。";
      const names = new Map(LowerlegPrecisionV1.MASTER.map((item) => [item.id, item.name]));
      const lines = (ids) => ids.length ? ids.map((id) => `- ${names.get(id)}`) : ["- なし"];
      const statusText = { ranked: "1つの候補に整理", tied: "複数の候補が並ぶ", insufficient: "順位を決めない" }[fixed.status];
      const reasonText = {
        main_evidence: "選んだ位置と動きが重なる候補を表示しています。",
        cross_group_guard: "位置と動きから複数の候補が残るため、独自の順位を決めません。",
        additional_dominates_main: "動きからの追加候補の手がかりもあり、順位を決めません。",
        no_main_location_support: "位置と動きが重なる候補はありません。動きからの候補を表示します。",
        no_trusted_evidence: "今回の回答だけでは候補を十分に絞れません。",
        location_unclear: "場所がはっきりしないため順位を決めません。",
        movement_unclear: "動きがはっきりしないため順位を決めません。"
      }[fixed.reason];
      const evidence = fixed.candidates.map((item) => {
        const group = item.displayGroup === "Main" ? "位置と動きが重なる候補" :
          item.displayGroup === "Additional" ? "動きからの追加候補" :
            item.displayGroup === "Reference" ? "伸ばされる方向の参考" : "限定的な関連・順位なし";
        const motions = item.matchedMotions.map((id) =>
          optionLabel(situationOptionsForPart("lowerleg"), id)).join("・");
        return `- ${item.name}（${group}）：${motions || "順位を決める手がかりなし"}`;
      });
      return [
        "【Health Check Lab｜すね・ふくらはぎのセルフチェック】",
        "以下は固定ルールで整理した結果です。医療上の診断や原因の確定ではありません。",
        "",
        "■回答",
        `詳しい場所：${optionLabel(painLocationOptionsForPart("lowerleg"), result.answers?.painLocation)}`,
        `左右：${optionLabel(sideOptions, result.answers?.side)}`,
        `動作：${(result.answers?.situations || []).map((id) => optionLabel(situationOptionsForPart("lowerleg"), id)).join("・")}`,
        "",
        "■固定結果",
        `結果状態：${statusText}`,
        `その理由：${reasonText}`,
        "選んだ位置と動きが重なる候補：", ...lines(fixed.main),
        "動きから追加で考えられる候補：", ...lines(fixed.additional),
        "参考として関連する筋肉（順位なし）：", ...lines(fixed.related),
        "伸ばされる方向としての参考：", ...lines(fixed.reference),
        ...(evidence.length ? ["候補になった回答上の手がかり：", ...evidence] : []),
        "これらの区分は医学的な確率順位を示しません。",
        "",
        ...aiCandidateExplanationRequestLines(),
        "固定された結果状態と候補所属を維持し、筋肉の追加・削除・独自の順位変更をしないでください。",
        "参考として関連する筋肉や伸ばされる方向の参考を、順位付き候補へ昇格させないでください。"
      ].join("\n");
    }

    function anklePrecisionV1AiHandoffText(result) {
      const fixed = aiHandoffContexts.get(result)?.anklePrecision;
      if (!fixed) return "今回の固定結果を確認できません。セルフチェックを最初からやり直してください。";
      const names = new Map(AnklePrecisionV1.MASTER.map((item) => [item.id, item.name]));
      const lines = (ids) => ids.length ? ids.map((id) => `- ${names.get(id)}`) : ["- なし"];
      const statusText = { ranked: "1つの候補に整理", tied: "複数の候補が並ぶ", insufficient: "順位を決めない" }[fixed.status];
      const reasonText = {
        main_evidence: "選んだ位置と動きが重なる候補を表示しています。",
        cross_group_guard: "位置と動きから複数の候補が残るため、独自の順位を決めません。",
        cross_group_uncertain: "動きの手がかりが競合するため、順位を決めません。",
        additional_dominates_main: "動きからの追加候補の手がかりもあり、順位を決めません。",
        no_main_location_support: "位置と動きが重なる候補はありません。動きからの候補を表示します。",
        no_trusted_evidence: "今回の回答だけでは候補を十分に絞れません。",
        location_unclear: "場所がはっきりしないため順位を決めません。",
        movement_unclear: "動きがはっきりしないため順位を決めません。"
      }[fixed.reason];
      const evidence = fixed.candidates.map((item) => {
        const group = item.displayGroup === "Main" ? "位置と動きが重なる候補" :
          item.displayGroup === "Additional" ? "動きからの追加候補" :
            item.displayGroup === "Reference" ? "伸ばされる方向の参考" : "限定的な関連・順位なし";
        const motions = item.matchedMotions.map((id) =>
          optionLabel(situationOptionsForPart("ankle"), id)).join("・");
        const pathway = result.answers?.painLocation === "ankle_back" &&
          ["ankle_gastrocnemius", "ankle_soleus"].includes(item.muscleId)
          ? "。足首後方は筋腱の経路としての位置的手がかりです" : "";
        return `- ${item.name}（${group}）：${motions || "順位を決める手がかりなし"}${pathway}`;
      });
      return [
        "【Health Check Lab｜足首のセルフチェック】",
        "以下は固定ルールで整理した結果です。医療上の診断や原因の確定ではありません。",
        "",
        "■回答",
        `詳しい場所：${optionLabel(painLocationOptionsForPart("ankle"), result.answers?.painLocation)}`,
        `左右：${optionLabel(sideOptions, result.answers?.side)}`,
        `動作：${(result.answers?.situations || []).map((id) => optionLabel(situationOptionsForPart("ankle"), id)).join("・")}`,
        "",
        "■固定結果",
        `結果状態：${statusText}`,
        `その理由：${reasonText}`,
        "選んだ位置と動きが重なる候補：", ...lines(fixed.main),
        "動きから追加で考えられる候補：", ...lines(fixed.additional),
        "参考として関連する筋肉（順位なし）：", ...lines(fixed.related),
        "伸ばされる方向としての参考：", ...lines(fixed.reference),
        ...(evidence.length ? ["候補になった回答上の手がかり：", ...evidence] : []),
        "これらの区分は医学的な確率順位を示しません。",
        "",
        ...aiCandidateExplanationRequestLines(),
        "固定された結果状態と候補所属を維持し、筋肉の追加・削除・独自の順位変更をしないでください。",
        "参考として関連する筋肉や伸ばされる方向の参考を、順位付き候補へ昇格させないでください。"
      ].join("\n");
    }

    function aiHandoffText(result) {
      if (isNeckPrecisionV22Result(result)) return neckPrecisionV22AiHandoffText(result);
      if (isShoulderPrecisionV12Result(result)) return shoulderPrecisionV12AiHandoffText(result);
      if (isLowbackPrecisionV1Result(result)) return lowbackPrecisionV1AiHandoffText(result);
      if (isHipPrecisionV1Result(result)) return hipPrecisionV1AiHandoffText(result);
      if (isKneePrecisionV1Result(result)) return kneePrecisionV1AiHandoffText(result);
      if (isButtockPrecisionV1Result(result)) return buttockPrecisionV1AiHandoffText(result);
      if (isThighPrecisionV1Result(result)) return thighPrecisionV1AiHandoffText(result);
      if (isLowerlegPrecisionV1Result(result)) return lowerlegPrecisionV1AiHandoffText(result);
      if (isAnklePrecisionV1Result(result)) return anklePrecisionV1AiHandoffText(result);
      const answers = result.answers || {};
      const situations = (answers.situations || []).map((id) => optionLabel(situationOptionsForPart(result.regionId), id));
      const symptoms = (answers.symptoms || []).map((id) => optionLabel(symptomOptions, id));
      const side = optionLabel(sideOptions, answers.side) || "未選択";
      const painLocation = optionLabel(painLocationOptionsForPart(result.regionId), answers.painLocation) || "未選択";
      const timing = optionLabel(timingOptions, answers.timing) || "未選択";
      const spread = optionLabel(spreadOptions, answers.spread) || "未選択";
      const needsSafetyFirst = aiAdviceProfile(result).needsSafetyFirst;
      const muscles = result.topMuscles.map((item) => {
        const reasons = (item.reasons || []).slice(0, 2).join("。 ");
        return `- ${item.name}：${muscleSummary(item, result)}${reasons ? `。 ${reasons}` : ""}`;
      });
      return [
        "【Health Check Lab｜セルフチェック結果】",
        "提供元：Health Check Lab",
        "Health Check Labは、身体の部位・動き・感じ方から、関連する可能性のある筋肉を整理する健康情報サービスです。",
        `結果ページ：${aiHandoffUrl(result)}`,
        "※医療診断ではなく、回答内容を整理した参考情報です。",
        "",
        `選んだ場所：${result.selectedParts.join("・")}`,
        `主な部位：${result.regionLabel}`,
        `左右：${side}`,
        `気になる詳しい場所：${painLocation}`,
        `気になった動作：${situations.join("・") || "未選択"}`,
        `症状の感じ方：${symptoms.join("・") || "未選択"}`,
        `症状が出るタイミング：${timing}`,
        `症状の広がり：${spread}`,
        "",
        "関連する可能性がある筋肉：",
        ...muscles,
        "",
        ...aiCandidateExplanationRequestLines(),
        "選んだ詳しい場所との関係では、筋腹・腱・関節を区別してください。その場所に筋肉本体がない場合は、あるように説明しないでください。",
        ...(needsSafetyFirst ? ["しびれ、力の入りにくさ、腕や脚への広がりが回答に含まれています。筋肉だけの問題と決めつけず、医療機関への相談目安も短く説明してください。"] : [])
      ].join("\n");
    }

    function renderAiHandoff(result) {
      const hasCandidates = result.topMuscles.length || result.candidateAdditionalMuscles?.length || result.candidateReferenceMuscles?.length;
      return `<section class="ai-handoff-card" aria-labelledby="aiHandoffTitle">
        <div class="ai-handoff-intro">
          <span class="ai-handoff-mark" aria-hidden="true">AI</span>
          <div><p class="ai-handoff-kicker">候補筋をもう一歩深く知る</p><h3 id="aiHandoffTitle">自分のAIに詳しく聞く</h3><p>${hasCandidates
            ? "候補筋の場所と働き、負担がかかったときに起こることがある症状、今回の回答との関係をAIに聞けます。"
            : "候補を絞れなかった理由を、今回の回答からAIに確認できます。"}</p></div>
        </div>
        <ol class="ai-handoff-steps" aria-label="AIで確認できる内容">
          <li><strong>1</strong><span>筋肉の説明</span></li>
          <li><strong>2</strong><span>症状の例</span></li>
          <li><strong>3</strong><span>回答との関係</span></li>
        </ol>
        <div class="ai-handoff-action">
          <button class="primary-button" id="copyAiHandoffBtn" type="button">候補筋についてAIに聞く内容をコピー</button>
          <small>今回の回答と候補筋をまとめて渡します。</small>
        </div>
        <p class="ai-handoff-status" id="aiHandoffStatus" aria-live="polite" hidden></p>
        <details><summary>コピー内容を確認</summary><pre id="aiHandoffText" class="share-note">${esc(aiHandoffText(result))}</pre></details>
      </section>`;
    }

    function historyRecordData(item) {
      const regionId = item.regionId || item.bodyPart || item.answers?.primaryPart || "back";
      const regionLabel = item.regionLabel || label(regionId) || "身体チェック";
      const muscleNames = [...new Set([
        ...(Array.isArray(item.topMuscles) ? item.topMuscles.map((muscle) => typeof muscle === "string" ? muscle : muscle?.name) : []),
        ...(Array.isArray(item.candidateMuscles) ? item.candidateMuscles : [])
      ].filter(Boolean))].slice(0, 3);
      const primaryMuscle = muscleNames[0] || "";
      const visual = muscleVisuals[primaryMuscle] || regionVisuals[regionId] || regionVisuals.back;
      const side = item.answers?.side || item.leftRight || "unknown";
      const sideLabel = optionLabel(sideOptions, side) || "左右未選択";
      const movementIds = item.answers?.situations || item.movements || [];
      const movements = movementIds.map((id) => {
        const current = optionLabel(situationOptionsForPart(regionId), id);
        return current === id && regionId === "shoulder" && usesShoulderPrecisionFlow()
          ? optionLabel(situationByPart.shoulder, id)
          : current;
      }).filter(Boolean);
      const viewLabel = visual.view === "back" ? "背面" : "正面";
      const muscleSource = visual.view === "front"
        ? "/assets/body-guide/body-muscles-front-face-1536.png"
        : "/assets/body-guide/body-muscles-back-1536.png";
      return { regionLabel, muscleNames, primaryMuscle, visual, side, sideLabel, movements, viewLabel, muscleSource };
    }

    function renderHistoryRows(records) {
      if (!records.length) return `<p class="empty-insight">今回が最初の記録です。</p>`;
      return `<ol class="body-history-list">${records.slice(0, 6).map((item) => {
        const record = historyRecordData(item);
        const visualLabel = record.primaryMuscle
          ? `${record.primaryMuscle}の位置を${record.viewLabel}の筋肉人体で表示`
          : `${record.regionLabel}の位置を${record.viewLabel}の人体で表示`;
        return `<li class="body-history-entry">
          <figure class="history-body-figure">
            <div class="history-body-visual" aria-label="${esc(visualLabel)}">
              <img src="${record.muscleSource}" width="160" height="240" alt="" />
              ${renderMuscleHighlights(record.visual, record.side)}
              <span class="history-view-label">${record.viewLabel}</span>
            </div>
          </figure>
          <div class="history-entry-copy">
            <div class="history-entry-meta"><time>${formatRecordDate(item.diagnosisDate || item.savedAt)}</time><span>${esc(record.sideLabel)}</span></div>
            <h5>${esc(record.regionLabel)}</h5>
            ${record.movements.length ? `<p><span>気になった動き</span><strong>${esc(compactAnswerList(record.movements))}</strong></p>` : ""}
            <div class="history-muscle-tags" aria-label="候補筋">${(record.muscleNames.length ? record.muscleNames : [`${record.regionLabel}の記録`]).map((name) => `<span>${esc(name)}</span>`).join("")}</div>
          </div>
        </li>`;
      }).join("")}</ol>`;
    }

    function renderRecordExperience(result) {
      const current = normalizedRecord(result);
      const allRecords = localRecords();
      const currentSaved = allRecords.some((item) => item.diagnosisId === current.diagnosisId);
      const dates = Platform?.recommendedDates(current.diagnosisDate || current.savedAt) || {};
      const saveTitle = currentSaved ? "今日の身体を記録しました" : "今の自分を、あとで振り返る";
      const saveLead = currentSaved
        ? "次に同じ部位をチェックした時、今回の回答と候補筋を振り返れます。"
        : "選んだ部位・気になった動き・候補筋を残しておくと、次のチェックで以前の自分と見比べられます。";
      const saveButtonLabel = currentSaved ? "今日の記録を保存済み" : "今日の身体を記録する";
      const saveStatus = currentSaved
        ? `次の確認目安：${formatRecordDate(dates.sevenDays)}`
        : "";
      return `<section class="body-record-panel ${currentSaved ? "is-saved" : ""}" id="recordExperience" aria-labelledby="recordExperienceTitle">
        <div class="record-panel-head"><div><h3 id="recordExperienceTitle">${saveTitle}</h3><p>${saveLead}</p></div></div>
        <ol class="record-value-flow" aria-label="記録から比較まで">
          <li><span aria-hidden="true">1</span><strong>今日を記録</strong></li>
          <li><span aria-hidden="true">2</span><strong>次回もチェック</strong></li>
          <li><span aria-hidden="true">3</span><strong>以前と見比べる</strong></li>
        </ol>
        <div class="record-primary-action"><button class="primary-button" id="saveBodyBtn" type="button" ${currentSaved ? "disabled" : ""}>${saveButtonLabel}</button><p id="saveStatus" aria-live="polite" ${currentSaved ? "" : "hidden"}>${saveStatus}</p></div>
        <div class="record-action-row">
          <button class="secondary-button" id="historyBodyBtn" type="button">診断履歴を見る（${allRecords.length}件）</button>
          <button class="secondary-button" id="retryBodyBtn" type="button">もう一度診断する</button>
        </div>
        <div class="body-history" id="bodyHistory" hidden><div class="history-head"><h4>これまでの身体の記録</h4><span>${allRecords.length}件</span></div>${renderHistoryRows(allRecords.slice().sort((a, b) => new Date(b.diagnosisDate || b.savedAt || 0) - new Date(a.diagnosisDate || a.savedAt || 0)))}</div>
        ${currentSaved ? `<div class="retry-schedule"><span>次の確認目安</span><strong>7日後 ${formatRecordDate(dates.sevenDays)}</strong><strong>14日後 ${formatRecordDate(dates.fourteenDays)}</strong></div>` : ""}
        <details class="anonymous-profile"><summary>匿名傾向に任意で参加する</summary><p>氏名・メール・電話番号は収集しません。未回答のままでも記録できます。</p><div class="anonymous-profile-grid">
          <label>年代<select id="recordAgeBand"><option value="">回答しない</option><option value="under20">19歳以下</option><option value="20s">20代</option><option value="30s">30代</option><option value="40s">40代</option><option value="50s">50代</option><option value="60s">60代</option><option value="70plus">70歳以上</option></select></label>
          <label>性別<select id="recordSex"><option value="">回答しない</option><option value="female">女性</option><option value="male">男性</option><option value="other">その他</option><option value="no_answer">回答しない</option></select></label>
          <label>お住まいの地域<select id="recordRegion"><option value="">回答しない</option><option value="hokkaido">北海道</option><option value="tohoku">東北</option><option value="kanto">関東</option><option value="chubu">中部</option><option value="kinki">近畿</option><option value="chugoku">中国</option><option value="shikoku">四国</option><option value="kyushu_okinawa">九州・沖縄</option></select></label>
          <label>生活への影響<select id="recordLifeImpact"><option value="">回答しない</option><option value="none">ほとんどない</option><option value="mild">少しある</option><option value="moderate">ある</option><option value="strong">強くある</option></select></label>
          <label>続いている期間<select id="recordDuration"><option value="">回答しない</option><option value="under_week">1週間未満</option><option value="one_to_four_weeks">1〜4週間</option><option value="one_to_three_months">1〜3か月</option><option value="over_three_months">3か月以上</option></select></label>
        </div></details>
      </section>`;
    }

    function refreshRecordExperience(result) {
      const root = $("#recordExperience");
      if (!root) return;
      root.outerHTML = renderRecordExperience(result);
      bindRecordControls();
    }

    function bindRecordControls() {
      $("#saveBodyBtn")?.addEventListener("click", saveAgain);
      $("#historyBodyBtn")?.addEventListener("click", () => {
        const panel = $("#bodyHistory");
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) emit("diagnosis_history_view");
      });
      $("#retryBodyBtn")?.addEventListener("click", () => {
        emit("diagnosis_retry_click");
        const retryPart = state.latest?.regionId || "";
        reset();
        if (parts[retryPart]) {
          state.entryPart = retryPart;
          state.showAllParts = false;
          state.selectedParts = [retryPart];
          state.primaryPart = retryPart;
        }
        render();
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    }

    function compactAnswerList(items, limit = 2) {
      const values = (items || []).filter(Boolean);
      if (values.length <= limit) return values.join("・") || "未選択";
      return `${values.slice(0, limit).join("・")} ほか${values.length - limit}件`;
    }

    function renderResult() {
      const result = state.latest || calculate();
      return `<section class="result-panel">
        ${Sponsor?.renderBanner ? Sponsor.renderBanner(result) : ""}
        ${renderBodyDiscovery(result)}
        ${result.hasDanger ? `<aside class="result-safety-note is-alert" aria-label="受診に関する注意">
          <strong>「${esc(result.dangerSigns.join("・"))}」を選んだため表示しています</strong>
          <p>この症状は筋肉以外が関係することもあります。強い、急に出た、または悪化している場合は、セルフケアより医療機関への相談を優先してください。</p>
        </aside>` : ""}
        ${result.topMuscles.length || isLowbackPrecisionV1Result(result) || isHipPrecisionV1Result(result) || isKneePrecisionV1Result(result) || isButtockPrecisionV1Result(result) || isThighPrecisionV1Result(result) || isLowerlegPrecisionV1Result(result) || isAnklePrecisionV1Result(result) || isNeckPrecisionV22Result(result) || isShoulderPrecisionV12Result(result) ? renderAiHandoff(result) : ""}
        ${renderRecordExperience(result)}
        ${isLowbackPrecisionV1Result(result) ? '<p class="lowback-precision-caution">しびれ、力が入りにくい、脚まで症状が広がるなどがある場合は、筋肉だけの問題とは限らないため、医療機関への相談もご検討ください。</p>' : ""}
        ${isHipPrecisionV1Result(result) ? '<p class="lowback-precision-caution">しびれ、力が入りにくい、脚まで症状が広がるなどがある場合は、筋肉だけの問題とは限らないため、医療機関への相談もご検討ください。</p>' : ""}
        ${isKneePrecisionV1Result(result) ? '<p class="lowback-precision-caution">しびれ、力が入りにくい、脚まで症状が広がるなどがある場合は、筋肉だけの問題とは限らないため、医療機関への相談もご検討ください。</p>' : ""}
        ${isLowerlegPrecisionV1Result(result) ? '<p class="lowback-precision-caution">片脚だけの強い腫れ、赤み、熱感、原因不明の強い痛み、胸痛や息苦しさなどがある場合は、筋肉のセルフケアより医療機関への相談を優先してください。</p>' : ""}
        ${isAnklePrecisionV1Result(result) ? '<p class="lowback-precision-caution">強い腫れ、明らかな変形、急な外傷、体重をかけられない、強い赤みや熱感がある場合は、医療機関への相談もご検討ください。</p>' : ""}
      </section>`;
    }

    function renderLoading() {
      return `<section class="panel diagnosis-panel loading-panel"><h2>回答をもとに候補を絞っています</h2><p>動作と症状の特徴を確認しています。あと少しで結果が表示されます。</p><div class="loading-dots"><span></span><span></span><span></span></div></section>`;
    }

    function canGoNext() {
      const step = currentStepId();
      if (step === "parts") return state.selectedParts.length > 0;
      if (step === "primary") return Boolean(state.primaryPart);
      if (step === "precision_location") return Boolean(state.painLocation);
      if (step === "precision_side") return Boolean(state.side);
      if (step === "situations") return state.situations.length > 0;
      if (step === "adaptive") return Boolean(state.adaptiveAnswer);
      if (step === "symptoms") return state.symptoms.length > 0;
      if (step === "supplement") return Boolean(state.painLocation && state.timing && state.side && state.spread);
      return true;
    }

    function render() {
      const step = currentStepId();
      const content = state.calculating ? renderLoading() : ({ parts: renderParts, primary: renderPrimary, precision_location: renderPrecisionLocation, precision_side: renderPrecisionSide, situations: renderSituations, adaptive: renderAdaptiveQuestion, symptoms: renderSymptoms, supplement: renderSupplement, result: renderResult }[step] || renderParts)();
      const questionHeader = step === "result" ? "" : `${renderContext(step)}${renderProgress()}`;
      const backAction = state.stepIndex > 0
        ? `<button class="secondary-button" id="bodyBackBtn" type="button">戻る</button>`
        : `<a class="secondary-button" href="/" data-link>ホームへ戻る</a>`;
      const leftAction = step === "result"
        ? `<button class="secondary-button" id="bodyBackBtn" type="button">回答を見直す</button>`
        : backAction;
      $("#bodyCheckRoot").innerHTML = `${hiddenAnalyticsInputs()}${questionHeader}${content}<div class="form-actions diagnosis-actions ${step === "result" ? "result-actions" : "question-actions"}">${leftAction}${step !== "result" ? `<button class="primary-button" id="bodyNextBtn" type="button" ${canGoNext() ? "" : "disabled"}>${nextLabel(step)}</button>` : `<a class="secondary-button" id="bodyResetLink" href="/" data-link>最初からやり直す</a>`}</div>`;
      bindStep();
      const stepKey = `${state.stepIndex}:${step}`;
      if (lastTrackedStep !== stepKey) {
        lastTrackedStep = stepKey;
        emit("step_viewed", { currentStep: state.stepIndex, questionId: step });
      }
    }

    function nextLabel(step) {
      if (usesLowbackPrecisionFlow()) {
        if (step === "parts" || step === "primary") return "詳しい場所へ";
        if (step === "precision_location") return "左右へ";
        if (step === "precision_side") return "動作へ";
        if (step === "situations") return "結果を見る";
      }
      if (usesPrecisionFlow()) {
        if (step === "parts" || step === "primary") return "詳しい場所へ";
        if (step === "precision_location") return "左右へ";
        if (step === "precision_side") return "動作へ";
        if (step === "situations") return "結果を見る";
        if (step === "adaptive") return "結果を見る";
      }
      if (step === "parts") return state.selectedParts.length > 1 ? "主な部位を選ぶ" : "動き・場面へ";
      if (step === "primary") return "動き・場面へ";
      if (step === "situations") return "感じ方へ";
      if (step === "symptoms") return "症状の特徴へ";
      if (step === "supplement") return "結果を見る";
      return "次へ進む";
    }

    async function goNext() {
      if (!canGoNext() || resultTransitionPending) return;
      const steps = currentSteps();
      const step = currentStepId();
      if (step === "parts" && state.selectedParts.length === 1) state.primaryPart = state.selectedParts[0];
      if (neckPrecisionMode() === "precision-v2.2" && step === "situations") {
        const question = pendingAdaptiveQuestion();
        if (question) {
          state.adaptiveQuestion = question;
          state.adaptiveAnswer = "";
          state.stepIndex = currentSteps().indexOf("adaptive");
          render();
          window.scrollTo({ top: 0, behavior: "auto" });
          return;
        }
      }
      if (step === "supplement" || ((usesLowbackPrecisionFlow() || usesHipPrecisionFlow() || usesKneePrecisionFlow() || usesButtockPrecisionFlow() || usesThighPrecisionFlow() || usesLowerlegPrecisionFlow() || usesAnklePrecisionFlow()) && step === "situations")
        || ((usesNeckPrecisionFlow() || usesShoulderPrecisionFlow()) && (step === "situations" || step === "adaptive"))) {
        resultTransitionPending = true;
        const resultButton = $("#bodyNextBtn");
        if (resultButton) {
          resultButton.disabled = true;
          resultButton.setAttribute("aria-busy", "true");
        }
        const result = calculate();
        const imagePlan = preloadResultMuscleImages(result);
        if (imagePlan && muscleImageLoader) {
          await muscleImageLoader.waitFor(imagePlan.first, MuscleImages.DEFAULT_RESULT_WAIT_MS);
        }
        state.calculating = false;
        state.stepIndex = currentSteps().length - 1;
        render();
        resultTransitionPending = false;
        window.scrollTo({ top: 0, behavior: "auto" });
        autoSave(state.latest);
        emit("diagnosis_completed", { results: { bodyType: state.latest.bodyType }, topMuscle: state.latest.topMuscles[0]?.name || "" });
        return;
      }
      state.stepIndex = Math.min(state.stepIndex + 1, steps.length - 1);
      render();
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    function goBack() {
      emit("back_clicked", { currentStep: state.stepIndex, questionId: currentStepId() });
      state.stepIndex = Math.max(0, state.stepIndex - 1);
      render();
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    function toggleMulti(key, id, max = 3) {
      let list = [...state[key]];
      const exists = list.includes(id);
      if (exists) {
        list = list.filter((item) => item !== id);
      } else {
        if (key === "situations") {
          list = id === UNCLEAR_SITUATION ? [] : list.filter((item) => item !== UNCLEAR_SITUATION);
        }
        if (key === "symptoms" && CHANGE_SYMPTOMS.has(id)) {
          list = id === "no_change"
            ? list.filter((item) => item !== "better_move" && item !== "better_rest")
            : list.filter((item) => item !== "no_change");
        }
        if (list.length < max) list.push(id);
      }
      state[key] = list;
      emit("option_selected", { questionId: currentStepId(), selectedOption: id, selectedOptionType: key });
    }

    function bindStep() {
      $$(".body-part-card").forEach((button) => button.addEventListener("click", () => {
        const id = button.dataset.part;
        if (!state.selectedParts.includes(id) && state.selectedParts.length >= MAX_SELECTION) {
          state.limitMessage = "診断を迷いにくくするため、気になる場所は3つまでにしています。";
          render();
          return;
        }
        toggleMulti("selectedParts", id, MAX_SELECTION);
        state.limitMessage = "";
        if (!state.selectedParts.includes(state.primaryPart)) {
          state.primaryPart = state.selectedParts[0] || "";
          state.situations = [];
          state.symptoms = [];
          state.painLocation = "";
          state.timing = "";
          state.side = "";
          state.spread = "";
          clearAdaptiveAnswer();
        }
        state.latest = null;
        render();
      }));
      $$(".diagnosis-option").forEach((button) => button.addEventListener("click", () => {
        const name = button.dataset.name;
        const id = button.dataset.choice;
        if (name !== "adaptiveAnswer") clearAdaptiveAnswer();
        if (button.dataset.multi === "false") {
          const changedPrimary = name === "primaryPart" && state.primaryPart !== id;
          state[name] = id;
          if (changedPrimary) {
            state.situations = [];
            state.symptoms = [];
            state.painLocation = "";
            state.timing = "";
            state.side = "";
            state.spread = "";
            clearAdaptiveAnswer();
          }
          emit("option_selected", { questionId: currentStepId(), selectedOption: id, selectedOptionType: name });
        } else {
          toggleMulti(name, id, 3);
        }
        state.latest = null;
        render();
      }));
      $("#bodyBackBtn")?.addEventListener("click", goBack);
      $("#bodyNextBtn")?.addEventListener("click", goNext);
      $("#bodyResetLink")?.addEventListener("click", () => emit("restart_clicked", { currentStep: state.stepIndex }));
      $("#copyAiHandoffBtn")?.addEventListener("click", async () => {
        const summary = $("#aiHandoffText")?.textContent || "";
        const copied = await copyText(summary);
        const status = $("#aiHandoffStatus");
        if (status) {
          status.hidden = false;
          status.textContent = copied === false
            ? "コピーできませんでした。内容を開いて手動で選択してください。"
            : "コピーしました。普段使っているAIへ貼り付けてください。";
        }
      });
      bindRecordControls();
      bindMuscleExplorer();
      if (currentStepId() === "supplement" || (usesPrecisionFlow() && currentStepId() === "situations")) preloadPotentialResultImages();
      if (currentStepId() === "result") {
        preloadResultMuscleImages(state.latest);
        revealRenderedMuscleImage();
      }
    }

    function init() {
      reset({ useLandingPart: true });
      applyLocalResultPreview();
      render();
    }

    return { init, localRecords, getPartMeta };
  }

  window.createBodyCheck = createBodyCheck;
})();
