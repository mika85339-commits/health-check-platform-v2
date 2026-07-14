const SUPABASE_URL = "https://uebrtbflpgccbyysiyrh.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlYnJ0YmZscGdjY2J5eXNpeXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjkwNjMsImV4cCI6MjA5NzE0NTA2M30.9FizNy7npscQ2phTDt3RdMg_rhhOVuDWcQu9LvBcNcQ";
const SUPABASE_TABLE = "community_insights";
const STORAGE_KEY = "health_check_lab_records";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function toast(message) {
  const current = $(".toast");
  if (current) current.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("コピーしました");
  } catch {
    toast("コピーできませんでした");
  }
}

function encodeShare(text) {
  return encodeURIComponent(text);
}

const AI_CACHE_KEY = "health_check_lab_ai_cache";

function loadAiCache() {
  try {
    return JSON.parse(localStorage.getItem(AI_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveAiCache(cache) {
  localStorage.setItem(AI_CACHE_KEY, JSON.stringify(cache));
}

function aiCacheKey(endpoint, payload) {
  return `${endpoint}:${JSON.stringify(payload).slice(0, 3000)}`;
}

function inputLength(payload) {
  return JSON.stringify(payload || {}).replace(/[{}\[\]":,]/g, "").trim().length;
}

async function analyzeWithOpenAI(endpoint, payload) {
  const trimmedPayload = { ...(payload || {}) };
  if (typeof trimmedPayload.text === "string") trimmedPayload.text = trimmedPayload.text.slice(0, 3000);
  if (typeof trimmedPayload.summary === "string") trimmedPayload.summary = trimmedPayload.summary.slice(0, 3000);
  if (endpoint === "analyze-health-content") {
    const source = [
      trimmedPayload.video_content && `動画内容:\n${trimmedPayload.video_content}`,
      trimmedPayload.subtitles && `字幕:\n${trimmedPayload.subtitles}`,
      trimmedPayload.post_text && `投稿文:\n${trimmedPayload.post_text}`,
      trimmedPayload.caption && `キャプション:\n${trimmedPayload.caption}`
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 3000);
    trimmedPayload.video_content = source;
    trimmedPayload.subtitles = "";
    trimmedPayload.post_text = "";
    trimmedPayload.caption = "";
    trimmedPayload.text = source;
  }
  if (inputLength(trimmedPayload) < 20) {
    throw new Error("入力内容が短いためAI判定は行いません。");
  }

  const cache = loadAiCache();
  const key = aiCacheKey(endpoint, trimmedPayload);
  if (cache[key]) return { cached: true, analysis: cache[key] };

  const response = await fetch(`/.netlify/functions/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(trimmedPayload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if ([404, 405, 501].includes(response.status)) {
      throw new Error("OpenAI API機能が起動していません。ローカル確認ではNetlify Functions対応のサーバーで開いてください。公開サイトではNetlifyの環境変数設定も確認してください。");
    }
    throw new Error(data.error || "AI判定中にエラーが発生しました。");
  }
  cache[key] = data.analysis;
  saveAiCache(cache);
  return data;
}

function setButtonLoading(button, isLoading, label) {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function runWhenIdle(callback) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 1200 });
    return;
  }
  window.setTimeout(callback, 250);
}

const CAUTION_TEXT =
  "このサイトは医療診断を行うものではありません。表示結果はセルフチェックの目安です。強い痛み、しびれ、麻痺、発熱などがある場合は医療機関へ相談してください。";

const libraryCategories = [
  "ストレッチ",
  "姿勢・骨盤矯正",
  "筋膜・トリガーポイント",
  "筋トレ・運動",
  "痛み・神経",
  "鍼灸・治療",
  "SNS健康情報"
];

const healthLibraryArticles = [
  { slug: "stretch-basics", title: "ストレッチの基本", category: "ストレッチ", label: "✅ 正しい", summary: "無理のない範囲で行うストレッチの考え方を整理します。" },
  { slug: "posture-pelvis-basics", title: "姿勢と骨盤の見方", category: "姿勢・骨盤矯正", label: "⚠️ 一部正しい", summary: "姿勢や骨盤の話を、断定しすぎず整理します。" },
  { slug: "fascia-trigger-point", title: "筋膜とトリガーポイント", category: "筋膜・トリガーポイント", label: "⚠️ 一部正しい", summary: "筋膜やトリガーポイントの情報の見方をまとめます。" },
  { slug: "training-pain-care", title: "痛みがある時の運動", category: "筋トレ・運動", label: "⚠️ 一部正しい", summary: "運動を続けるか休むかを考える材料を整理します。" },
  { slug: "pain-nerve-signs", title: "痛みと神経症状", category: "痛み・神経", label: "✅ 正しい", summary: "しびれや強い痛みがある時の注意点を確認します。" },
  { slug: "acupuncture-care", title: "鍼灸と体のケア", category: "鍼灸・治療", label: "✅ 正しい", summary: "鍼灸をセルフケアとどう組み合わせるか整理します。" },
  { slug: "sns-health-claims", title: "SNS健康情報の見分け方", category: "SNS健康情報", label: "❌ 根拠が弱い", summary: "強い断定や商品誘導がある投稿の見方を確認します。" }
];

const BodyCheck = (() => {
  const parts = {
    neck: { label: "首", adjacent: ["shoulder"], muscles: ["胸鎖乳突筋", "斜角筋", "後頭下筋群", "肩甲挙筋"], care: ["首を大きく回さず、後頭部を軽く伸ばすストレッチを20秒", "スマホを見る高さを少し上げて首の前傾を減らす"], questions: [
      ["neck_turn", "首を回す", ["胸鎖乳突筋", "斜角筋", "肩甲挙筋"]],
      ["look_up", "上を向く", ["後頭下筋群", "僧帽筋上部"]],
      ["look_down", "下を向く", ["板状筋", "僧帽筋上部"]],
      ["desk_after", "デスクワーク後につらい", ["肩甲挙筋", "僧帽筋上部"]],
      ["phone_after", "スマホ後につらい", ["胸鎖乳突筋", "後頭下筋群"]],
      ["headache", "頭痛を伴う", ["後頭下筋群", "側頭筋", "胸鎖乳突筋"]]
    ]},
    shoulder: { label: "肩", adjacent: ["neck"], muscles: ["僧帽筋", "肩甲挙筋", "三角筋", "回旋筋腱板"], care: ["肩甲骨を後ろへ軽く寄せる運動を10回", "肩をすくめず腕を小さく回す運動を左右10回"], questions: [
      ["front_raise", "腕を前から上げる", ["三角筋前部", "前鋸筋", "回旋筋腱板"]],
      ["side_raise", "腕を横から上げる", ["三角筋中部", "棘上筋"]],
      ["hand_back", "背中に手を回す", ["肩甲下筋", "小胸筋", "広背筋"]],
      ["heavy", "肩が重だるい", ["僧帽筋上部", "肩甲挙筋"]],
      ["scapula_tight", "肩甲骨周囲が張る", ["菱形筋", "僧帽筋中部"]],
      ["sitting_pain", "長時間座るとつらい", ["僧帽筋", "胸筋群", "肩甲挙筋"]]
    ]},
    lowback: { label: "腰", adjacent: ["hip"], muscles: ["脊柱起立筋", "多裂筋", "腰方形筋", "腸腰筋", "大臀筋"], care: ["仰向けで膝を抱えるストレッチを20秒", "痛みがなければ小さな骨盤前後運動を10回"], questions: [
      ["forward_bend", "前屈する", ["脊柱起立筋", "ハムストリングス", "大臀筋"]],
      ["extension", "腰を反る", ["多裂筋", "腰方形筋", "腸腰筋"]],
      ["stand_up", "立ち上がる", ["大臀筋", "腸腰筋", "脊柱起立筋"]],
      ["long_sit", "長時間座るとつらい", ["腸腰筋", "梨状筋", "腰方形筋"]],
      ["long_stand", "長時間立つとつらい", ["脊柱起立筋", "腰方形筋", "中臀筋"]],
      ["walk_worse", "歩くと悪化する", ["中臀筋", "腸腰筋", "多裂筋"]]
    ]},
    hip: { label: "股関節", adjacent: ["lowback", "knee"], muscles: ["腸腰筋", "中臀筋", "梨状筋", "内転筋", "大臀筋"], care: ["股関節前側を無理なく伸ばすストレッチを左右20秒", "お尻を軽く締める運動を10回"], questions: [
      ["hip_open", "脚を開く", ["内転筋", "梨状筋", "中臀筋"]],
      ["knee_hug", "脚を抱える", ["大臀筋", "梨状筋", "腸腰筋"]],
      ["socks", "靴下を履く", ["腸腰筋", "大臀筋", "内転筋"]],
      ["walk_pain", "歩くとつらい", ["中臀筋", "腸腰筋", "大臀筋"]],
      ["sit_pain", "座るとつらい", ["梨状筋", "腸腰筋"]],
      ["cross_leg", "脚を組むことが多い", ["梨状筋", "内転筋", "中臀筋"]]
    ]},
    knee: { label: "膝", adjacent: ["hip", "ankle"], muscles: ["大腿四頭筋", "ハムストリングス", "中臀筋", "下腿三頭筋"], care: ["椅子からゆっくり立ち座りを5回", "太もも前を軽く伸ばすストレッチを20秒"], questions: [
      ["stairs_up", "階段を上る", ["大腿四頭筋", "中臀筋"]],
      ["stairs_down", "階段を下る", ["大腿四頭筋", "ハムストリングス"]],
      ["squat", "しゃがむ", ["大腿四頭筋", "内転筋", "臀筋群"]],
      ["long_walk", "長時間歩くとつらい", ["大腿四頭筋", "中臀筋", "下腿三頭筋"]],
      ["stairs_worse", "階段で悪化する", ["大腿四頭筋", "中臀筋"]],
      ["stand_start", "立ち上がりでつらい", ["大腿四頭筋", "大臀筋"]]
    ]},
    ankle: { label: "足首", adjacent: ["knee"], muscles: ["下腿三頭筋", "前脛骨筋", "足底筋群", "後脛骨筋"], care: ["足首をゆっくり上下に動かす運動を10回", "ふくらはぎを軽く伸ばすストレッチを20秒"], questions: [
      ["walk", "歩く", ["下腿三頭筋", "前脛骨筋", "足底筋群"]],
      ["ankle_squat", "しゃがむ", ["下腿三頭筋", "前脛骨筋"]],
      ["toe_stand", "つま先立ち", ["下腿三頭筋", "足底筋群"]],
      ["walk_worse", "歩行で悪化する", ["後脛骨筋", "足底筋群"]],
      ["stand_worse", "立ちっぱなしで悪化する", ["下腿三頭筋", "足底筋群"]],
      ["morning_stiff", "朝こわばる", ["足底筋群", "下腿三頭筋"]]
    ]}
  };

  const answerOptions = [
    { id: "pain", label: "痛い", score: 10, bucket: "pain" },
    { id: "limited", label: "動きにくい", score: 7, bucket: "mobility" },
    { id: "minor", label: "少し気になる", score: 4, bucket: "mild" },
    { id: "none", label: "気にならない", score: 0, bucket: "none" }
  ];
  const durations = { days: "数日以内", week: "1週間以上", month: "1ヶ月以上", chronic: "3ヶ月以上" };
  const numbnessLabels = { none: "なし", mild: "少しある", strong: "強い" };
  const timingLabels = { moving: "動いた時", rest: "動かなくても", morning: "朝", evening: "夕方", always: "常にある" };
  const dangerLabels = { fever: "発熱", paralysis: "麻痺", bladder: "排尿排便異常", trauma: "外傷後", sudden: "急激な悪化", night: "夜間痛", none: "なし" };
  const lifestyleLabels = { desk: "デスクワーク", standing: "立ち仕事", inactive: "運動不足", training: "筋トレ", phone: "スマホ時間が長い" };
  let state = {};

  function reset() {
    state = { step: 0, selectedParts: ["lowback"], primaryPart: "lowback", responses: {}, painIntensity: 5, duration: "days", numbness: "none", timings: [], dangers: ["none"], lifestyles: [], latest: null };
  }
  function partLabel(id) { return parts[id]?.label || id; }
  function relationWeight(partId) {
    if (partId === state.primaryPart) return 3;
    if (parts[state.primaryPart]?.adjacent.includes(partId)) return 1.5;
    return 0.5;
  }
  function durationPoint() { return { days: 0, week: 5, month: 10, chronic: 18 }[state.duration] || 0; }
  function dangerActive() { return state.dangers.filter((id) => id !== "none"); }
  function scoreLevel(score, hasDanger) {
    if (hasDanger) return { level: 1, label: "医療相談を優先" };
    if (score >= 170) return { level: 2, label: "高負担" };
    if (score >= 105) return { level: 3, label: "中負担" };
    if (score >= 45) return { level: 4, label: "軽負担" };
    return { level: 5, label: "安定傾向" };
  }
  function typeName(result) {
    if (result.hasDanger) return "医療相談優先タイプ";
    if (state.numbness === "strong") return "しびれ注意タイプ";
    if (["neck", "shoulder"].includes(state.primaryPart) && (state.lifestyles.includes("desk") || state.lifestyles.includes("phone")) && state.duration === "chronic") return "慢性首肩こり蓄積タイプ";
    if (state.primaryPart === "lowback" && state.lifestyles.includes("desk")) return "座りすぎ腰負担タイプ";
    if (state.primaryPart === "lowback") return "腰痛主症状タイプ";
    if (state.primaryPart === "knee") return "階段・しゃがみ膝負担タイプ";
    if (state.primaryPart === "ankle") return "歩行時足首負担タイプ";
    return `${partLabel(state.primaryPart)}中心の負担タイプ`;
  }
  function selectedQuestionCount() { return state.selectedParts.reduce((sum, id) => sum + parts[id].questions.length, 0); }

  function calculate() {
    const muscleScores = new Map();
    const partScores = new Map();
    const bucket = { pain: 0, mobility: 0, mild: 0 };
    const motionResults = [];
    state.selectedParts.forEach((partId) => {
      const weight = relationWeight(partId);
      let partTotal = 0;
      parts[partId].questions.forEach(([id, label, muscles]) => {
        const key = `${partId}_${id}`;
        const answer = answerOptions.find((item) => item.id === (state.responses[key] || "none")) || answerOptions[3];
        const weightedScore = answer.score * weight;
        partTotal += weightedScore;
        if (answer.bucket !== "none") bucket[answer.bucket] += weightedScore;
        muscles.forEach((muscle) => muscleScores.set(muscle, (muscleScores.get(muscle) || 0) + weightedScore));
        motionResults.push({ part: partLabel(partId), label, answer: answer.label, score: weightedScore });
      });
      partScores.set(partId, partTotal);
    });
    const hasDanger = dangerActive().length > 0;
    const symptomPoint = state.painIntensity * 5 + durationPoint() + (state.numbness === "mild" ? 8 : 0) + (state.numbness === "strong" ? 25 : 0) + state.timings.length * 3 + state.lifestyles.length * 3 + (hasDanger ? 60 : 0);
    const totalScore = Array.from(partScores.values()).reduce((sum, value) => sum + value, 0) + symptomPoint;
    const level = scoreLevel(totalScore, hasDanger);
    const topMuscles = Array.from(muscleScores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, score]) => ({ name, score, relation: Math.min(10, Math.max(1, Math.round(score / 9))) }));
    if (!topMuscles.length) parts[state.primaryPart].muscles.slice(0, 3).forEach((name) => topMuscles.push({ name, score: 1, relation: 2 }));
    const result = {
      module: "BodyCheck", savedAt: new Date().toISOString(), regionId: state.primaryPart, regionLabel: partLabel(state.primaryPart), selectedParts: state.selectedParts.map(partLabel), conditionLevel: level.level, levelLabel: level.label, postureDamage: Math.min(100, Math.round(totalScore / 2.1)), muscleAge: Math.min(85, Math.max(20, 22 + Math.round(totalScore / 4.2))), futureRisk: hasDanger ? "早めの医療相談推奨" : totalScore >= 160 ? "高め" : totalScore >= 95 ? "中程度" : "低め", painScore: state.painIntensity, painMotionScore: Math.round(bucket.pain), limitedScore: Math.round(bucket.mobility), stiffnessScore: Math.round(bucket.mild), totalScore: Math.round(totalScore), hasDanger, dangerSigns: dangerActive().map((id) => dangerLabels[id]), bodyType: "", topMuscles, care: parts[state.primaryPart].care, duration: state.duration, durationLabel: durations[state.duration], lifestyleTags: state.lifestyles, motionResults, lead: "", shareText: "", autoSaved: false
    };
    result.bodyType = typeName(result);
    result.lead = hasDanger ? `危険症状に「${result.dangerSigns.join("、")}」が含まれています。セルフケアより医療機関への相談を優先してください。` : `主症状は「${result.regionLabel}」として評価しました。${result.levelLabel}で、${topMuscles[0].name}の関連が高めです。`;
    result.shareText = ["Health Check Lab / BodyCheck", `主症状：${result.regionLabel}`, `気になる場所：${result.selectedParts.join(" / ")}`, `負担レベル：${result.conditionLevel}/5 ${result.levelLabel}`, `タイプ：${result.bodyType}`, `候補筋肉：${topMuscles.map((item) => item.name).join(" / ")}`, "※医療診断ではなくセルフチェックの目安です"].join("\n");
    state.latest = result;
    return result;
  }

  function localRecords() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; } }
  function saveLocal(result) { const records = localRecords(); records.push(result); localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-300))); }
  function communityPayload(result) { return { area: result.regionLabel, result_type: result.bodyType, burden_score: Math.round(result.totalScore), main_tendency: result.topMuscles[0]?.name || result.bodyType, pain_score: result.painMotionScore, mobility_score: result.limitedScore, stiffness_score: result.stiffnessScore, duration: result.duration, lifestyle_tags: result.lifestyleTags, created_at: result.savedAt }; }
  async function submitSupabase(result) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(communityPayload(result)) });
    if (!response.ok) throw new Error("Supabase save failed");
  }
  async function autoSave(result) {
    if (result.autoSaved) return;
    result.autoSaved = true; saveLocal(result);
    const status = $("#saveStatus"); if (status) status.textContent = "匿名データを保存しています...";
    try { await submitSupabase(result); if (status) status.textContent = "匿名データを保存しました。みんなの悩みに反映されます。"; } catch { if (status) status.textContent = "端末内に保存しました。公開集計は通信できる環境で反映されます。"; }
  }
  async function saveAgain() {
    if (!state.latest) return;
    const status = $("#saveStatus"); if (status) status.textContent = "記録を保存しています...";
    const result = state.latest;
    await Promise.allSettled([result.autoSaved ? Promise.resolve() : submitSupabase(result)]);
    result.autoSaved = true; if (status) status.textContent = "記録しました。匿名の集計データとして活用されます。"; toast("記録しました");
  }
  function bodyAiPayload(result) { return { summary: result.shareText, result: { area: result.regionLabel, selectedParts: result.selectedParts, level: result.levelLabel, type: result.bodyType, painScore: result.painScore, duration: result.durationLabel, numbness: numbnessLabels[state.numbness], muscles: result.topMuscles.map((item) => item.name), dangerSigns: result.dangerSigns } }; }
  function aiListCard(title, items, tone = "") { return `<article class="trust-card ${tone}"><h3>${title}</h3><ul class="trust-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul></article>`; }
  function renderBodyAiAnalysis(analysis, cached = false) { $("#bodyAiResult").innerHTML = `<div class="ai-result"><p class="ai-badge">${cached ? "AI分析済み（キャッシュ）" : "AI分析"}</p><article class="info-card"><h3>AI要約</h3><p>${analysis.result_summary}</p></article><article class="info-card"><h3>負担パターン</h3><p>${analysis.burden_pattern}</p></article><article class="info-card"><h3>筋肉ごとの理由</h3><ul class="trust-list">${analysis.muscle_reasons.map((item) => `<li><strong>${item.muscle}</strong><br>${item.reason}</li>`).join("")}</ul></article><div class="trust-card-grid">${aiListCard("セルフケア方向性", analysis.selfcare_direction, "good")}${aiListCard("避けた方が良い行動", analysis.avoid_actions, "warning")}${aiListCard("受診目安", analysis.when_to_see_doctor, "danger")}</div><article class="info-card"><h3>共有文章</h3><pre class="share-note">${analysis.share_text}</pre></article><p class="ai-caution">${analysis.medical_disclaimer}</p></div>`; }
  async function runBodyAiAnalysis() {
    const button = $("#bodyAiBtn"); const result = state.latest; if (!result) return;
    setButtonLoading(button, true, "AI判定中..."); $("#bodyAiResult").innerHTML = `<p class="empty-insight">AIが結果を整理しています。</p>`;
    try { const data = await analyzeWithOpenAI("analyze-body-check", bodyAiPayload(result)); renderBodyAiAnalysis(data.analysis, data.cached); } catch (error) { $("#bodyAiResult").innerHTML = `<p class="ai-error">${error.message}</p>`; } finally { setButtonLoading(button, false); }
  }
  function renderStepBar() { const items = ["気になる場所", "一番つらい場所", "部位別チェック", "共通質問", "結果"]; return `<div class="progress">${items.map((item, index) => `<span class="${index <= state.step ? "active" : ""}">${index + 1}. ${item}</span>`).join("")}</div>`; }
  function renderPartChoices() { return Object.entries(parts).map(([id, part]) => `<label class="choice-card"><input type="checkbox" name="selectedPart" value="${id}" ${state.selectedParts.includes(id) ? "checked" : ""} /><span>${part.label}</span></label>`).join(""); }
  function renderPrimaryChoices() { return state.selectedParts.map((id) => `<label class="choice-card"><input type="radio" name="primaryPart" value="${id}" ${state.primaryPart === id ? "checked" : ""} /><span>${partLabel(id)}</span></label>`).join(""); }
  function renderStep0() { return `<section class="panel"><h2>気になる場所</h2><p>複数選択できます。質問は選んだ部位だけ表示します。</p><div class="choice-grid">${renderPartChoices()}</div></section>`; }
  function renderStep1() { return `<section class="panel"><h2>一番つらい場所</h2><p>主症状部位として結果判定で最優先します。</p><div class="choice-grid">${renderPrimaryChoices()}</div></section>`; }
  function renderStep2() { return `<section class="panel"><h2>選択した部位だけチェック</h2><p>${selectedQuestionCount()}問です。近いものを選んでください。</p><div class="question-list">${state.selectedParts.map((partId) => `<div class="part-question-block"><h3>${partLabel(partId)}</h3>${parts[partId].questions.map(([id, label]) => { const key = `${partId}_${id}`; return `<article class="motion-question"><h4>${label}</h4><div class="answer-grid">${answerOptions.map((answer) => `<label><input type="radio" name="${key}" value="${answer.id}" ${(state.responses[key] || "none") === answer.id ? "checked" : ""} /><span>${answer.label}</span></label>`).join("")}</div></article>`; }).join("")}</div>`).join("")}</div></section>`; }
  function checkboxGroup(name, labels, selected) { return Object.entries(labels).map(([id, label]) => `<label class="chip"><input type="checkbox" name="${name}" value="${id}" ${selected.includes(id) ? "checked" : ""} /> <span>${label}</span></label>`).join(""); }
  function renderStep3() { return `<section class="panel"><h2>共通質問</h2><p>痛みの強さ、期間、しびれ、生活習慣を確認します。</p><label class="range-field"><span>痛みの強さ <strong id="painValue">${state.painIntensity}</strong>/10</span><input id="painScore" type="range" min="1" max="10" value="${state.painIntensity}" /></label><label class="field"><span>期間</span><select id="durationSelect">${Object.entries(durations).map(([id, label]) => `<option value="${id}" ${state.duration === id ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="field"><span>しびれ</span><select id="numbnessSelect">${Object.entries(numbnessLabels).map(([id, label]) => `<option value="${id}" ${state.numbness === id ? "selected" : ""}>${label}</option>`).join("")}</select></label><h3>症状タイミング</h3><div class="chip-group">${checkboxGroup("timing", timingLabels, state.timings)}</div><h3>危険症状</h3><div class="chip-group">${checkboxGroup("danger", dangerLabels, state.dangers)}</div><h3>生活習慣</h3><div class="chip-group">${checkboxGroup("lifestyle", lifestyleLabels, state.lifestyles)}</div></section>`; }
  function metric(label, value, note, tone = "") { return `<article class="metric-card ${tone}"><small>${label}</small><strong>${value}</strong><span>${note}</span></article>`; }
  function renderResultStep() {
    const result = state.latest || calculate();
    const burdenScore = result.postureDamage;
    return `<section class="result-panel"><div class="result-hero"><div class="score-circle large-score" style="--score:${burdenScore}%"><strong>${burdenScore}</strong><span>/100</span></div><div><p class="eyebrow">体の動作セルフチェック結果</p><h2>体の負担レベル ${burdenScore}点</h2><p>${result.lead}</p></div></div><div class="metric-grid">${metric("主症状部位", result.regionLabel, "結果判定で最優先")}${metric("タイプ名", result.bodyType, "回答傾向から分類")}${metric("危険症状判定", result.hasDanger ? "要注意" : "該当なし", result.hasDanger ? result.dangerSigns.join("、") : "危険症状は選択されていません", result.hasDanger ? "hot" : "")}</div><article class="info-card"><h3>関係しやすい筋肉ランキング</h3><ol class="ranking-list">${result.topMuscles.map((item) => `<li><span>${item.name}</span><strong>関連度 ${item.relation}/10</strong></li>`).join("")}</ol></article><article class="info-card"><h3>みんなの悩み比較</h3><div id="resultCommunityInsights"><p class="empty-insight">集計データを読み込みます。</p></div></article><article class="info-card ai-card"><div class="ai-card-head"><div><h3>AIで詳しく解説する</h3><p>通常結果は表示済みです。ここで初めてOpenAI APIを呼び、説明を補足します。</p></div><button class="primary-button" id="bodyAiBtn" type="button">AIで詳しく解説する</button></div><div id="bodyAiResult"><p class="empty-insight">AI解説はまだ実行していません。</p></div></article><article class="info-card"><h3>SNSシェア用メモ</h3><pre id="bodyShareText" class="share-note">${result.shareText}</pre><div class="button-row"><a class="primary-button" href="https://twitter.com/intent/tweet?text=${encodeShare(result.shareText)}" target="_blank" rel="noreferrer">Xで共有</a><a class="secondary-button" href="https://social-plugins.line.me/lineit/share?text=${encodeShare(result.shareText)}" target="_blank" rel="noreferrer">LINEで共有</a><button class="secondary-button" id="copyBodyShareBtn" type="button">メモをコピー</button></div></article><div class="save-strip"><div><strong>この結果を匿名で記録する</strong><p id="saveStatus">結果表示後に匿名データとして自動保存します。個人情報は保存しません。</p></div><button class="primary-button" id="saveBodyBtn" type="button">記録する</button></div></section>`;
  }
  function canGoNext() { if (state.step === 0) return state.selectedParts.length > 0; if (state.step === 1) return state.selectedParts.includes(state.primaryPart); return true; }
  function render() {
    const content = [renderStep0, renderStep1, renderStep2, renderStep3, renderResultStep][state.step]();
    $("#bodyCheckRoot").innerHTML = `${renderStepBar()}${content}<div class="form-actions">${state.step > 0 ? `<button class="secondary-button" id="bodyBackBtn" type="button">戻る</button>` : `<a class="secondary-button" href="/" data-link>ホームへ戻る</a>`}${state.step < 4 ? `<button class="primary-button" id="bodyNextBtn" type="button" ${canGoNext() ? "" : "disabled"}>${state.step === 3 ? "結果を見る" : "次へ進む"}</button>` : `<button class="secondary-button" id="bodyResetBtn" type="button">もう一度チェック</button>`}</div>`;
    bindStep();
  }
  function bindStep() {
    $$('input[name="selectedPart"]').forEach((input) => input.addEventListener("change", () => { state.selectedParts = $$('input[name="selectedPart"]:checked').map((item) => item.value); if (!state.selectedParts.includes(state.primaryPart)) state.primaryPart = state.selectedParts[0] || "lowback"; render(); }));
    $$('input[name="primaryPart"]').forEach((input) => input.addEventListener("change", () => { state.primaryPart = input.value; render(); }));
    $$('input[type="radio"][name*="_"]').forEach((input) => input.addEventListener("change", () => { state.responses[input.name] = input.value; }));
    $("#painScore")?.addEventListener("input", (event) => { state.painIntensity = Number(event.target.value); $("#painValue").textContent = event.target.value; });
    $("#durationSelect")?.addEventListener("change", (event) => { state.duration = event.target.value; });
    $("#numbnessSelect")?.addEventListener("change", (event) => { state.numbness = event.target.value; });
    $$('input[name="timing"]').forEach((input) => input.addEventListener("change", () => { state.timings = $$('input[name="timing"]:checked').map((item) => item.value); }));
    $$('input[name="lifestyle"]').forEach((input) => input.addEventListener("change", () => { state.lifestyles = $$('input[name="lifestyle"]:checked').map((item) => item.value); }));
    $$('input[name="danger"]').forEach((input) => input.addEventListener("change", () => { let values = $$('input[name="danger"]:checked').map((item) => item.value); if (input.value === "none" && input.checked) values = ["none"]; if (input.value !== "none" && input.checked) values = values.filter((value) => value !== "none"); state.dangers = values.length ? values : ["none"]; render(); }));
    $("#bodyBackBtn")?.addEventListener("click", () => { state.step = Math.max(0, state.step - 1); render(); window.scrollTo({ top: 0, behavior: "auto" }); });
    $("#bodyNextBtn")?.addEventListener("click", () => { if (!canGoNext()) return; if (state.step === 3) calculate(); state.step = Math.min(4, state.step + 1); render(); if (state.step === 4) { autoSave(state.latest); runWhenIdle(() => CommunityInsights.refresh(state.latest)); } window.scrollTo({ top: 0, behavior: "auto" }); });
    $("#bodyResetBtn")?.addEventListener("click", () => { reset(); render(); });
    $("#copyBodyShareBtn")?.addEventListener("click", () => copyText($("#bodyShareText").textContent));
    $("#saveBodyBtn")?.addEventListener("click", saveAgain);
    $("#bodyAiBtn")?.addEventListener("click", runBodyAiAnalysis);
  }
  function init() { reset(); render(); }
  return { init, localRecords };
})();

const SocialTrustCheck = (() => {
  const dangerWords = ["絶対治る", "病院に行くな", "薬はいらない", "副作用ゼロ", "誰でも改善", "これだけで完治", "がんが消える", "サプリだけで治る"];
  const wordSets = {
    evidence: ["論文", "研究", "PubMed", "RCT", "メタ分析", "ガイドライン", "査読"],
    publicOrg: ["厚生労働省", "国立", "WHO", "CDC", "医師会", "公的機関", "大学病院"],
    risk: ["注意", "リスク", "副作用", "禁忌", "悪化", "個人差", "無理をしない"],
    hospital: ["病院", "医療機関", "医師", "受診", "相談", "専門家"],
    product: ["購入", "限定", "今だけ", "サプリ", "教材", "オンライン講座", "リンクから"],
    anecdote: ["私は", "体験談", "個人の感想", "治りました", "ビフォーアフター"],
    assertive: ["必ず", "絶対", "完全", "完治", "誰でも", "だけで", "即効", "ゼロ"]
  };

  function hits(text, words) {
    return words.filter((word) => text.includes(word));
  }

  function platform(url) {
    if (!url) return "本文貼り付け";
    if (/x\.com|twitter\.com/i.test(url)) return "X";
    if (/instagram\.com/i.test(url)) return "Instagram";
    if (/tiktok\.com/i.test(url)) return "TikTok";
    if (/youtube\.com\/shorts|youtu\.be/i.test(url)) return "YouTube Shorts";
    return "その他URL";
  }

  function judge(score) {
    if (score >= 80) return "信頼度高め";
    if (score >= 60) return "一部注意";
    if (score >= 40) return "根拠が弱い可能性";
    if (score >= 20) return "注意が必要";
    return "かなり注意";
  }

  function collectInput() {
    const get = (selector) => $(selector)?.value.trim() || "";
    return {
      url: get("#socialUrl"),
      video_content: get("#videoContent"),
      subtitles: get("#subtitleText"),
      post_text: get("#socialText"),
      caption: get("#captionText")
    };
  }

  function combinedInputText(input = collectInput()) {
    return [
      input.url,
      input.video_content,
      input.subtitles,
      input.post_text,
      input.caption
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 3000);
  }

  function evaluate() {
    const input = collectInput();
    const url = input.url;
    const body = combinedInputText(input);
    const text = `${url}\n${body}`.trim();
    if (url && body.replace(url, "").trim().length < 20) {
      return {
        score: 0,
        title: "本文を貼り付けてください",
        lead: "URLだけでは内容を十分に読み取れません。動画内容、字幕、投稿文、キャプションのどれかを貼り付けてください。",
        good: [],
        cautions: ["URLだけでは主張・根拠・危険表現を十分に確認できません。"],
        danger: [],
        checkpoints: ["動画内容", "字幕", "投稿文", "キャプション"],
        shareText: "Health Check Labで健康動画・SNS投稿チェック：内容の貼り付けが必要でした。"
      };
    }
    const resultHits = Object.fromEntries(Object.entries(wordSets).map(([key, words]) => [key, hits(text, words)]));
    const danger = hits(text, dangerWords);
    let score = 50;
    if (resultHits.evidence.length) score += 15;
    if (resultHits.publicOrg.length) score += 15;
    if (resultHits.risk.length) score += 10;
    if (resultHits.hospital.length) score += 10;
    if (!text) score -= 30;
    score -= Math.min(20, resultHits.assertive.length * 6);
    score -= Math.min(18, resultHits.anecdote.length * 6);
    score -= Math.min(18, resultHits.product.length * 7);
    score -= danger.length * 18;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const title = judge(score);
    const good = [];
    if (resultHits.evidence.length) good.push("論文や研究への言及があります。");
    if (resultHits.publicOrg.length) good.push("公的機関や信頼しやすい組織への言及があります。");
    if (resultHits.risk.length) good.push("リスクや注意点が書かれています。");
    if (resultHits.hospital.length) good.push("病院受診や専門家への相談を促しています。");
    if (!good.length) good.push("良い点は本文からは明確に確認できませんでした。");
    const cautions = [];
    if (!resultHits.evidence.length) cautions.push("医学的根拠や論文引用が見当たりません。");
    if (!resultHits.publicOrg.length) cautions.push("公的機関の引用が見当たりません。");
    if (resultHits.assertive.length) cautions.push("断定表現が含まれています。");
    if (resultHits.anecdote.length) cautions.push("体験談中心の可能性があります。");
    if (resultHits.product.length) cautions.push("商品誘導が含まれる可能性があります。");
    if (!resultHits.risk.length) cautions.push("リスク説明が不足している可能性があります。");
    const shareText = [
      "Health Check Lab / SocialTrustCheck",
      `信頼度：${score}/100 ${title}`,
      `対象：${platform(url)}`,
      danger.length ? `危険表現：${danger.join(" / ")}` : "危険表現：目立つものは検出されませんでした",
      "※健康動画・SNS投稿は根拠・安全性・受診目安を確認してから参考にしましょう"
    ].join("\n");
    return {
      score,
      title,
      lead: `対象：${platform(url)} / 信頼度 ${score}点。${title}として確認してください。`,
      good,
      cautions,
      danger,
      checkpoints: ["誰が発信しているか", "論文・公的機関の引用があるか", "リスクも書かれているか", "商品購入へ強く誘導していないか", "強い症状のとき受診を勧めているか"],
      shareText
    };
  }

  function card(title, items, tone = "") {
    return `<article class="trust-card ${tone}"><h3>${title}</h3><ul class="trust-list">${items.map((item) => `<li>${item}</li>`).join("")}</ul></article>`;
  }

  function render(result) {
    $("#trustResult").innerHTML = `
      <section class="result-panel">
        <div class="result-hero">
          <div class="score-circle" style="--score:${result.score}%"><strong>${result.score}</strong><span>/100</span></div>
          <div>
            <p class="eyebrow">健康動画・SNS投稿 信頼度チェック</p>
            <h2>${result.title}</h2>
            <p>${result.lead}</p>
          </div>
        </div>
        <div class="meter"><span style="width:${result.score}%"></span></div>
        <div class="trust-card-grid">
          ${card("良い点", result.good, result.score >= 80 ? "good" : "")}
          ${card("注意点", result.cautions, "warning")}
          ${card("危険表現", result.danger.length ? result.danger : ["目立つ危険表現は検出されませんでした"], result.danger.length ? "danger" : "good")}
          ${card("確認ポイント", result.checkpoints)}
        </div>
        <article class="info-card ai-card">
          <h3>AIによる追加判定</h3>
          <div id="trustAiResult"><p class="empty-insight">入力内容が20文字以上の場合、AI判定を実行します。</p></div>
        </article>
        <article class="info-card">
          <h3>共有用メモ</h3>
          <pre id="trustShareText" class="share-note">${result.shareText}</pre>
          <div class="button-row">
            <a class="primary-button" href="https://twitter.com/intent/tweet?text=${encodeShare(result.shareText)}" target="_blank" rel="noreferrer">Xで共有</a>
            <a class="secondary-button" href="https://social-plugins.line.me/lineit/share?text=${encodeShare(result.shareText)}" target="_blank" rel="noreferrer">LINEで共有</a>
            <button class="secondary-button" id="copyTrustShareBtn" type="button">メモをコピー</button>
          </div>
        </article>
      </section>
    `;
    $("#copyTrustShareBtn").addEventListener("click", () => copyText($("#trustShareText").textContent));
  }

  function renderHealthAiAnalysis(analysis, cached = false) {
    $("#trustAiResult").innerHTML = `
      <div class="ai-result">
        <p class="ai-badge">${cached ? "AI判定済み（キャッシュ）" : "AI判定"}</p>
        <div class="result-hero compact">
          <div class="score-circle" style="--score:${analysis.trust_score}%"><strong>${analysis.trust_score}</strong><span>/100</span></div>
          <div>
            <h4>${analysis.label}</h4>
            <p>${analysis.claim_summary}</p>
          </div>
        </div>
        <div class="metric-grid">
          <article class="metric-card"><small>主張カテゴリ</small><strong>${analysis.claim_category}</strong><span>${analysis.claim_summary}</span></article>
          <article class="metric-card"><small>根拠レベル</small><strong>${analysis.evidence_level}</strong><span>参考にする前に根拠の確認が必要です</span></article>
        </div>
        <div class="trust-card-grid">
          ${card("良い点", analysis.good_points, analysis.trust_score >= 80 ? "good" : "")}
          ${card("注意点", analysis.cautions, "warning")}
          ${card("危険表現", analysis.dangerous_expressions.length ? analysis.dangerous_expressions : ["目立つ危険表現はありません。"], analysis.dangerous_expressions.length ? "danger" : "good")}
          ${card("不足している情報", analysis.missing_information, "warning")}
          ${card("次に確認すること", analysis.what_to_check_next)}
          ${card("受診を考える目安", analysis.when_to_see_doctor, "danger")}
        </div>
      </div>
    `;
  }

  async function runHealthContentAi(button) {
    const input = collectInput();
    const text = combinedInputText(input);
    setButtonLoading(button, true, "AI判定中...");
    $("#trustAiResult").innerHTML = `<p class="empty-insight">AIが健康動画・SNS投稿を確認しています。</p>`;
    try {
      const data = await analyzeWithOpenAI("analyze-health-content", { ...input, text });
      renderHealthAiAnalysis(data.analysis, data.cached);
    } catch (error) {
      $("#trustAiResult").innerHTML = `<p class="ai-error">${error.message}</p>`;
    } finally {
      setButtonLoading(button, false);
    }
  }

  function init() {
    $("#socialForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      render(evaluate());
      $("#trustResult").scrollIntoView({ behavior: "auto", block: "start" });
      await runHealthContentAi(event.submitter || $("#socialForm button[type='submit']"));
    });
  }

  return { init };
})();

const CommunityInsights = (() => {
  let rows = [];
  let fetchedAt = 0;
  let pendingFetch = null;
  const CACHE_MS = 60 * 1000;

  function normalize(record) {
    if (record.area && record.result_type) return record;
    return {
      area: record.regionLabel || "未分類",
      result_type: record.bodyType || "未分類",
      burden_score: record.totalScore || 0,
      main_tendency: record.topMuscles?.[0]?.name || "未分類",
      pain_score: record.painMotionScore || 0,
      mobility_score: record.limitedScore || 0,
      stiffness_score: record.stiffnessScore || 0,
      duration: record.duration || "unknown",
      lifestyle_tags: record.lifestyleTags || [],
      created_at: record.savedAt || new Date().toISOString()
    };
  }

  function localRows() {
    return BodyCheck.localRecords().map(normalize);
  }

  async function supabaseRows() {
    if (rows.length && Date.now() - fetchedAt < CACHE_MS) return rows;
    if (pendingFetch) return pendingFetch;
    pendingFetch = fetch(
      `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=area,result_type,burden_score,main_tendency,pain_score,mobility_score,stiffness_score,duration,lifestyle_tags,created_at&order=created_at.desc&limit=500`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    )
      .then((response) => {
        if (!response.ok) throw new Error("Supabase fetch failed");
        return response.json();
      })
      .then((data) => {
        rows = data;
        fetchedAt = Date.now();
        return rows;
      })
      .finally(() => {
        pendingFetch = null;
      });
    return pendingFetch;
  }

  function countBy(items, getter) {
    const map = new Map();
    items.forEach((item) => {
      const value = getter(item) || "未分類";
      map.set(value, (map.get(value) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }

  function thisWeek(items) {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return items.filter((item) => new Date(item.created_at).getTime() >= weekAgo);
  }

  function barRows(rank, total) {
    return rank
      .slice(0, 5)
      .map(([label, count]) => {
        const percent = total ? Math.round((count / total) * 100) : 0;
        return `<div class="bar-row"><div><strong>${label}</strong><span>${count}人</span></div><b style="width:${Math.max(8, percent)}%"></b></div>`;
      })
      .join("");
  }

  function lifestyleRank(items) {
    const flat = items.flatMap((item) => item.lifestyle_tags || []);
    const labels = { inactive: "座り時間が長い", overuse: "同じ動作が多い", sleepPoor: "睡眠・疲労", numbness: "しびれ" };
    return countBy(flat.map((id) => ({ id })), (item) => labels[item.id] || item.id);
  }

  function render(target = "#communityRoot", sameType = null) {
    const root = $(target);
    if (!root) return;
    if (rows.length < 5) {
      root.innerHTML = `<section class="empty-state"><h2>まだ集計データが少ないです</h2><p>5件以上の匿名データが集まると、ランキングが表示されます。</p></section>`;
      return;
    }
    const weekly = thisWeek(rows);
    const base = weekly.length ? weekly : rows;
    const area = countBy(base, (item) => item.area);
    const type = countBy(rows, (item) => item.result_type);
    const tendency = countBy(rows, (item) => item.main_tendency);
    const lifestyle = lifestyleRank(rows);
    const samePercent = sameType ? Math.round((rows.filter((item) => item.result_type === sameType).length / rows.length) * 100) : null;
    root.innerHTML = `
      <div class="stat-strip">
        <article><small>匿名記録</small><strong>${rows.length}</strong><span>件</span></article>
        <article><small>今週多い悩み</small><strong>${area[0]?.[0] || "-"}</strong><span>${area[0]?.[1] || 0}人</span></article>
        <article><small>同じ悩み</small><strong>${samePercent === null ? "-" : `${samePercent}%`}</strong><span>${sameType || "BodyCheck後に表示"}</span></article>
      </div>
      <div class="ranking-grid">
        <article class="ranking-card"><h3>今週多い悩み</h3>${barRows(area, base.length)}</article>
        <article class="ranking-card"><h3>エリア別割合</h3>${barRows(area, base.length)}</article>
        <article class="ranking-card"><h3>タイプ別ランキング</h3>${barRows(type, rows.length)}</article>
        <article class="ranking-card"><h3>生活習慣ランキング</h3>${barRows(lifestyle, rows.length)}</article>
        <article class="ranking-card"><h3>負担が集まりやすい場所</h3>${barRows(tendency, rows.length)}</article>
      </div>
    `;
  }

  async function refresh(result = null, target = "#communityRoot") {
    try {
      rows = await supabaseRows();
    } catch {
      rows = localRows();
    }
    render(target, result?.bodyType || null);
  }

  return { refresh };
})();

function pageShell(title, lead, body, back = "/") {
  return `
    <section class="page">
      <div class="page-hero">
        <a class="back-link" href="${back}" data-link>戻る</a>
        <p class="eyebrow">Health Check Lab</p>
        <h1>${title}</h1>
        <p>${lead}</p>
      </div>
      ${body}
    </section>
  `;
}

function renderHome() {
  $("#app").innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">Health Check Lab</p>
        <h1>健康を、わかりやすく。</h1>
        <p>体の状態、健康情報の見方、学び直しをひとつにまとめたセルフチェックサイトです。</p>
        <div class="button-row">
          <a class="primary-button" href="/body-check" data-link>体のセルフチェックを始める</a>
          <a class="secondary-button" href="/health-check" data-link>健康情報を調べる</a>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="pulse-card"><strong>Body</strong><span>負担レベルを見える化</span></div>
        <div class="pulse-card"><strong>Info</strong><span>健康情報を整理</span></div>
      </div>
    </section>
    <section class="section">
      <h2>3つのメイン機能</h2>
      <div class="feature-grid">
        <a class="feature-card" href="/body-check" data-link>
          <span class="feature-icon">BC</span>
          <h3>体のセルフチェック</h3>
          <p>気になる部位を選び、体の負担レベルを確認できます。</p>
        </a>
        <a class="feature-card" href="/health-check" data-link>
          <span class="feature-icon">HI</span>
          <h3>健康情報を調べる</h3>
          <p>SNS投稿や動画の内容を整理し、参考度を確認します。</p>
        </a>
        <a class="feature-card" href="/health-library" data-link>
          <span class="feature-icon">LB</span>
          <h3>健康情報ライブラリ</h3>
          <p>体のケアや情報の見方を、短く読みやすくまとめます。</p>
        </a>
      </div>
    </section>
    <section class="section split-section">
      <div>
        <h2>みんなの悩み</h2>
        <p>匿名で集計された悩みの傾向を見て、「自分だけじゃない」と感じられる場所にします。</p>
        <a class="text-link" href="/community" data-link>詳しく見る</a>
      </div>
      <div id="homeCommunity" class="mini-community"><p class="empty-insight">集計データを読み込みます。</p></div>
    </section>
    <section class="section">
      <h2>使い方は3ステップ</h2>
      <div class="step-grid">
        <article><strong>1</strong><h3>気になる機能を選ぶ</h3><p>体のチェックかSNS情報チェックを選びます。</p></article>
        <article><strong>2</strong><h3>内容を入力する</h3><p>個人情報なしで、状態や投稿内容を入力します。</p></article>
        <article><strong>3</strong><h3>結果を確認する</h3><p>カード形式の結果を見て、必要なら共有できます。</p></article>
      </div>
    </section>
    <section class="caution-card">
      <h2>注意文</h2>
      <p>${CAUTION_TEXT}</p>
      <a class="text-link" href="/faq" data-link>よくある質問を見る</a>
    </section>
  `;
  runWhenIdle(() => CommunityInsights.refresh(null, "#homeCommunity"));
}

function renderBodyCheck() {
  $("#app").innerHTML = pageShell(
    "体の動作セルフチェック",
    "エリア選択から結果表示まで、このページ内で完結します。個人情報は入力しません。",
    `<div id="bodyCheckRoot"></div>`
  );
  BodyCheck.init();
}

function renderSnsTrust() {
  $("#app").innerHTML = pageShell(
    "健康情報を調べる",
    "投稿や動画の内容を整理し、参考にしやすいか確認します。",
    `
      <section class="panel">
        <form id="socialForm" class="stack-form">
          <label class="field"><span>URL（任意）</span><input id="socialUrl" type="url" placeholder="https://..." /></label>
          <label class="field"><span>動画内容</span><textarea id="videoContent" rows="4" maxlength="3000" placeholder="動画で話している内容や要点を入力"></textarea></label>
          <label class="field"><span>字幕</span><textarea id="subtitleText" rows="3" maxlength="3000" placeholder="字幕があれば貼り付け"></textarea></label>
          <label class="field"><span>投稿文</span><textarea id="socialText" rows="5" maxlength="3000" placeholder="SNS投稿の本文を貼り付け"></textarea></label>
          <label class="field"><span>キャプション</span><textarea id="captionText" rows="3" maxlength="3000" placeholder="キャプションや補足文があれば貼り付け"></textarea></label>
          <p class="form-hint">医学的真偽や治療効果を断定せず、参考にできる度合いとして整理します。入力は合計3000文字までをAI判定に使います。</p>
          <button class="primary-button" type="submit">AIで参考度をチェックする</button>
        </form>
      </section>
      <div id="trustResult"></div>
    `
  );
  SocialTrustCheck.init();
}

function renderHealthLibrary() {
  $("#app").innerHTML = pageShell(
    "健康情報ライブラリ",
    "健康情報をカテゴリ別に確認できます。",
    `
      <section class="panel library-controls">
        <label class="field">
          <span>検索</span>
          <input id="librarySearch" type="search" placeholder="キーワードを入力" />
        </label>
        <div class="category-pills" id="libraryCategories">
          <button class="category-pill active" type="button" data-category="all">すべて</button>
          ${libraryCategories.map((category) => `<button class="category-pill" type="button" data-category="${category}">${category}</button>`).join("")}
        </div>
      </section>
      <section class="library-layout">
        <aside class="panel library-category-list">
          <h2>カテゴリ</h2>
          <ul>
            ${libraryCategories.map((category) => `<li>${category}</li>`).join("")}
          </ul>
        </aside>
        <div class="library-list" id="libraryList"></div>
      </section>
      <section class="caution-card">
        <h2>読む前に</h2>
        <p>${CAUTION_TEXT}</p>
      </section>
    `
  );
  bindHealthLibrary();
}

function articleCard(article) {
  return `
    <a class="library-card" href="/health-library/${article.slug}" data-link>
      <div>
        <span class="library-category">${article.category}</span>
        <span class="judgement-label">${article.label}</span>
      </div>
      <h3>${article.title}</h3>
      <p>${article.summary}</p>
    </a>
  `;
}

function bindHealthLibrary() {
  const list = $("#libraryList");
  const search = $("#librarySearch");
  let activeCategory = "all";

  function renderList() {
    const keyword = (search?.value || "").trim().toLowerCase();
    const filtered = healthLibraryArticles.filter((article) => {
      const categoryMatch = activeCategory === "all" || article.category === activeCategory;
      const keywordText = `${article.title} ${article.category} ${article.label} ${article.summary}`.toLowerCase();
      return categoryMatch && (!keyword || keywordText.includes(keyword));
    });
    list.innerHTML = filtered.length
      ? filtered.map(articleCard).join("")
      : `<p class="empty-state">該当する記事はまだありません。</p>`;
  }

  search?.addEventListener("input", renderList);
  $$("#libraryCategories .category-pill").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      $$("#libraryCategories .category-pill").forEach((item) => item.classList.toggle("active", item === button));
      renderList();
    });
  });
  renderList();
}

function renderHealthLibraryArticle(slug) {
  const article = healthLibraryArticles.find((item) => item.slug === slug);
  if (!article) {
    $("#app").innerHTML = pageShell(
      "記事が見つかりません",
      "指定された記事はまだ作成されていません。",
      `<section class="panel"><a class="primary-button" href="/health-library" data-link>ライブラリへ戻る</a></section>`,
      "/health-library"
    );
    return;
  }

  const sections = [
    ["1. 判定", `<p><span class="judgement-label large">${article.label}</span></p>`],
    ["2. 結論", "<p>この記事の結論をここに記載します。</p>"],
    ["3. SNSでよく言われること", "<p>SNSで見かけやすい表現や主張を整理します。</p>"],
    ["4. なぜそう言われるのか", "<p>その情報が広がりやすい理由を説明します。</p>"],
    ["5. 現在の研究では", "<p>研究や公的情報に基づく整理を記載します。</p>"],
    ["6. 誤解されやすいポイント", "<p>言い切りや過度な期待につながる点を整理します。</p>"],
    ["7. 実際はどう考えればいいのか", "<p>日常で参考にする時の考え方をまとめます。</p>"],
    ["8. 鍼灸師としての見解", "<p>鍼灸師の視点から、体の状態との向き合い方を記載します。</p>"],
    ["9. よくある質問", "<p>よくある疑問と回答をここに追加します。</p>"],
    ["10. まとめ", "<p>重要なポイントを短くまとめます。</p>"],
    ["11. 参考文献・参考情報", "<p>参考にした文献や公的情報をここに記載します。</p>"]
  ];

  $("#app").innerHTML = pageShell(
    article.title,
    article.summary,
    `
      <article class="panel article-template">
        <div class="article-meta">
          <span class="library-category">${article.category}</span>
          <span class="judgement-label">${article.label}</span>
        </div>
        ${sections.map(([title, body]) => `<section><h2>${title}</h2>${body}</section>`).join("")}
        <section class="supervision-box">
          <h2>執筆・監修</h2>
          <p><strong>ハリプラス鍼灸院</strong><br>鍼灸師</p>
        </section>
      </article>
    `,
    "/health-library"
  );
}

function renderCommunity() {
  $("#app").innerHTML = pageShell(
    "みんなの悩み",
    "Supabaseに匿名保存された集計データだけを使い、不調が集まりやすい場所を表示します。個人データは表示しません。",
    `<div id="communityRoot"><p class="empty-insight">集計データを読み込みます。</p></div>`
  );
  CommunityInsights.refresh();
}

function renderAbout() {
  $("#app").innerHTML = pageShell(
    "このサイトについて",
    "Health Check Labは、健康情報を整理するためのセルフチェック・プラットフォームです。",
    `
      <section class="panel prose">
        <h2>目的</h2>
        <p>体の動作チェック、健康動画・SNS投稿の信頼度チェック、みんなの悩み共有を通じて、自分の状態や情報の見方を整理しやすくします。</p>
        <h2>医療診断ではありません</h2>
        <p>${CAUTION_TEXT}</p>
        <h2>匿名データのみ保存</h2>
        <p>集計に使うのは、部位・タイプ・スコア・生活習慣タグなどの匿名データのみです。氏名、住所、電話番号、メールアドレス、SNSアカウント、自由入力テキストは保存しません。</p>
      </section>
    `
  );
}

function renderFaq() {
  const faqs = [
    ["これは医療診断ですか？", "いいえ。医療診断ではなく、セルフチェックの目安です。強い痛みやしびれなどがある場合は医療機関へ相談してください。"],
    ["個人情報は保存されますか？", "保存しません。みんなの悩みでは、部位やタイプなどの匿名集計データのみを扱います。"],
    ["SNSのURLだけで分析できますか？", "投稿本文を自動取得できない場合があります。その場合は本文を貼り付けてください。"],
    ["結果はどれくらい信用できますか？", "質問内容から傾向を整理するものです。診断や治療方針の決定には使わず、必要に応じて専門家へ相談してください。"],
    ["みんなの悩みは何が表示されますか？", "個人データではなく、今週多い悩み、エリア別割合、タイプ別ランキング、生活習慣ランキングなどの集計だけを表示します。"]
  ];
  $("#app").innerHTML = pageShell(
    "よくある質問",
    "使い方やデータの扱いについて、よくある質問をまとめました。",
    `<section class="faq-list">${faqs.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</section>`
  );
}

const routes = {
  "/": renderHome,
  "/body-check": renderBodyCheck,
  "/health-check": renderSnsTrust,
  "/health-library": renderHealthLibrary,
  "/community": renderCommunity,
  "/about": renderAbout,
  "/faq": renderFaq
};

function route() {
  const path = location.pathname.replace(/\/$/, "") || "/";
  if (path.startsWith("/health-library/")) {
    renderHealthLibraryArticle(path.split("/").pop());
  } else {
    (routes[path] || renderHome)();
  }
  $$(".site-nav a").forEach((link) => {
    const linkPath = new URL(link.href).pathname.replace(/\/$/, "") || "/";
    link.classList.toggle("active", linkPath === path || (linkPath === "/health-library" && path.startsWith("/health-library/")));
  });
  document.body.classList.remove("menu-open");
  $("#menuButton")?.setAttribute("aria-expanded", "false");
  $("#app").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-link]");
  if (!link) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin) return;
  event.preventDefault();
  history.pushState({}, "", url.pathname);
  route();
});

window.addEventListener("popstate", route);

document.addEventListener("DOMContentLoaded", () => {
  const storedRoute = sessionStorage.getItem("health-check-lab-route");
  if (storedRoute) {
    sessionStorage.removeItem("health-check-lab-route");
    history.replaceState({}, "", storedRoute);
  }
  $("#menuButton")?.addEventListener("click", () => {
    const opened = document.body.classList.toggle("menu-open");
    $("#menuButton").setAttribute("aria-expanded", String(opened));
  });
  route();
});

