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

let healthLibraryArticles = [];
let healthLibraryTopics = [];
let healthLibraryRelated = {};
let healthLibraryPromise = null;

function articleSummary(article) {
  return article.summary || article.conclusion || "記事の要点を確認できます。";
}

function articleVerdict(article) {
  return article.verdict || "⚠️ 一部正しい";
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return response.json();
}

async function loadHealthLibraryData() {
  if (healthLibraryPromise) return healthLibraryPromise;
  healthLibraryPromise = Promise.all([
    fetchJson("/content/truth-check/topics.json").catch(() => []),
    fetchJson("/content/truth-check/articles/index.json").catch(() => []),
    fetchJson("/content/truth-check/related.json").catch(() => ({}))
  ]).then(async ([topics, slugs, related]) => {
    const articles = await Promise.all(
      slugs.map((slug) => fetchJson(`/content/truth-check/articles/${slug}.json`).catch(() => null))
    );
    healthLibraryTopics = topics;
    healthLibraryRelated = related;
    healthLibraryArticles = articles.filter(Boolean);
    return { topics: healthLibraryTopics, articles: healthLibraryArticles };
  });
  return healthLibraryPromise;
}

const BodyCheck = window.createBodyCheck({
  $,
  $$,
  STORAGE_KEY,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE,
  analyzeWithOpenAI,
  setButtonLoading,
  copyText,
  encodeShare,
  runWhenIdle,
  getCommunityInsights: () => CommunityInsights
});

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
    "全身筋肉チェック",
    "気になる部位を選び、動作と症状から筋肉の負担傾向を確認します。",
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
        <span class="judgement-label">${articleVerdict(article)}</span>
      </div>
      <h3>${article.title}</h3>
      <p>${articleSummary(article)}</p>
    </a>
  `;
}

async function bindHealthLibrary() {
  const list = $("#libraryList");
  const search = $("#librarySearch");
  let activeCategory = "all";
  list.innerHTML = `<p class="empty-insight">記事データを読み込みます。</p>`;
  try {
    await loadHealthLibraryData();
  } catch {
    list.innerHTML = `<p class="empty-state">記事データを読み込めませんでした。</p>`;
    return;
  }

  function renderList() {
    const keyword = (search?.value || "").trim().toLowerCase();
    const filtered = healthLibraryArticles.filter((article) => {
      const categoryMatch = activeCategory === "all" || article.category === activeCategory;
      const keywordText = `${article.title} ${article.category} ${articleVerdict(article)} ${articleSummary(article)}`.toLowerCase();
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

async function renderHealthLibraryArticle(slug) {
  $("#app").innerHTML = pageShell(
    "記事を読み込み中",
    "健康情報ライブラリの記事データを確認しています。",
    `<section class="panel"><p class="empty-insight">記事データを読み込みます。</p></section>`,
    "/health-library"
  );
  try {
    await loadHealthLibraryData();
  } catch {
    $("#app").innerHTML = pageShell(
      "記事を読み込めません",
      "記事データの取得に失敗しました。",
      `<section class="panel"><a class="primary-button" href="/health-library" data-link>ライブラリへ戻る</a></section>`,
      "/health-library"
    );
    return;
  }
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
    ["1. 判定", `<p><span class="judgement-label large">${articleVerdict(article)}</span></p>`],
    ["2. 結論", `<p>${article.conclusion}</p>`],
    ["3. SNSでよく言われること", `<p>${article.snsClaim}</p>`],
    ["4. なぜそう言われるのか", `<p>${article.whyItSpread}</p>`],
    ["5. 現在の研究では", `<p>${article.currentEvidence}</p>`],
    ["6. 誤解されやすいポイント", `<p>${article.commonMisunderstandings}</p>`],
    ["7. 実際はどう考えればいいのか", `<p>${article.practicalView}</p>`],
    ["8. 鍼灸師としての見解", `<p>${article.acupuncturistView}</p>`],
    ["9. よくある質問", `<div class="faq-list">${(article.faq || []).map((item) => `<details><summary>${item.question}</summary><p>${item.answer}</p></details>`).join("")}</div>`],
    ["10. まとめ", `<p>${article.summary}</p>`],
    ["11. 参考文献・参考情報", `<ul class="trust-list">${(article.references || []).map((item) => `<li>${item.url ? `<a href="${item.url}" target="_blank" rel="noopener">${item.title}</a>` : item.title}</li>`).join("")}</ul>`]
  ];
  const relatedArticles = (healthLibraryRelated[article.slug] || [])
    .map((relatedSlug) => healthLibraryArticles.find((item) => item.slug === relatedSlug))
    .filter(Boolean);

  $("#app").innerHTML = pageShell(
    article.title,
    articleSummary(article),
    `
      <article class="panel article-template">
        <div class="article-meta">
          <span class="library-category">${article.category}</span>
          <span class="judgement-label">${articleVerdict(article)}</span>
        </div>
        ${sections.map(([title, body]) => `<section><h2>${title}</h2>${body}</section>`).join("")}
        <section class="supervision-box">
          <h2>執筆・監修</h2>
          <p><strong>ハリプラス鍼灸院</strong><br>鍼灸師</p>
        </section>
        <section>
          <h2>関連記事</h2>
          ${relatedArticles.length ? `<div class="library-list">${relatedArticles.map(articleCard).join("")}</div>` : `<p class="empty-insight">関連記事はまだありません。</p>`}
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

