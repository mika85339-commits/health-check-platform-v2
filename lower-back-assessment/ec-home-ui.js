(function () {
  const localCaution = "このサイトは医療診断を行うものではありません。表示結果はセルフチェックの目安です。強い痛み、しびれ、麻痺、発熱などがある場合は医療機関へ相談してください。";
  const popularTerms = ["腰痛", "肩こり", "坐骨神経痛", "ストレートネック", "骨盤矯正", "筋膜リリース", "EMS", "姿勢改善", "猫背", "インナーマッスル"];
  const exampleTerms = ["腰痛", "肩こり", "梨状筋", "ストレッチ", "骨盤矯正", "猫背", "筋膜リリース", "鍼灸", "自律神経"];
  const searchCategories = ["症状", "筋肉", "ストレッチ", "姿勢", "神経", "鍼灸", "運動", "真偽判定", "セルフケア"];
  const bodyAreas = ["首", "肩", "肩甲骨", "背中", "腰", "お尻", "股関節", "太もも", "膝", "ふくらはぎ", "足"];
  const snsExamples = ["筋膜の癒着", "骨盤の歪み", "姿勢改善", "デトックス", "白湯", "EMS", "老廃物", "猫背", "ストレートネック"];
  const synonymGroups = [["肩こり", "肩のこり", "肩凝り"], ["腰痛", "腰が痛い", "腰の痛み"], ["鍼", "鍼灸", "はり", "針"], ["筋膜リリース", "フォームローラー"], ["坐骨神経痛", "坐骨", "お尻のしびれ"], ["ストレートネック", "スマホ首"], ["骨盤矯正", "骨盤の歪み", "骨盤のゆがみ"], ["猫背", "巻き肩"], ["自律神経", "交感神経", "副交感神経"]];

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
    return article.dateModified || article.updatedAt || article.publishedAt || article.datePublished || "更新日未設定";
  }

  function articleCard(article, compact = false) {
    const label = (article.category || "H").slice(0, 2);
    return `<a class="market-article-card ${compact ? "compact" : ""}" href="/health-library/${encodeURIComponent(article.slug)}" data-link><div class="article-thumb" aria-hidden="true"><span>${escapeHtml(label)}</span></div><div class="market-article-body"><div class="article-card-meta"><span class="library-category">${escapeHtml(article.category || "健康情報")}</span><span class="judgement-label">${escapeHtml(verdictText(article))}</span></div><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(articleSummary(article))}</p><div class="article-card-foot"><span>${escapeHtml(updatedDate(article))}</span><strong>詳細を見る</strong></div></div></a>`;
  }

  function topicCard(topic) {
    return `<article class="market-article-card compact"><div class="article-thumb theme" aria-hidden="true"><span>判定</span></div><div class="market-article-body"><div class="article-card-meta"><span class="library-category">${escapeHtml(topic.category || "真偽判定")}</span><span class="judgement-label muted-label">テーマ</span></div><h3>${escapeHtml(topic.title)}</h3><p>このテーマは記事化候補です。関連する公開記事を優先して表示します。</p><div class="article-card-foot"><span>${escapeHtml(topic.status || "unused")}</span><a href="/health-library?search=${encodeURIComponent(topic.title)}">関連を探す</a></div></div></article>`;
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
      popularRoot.innerHTML = popular.length ? popular.map((article) => articleCard(article)).join("") : `<p class="empty-state">公開記事を準備中です。</p>`;
      recentRoot.innerHTML = recent.length ? recent.map((article) => articleCard(article, true)).join("") : `<p class="empty-state">新着記事を準備中です。</p>`;
    } catch {
      popularRoot.innerHTML = `<p class="empty-state">記事データを読み込めませんでした。</p>`;
      recentRoot.innerHTML = `<p class="empty-state">記事データを読み込めませんでした。</p>`;
    }
  }

  function renderEcHome(options = {}) {
    const CAUTION_TEXT = options.CAUTION_TEXT || localCaution;
    const runWhenIdle = options.runWhenIdle || ((callback) => window.setTimeout(callback, 1));
    const CommunityInsights = options.CommunityInsights || { refresh: () => {} };
    document.querySelector("#app").innerHTML = `<section class="market-hero"><div class="market-hero-inner"><p class="eyebrow">Health Check Lab</p><h1>体の不調と健康情報を、もっと分かりやすく。</h1><p class="hero-lead">体をセルフチェック。健康情報を検索。医学的根拠を確認。</p><form class="market-search" data-market-search><input name="search" type="search" placeholder="症状・筋肉・ストレッチ・SNSで見た情報を検索" aria-label="健康情報を検索" /><button type="submit">検索</button></form><div class="example-row" aria-label="検索例">${exampleTerms.map((term) => termChip(term, "example-chip")).join("")}</div></div></section><section class="section market-section"><div class="section-header"><h2>メイン機能</h2><p>今したいことから選べます。</p></div><div class="market-feature-grid"><a class="market-feature-card" href="/body-check" data-link><span class="feature-icon">体</span><h3>体のセルフチェック</h3><p>症状や動作から負担のある筋肉候補を確認</p><strong>セルフチェックする</strong></a><a class="market-feature-card" href="/health-check" data-link><span class="feature-icon">探</span><h3>健康情報を検索</h3><p>SNS・動画・ネットで見た健康情報を検索</p><strong>検索する</strong></a><a class="market-feature-card" href="/health-library" data-link><span class="feature-icon">読</span><h3>健康情報ライブラリ</h3><p>医学的根拠をもとにした記事一覧</p><strong>記事を見る</strong></a></div></section><section class="section market-section"><div class="section-header"><h2>人気検索</h2><p>よく調べられるテーマから探せます。</p></div><div class="chip-scroll">${popularTerms.map((term) => termChip(term)).join("")}</div></section><section class="section market-section"><div class="section-header"><h2>カテゴリから探す</h2><p>症状、筋肉、ケア方法から絞り込めます。</p></div><div class="category-market-grid">${searchCategories.map((category) => `<a href="/health-library?search=${encodeURIComponent(category)}"><span>${escapeHtml(category.slice(0, 1))}</span><strong>${escapeHtml(category)}</strong></a>`).join("")}</div></section><section class="section market-section"><div class="section-header"><h2>部位から探す</h2><p>気になる場所からセルフチェックや関連記事へ進めます。</p></div><div class="body-finder"><div class="body-figure" aria-hidden="true"><svg viewBox="0 0 120 260" role="img"><circle cx="60" cy="28" r="18"></circle><path d="M60 48v66M30 72h60M44 114l-16 70M76 114l16 70M52 184l-10 58M68 184l10 58"></path></svg><span>Body Map</span></div><div class="body-area-grid">${bodyAreas.map((area) => `<article class="body-area-card"><h3>${escapeHtml(area)}</h3><div><a href="/body-check" data-link>セルフチェック</a><a href="/health-library?search=${encodeURIComponent(area)}">関連記事</a></div></article>`).join("")}</div></div></section><section class="section market-section"><div class="section-header"><h2>人気記事</h2><p>よく読まれる健康情報を確認できます。</p></div><div class="market-article-grid" id="popularArticles"><p class="empty-insight">記事データを読み込みます。</p></div></section><section class="section market-section"><div class="section-header"><h2>新着記事</h2><p>公開日・更新日が新しい記事です。</p></div><div class="market-article-grid compact-list" id="recentArticles"><p class="empty-insight">記事データを読み込みます。</p></div></section><section class="section market-section search-panel-section"><div><h2>SNSで見た健康情報を調べる</h2><p>動画で聞いた言葉だけでも検索できます。まず記事データベースを優先して探します。</p><div class="example-row">${snsExamples.map((term) => termChip(term, "example-chip")).join("")}</div></div><form class="market-search slim" data-market-search><input name="search" type="search" placeholder="SNSで見た言葉を入力" /><button type="submit">調べる</button></form></section><section class="section market-section ai-consult-section"><div><h2>AI相談</h2><p>何でも質問してください。まず関連する記事やテーマを探します。</p></div><form class="market-search slim" data-market-search><input name="search" type="search" placeholder="AIに相談したい内容を入力" /><button type="submit">AIに相談</button></form></section><section class="section split-section"><div><h2>みんなの悩み</h2><p>匿名集計から、不調が集まりやすい場所を確認できます。</p><a class="text-link" href="/community" data-link>詳しく見る</a></div><div id="homeCommunity" class="mini-community"><p class="empty-insight">集計データを読み込みます。</p></div></section><section class="caution-card clinic-cta"><p class="eyebrow">監修</p><h2>ハリプラス鍼灸院</h2><p>Health Check Labは、健康情報を分かりやすく整理するためのセルフチェックサービスです。</p><a class="primary-button" href="/clinic-profile">詳しく見る</a></section><section class="caution-card"><h2>注意文</h2><p>${CAUTION_TEXT}</p><a class="text-link" href="/faq" data-link>よくある質問を見る</a></section>`;
    bindSearchForms();
    runWhenIdle(() => renderArticleRails());
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
  document.addEventListener("click", () => window.setTimeout(enhanceCurrentPage, 0));

  window.normalizeHealthSearch = normalizeHealthSearch;
  window.healthSearchText = healthSearchText;
  window.renderEcHome = renderEcHome;
  window.renderSnsSearchPage = () => `${snsSearchPanel()}<div id="trustResult"></div>`;
  window.bindSnsSearchPage = bindSnsSearchPage;
})();
