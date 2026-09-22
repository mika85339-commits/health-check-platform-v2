(function () {
  const VERSION = "bodycheck-v3-muscle-ux";
  const MAX_SELECTION = 3;

  const partOrder = ["neck", "shoulder", "scapula", "back", "lowback", "buttock", "hip", "thigh", "knee", "calf", "ankle", "foot"];
  const parts = {
    neck: { label: "首", adjacent: ["shoulder", "scapula"], icon: "Ne", care: ["首を大きく回さず、下を向く時間を短くする", "後頭部を軽く伸ばし、呼吸を止めずに20秒"] },
    shoulder: { label: "肩", adjacent: ["neck", "scapula"], icon: "Sh", care: ["肩をすくめず、小さく腕を回す", "痛みが強い角度で無理に上げない"] },
    scapula: { label: "肩甲骨周囲", adjacent: ["neck", "shoulder", "back"], icon: "Sc", care: ["肩甲骨を軽く寄せて戻す運動を10回", "長時間同じ姿勢を避ける"] },
    back: { label: "背中", adjacent: ["scapula", "lowback"], icon: "Bk", care: ["深呼吸で背中を広げる", "反る動きは小さく確認する"] },
    lowback: { label: "腰", adjacent: ["back", "buttock", "hip"], icon: "Lb", care: ["仰向けで膝を抱え、腰を丸めすぎず20秒", "立ち上がり前に骨盤を小さく動かす"] },
    buttock: { label: "お尻", adjacent: ["lowback", "hip", "thigh"], icon: "Bt", care: ["座りっぱなしを避け、短い歩行を挟む", "お尻を軽く締める運動を10回"] },
    hip: { label: "股関節", adjacent: ["lowback", "buttock", "thigh", "knee"], icon: "Hp", care: ["股関節前側を無理なく伸ばす", "脚を開く動きは痛みの手前で止める"] },
    thigh: { label: "太もも", adjacent: ["hip", "knee"], icon: "Th", care: ["太もも前後を反動なしで伸ばす", "階段やしゃがみ込みを少し減らす"] },
    knee: { label: "膝", adjacent: ["hip", "thigh", "calf", "ankle"], icon: "Kn", care: ["椅子からゆっくり立ち座りを5回", "深くしゃがむ動きは痛みの手前まで"] },
    calf: { label: "ふくらはぎ", adjacent: ["knee", "ankle", "foot"], icon: "Ca", care: ["ふくらはぎを壁で軽く伸ばす", "つま先立ちは回数を少なめに確認する"] },
    ankle: { label: "足首", adjacent: ["knee", "calf", "foot"], icon: "An", care: ["足首を上下にゆっくり10回", "片脚立ちは支えを使って確認する"] },
    foot: { label: "足", adjacent: ["calf", "ankle"], icon: "Fo", care: ["足裏を軽くほぐす", "朝の一歩目は急がず荷重をかける"] }
  };

  const situationByPart = {
    neck: [["look_down", "下を向く時"], ["look_up", "上を向く時"], ["turn_right", "右を向く時"], ["turn_left", "左を向く時"], ["look_back", "振り向く時"], ["phone_long", "長時間スマートフォンを見る時"], ["desk_work", "デスクワーク中"], ["morning", "朝起きた時"]],
    shoulder: [["front_raise", "腕を前から上げる時"], ["side_raise", "腕を横から上げる時"], ["hand_back", "後ろに手を回す時"], ["change_clothes", "服を着替える時"], ["tie_hair", "髪を結ぶ時"], ["carry_heavy", "重い物を持つ時"], ["side_sleep", "横向きで寝る時"], ["night_sleep", "夜寝ている時"]],
    scapula: [["arm_up", "腕を上げる時"], ["reach_forward", "腕を前へ伸ばす時"], ["pull_object", "物を引く時"], ["move_neck", "首を動かす時"], ["long_sitting", "長時間座っている時"], ["deep_breath", "深呼吸する時"], ["hand_back", "背中に手を回す時"]],
    back: [["bend_forward", "前かがみになる時"], ["extend_back", "後ろへ反る時"], ["twist_body", "体をひねる時"], ["side_bend", "横に倒す時"], ["deep_breath", "深呼吸する時"], ["long_sitting", "長時間座る時"], ["turn_over", "寝返りする時"]],
    lowback: [["bend_forward", "前に曲げる時"], ["extend_back", "後ろに反る時"], ["twist_body", "体をひねる時"], ["side_bend", "横に倒す時"], ["stand_up", "立ち上がる時"], ["sit_down", "座る時"], ["walking", "歩く時"], ["long_sitting", "長時間座る時"], ["turn_over", "寝返りする時"], ["morning", "朝起きる時"]],
    buttock: [["walking", "歩く時"], ["single_leg", "片脚で立つ時"], ["stairs_up", "階段を上る時"], ["stairs_down", "階段を下りる時"], ["stand_up", "立ち上がる時"], ["long_sitting", "長時間座る時"], ["side_sleep", "横向きで寝る時"], ["cross_leg", "脚を組む時"]],
    hip: [["walking", "歩く時"], ["stairs_up", "階段を上る時"], ["stairs_down", "階段を下りる時"], ["squat", "しゃがむ時"], ["wear_socks", "靴下を履く時"], ["car_inout", "車へ乗り降りする時"], ["cross_leg_sit", "あぐらをかく時"], ["open_leg", "脚を開く時"]],
    thigh: [["walking", "歩く時"], ["running", "走る時"], ["stairs_up", "階段を上る時"], ["stairs_down", "階段を下りる時"], ["squat", "しゃがむ時"], ["extend_knee", "脚を伸ばす時"], ["bend_knee", "脚を曲げる時"], ["long_sitting", "長時間座る時"]],
    knee: [["walking", "歩く時"], ["stairs_up", "階段を上る時"], ["stairs_down", "階段を下りる時"], ["stand_up", "立ち上がる時"], ["squat", "しゃがむ時"], ["seiza", "正座する時"], ["extend_knee", "膝を伸ばす時"], ["bend_knee", "膝を曲げる時"]],
    calf: [["walking", "歩く時"], ["running", "走る時"], ["stairs_up", "階段を上る時"], ["toe_stand", "つま先立ちする時"], ["long_standing", "立ち続ける時"], ["first_step", "朝の一歩目"], ["after_exercise", "運動後"], ["sleeping", "寝ている時"]],
    ankle: [["start_walk", "歩き始め"], ["long_walk", "長く歩く時"], ["running", "走る時"], ["stairs", "階段を使う時"], ["toe_stand", "つま先立ちする時"], ["single_leg", "片脚で立つ時"], ["first_step", "朝の一歩目"], ["wear_shoes", "靴を履いている時"]],
    foot: [["start_walk", "歩き始め"], ["long_walk", "長く歩く時"], ["running", "走る時"], ["stairs", "階段を使う時"], ["toe_stand", "つま先立ちする時"], ["single_leg", "片脚で立つ時"], ["first_step", "朝の一歩目"], ["wear_shoes", "靴を履いている時"]]
  };

  const symptomOptions = [
    ["sharp", "鋭く痛む"], ["heavy", "重だるい"], ["tight", "張る、突っ張る"], ["limited", "動かしにくい"], ["catching", "引っかかる"],
    ["weakness", "力が入りにくい"], ["numbness", "しびれる"], ["better_move", "動くと楽になる"], ["better_rest", "休むと楽になる"], ["no_change", "特に変化しない"]
  ];
  const timingOptions = [["start", "動き始め"], ["middle", "動作の途中"], ["end", "最後まで動かした時"], ["return", "元に戻る時"], ["after", "動作後"]];
  const sideOptions = [["right", "右側"], ["left", "左側"], ["both", "両側"], ["center", "中央"]];
  const spreadOptions = [["local", "選択した部位だけ"], ["near", "近くの部位まで広がる"], ["limb", "腕や脚まで広がる"]];
  const partDisplayCodes = {
    neck: "NECK",
    shoulder: "SHOULDER",
    scapula: "SCAPULA",
    back: "BACK",
    lowback: "LOW BACK",
    buttock: "HIP LINE",
    hip: "HIP",
    thigh: "THIGH",
    knee: "KNEE",
    calf: "CALF",
    ankle: "ANKLE",
    foot: "FOOT"
  };

  const muscleRules = [
    { name: "胸鎖乳突筋", primary: ["neck"], related: ["head", "shoulder"], motions: ["look_up", "turn_right", "turn_left", "look_back", "phone_long"], stretch: ["look_up", "turn_right", "turn_left"], symptoms: ["heavy", "tight"], bonus: ["phone_long", "desk_work"] },
    { name: "斜角筋", primary: ["neck"], related: ["shoulder", "scapula"], motions: ["look_down", "turn_right", "turn_left", "desk_work"], stretch: ["look_down"], symptoms: ["tight", "numbness", "heavy"], bonus: ["phone_long"] },
    { name: "後頭下筋群", primary: ["neck"], related: ["head"], motions: ["look_up", "look_down", "morning", "phone_long"], symptoms: ["heavy", "tight"], bonus: ["morning"] },
    { name: "僧帽筋上部", primary: ["neck", "shoulder"], related: ["scapula"], motions: ["desk_work", "carry_heavy", "long_sitting"], contraction: ["side_raise"], symptoms: ["heavy", "tight"], bonus: ["desk_work"] },
    { name: "肩甲挙筋", primary: ["neck", "scapula"], related: ["shoulder"], motions: ["move_neck", "desk_work", "long_sitting", "morning"], stretch: ["look_down"], symptoms: ["heavy", "tight"], bonus: ["phone_long"] },
    { name: "三角筋", primary: ["shoulder"], related: ["upper_arm"], motions: ["front_raise", "side_raise", "change_clothes", "carry_heavy"], contraction: ["front_raise", "side_raise"], symptoms: ["sharp", "limited", "weakness"] },
    { name: "棘上筋", primary: ["shoulder"], related: ["scapula"], motions: ["side_raise", "arm_up", "night_sleep"], contraction: ["side_raise"], symptoms: ["sharp", "limited", "catching"], bonus: ["night_sleep"] },
    { name: "肩甲下筋", primary: ["shoulder"], related: ["scapula"], motions: ["hand_back", "change_clothes", "tie_hair"], stretch: ["hand_back"], symptoms: ["limited", "catching", "sharp"] },
    { name: "菱形筋", primary: ["scapula"], related: ["back"], motions: ["pull_object", "long_sitting", "deep_breath"], contraction: ["pull_object"], symptoms: ["heavy", "tight"] },
    { name: "前鋸筋", primary: ["scapula", "shoulder"], related: ["rib"], motions: ["reach_forward", "arm_up", "deep_breath"], contraction: ["reach_forward"], symptoms: ["tight", "limited"] },
    { name: "広背筋", primary: ["back", "scapula", "shoulder"], related: ["lowback"], motions: ["hand_back", "pull_object", "extend_back", "deep_breath"], stretch: ["arm_up"], symptoms: ["tight", "limited"] },
    { name: "脊柱起立筋", primary: ["back", "lowback"], related: ["buttock"], motions: ["bend_forward", "stand_up", "long_sitting", "long_standing"], stretch: ["bend_forward"], symptoms: ["heavy", "tight"], bonus: ["morning"] },
    { name: "多裂筋", primary: ["lowback", "back"], related: ["buttock"], motions: ["extend_back", "twist_body", "turn_over", "stand_up"], contraction: ["extend_back", "twist_body"], symptoms: ["sharp", "catching", "limited"] },
    { name: "腰方形筋", primary: ["lowback", "back"], related: ["hip"], motions: ["side_bend", "long_sitting", "walking", "turn_over"], contraction: ["side_bend"], symptoms: ["heavy", "tight", "sharp"] },
    { name: "腸腰筋", primary: ["lowback", "hip"], related: ["thigh"], motions: ["extend_back", "stand_up", "walking", "wear_socks", "car_inout", "long_sitting"], contraction: ["stand_up", "walking"], stretch: ["extend_back"], symptoms: ["tight", "limited", "catching"] },
    { name: "大臀筋", primary: ["buttock", "hip", "lowback"], related: ["thigh"], motions: ["stand_up", "stairs_up", "squat", "walking"], contraction: ["stand_up", "stairs_up"], stretch: ["wear_socks"], symptoms: ["heavy", "weakness"] },
    { name: "中臀筋", primary: ["buttock", "hip"], related: ["lowback", "knee"], motions: ["single_leg", "walking", "stairs_up", "stairs_down", "side_sleep"], contraction: ["single_leg", "walking"], symptoms: ["heavy", "sharp", "weakness"], bonus: ["side_sleep"] },
    { name: "梨状筋", primary: ["buttock", "hip"], related: ["thigh", "lowback"], motions: ["long_sitting", "cross_leg", "cross_leg_sit", "walking"], stretch: ["cross_leg", "cross_leg_sit"], symptoms: ["heavy", "numbness", "tight"] },
    { name: "内転筋", primary: ["hip", "thigh"], related: ["knee"], motions: ["open_leg", "squat", "cross_leg_sit"], stretch: ["open_leg"], symptoms: ["tight", "sharp", "limited"] },
    { name: "大腿四頭筋", primary: ["thigh", "knee"], related: ["hip"], motions: ["stairs_up", "stairs_down", "squat", "stand_up", "extend_knee", "seiza"], contraction: ["stairs_up", "stand_up", "extend_knee"], stretch: ["bend_knee", "seiza"], symptoms: ["heavy", "weakness", "sharp"] },
    { name: "ハムストリングス", primary: ["thigh", "knee"], related: ["buttock", "lowback"], motions: ["bend_forward", "walking", "running", "stairs_down", "extend_knee", "long_sitting"], stretch: ["bend_forward", "extend_knee"], symptoms: ["tight", "sharp"] },
    { name: "下腿三頭筋", primary: ["calf", "ankle"], related: ["knee", "foot"], motions: ["walking", "running", "stairs_up", "toe_stand", "long_standing", "after_exercise"], contraction: ["toe_stand", "stairs_up"], stretch: ["squat"], symptoms: ["tight", "heavy", "sharp"] },
    { name: "前脛骨筋", primary: ["ankle", "foot"], related: ["calf"], motions: ["start_walk", "long_walk", "stairs", "wear_shoes"], contraction: ["start_walk"], symptoms: ["tight", "heavy", "limited"] },
    { name: "後脛骨筋", primary: ["ankle", "foot"], related: ["calf"], motions: ["single_leg", "long_walk", "toe_stand", "first_step"], contraction: ["single_leg", "toe_stand"], symptoms: ["heavy", "sharp", "limited"] },
    { name: "足底筋群", primary: ["foot", "ankle"], related: ["calf"], motions: ["first_step", "start_walk", "long_walk", "wear_shoes", "toe_stand"], stretch: ["first_step"], symptoms: ["sharp", "tight", "heavy"], bonus: ["first_step"] }
  ];

  function createBodyCheck(deps) {
    const { $, $$, STORAGE_KEY, analyzeWithOpenAI, setButtonLoading, copyText, encodeShare, runWhenIdle, getCommunityInsights } = deps;
    const Platform = window.HealthCheckBodyPlatform;
    let state = {};
    let lastTrackedStep = "";

    function reset() {
      state = {
        stepIndex: 0,
        selectedParts: [],
        primaryPart: "",
        situations: [],
        symptoms: [],
        timing: "",
        side: "",
        spread: "",
        latest: null,
        calculating: false,
        limitMessage: ""
      };
      lastTrackedStep = "";
      emit("diagnosis_started", { questionId: "part_select" });
    }

    function emit(eventName, detail = {}) {
      document.dispatchEvent(new CustomEvent("hcl:diagnosis-event", { detail: { eventName, diagnosisVersion: VERSION, ...detail } }));
    }

    const label = (id) => parts[id]?.label || id;
    const optionLabel = (options, id) => options.find((item) => item[0] === id)?.[1] || id;
    const esc = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
    const currentSteps = () => {
      const steps = ["parts"];
      if (state.selectedParts.length > 1) steps.push("primary");
      steps.push("situations", "symptoms");
      if (needsSupplement()) steps.push("supplement");
      steps.push("result");
      return steps;
    };
    const currentStepId = () => currentSteps()[state.stepIndex] || "parts";
    const questionNumber = () => state.stepIndex + 1;
    const totalQuestions = () => currentSteps().length;
    const hasNerveFlag = () => state.symptoms.includes("numbness") || state.symptoms.includes("weakness");
    const needsSupplement = () => Boolean(state.primaryPart && state.situations.length && state.symptoms.length);
    const selectedSituations = () => situationByPart[state.primaryPart] || [];

    function selectableCard({ id, text, selected, disabled, name, multi = true }) {
      return `<button class="diagnosis-option ${selected ? "selected" : ""}" type="button" data-choice="${id}" data-name="${name}" data-multi="${multi}" ${disabled ? "disabled" : ""}>
        <span class="option-check">${selected ? "✓" : ""}</span><span class="node-label">TRACE NODE</span><strong>${text}</strong>
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
      return `<div class="diagnosis-progress">
        <div class="progress-meta">
          <span>${questionNumber()} / ${total}</span>
          <strong>あと${Math.max(0, total - questionNumber())}問</strong>
        </div>
        <div class="progress-track"><span style="width:${pct}%"></span></div>
        <div class="progress body-trace-steps">${currentSteps().map((item, index) => `<span class="${index < state.stepIndex ? "complete" : ""} ${index === state.stepIndex ? "active" : ""}"><em>${String(index + 1).padStart(2, "0")} ${stepCode(item)}</em><strong>${stepLabel(item)}</strong></span>`).join("")}</div>
      </div>`;
    }

    function stepLabel(id) {
      return { parts: "部位", primary: "主症状", situations: "場面", symptoms: "症状", supplement: "補助", result: "候補筋" }[id] || id;
    }

    function stepCode(id) {
      return { parts: "LOCATION", primary: "FOCUS", situations: "CONDITION", symptoms: "SIGNAL", supplement: "DETAIL", result: "RESULT" }[id] || "TRACE";
    }

    function stepHeadline(id) {
      return { parts: "気になる場所を選んでください", primary: "今、一番困っている場所はどこですか？", situations: "どんな時に一番気になりますか？", symptoms: "その時、どんな感じになりますか？", supplement: "もう少しだけ確認します" }[id] || "身体のサインをたどります";
    }

    function stepLead(id) {
      return {
        parts: "最大3部位まで選べます。迷う時は、今いちばん気になる場所から選んでください。",
        primary: "ここで選んだ場所に合わせて、次の質問が変わります。",
        situations: `${label(state.primaryPart)}で困る場面を最大3つまで選んでください。`,
        symptoms: "症状の感じ方を最大3つまで選んでください。",
        supplement: "候補筋肉の順位を絞るために使います。"
      }[id] || "";
    }

    function stepHeader(id) {
      return `<div class="diagnosis-step-head">
        <span class="trace-label">BODY TRACE</span>
        <p class="eyebrow">STEP ${String(questionNumber()).padStart(2, "0")} / ${stepCode(id)}</p>
        <h2>${stepHeadline(id)}</h2>
        <p>${stepLead(id)}</p>
      </div>`;
    }

    function renderParts() {
      const cards = partOrder.map((id) => {
        const selected = state.selectedParts.includes(id);
        const disabled = !selected && state.selectedParts.length >= MAX_SELECTION;
        return `<button class="body-part-card ${selected ? "selected" : ""}" type="button" data-part="${id}" ${disabled ? "disabled" : ""}>
          <span class="part-icon">${parts[id].icon}</span><span class="node-label">${partDisplayCodes[id] || "BODY NODE"}</span><strong>${parts[id].label}</strong><small>${selected ? "選択中" : "タップして選択"}</small>
        </button>`;
      }).join("");
      return `<section class="panel diagnosis-panel">
        ${stepHeader("parts")}
        <div class="body-part-grid">${cards}</div>
        ${state.limitMessage ? `<p class="form-hint limit-message">${state.limitMessage}</p>` : ""}
      </section>`;
    }

    function renderPrimary() {
      return `<section class="panel diagnosis-panel">
        ${stepHeader("primary")}
        <div class="diagnosis-option-grid">${state.selectedParts.map((id) => selectableCard({ id, text: label(id), selected: state.primaryPart === id, name: "primaryPart", multi: false })).join("")}</div>
      </section>`;
    }

    function renderSituations() {
      return `<section class="panel diagnosis-panel">
        ${stepHeader("situations")}
        <div class="diagnosis-option-grid">${selectedSituations().map(([id, text]) => selectableCard({ id, text, selected: state.situations.includes(id), disabled: !state.situations.includes(id) && state.situations.length >= 3, name: "situations" })).join("")}</div>
      </section>`;
    }

    function renderSymptoms() {
      return `<section class="panel diagnosis-panel">
        ${stepHeader("symptoms")}
        <div class="diagnosis-option-grid">${symptomOptions.map(([id, text]) => selectableCard({ id, text, selected: state.symptoms.includes(id), disabled: !state.symptoms.includes(id) && state.symptoms.length >= 3, name: "symptoms" })).join("")}</div>
        ${hasNerveFlag() ? `<div class="ai-caution">しびれや力の入りにくさは、筋肉だけでなく神経症状なども関係することがあります。強い症状や悪化がある場合は医療機関へ相談してください。</div>` : ""}
      </section>`;
    }

    function pillGroup(title, name, options, selected) {
      return `<div class="supplement-group"><h3>${title}</h3><div class="diagnosis-option-grid compact">${options.map(([id, text]) => selectableCard({ id, text, selected: selected === id, name, multi: false })).join("")}</div></div>`;
    }

    function renderSupplement() {
      return `<section class="panel diagnosis-panel">
        ${stepHeader("supplement")}
        ${pillGroup("症状が出るタイミング", "timing", timingOptions, state.timing)}
        ${pillGroup("左右", "side", sideOptions, state.side)}
        ${pillGroup("症状の広がり", "spread", spreadOptions, state.spread)}
      </section>`;
    }

    function addScore(scoreMap, reasonMap, muscle, points, reason) {
      scoreMap.set(muscle, (scoreMap.get(muscle) || 0) + points);
      if (!reasonMap.has(muscle)) reasonMap.set(muscle, new Set());
      if (reason) reasonMap.get(muscle).add(reason);
    }

    function calculate() {
      const scores = new Map();
      const reasons = new Map();
      const primary = state.primaryPart;
      const selectedSet = new Set(state.selectedParts);
      const situationSet = new Set(state.situations);
      const symptomSet = new Set(state.symptoms);

      muscleRules.forEach((rule) => {
        let matched = 0;
        if (rule.primary.includes(primary)) {
          addScore(scores, reasons, rule.name, 26, `${label(primary)}が主な部位として選ばれています`);
          matched += 1;
        }
        state.selectedParts.forEach((partId) => {
          if (partId !== primary && (rule.primary.includes(partId) || rule.related.includes(partId))) {
            addScore(scores, reasons, rule.name, 7, `${label(partId)}にも気になる反応があります`);
            matched += 1;
          }
        });
        state.situations.forEach((id) => {
          if (rule.motions.includes(id)) {
            addScore(scores, reasons, rule.name, 12, `${optionLabel(selectedSituations(), id)}で負担が増えやすい傾向があります`);
            matched += 1;
          }
          if (rule.contraction?.includes(id)) addScore(scores, reasons, rule.name, 5, "筋肉を使う動作で反応しやすい回答です");
          if (rule.stretch?.includes(id)) addScore(scores, reasons, rule.name, 5, "筋肉が伸ばされる動作で反応しやすい回答です");
          if (rule.bonus?.includes(id)) addScore(scores, reasons, rule.name, 4, "日常負荷の特徴と重なります");
        });
        state.symptoms.forEach((id) => {
          if (rule.symptoms.includes(id)) {
            addScore(scores, reasons, rule.name, 8, `${optionLabel(symptomOptions, id)}という症状の性質と合います`);
            matched += 1;
          }
        });
        if (state.timing === "start" && ["腸腰筋", "大臀筋", "中臀筋", "足底筋群", "前脛骨筋"].includes(rule.name)) addScore(scores, reasons, rule.name, 4, "動き始めの反応が候補に影響します");
        if (state.timing === "end" && ["棘上筋", "多裂筋", "大腿四頭筋", "下腿三頭筋"].includes(rule.name)) addScore(scores, reasons, rule.name, 4, "最後まで動かした時の反応が候補に影響します");
        if (state.spread === "near" && rule.related.some((id) => selectedSet.has(id))) addScore(scores, reasons, rule.name, 5, "近くの部位まで広がる回答と関連します");
        if (state.spread === "limb" && ["斜角筋", "梨状筋", "腰方形筋", "後脛骨筋"].includes(rule.name)) addScore(scores, reasons, rule.name, 5, "腕や脚まで広がる回答では注意して見ます");
        if (matched === 0) addScore(scores, reasons, rule.name, -8, "");
      });

      const topMuscles = Array.from(scores.entries())
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, score], index) => {
          const reasonList = Array.from(reasons.get(name) || []).filter(Boolean).slice(0, 3);
          return { name, score: Math.round(score), relation: relationLabel(index), reasons: reasonList };
        });

      if (!topMuscles.length) {
        muscleRules.filter((rule) => rule.primary.includes(primary)).slice(0, 3).forEach((rule, index) => topMuscles.push({ name: rule.name, score: 10 - index, relation: relationLabel(index), reasons: [`${label(primary)}に関係する代表的な筋肉です`] }));
      }

      const burdenScore = Math.min(100, Math.max(10, Math.round((topMuscles[0].score || 10) + state.situations.length * 8 + state.symptoms.length * 7 + (hasNerveFlag() ? 12 : 0))));
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
        care: parts[primary].care,
        duration: state.timing || "unknown",
        durationLabel: state.timing ? optionLabel(timingOptions, state.timing) : "未選択",
        lifestyleTags: [primary, ...state.situations, ...state.symptoms],
        motionResults: state.situations.map((id) => ({ part: label(primary), label: optionLabel(selectedSituations(), id), answer: state.symptoms.map((symptom) => optionLabel(symptomOptions, symptom)).join(" / "), score: 1 })),
        lead: "",
        shareText: "",
        autoSaved: false,
        answers: {
          selectedParts: state.selectedParts,
          primaryPart: primary,
          situations: state.situations,
          symptoms: state.symptoms,
          timing: state.timing,
          side: state.side,
          spread: state.spread
        }
      };
      result.lead = hasDanger
        ? "しびれや力の入りにくさが選ばれています。筋肉の負担だけでなく、神経症状なども含めて確認してください。"
        : `${label(primary)}を中心に、動作と症状の組み合わせから筋肉候補を整理しました。`;
      result.shareText = ["Health Check Lab / 全身筋肉チェック", `主な部位：${result.regionLabel}`, `気になる場所：${result.selectedParts.join(" / ")}`, `負担レベル：${result.postureDamage}/100`, `候補：${topMuscles.map((item) => item.name).join(" / ")}`, "※医療診断ではなくセルフチェックの参考情報です"].join("\n");
      state.latest = result;
      return result;
    }

    function relationLabel(index) {
      return ["可能性が比較的高い", "可能性がある", "関連する可能性がある"][index] || "関連する可能性がある";
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
      return Platform.normalizeRecord(result, {
        diagnosisId: result.diagnosisId,
        anonymousDeviceId: Platform.anonymousDeviceId(localStorage),
        anonymousSessionId: Platform.anonymousSessionId(sessionStorage),
        referralSource: Platform.referralSource(sessionStorage),
        repeatVisit: existing.some((item) => item.diagnosisId !== result.diagnosisId),
        profile
      });
    }
    function saveLocal(result) {
      if (Platform) return Platform.upsertRecord(localStorage, STORAGE_KEY, result);
      const records = localRecords(); records.push(result); localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-300))); return records;
    }
    async function submitSupabase(result, mode = "auto") {
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
      saveLocal(result);
      const status = $("#saveStatus");
      if (status) status.textContent = "この端末に記録しました。匿名集計へ安全に送信しています。";
      try { await submitSupabase(result, "auto"); if (status) status.textContent = "この端末に記録しました。匿名集計にも反映されます。"; }
      catch { if (status) status.textContent = "この端末に記録しました。匿名集計は通信できる時に利用できます。"; }
    }
    async function saveAgain() {
      if (!state.latest) return;
      emit("diagnosis_save_click");
      const status = $("#saveStatus");
      if (status) status.textContent = "今回の状態を記録しています...";
      const result = normalizedRecord(state.latest, profileFromForm());
      result.autoSaved = true;
      state.latest = result;
      saveLocal(result);
      await Promise.allSettled([submitSupabase(result, "confirm")]);
      emit("diagnosis_save_complete");
      refreshRecordExperience(result);
      const refreshedStatus = $("#saveStatus");
      if (refreshedStatus) refreshedStatus.textContent = "記録しました。次回の診断で今回の状態と比較できます。";
    }

    function bodyAiPayload(result) {
      return {
        summary: result.shareText,
        result: {
          selectedParts: result.selectedParts,
          primaryPart: result.regionLabel,
          situations: state.situations.map((id) => optionLabel(selectedSituations(), id)),
          symptoms: state.symptoms.map((id) => optionLabel(symptomOptions, id)),
          supplement: {
            timing: optionLabel(timingOptions, state.timing),
            side: optionLabel(sideOptions, state.side),
            spread: optionLabel(spreadOptions, state.spread)
          },
          muscles: result.topMuscles,
          scoreReasons: result.topMuscles.map((item) => ({ muscle: item.name, reasons: item.reasons })),
          dangerSigns: result.dangerSigns
        }
      };
    }
    function aiListCard(title, items, tone = "") { return `<article class="trust-card ${tone}"><h3>${title}</h3><ul class="trust-list">${(items || []).map((item) => `<li>${item}</li>`).join("")}</ul></article>`; }
    function renderBodyAiAnalysis(analysis, cached = false) {
      $("#bodyAiResult").innerHTML = `<div class="ai-result"><p class="ai-badge">${cached ? "AI分析済み（キャッシュ）" : "AI分析"}</p><article class="info-card"><h3>AI要約</h3><p>${analysis.result_summary}</p></article><article class="info-card"><h3>負担パターン</h3><p>${analysis.burden_pattern}</p></article><article class="info-card"><h3>筋肉ごとの理由</h3><ul class="trust-list">${(analysis.muscle_reasons || []).map((item) => `<li><strong>${item.muscle}</strong><br>${item.reason}</li>`).join("")}</ul></article><div class="trust-card-grid">${aiListCard("セルフケア方向性", analysis.selfcare_direction, "good")}${aiListCard("避けた方が良い行動", analysis.avoid_actions, "warning")}${aiListCard("受診目安", analysis.when_to_see_doctor, "danger")}</div><article class="info-card"><h3>共有文章</h3><pre class="share-note">${analysis.share_text || ""}</pre></article><p class="ai-caution">${analysis.medical_disclaimer || "この結果は医療診断ではありません。"}</p></div>`;
    }

    function articleText(article) {
      return [article.title, article.category, article.summary, article.excerpt, ...(article.tags || []), ...(article.specialtyTags || []), ...(article.relatedMuscles || []), ...(article.relatedSymptoms || [])].filter(Boolean).join(" ").toLowerCase();
    }

    function scoreArticle(article, terms) {
      const text = articleText(article);
      return terms.reduce((total, term) => total + (text.includes(String(term || "").toLowerCase()) ? 1 : 0), 0);
    }

    function relatedArticleCard(article) {
      return `<a class="diagnosis-related-card" href="/health-library/${encodeURIComponent(article.slug)}" data-link><span>${esc(article.category || "健康情報")}</span><strong>${esc(article.title)}</strong><small>${esc(article.summary || article.excerpt || "関連する記事を読む")}</small></a>`;
    }

    async function refreshRelatedArticles(result) {
      const root = $("#resultRelatedArticles");
      if (!root || !window.loadHealthLibraryData) return;
      try {
        const { articles } = await window.loadHealthLibraryData();
        const terms = [result.regionLabel, ...result.selectedParts, ...result.topMuscles.map((item) => item.name), ...state.situations.map((id) => optionLabel(selectedSituations(), id)), ...state.symptoms.map((id) => optionLabel(symptomOptions, id))].filter(Boolean);
        const picked = articles
          .filter((article) => article.slug)
          .map((article) => ({ article, score: scoreArticle(article, terms) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((item) => item.article);
        if (picked.length) root.innerHTML = picked.map(relatedArticleCard).join("");
      } catch (_) {
        root.dataset.fallback = "true";
      }
    }
    async function runBodyAiAnalysis() {
      const button = $("#bodyAiBtn");
      const result = state.latest;
      if (!result) return;
      emit("ai_explanation_clicked", { topMuscle: result.topMuscles[0]?.name || "" });
      setButtonLoading(button, true, "AI判定中...");
      $("#bodyAiResult").innerHTML = `<p class="empty-insight">AIが結果を整理しています。</p>`;
      try { const data = await analyzeWithOpenAI("analyze-body-check", bodyAiPayload(result)); renderBodyAiAnalysis(data.analysis, data.cached); }
      catch (error) { $("#bodyAiResult").innerHTML = `<p class="ai-error">${error.message}</p>`; }
      finally { setButtonLoading(button, false); }
    }

    function formatRecordDate(value) {
      const date = new Date(value || Date.now());
      if (Number.isNaN(date.getTime())) return "日時不明";
      return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(date);
    }

    function bodyMapPosition(regionId, side) {
      const positions = {
        neck: [50, 16], shoulder: [side === "left" ? 62 : side === "right" ? 38 : 50, 23], scapula: [50, 29],
        back: [50, 37], lowback: [50, 48], buttock: [50, 55], hip: [side === "left" ? 58 : side === "right" ? 42 : 50, 56],
        thigh: [side === "left" ? 57 : side === "right" ? 43 : 50, 68], knee: [side === "left" ? 57 : side === "right" ? 43 : 50, 79],
        calf: [side === "left" ? 57 : side === "right" ? 43 : 50, 88], ankle: [side === "left" ? 57 : side === "right" ? 43 : 50, 94],
        foot: [side === "left" ? 60 : side === "right" ? 40 : 50, 97]
      };
      return positions[regionId] || [50, 50];
    }

    function renderBodyDiscovery(result) {
      const side = result.answers?.side || "unknown";
      const sideLabel = optionLabel(sideOptions, side) || "左右未選択";
      const [x, y] = bodyMapPosition(result.regionId, side);
      const movements = (result.answers?.situations || []).map((id) => optionLabel(selectedSituations(), id));
      return `<section class="result-discovery" aria-labelledby="bodyDiscoveryTitle">
        <div class="result-discovery-copy">
          <p class="trace-label">YOUR BODY TRACE</p>
          <h3 id="bodyDiscoveryTitle">${esc(result.regionLabel)}のサインから見えたこと</h3>
          <p><strong>${esc(movements[0] || "選択した動作")}</strong>と<strong>${esc(state.symptoms.map((id) => optionLabel(symptomOptions, id)).join("・"))}</strong>の組み合わせから、負担に関係する可能性がある筋肉を整理しました。</p>
          <div class="body-discovery-tags"><span>${esc(sideLabel)}</span>${movements.map((item) => `<span>${esc(item)}</span>`).join("")}</div>
        </div>
        <div class="body-map-card" aria-label="${esc(result.regionLabel)}を強調した身体マップ">
          <div class="body-figure" aria-hidden="true"><i class="body-head"></i><i class="body-torso"></i><i class="body-arm left"></i><i class="body-arm right"></i><i class="body-leg left"></i><i class="body-leg right"></i><b class="body-marker" style="--marker-x:${x}%;--marker-y:${y}%"></b></div>
          <div class="body-map-caption"><small>選択した部位</small><strong>${esc(result.regionLabel)}・${esc(sideLabel)}</strong><span>${result.postureDamage}/100</span></div>
        </div>
      </section>`;
    }

    function comparisonSummary(result, previous) {
      if (!Platform || !previous) return null;
      return Platform.compareRecords(normalizedRecord(result), previous);
    }

    function renderHistoryRows(records) {
      if (!records.length) return `<p class="empty-insight">今回が最初の記録です。</p>`;
      return `<ol class="body-history-list">${records.slice(0, 6).map((item) => `<li><time>${formatRecordDate(item.diagnosisDate || item.savedAt)}</time><div><strong>${esc(item.regionLabel || item.bodyPart || "身体チェック")}</strong><span>負担スコア ${Number(item.symptomScore ?? item.postureDamage ?? item.totalScore ?? 0)}/100</span></div><small>${esc((item.candidateMuscles || item.topMuscles?.map((muscle) => muscle.name) || []).slice(0, 2).join("・"))}</small></li>`).join("")}</ol>`;
    }

    function renderRecordExperience(result) {
      const current = normalizedRecord(result);
      const allRecords = localRecords();
      const history = Platform ? Platform.comparableHistory(allRecords, current) : [];
      const previous = history[0] || null;
      const comparison = comparisonSummary(current, previous);
      const dates = Platform?.recommendedDates(current.diagnosisDate || current.savedAt) || {};
      const deltaLabel = comparison ? `${comparison.delta > 0 ? "+" : ""}${comparison.delta}` : "-";
      const preview = comparison
        ? `<div class="record-preview"><span>前回 ${comparison.previousScore}/100</span><strong>今回 ${comparison.currentScore}/100</strong><b class="${comparison.direction}">差 ${deltaLabel}</b></div>`
        : `<div class="record-preview first-record"><strong>今回が比較の基準になります</strong><span>次回から変化を確認できます</span></div>`;
      return `<section class="body-record-panel" id="recordExperience" aria-labelledby="recordExperienceTitle">
        <div class="record-panel-head"><div><p class="trace-label">MY BODY / LOCAL RECORD</p><h3 id="recordExperienceTitle">7日後の変化を見るために記録する</h3><p>この端末だけに履歴を残し、次回の同じ部位の結果と比較できます。ログインは不要です。</p></div>${preview}</div>
        <div class="record-primary-action"><button class="primary-button" id="saveBodyBtn" type="button">今回の状態を記録する</button><p id="saveStatus">結果をこの端末へ記録しています。</p></div>
        <div class="record-action-row">
          <button class="secondary-button" id="compareBodyBtn" type="button" ${previous ? "" : "disabled"}>前回と比較する</button>
          <button class="secondary-button" id="historyBodyBtn" type="button">診断履歴を見る（${allRecords.length}件）</button>
          <button class="secondary-button" id="retryBodyBtn" type="button">もう一度診断する</button>
        </div>
        <div class="body-comparison" id="bodyComparison" hidden>${comparison ? `<h4>前回との比較</h4><div class="comparison-grid"><p><small>負担スコア</small><strong>${comparison.previousScore} → ${comparison.currentScore}</strong><span>差 ${deltaLabel}</span></p><p><small>共通する候補筋</small><strong>${esc(comparison.sharedMuscles.join("・") || "共通候補なし")}</strong><span>${comparison.sideChanged ? "左右の回答に変化があります" : "左右の回答は同じです"}</span></p></div>` : ""}</div>
        <div class="body-history" id="bodyHistory" hidden><div class="history-head"><h4>この端末の診断履歴</h4><span>最大300件</span></div>${renderHistoryRows(allRecords.slice().sort((a, b) => new Date(b.diagnosisDate || b.savedAt || 0) - new Date(a.diagnosisDate || a.savedAt || 0)))}</div>
        <div class="retry-schedule"><span>次の確認目安</span><strong>7日後 ${formatRecordDate(dates.sevenDays)}</strong><strong>14日後 ${formatRecordDate(dates.fourteenDays)}</strong></div>
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
      $("#compareBodyBtn")?.addEventListener("click", () => {
        const panel = $("#bodyComparison");
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) emit("diagnosis_compare_view");
      });
      $("#historyBodyBtn")?.addEventListener("click", () => {
        const panel = $("#bodyHistory");
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) emit("diagnosis_history_view");
      });
      $("#retryBodyBtn")?.addEventListener("click", () => {
        emit("diagnosis_retry_click");
        reset();
        render();
        window.scrollTo({ top: 0, behavior: "auto" });
      });
    }

    function renderResult() {
      const result = state.latest || calculate();
      const maxScore = Math.max(...result.topMuscles.map((item) => item.score), 1);
      return `<section class="result-panel">
        <div class="result-hero">
          <div class="score-circle large-score" style="--score:${result.postureDamage}%"><strong>${result.postureDamage}</strong><span>/100</span></div>
          <div><p class="eyebrow">TRACE COMPLETE</p><h2>今回の回答から、関係している可能性のある筋肉</h2><p>${result.lead}</p></div>
        </div>
        ${renderBodyDiscovery(result)}
        <div class="metric-grid">
          <article class="metric-card"><small>主な部位</small><strong>${result.regionLabel}</strong><span>結果判定で最優先</span></article>
          <article class="metric-card"><small>タイプ</small><strong>${result.bodyType}</strong><span>回答傾向から分類</span></article>
          <article class="metric-card ${result.hasDanger ? "danger" : ""}"><small>注意表示</small><strong>${result.hasDanger ? "要確認" : "通常表示"}</strong><span>${result.hasDanger ? result.dangerSigns.join("、") : "しびれ・力の入りにくさは未選択"}</span></article>
        </div>
        <article class="info-card">
          <h3>症状と動きから候補として考えられる筋肉</h3>
          <ol class="muscle-rank-list">${result.topMuscles.map((item) => `<li><div><strong>${item.name}</strong><span>${item.relation}</span></div><b style="width:${Math.max(18, Math.round((item.score / maxScore) * 100))}%"></b></li>`).join("")}</ol>
        </article>
        <article class="info-card">
          <h3>候補になった理由</h3>
          <div class="reason-grid">${result.topMuscles.map((item) => `<div><strong>${item.name}</strong><ul>${item.reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul></div>`).join("")}</div>
        </article>
        ${renderRecordExperience(result)}
        <article class="ai-caution">
          この結果は医療診断ではなく、回答内容から負担が考えられる筋肉を推定した参考情報です。${result.hasDanger ? "しびれ、麻痺、力が入りにくい、強い痛み、発熱、外傷などがある場合は医療機関へ相談してください。" : ""}
        </article>
        <article class="info-card population-insight-card"><p class="trace-label">HEALTH CHECK LAB TRENDS</p><h3>Health Check Lab利用者の匿名傾向</h3><p>このサービス内で記録された傾向です。日本人全体の統計ではありません。</p><div id="resultCommunityInsights"><p class="empty-insight">匿名集計を読み込みます。</p></div></article>
        <article class="info-card">
          <h3>NEXT SIGNALS</h3>
          <p>この筋肉について、もう少し深く知るための記事へつなげます。</p>
          <div class="diagnosis-related-grid" id="resultRelatedArticles">
            <a class="diagnosis-related-card" href="/health-library?search=${encodeURIComponent(result.regionLabel)}"><span>健康情報</span><strong>${result.regionLabel}の記事を探す</strong><small>選択した部位に近い記事を表示します。</small></a>
            <a class="diagnosis-related-card" href="/health-library?search=${encodeURIComponent(result.topMuscles[0]?.name || result.regionLabel)}"><span>筋肉</span><strong>${result.topMuscles[0]?.name || result.regionLabel}</strong><small>候補筋肉に関係する記事を探します。</small></a>
            <a class="diagnosis-related-card" href="/health-library" data-link><span>記事</span><strong>健康情報ライブラリ</strong><small>すべての記事を見る</small></a>
          </div>
        </article>
        <article class="info-card ai-card"><div class="ai-card-head"><div><h3>AIで詳しく解説する</h3><p>通常結果は表示済みです。必要な人だけAI解説を実行できます。</p></div><button class="primary-button" id="bodyAiBtn" type="button">AIで詳しく解説する</button></div><div id="bodyAiResult"><p class="empty-insight">AI解説はまだ実行していません。</p></div></article>
        <article class="info-card"><h3>SNSシェア用メモ</h3><pre id="bodyShareText" class="share-note">${result.shareText}</pre><div class="button-row"><a class="primary-button" href="https://twitter.com/intent/tweet?text=${encodeShare(result.shareText)}" target="_blank" rel="noreferrer">Xで共有</a><a class="secondary-button" href="https://social-plugins.line.me/lineit/share?text=${encodeShare(result.shareText)}" target="_blank" rel="noreferrer">LINEで共有</a><button class="secondary-button" id="copyBodyShareBtn" type="button">メモをコピー</button></div></article>
      </section>`;
    }

    function renderLoading() {
      return `<section class="panel diagnosis-panel loading-panel"><h2>回答をもとに候補を絞っています</h2><p>動作と症状の特徴を確認しています。あと少しで結果が表示されます。</p><div class="loading-dots"><span></span><span></span><span></span></div></section>`;
    }

    function canGoNext() {
      const step = currentStepId();
      if (step === "parts") return state.selectedParts.length > 0;
      if (step === "primary") return Boolean(state.primaryPart);
      if (step === "situations") return state.situations.length > 0;
      if (step === "symptoms") return state.symptoms.length > 0;
      if (step === "supplement") return Boolean(state.timing && state.side && state.spread);
      return true;
    }

    function render() {
      const step = currentStepId();
      const content = state.calculating ? renderLoading() : ({ parts: renderParts, primary: renderPrimary, situations: renderSituations, symptoms: renderSymptoms, supplement: renderSupplement, result: renderResult }[step] || renderParts)();
      $("#bodyCheckRoot").innerHTML = `${hiddenAnalyticsInputs()}${renderProgress()}${content}<div class="form-actions diagnosis-actions">${step !== "parts" ? `<button class="secondary-button" id="bodyBackBtn" type="button">戻る</button>` : `<a class="secondary-button" href="/" data-link>ホームへ戻る</a>`}${step !== "result" ? `<button class="primary-button" id="bodyNextBtn" type="button" ${canGoNext() ? "" : "disabled"}>${nextLabel(step)}</button>` : `<button class="secondary-button" id="bodyResetBtn" type="button">最初からやり直す</button>`}</div>`;
      bindStep();
      const stepKey = `${state.stepIndex}:${step}`;
      if (lastTrackedStep !== stepKey) {
        lastTrackedStep = stepKey;
        emit("step_viewed", { currentStep: state.stepIndex, questionId: step });
      }
    }

    function nextLabel(step) {
      if (step === "supplement") return "結果を見る";
      return "次へ進む";
    }

    function goNext() {
      if (!canGoNext()) return;
      const steps = currentSteps();
      const step = currentStepId();
      if (step === "parts" && state.selectedParts.length === 1) state.primaryPart = state.selectedParts[0];
      if (step === "supplement") {
        state.calculating = true;
        render();
        window.setTimeout(() => {
          calculate();
          state.calculating = false;
          state.stepIndex = currentSteps().length - 1;
          render();
          autoSave(state.latest);
          refreshRelatedArticles(state.latest);
          runWhenIdle(() => getCommunityInsights()?.refresh(state.latest, "#resultCommunityInsights"));
          emit("diagnosis_completed", { results: { burdenScore: state.latest.postureDamage, bodyType: state.latest.bodyType }, topMuscle: state.latest.topMuscles[0]?.name || "" });
        }, 350);
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
      const list = state[key];
      const exists = list.includes(id);
      state[key] = exists ? list.filter((item) => item !== id) : list.length < max ? [...list, id] : list;
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
          state.timing = "";
          state.side = "";
          state.spread = "";
        }
        state.latest = null;
        render();
      }));
      $$(".diagnosis-option").forEach((button) => button.addEventListener("click", () => {
        const name = button.dataset.name;
        const id = button.dataset.choice;
        if (button.dataset.multi === "false") {
          const changedPrimary = name === "primaryPart" && state.primaryPart !== id;
          state[name] = id;
          if (changedPrimary) {
            state.situations = [];
            state.symptoms = [];
            state.timing = "";
            state.side = "";
            state.spread = "";
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
      $("#bodyResetBtn")?.addEventListener("click", () => { emit("restart_clicked", { currentStep: state.stepIndex }); reset(); render(); });
      $("#copyBodyShareBtn")?.addEventListener("click", () => copyText($("#bodyShareText").textContent));
      bindRecordControls();
      $("#bodyAiBtn")?.addEventListener("click", runBodyAiAnalysis);
    }

    function init() {
      reset();
      render();
    }

    return { init, localRecords };
  }

  window.createBodyCheck = createBodyCheck;
})();
