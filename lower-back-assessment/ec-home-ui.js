(function () {
  const localCaution = "このサイトは医療診断を行うものではありません。表示結果はセルフチェックの目安です。強い痛み、しびれ、麻痺、発熱などがある場合は医療機関へ相談してください。";
  const popularTerms = ["腰痛", "肩こり", "坐骨神経痛", "ストレートネック", "骨盤矯正", "筋膜リリース", "EMS", "姿勢改善", "猫背", "インナーマッスル"];
  const exampleTerms = ["腰痛", "肩こり", "梨状筋", "ストレッチ", "骨盤矯正", "猫背", "筋膜リリース", "鍼灸", "自律神経"];
  const searchCategories = [
    { name: "症状", icon: "痛み" },
    { name: "筋肉", icon: "筋肉" },
    { name: "ストレッチ", icon: "ケア" },
    { name: "姿勢", icon: "姿勢" },
    { name: "神経", icon: "神経" },
    { name: "鍼灸", icon: "鍼灸" },
    { name: "運動", icon: "運動" },
    { name: "真偽判定", icon: "判定" },
    { name: "セルフケア", icon: "習慣" }
  ];
  const bodyAreas = [
    { name: "首", description: "首の動きやこわばりを確認" },
    { name: "肩", description: "肩の重さや上げにくさを確認" },
    { name: "肩甲骨", description: "背中側の張りや動きを確認" },
    { name: "背中", description: "背中の張りや姿勢の負担を確認" },
    { name: "腰", description: "前屈や立ち上がりの負担を確認" },
    { name: "お尻", description: "座る時や歩く時の違和感を確認" },
    { name: "股関節", description: "脚を開く動きや歩行を確認" },
    { name: "太もも", description: "階段やしゃがむ動きを確認" },
    { name: "膝", description: "階段や立ち上がりの負担を確認" },
    { name: "ふくらはぎ", description: "歩行や立ち仕事の張りを確認" },
    { name: "足首", description: "歩く、しゃがむ動きの負担を確認" },
    { name: "足", description: "足裏や足先の違和感を確認" }
  ];
  const snsExamples = ["筋膜の癒着", "骨盤の歪み", "姿勢改善", "デトックス", "白湯", "EMS", "老廃物", "猫背", "ストレートネック"];
  const synonymGroups = [["肩こり", "肩のこり", "肩凝り"], ["腰痛", "腰が痛い", "腰の痛み"], ["鍼", "鍼灸", "はり", "針"], ["筋膜リリース", "フォームローラー"], ["坐骨神経痛", "坐骨", "お尻のしびれ"], ["ストレートネック", "スマホ首"], ["骨盤矯正", "骨盤の歪み", "骨盤のゆがみ"], ["猫背", "巻き肩"], ["自律神経", "交感神経", "副交感神経"]];
  const ambientTerms = [
    ["首の緊張", "首の緊張", "t1"],
    ["腰の重さ", "腰痛", "t2"],
    ["神経の圧迫", "神経", "t3"],
    ["動かすと痛む", "動作 痛み", "t4"],
    ["筋肉のこわばり", "筋肉 こわばり", "t5"],
    ["血流", "血流", "t6"],
    ["ストレス", "ストレス", "t7"],
    ["肩甲骨", "肩甲骨", "t8"],
    ["股関節", "股関節", "t9"],
    ["膝", "膝痛", "t10"],
    ["ふくらはぎ", "ふくらはぎ", "t11"],
    ["慢性痛", "慢性痛", "t12"],
    ["肩こり", "肩こり", "t13"],
    ["自律神経", "自律神経", "t14"],
    ["鍼灸", "鍼灸", "t15"],
    ["セルフチェック", "セルフチェック", "t16"]
  ];

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function normalizeKana(value) {
    return String(value || "").replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
  }

  function normalizeHealthSearch(value) {
    let text = normalizeKana(value).toLowerCase().replace(/\s+/g, "");
    synonymGroups.forEach((group) => {
      const normalized = group.map((item) => normalizeKana(item).toLowerCase().replace(/\s+/g, ""));
      const canonical = normalized[0];
      normalized.forEach((item) => {
        text = text.replaceAll(item, canonical);
      });
    });
    return text;
  }

  function healthSearchText(item) {
    return [item.title, item.slug, item.category, item.verdict, item.conclusion, item.summary, item.snsClaim, item.whyItSpread, item.currentEvidence, item.commonMisunderstandings, item.practicalView, item.acupuncturistView, item.status, ...(item.tags || []), ...(item.specialtyTags || []), ...(item.relatedMuscles || []), ...(item.relatedSymptoms || [])].filter(Boolean).join(" ");
  }

  function verdictText(article) {
    return article.verdict || "一部正しい";
  }

  function articleSummary(article) {
    return article.summary || article.conclusion || "記事の要点を確認できます。";
  }

  function updatedDate(article) {
    const value = article.dateModified || article.updatedAt || article.publishedAt || article.datePublished;
    if (!value) return "更新日未設定";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });
  }

  function articleCard(article, compact = false) {
    const label = (article.category || "H").slice(0, 2);
    return `<a class="market-article-card ${compact ? "compact" : ""}" href="/health-library/${encodeURIComponent(article.slug)}" data-link><div class="article-thumb" aria-hidden="true"><span>${escapeHtml(label)}</span></div><div class="market-article-body"><div class="article-card-meta"><span class="library-category">${escapeHtml(article.category || "健康情報")}</span><span class="judgement-label">${escapeHtml(verdictText(article))}</span></div><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(articleSummary(article))}</p><div class="article-card-foot"><span>${escapeHtml(updatedDate(article))}</span><strong>詳細を見る</strong></div></div></a>`;
  }

  function topicCard(topic) {
    return `<article class="market-article-card compact"><div class="article-thumb theme" aria-hidden="true"><span>判定</span></div><div class="market-article-body"><div class="article-card-meta"><span class="library-category">${escapeHtml(topic.category || "真偽判定")}</span><span class="judgement-label muted-label">テーマ</span></div><h3>${escapeHtml(topic.title)}</h3><p>このテーマは記事化候補です。関連する公開記事を優先して表示します。</p><div class="article-card-foot"><span>${escapeHtml(topic.status || "unused")}</span><a href="/health-library?search=${encodeURIComponent(topic.title)}">関連を探す</a></div></div></article>`;
  }

  function emptyArticleState() {
    return `<article class="market-empty-card"><h3>記事を準備しています</h3><p>健康情報ライブラリの記事は順次追加されます。</p><div><a href="/health-library" data-link>記事を探索する</a><a href="/body-check" data-link>原因筋を探す</a></div></article>`;
  }

  function searchItems(query, articles, topics, limit = 12) {
    const normalized = normalizeHealthSearch(query);
    if (!normalized) return [];
    const scoredArticles = articles.map((article) => {
      const text = normalizeHealthSearch(healthSearchText(article));
      let score = 0;
      if (normalizeHealthSearch(article.title).includes(normalized)) score += 8;
      if (normalizeHealthSearch(article.category).includes(normalized)) score += 4;
      if (text.includes(normalized)) score += 2;
      return { type: "article", item: article, score };
    }).filter((entry) => entry.score > 0);
    const scoredTopics = topics.map((topic) => {
      const text = normalizeHealthSearch(`${topic.title} ${topic.category} ${topic.slug}`);
      let score = 0;
      if (normalizeHealthSearch(topic.title).includes(normalized)) score += 5;
      if (text.includes(normalized)) score += 1;
      return { type: "topic", item: topic, score };
    }).filter((entry) => entry.score > 0);
    return scoredArticles.concat(scoredTopics).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  function termChip(term, className = "search-chip") {
    return `<a class="${className}" href="/health-library?search=${encodeURIComponent(term)}">${escapeHtml(term)}</a>`;
  }

  function submitSearch(form) {
    const input = form.querySelector("input[type='search'], input[name='search']");
    const query = input?.value.trim();
    if (!query) return;
    history.pushState({}, "", `/health-library?search=${encodeURIComponent(query)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function bindSearchForms(root = document) {
    root.querySelectorAll("[data-market-search]").forEach((form) => {
      if (form.dataset.bound === "true") return;
      form.dataset.bound = "true";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitSearch(form);
      });
    });
  }

  async function renderArticleRails() {
    const popularRoot = document.querySelector("#popularArticles");
    const recentRoot = document.querySelector("#recentArticles");
    if (!popularRoot || !recentRoot || !window.loadHealthLibraryData) return;
    try {
      const { articles } = await window.loadHealthLibraryData();
      const published = articles.filter((article) => article.status !== "draft");
      const popular = published.slice(0, 6);
      const recent = [...published].sort((a, b) => String(updatedDate(b)).localeCompare(String(updatedDate(a)))).slice(0, 6);
      popularRoot.innerHTML = popular.length ? popular.map((article) => articleCard(article)).join("") : emptyArticleState();
      recentRoot.innerHTML = recent.length ? recent.map((article) => articleCard(article, true)).join("") : emptyArticleState();
    } catch {
      popularRoot.innerHTML = `<p class="empty-state">記事データを読み込めませんでした。</p>`;
      recentRoot.innerHTML = `<p class="empty-state">記事データを読み込めませんでした。</p>`;
    }
  }

  function bodyAreaCard(area) {
    return `<article class="body-area-card"><h3>${escapeHtml(area.name)}</h3><p>${escapeHtml(area.description)}</p><div><a href="/body-check" data-link>セルフチェック</a><a href="/health-library?search=${encodeURIComponent(area.name)}">関連記事</a></div></article>`;
  }

  function renderAmbientTerms() {
    return ambientTerms.map(([label, query, className]) => `<a class="floating-term ${className}" href="/health-library?search=${encodeURIComponent(query)}">${escapeHtml(label)}</a>`).join("");
  }

  function bindExperienceStart() {
    document.querySelectorAll("[data-start-diagnosis]").forEach((link) => {
      if (link.dataset.bound === "true") return;
      link.dataset.bound = "true";
      link.addEventListener("click", (event) => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        event.preventDefault();
        document.body.classList.add("experience-entering");
        window.setTimeout(() => {
          document.body.classList.remove("experience-entering");
          history.pushState({}, "", "/body-check");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, 950);
      });
    });
  }

  function renderEcHome(options = {}) {
    const CAUTION_TEXT = options.CAUTION_TEXT || localCaution;
    const runWhenIdle = options.runWhenIdle || ((callback) => window.setTimeout(callback, 1));
    const CommunityInsights = options.CommunityInsights || { refresh: () => {} };
    document.querySelector("#app").innerHTML = `<main class="experience-home" aria-label="Health Check"><nav class="experience-fixed-nav" aria-label="主要メニュー"><a class="nav-primary" href="/body-check" data-start-diagnosis><span>START</span>原因筋を探す</a><a href="/health-library" data-link><span>EXPLORE</span>記事</a></nav><section class="experience-world"><div class="bio-field" aria-hidden="true"><span class="cell c1"></span><span class="cell c2"></span><span class="cell c3"></span><span class="fiber f1"></span><span class="fiber f2"></span><span class="fiber f3"></span><span class="nerve n1"></span><span class="nerve n2"></span></div><div class="experience-terms" aria-label="健康情報の入口">${renderAmbientTerms()}</div><div class="experience-copy"><p class="experience-label">HEALTH CHECK</p><h1>その痛み、<br />どこから来ている？</h1><p class="experience-lead">痛みの手がかりを、身体の中から探す。症状や動きを選ぶだけで、関係している可能性がある筋肉と、読みたい健康記事へ進めます。</p><div class="experience-actions"><a class="experience-start" href="/body-check" data-start-diagnosis aria-label="原因筋チェックを開始する"><span>START</span><strong>原因筋チェック</strong></a><a class="experience-journal-link" href="/health-library" data-link><span>EXPLORE</span><strong>記事から探す</strong></a></div><p class="experience-note">※医療診断ではありません。強い痛み・しびれ・麻痺・発熱などがある場合は医療機関へ相談してください。</p></div></section><section class="experience-mini-cards" aria-label="Health Checkの使い方"><article><span>01 SIGNAL</span><h2>症状を選ぶ</h2><p>部位、動き、症状の感じ方を一問ずつ整理します。</p></article><article><span>02 TRACE</span><h2>候補筋をたどる</h2><p>原因の断定ではなく、関係している可能性を示します。</p></article><article><span>03 EXPLORE</span><h2>記事で理解する</h2><p>結果に近い健康記事を読み、体の理解につなげます。</p></article></section><section class="experience-quiet-links"><div class="journal-orbit" aria-hidden="true"><span>血流</span><span>神経</span><span>筋肉</span><span>鍼灸</span></div><div><p class="eyebrow">HEALTH JOURNAL</p><h2>身体を、<br />もう少し深く知る。</h2><p>症状・筋肉・セルフケア・鍼灸について、体の仕組みから整理します。</p></div><a class="secondary-button" href="/health-library" data-link>記事を探索する</a></section><section class="caution-card experience-caution"><p class="eyebrow">MEDICAL NOTE</p><h2>医療情報に関する注意</h2><p>${CAUTION_TEXT}</p><a class="text-link" href="/faq" data-link>FAQを見る</a></section><div class="experience-transition" aria-hidden="true"><span></span><span></span><span></span></div></main>`;
    bindExperienceStart();
    bindSearchForms();
    runWhenIdle(() => CommunityInsights.refresh(null, "#homeCommunity"));
  }

  function snsSearchPanel() {
    return `<section class="panel sns-search-first"><h2>SNSで見た健康情報を調べる</h2><p>URL貼り付けの前に、動画で聞いた言葉や投稿内のキーワードから記事データベースを検索します。</p><form class="market-search slim" id="snsKeywordSearch"><input name="search" type="search" placeholder="例：筋膜の癒着、骨盤の歪み、白湯、EMS" /><button type="submit">検索</button></form><div class="example-row">${snsExamples.map((term) => `<button class="example-chip" type="button" data-sns-term="${escapeHtml(term)}">${escapeHtml(term)}</button>`).join("")}</div></section><section class="library-list" id="snsSearchResults"></section>`;
  }

  function renderSearchResults(container, query, articles, topics) {
    const results = searchItems(query, articles, topics, 14);
    if (!query) {
      container.innerHTML = `<p class="empty-state">キーワードを入力すると、記事・真偽判定テーマ・関連情報を表示します。</p>`;
      return;
    }
    if (!results.length) {
      container.innerHTML = `<p class="empty-state">該当する情報はまだありません。別の言葉でも検索してみてください。</p>`;
      return;
    }
    container.innerHTML = `<div class="section-header"><h2>「${escapeHtml(query)}」の検索結果</h2><p>記事一覧、真偽判定テーマ、関連情報を表示しています。</p></div><div class="market-article-grid">${results.map((result) => (result.type === "article" ? articleCard(result.item, true) : topicCard(result.item))).join("")}</div>`;
  }

  async function bindSnsSearchPage() {
    const form = document.querySelector("#snsKeywordSearch");
    const input = form?.querySelector("input");
    const results = document.querySelector("#snsSearchResults");
    if (!form || !input || !results || !window.loadHealthLibraryData) return;
    const initial = new URLSearchParams(location.search).get("search") || "";
    input.value = initial;
    let data = { articles: [], topics: [] };
    try {
      data = await window.loadHealthLibraryData();
    } catch {
      results.innerHTML = `<p class="empty-state">記事データを読み込めませんでした。</p>`;
      return;
    }
    const runSearch = () => renderSearchResults(results, input.value.trim(), data.articles, data.topics);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runSearch();
    });
    document.querySelectorAll("[data-sns-term]").forEach((button) => {
      button.addEventListener("click", () => {
        input.value = button.dataset.snsTerm;
        runSearch();
      });
    });
    runSearch();
  }

  function applyLibraryQuery() {
    const query = new URLSearchParams(location.search).get("search");
    const input = document.querySelector("#librarySearch");
    if (!query || !input) return;
    input.value = query;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function enhanceCurrentPage() {
    window.setTimeout(() => {
      const path = location.pathname.replace(/\/$/, "") || "/";
      if (path === "/") {
        renderEcHome();
        return;
      }
      if (path === "/health-check" && !document.querySelector(".sns-search-first")) {
        const hero = document.querySelector(".page-hero");
        if (hero) {
          hero.insertAdjacentHTML("afterend", snsSearchPanel());
          bindSnsSearchPage();
        }
      }
      if (path === "/health-library") applyLibraryQuery();
    }, 0);
  }

  document.addEventListener("DOMContentLoaded", enhanceCurrentPage);
  window.addEventListener("popstate", enhanceCurrentPage);
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-start-diagnosis]")) return;
    window.setTimeout(enhanceCurrentPage, 0);
  });

  window.normalizeHealthSearch = normalizeHealthSearch;
  window.healthSearchText = healthSearchText;
  window.renderEcHome = renderEcHome;
  window.renderSnsSearchPage = () => `${snsSearchPanel()}<div id="trustResult"></div>`;
  window.bindSnsSearchPage = bindSnsSearchPage;
})();
