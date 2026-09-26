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
    { name: "肘", description: "曲げ伸ばしや握る動作を確認" },
    { name: "手首", description: "手首や指を使う動作を確認" },
    { name: "背中", description: "背中の張りや姿勢の負担を確認" },
    { name: "腰", description: "前屈や立ち上がりの負担を確認" },
    { name: "股関節", description: "脚を開く動きや歩行を確認" },
    { name: "お尻", description: "座る時や歩く時の違和感を確認" },
    { name: "太もも", description: "階段やしゃがむ動きを確認" },
    { name: "膝", description: "階段や立ち上がりの負担を確認" },
    { name: "すね・ふくらはぎ", description: "歩行や立ち仕事での違いを確認" },
    { name: "足首", description: "歩く、しゃがむ動きの負担を確認" },
    { name: "足裏", description: "かかとや土踏まずの違いを確認" }
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
    ["股関節", "股関節", "t9"],
    ["膝", "膝痛", "t10"],
    ["ふくらはぎ", "ふくらはぎ", "t11"],
    ["慢性痛", "慢性痛", "t12"],
    ["肩こり", "肩こり", "t13"],
    ["自律神経", "自律神経", "t14"],
    ["鍼灸", "鍼灸", "t15"],
    ["セルフチェック", "セルフチェック", "t16"]
  ];
  const homeSelectorParts = [
    {
      partId: "neck",
      label: "首",
      views: {
        front: { side: "right", labelY: 16.4, line: [72, 16.4, 50, 16.4], markers: [[50, 16.4]] },
        back: { side: "right", labelY: 12.5, line: [72, 12.5, 50, 13.5], markers: [[50, 13.5]] }
      }
    },
    {
      partId: "shoulder",
      label: "肩",
      views: {
        front: { side: "left", labelY: 21.4, line: [28, 21.4, 36.5, 21.4], markers: [[36.5, 21.4], [63.5, 21.4]] },
        back: { side: "left", labelY: 16.2, line: [28, 16.2, 34, 19.7], markers: [[34, 19.7], [66, 19.7]] }
      }
    },
    {
      partId: "elbow",
      label: "肘",
      views: {
        front: { side: "right", labelY: 31.5, line: [72, 31.5, 68.5, 33], markers: [[31.5, 33], [68.5, 33]] },
        back: { side: "left", labelY: 29.6, line: [28, 29.6, 31.5, 33], markers: [[31.5, 33], [68.5, 33]] }
      }
    },
    {
      partId: "wrist",
      label: "手首",
      views: {
        front: { side: "left", labelY: 40.5, line: [28, 40.5, 28.5, 42], markers: [[28.5, 42], [71.5, 42]] },
        back: { side: "right", labelY: 39.5, line: [72, 39.5, 71.5, 42], markers: [[28.5, 42], [71.5, 42]] }
      }
    },
    {
      partId: "back",
      label: "背中",
      views: {
        back: { side: "right", labelY: 26.3, line: [72, 26.3, 50, 30.5], markers: [[50, 30.5]] }
      }
    },
    {
      partId: "lowback",
      label: "腰",
      views: {
        back: { side: "left", labelY: 43.5, line: [28, 43.5, 50, 37.6], markers: [[50, 37.6]] }
      }
    },
    {
      partId: "hip",
      label: "股関節",
      views: {
        front: { side: "right", labelY: 47.7, line: [72, 47.7, 57.5, 47.7], markers: [[42.5, 47.7], [57.5, 47.7]] }
      }
    },
    {
      partId: "buttock",
      label: "お尻",
      views: {
        back: { side: "right", labelY: 52.5, line: [72, 52.5, 56.5, 46.2], markers: [[43.5, 46.2], [56.5, 46.2]] }
      }
    },
    {
      partId: "thigh",
      label: "太もも",
      views: {
        front: { side: "left", labelY: 56.5, line: [28, 56.5, 43, 56.5], markers: [[43, 56.5], [57, 56.5]] },
        back: { side: "left", labelY: 58.2, line: [28, 58.2, 43, 56.5], markers: [[43, 56.5], [57, 56.5]] }
      }
    },
    {
      partId: "knee",
      label: "膝",
      views: {
        front: { side: "right", labelY: 65.7, line: [72, 65.7, 57.5, 65.7], markers: [[42.5, 65.7], [57.5, 65.7]] },
        back: { side: "right", labelY: 67.5, line: [72, 67.5, 57.5, 65.7], markers: [[42.5, 65.7], [57.5, 65.7]] }
      }
    },
    {
      partId: "lowerleg",
      label: "すね・ふくらはぎ",
      views: {
        front: { side: "left", labelY: 76.5, line: [28, 76.5, 42, 77], markers: [[42, 77], [58, 77]] },
        back: { side: "left", labelY: 77, line: [28, 77, 42, 77], markers: [[42, 77], [58, 77]] }
      }
    },
    {
      partId: "ankle",
      label: "足首",
      views: {
        front: { side: "right", labelY: 86.6, line: [72, 86.6, 58, 86.6], markers: [[42, 86.6], [58, 86.6]] },
        back: { side: "right", labelY: 87, line: [72, 87, 58, 86.6], markers: [[42, 86.6], [58, 86.6]] }
      }
    },
    {
      partId: "sole",
      label: "足裏",
      views: {
        front: { side: "left", labelY: 94, line: [28, 94, 41.5, 93], markers: [[41.5, 93], [58.5, 93]] },
        back: { side: "left", labelY: 93.5, line: [28, 93.5, 41.5, 93], markers: [[41.5, 93], [58.5, 93]] }
      }
    }
  ];
  const homeDetailedParts = [
    ["neck", "首"],
    ["shoulder", "肩"],
    ["elbow", "肘"],
    ["wrist", "手首"],
    ["back", "背中"],
    ["lowback", "腰"],
    ["hip", "股関節"],
    ["buttock", "お尻"],
    ["thigh", "太もも"],
    ["knee", "膝"],
    ["lowerleg", "すね・ふくらはぎ"],
    ["ankle", "足首"],
    ["sole", "足裏"]
  ];
  const homeArticleGroups = [
    { id: "lower-back", title: "腰の悩み", terms: ["腰痛", "腸腰筋", "腰"] },
    { id: "neck-shoulder", title: "首・肩の悩み", terms: ["肩こり", "首こり", "首肩", "肩", "首"] }
  ];

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function homeDiagnosisHref(partId) {
    return `/body-check?part=${encodeURIComponent(partId)}&from=home-body-selector`;
  }

  function homeSelectorImage(view, initialView) {
    const alt = view === "front"
      ? "首、肩、肘、手首、股関節、太もも、膝、すね、足首、足裏を選べる正面の人体図"
      : "首、肩、肘、手首、背中、腰、股関節、お尻、太もも、膝、すね・ふくらはぎ、足首、足裏を選べる背面の人体図";
    const source480 = `/assets/body-guide/body-selector-${view}-480.webp`;
    const source768 = `/assets/body-guide/body-selector-${view}-768.webp`;
    const visible = view === initialView;
    return `<img class="home-body-selector-image" data-home-body-image="${view}" alt="${alt}" width="768" height="1152" decoding="async" sizes="(max-width: 620px) calc(100vw - 64px), (max-width: 900px) 340px, 390px" ${visible ? `src="${source480}" srcset="${source480} 480w, ${source768} 768w" fetchpriority="high"` : `data-src="${source480}" data-srcset="${source480} 480w, ${source768} 768w" loading="lazy"`} />`;
  }

  function homeSelectorHotspots(view) {
    return homeSelectorParts.filter((part) => part.views[view]).map((part) => {
      const position = part.views[view];
      const [startX, startY, endX, endY] = position.line;
      const href = homeDiagnosisHref(part.partId);
      const markers = position.markers.map(([x, y]) => `<a class="home-body-selector-marker-hit" href="${href}" style="--home-marker-x:${x}%;--home-marker-y:${y}%;" tabindex="-1" aria-hidden="true"><span class="home-body-selector-marker"></span></a>`).join("");
      return `<div class="home-body-selector-part home-body-selector-part-${position.side}" data-home-selector-part="${part.partId}"><a class="home-body-selector-label" href="${href}" data-home-part-choice="${part.partId}" style="--home-label-y:${position.labelY}%;" aria-label="${escapeHtml(`${part.label}のセルフチェックを始める`)}"><span>${escapeHtml(part.label)}</span></a><svg class="home-body-selector-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M ${startX} ${startY} L ${endX} ${endY}" vector-effect="non-scaling-stroke" /></svg>${markers}</div>`;
    }).join("");
  }

  function renderHomeBodySelector() {
    const initialView = "front";
    const viewPanel = (view) => `<div class="home-body-selector-view" data-home-body-view-panel="${view}"${view === initialView ? "" : " hidden"}><div class="home-body-selector-figure">${homeSelectorImage(view, initialView)}${homeSelectorHotspots(view)}</div></div>`;
    return `<section class="home-body-selector" id="body-selector" data-home-body-selector data-initial-view="${initialView}" aria-labelledby="home-body-selector-title"><div class="home-body-selector-toolbar"><div><strong id="home-body-selector-title">人体図から選ぶ</strong><span>部位をタップしてチェック開始</span></div><div class="home-body-selector-switch" role="group" aria-label="人体図の向き"><button type="button" data-home-body-view-button="front" aria-pressed="true">正面</button><button type="button" data-home-body-view-button="back" aria-pressed="false">背面</button></div></div><div class="home-body-selector-canvas">${viewPanel("front")}${viewPanel("back")}</div></section>`;
  }

  function loadHomeSelectorImage(image) {
    if (!image || image.getAttribute("src")) return;
    if (image.dataset.srcset) image.setAttribute("srcset", image.dataset.srcset);
    if (image.dataset.src) image.setAttribute("src", image.dataset.src);
    image.hidden = false;
  }

  function showHomeBodyView(selector, view) {
    const target = selector.querySelector(`[data-home-body-view-panel="${view}"]`);
    if (!target) return;
    loadHomeSelectorImage(target.querySelector("[data-home-body-image]"));
    selector.querySelectorAll("[data-home-body-view-panel]").forEach((panel) => {
      panel.hidden = panel !== target;
    });
    selector.querySelectorAll("[data-home-body-view-button]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.homeBodyViewButton === view));
    });
  }

  function setupHomeBodySelector() {
    const selector = document.querySelector("[data-home-body-selector]");
    if (!selector) return;
    showHomeBodyView(selector, selector.dataset.initialView || "front");
    selector.querySelectorAll("[data-home-body-view-button]").forEach((button) => {
      button.addEventListener("click", () => showHomeBodyView(selector, button.dataset.homeBodyViewButton));
    });
  }

  function homeArticleText(article) {
    return [
      article?.title,
      article?.excerpt,
      article?.summary,
      ...(article?.categories || []).map((item) => item?.title),
      ...(article?.tags || []).map((item) => item?.title)
    ].filter(Boolean).join(" ");
  }

  function selectHomeArticles(articles, terms, limit = 3) {
    const ranked = (articles || []).map((article) => {
      const title = String(article?.title || "");
      const categories = (article?.categories || []).map((item) => item?.title || "").join(" ");
      const text = homeArticleText(article);
      const hasDirectMatch = terms.some((term) => title.includes(term) || categories.includes(term));
      const score = terms.reduce((total, term) => total + (title.includes(term) ? 6 : 0) + (categories.includes(term) ? 3 : 0) + (text.includes(term) ? 1 : 0), 0);
      return { article, hasDirectMatch, score };
    }).filter((item) => item.hasDirectMatch && item.score > 0 && item.article?.slug && item.article?.seo?.noIndex !== true)
      .sort((left, right) => right.score - left.score || String(right.article.publishedAt || "").localeCompare(String(left.article.publishedAt || "")));
    const seen = new Set();
    return ranked.filter(({ article }) => {
      const key = String(article.title || article.slug).trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit).map((item) => item.article);
  }

  function homeArticleDateValue(article) {
    return article?.publishedAt || article?.datePublished || article?.updatedAt || "";
  }

  function homeArticleTimestamp(article) {
    const timestamp = new Date(homeArticleDateValue(article)).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  function formatHomeArticleDate(article) {
    const value = homeArticleDateValue(article);
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }).format(date);
  }

  function publishedHomeArticles(articles) {
    const seen = new Set();
    return (articles || []).filter((article) => {
      if (!article?.slug || article?.seo?.noIndex === true) return false;
      const key = String(article.slug).trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function selectLatestHomeArticle(articles, terms) {
    return publishedHomeArticles(articles).map((article) => {
      const title = String(article?.title || "");
      const categories = (article?.categories || []).map((item) => item?.title || "").join(" ");
      const text = homeArticleText(article);
      const hasDirectMatch = terms.some((term) => title.includes(term) || categories.includes(term));
      const score = terms.reduce((total, term) => total + (title.includes(term) ? 6 : 0) + (categories.includes(term) ? 3 : 0) + (text.includes(term) ? 1 : 0), 0);
      return { article, hasDirectMatch, score };
    }).filter((item) => item.hasDirectMatch && item.score > 0)
      .sort((left, right) => homeArticleTimestamp(right.article) - homeArticleTimestamp(left.article) || right.score - left.score)[0]?.article || null;
  }

  function homeArticleCategories(articles) {
    const counts = new Map();
    publishedHomeArticles(articles).forEach((article) => {
      (article.categories || []).forEach((category) => {
        const title = String(category?.title || "").trim();
        if (title) counts.set(title, (counts.get(title) || 0) + 1);
      });
    });
    return Array.from(counts, ([title, count]) => ({ title, count }))
      .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title, "ja"));
  }

  function selectHomeCategoryArticles(articles, category = "all", limit = 4) {
    const selected = publishedHomeArticles(articles).filter((article) => category === "all"
      || (article.categories || []).some((item) => String(item?.title || "").trim() === category));
    const seenTitles = new Set();
    return selected.sort((left, right) => homeArticleTimestamp(right) - homeArticleTimestamp(left))
      .filter((article) => {
        const key = String(article.title || article.slug).trim();
        if (seenTitles.has(key)) return false;
        seenTitles.add(key);
        return true;
      }).slice(0, limit);
  }

  function homeArticleMeta(article) {
    const category = article.categories?.[0]?.title || "健康情報";
    const date = formatHomeArticleDate(article);
    const dateValue = homeArticleDateValue(article);
    return `<span>${escapeHtml(category)}</span>${date ? `<time datetime="${escapeHtml(dateValue)}">${escapeHtml(date)}</time>` : ""}`;
  }

  function homeArticleCard(article) {
    const summary = article.summary || article.excerpt || "記事の要点を確認できます。";
    return `<a class="home-article-card" href="/health-library/${encodeURIComponent(article.slug)}/" data-link><span class="home-article-card-meta">${homeArticleMeta(article)}</span><strong>${escapeHtml(article.title)}</strong><p>${escapeHtml(summary)}</p><b>記事を読む <span aria-hidden="true">→</span></b></a>`;
  }

  function homeCategoryArticle(article) {
    const summary = article.summary || article.excerpt || "記事の要点を確認できます。";
    return `<a class="home-category-article" href="/health-library/${encodeURIComponent(article.slug)}/" data-link><span class="home-category-article-copy"><span class="home-article-card-meta">${homeArticleMeta(article)}</span><strong>${escapeHtml(article.title)}</strong><p>${escapeHtml(summary)}</p></span><span class="home-category-article-arrow" aria-hidden="true">→</span></a>`;
  }

  function mergeHomeArticlePreviews(articles, previews = {}) {
    return (articles || []).map((article) => {
      const preview = previews[article?.slug];
      if (!preview) return article;
      return {
        ...article,
        title: preview.title || article.title,
        summary: preview.description || article.summary,
        localPreview: preview
      };
    });
  }

  function renderHomeFeaturedArticles(articles) {
    return homeArticleGroups.map((group) => {
      const article = selectLatestHomeArticle(articles, group.terms);
      return `<section class="home-featured-group" aria-labelledby="home-article-${group.id}"><div class="home-featured-group-heading"><h3 id="home-article-${group.id}">${escapeHtml(group.title)}</h3><span>最新</span></div>${article ? homeArticleCard(article) : `<p class="home-article-empty">該当する公開記事は健康情報ライブラリで確認できます。</p>`}</section>`;
    }).join("");
  }

  function renderHomeCategoryButtons(categories, activeCategory) {
    const buttons = [{ title: "すべて", value: "all" }, ...categories.map((category) => ({ title: category.title, value: category.title }))];
    return buttons.map((category) => `<button type="button" class="home-category-button" data-home-article-category="${escapeHtml(category.value)}" aria-pressed="${category.value === activeCategory}">${escapeHtml(category.title)}</button>`).join("");
  }

  function renderHomeCategoryResults(articles, activeCategory = "all") {
    const selectedArticles = selectHomeCategoryArticles(articles, activeCategory);
    const categoryLabel = activeCategory === "all" ? "すべて" : activeCategory;
    const total = activeCategory === "all"
      ? publishedHomeArticles(articles).length
      : publishedHomeArticles(articles).filter((article) => (article.categories || []).some((item) => item?.title === activeCategory)).length;
    return `<div class="home-category-result-heading"><h4>${escapeHtml(categoryLabel)}の記事</h4><span>${total}件中${selectedArticles.length}件を表示</span></div><div class="home-category-results">${selectedArticles.length ? selectedArticles.map(homeCategoryArticle).join("") : `<p class="home-article-empty">このカテゴリーの記事はまだありません。</p>`}</div>`;
  }

  function renderHomeArticleExperience(articles, activeCategory = "all") {
    const categories = homeArticleCategories(articles);
    const validCategory = activeCategory === "all" || categories.some((category) => category.title === activeCategory)
      ? activeCategory
      : "all";
    return `<div class="home-featured-articles">${renderHomeFeaturedArticles(articles)}</div><section class="home-category-browser" aria-labelledby="home-category-title"><div class="home-category-heading"><div><h3 id="home-category-title">カテゴリーから選ぶ</h3><p>気になるテーマを選ぶと、新しい記事を確認できます。</p></div></div><div class="home-category-controls" aria-label="記事カテゴリー">${renderHomeCategoryButtons(categories, validCategory)}</div><div class="home-category-result" data-home-category-result aria-live="polite">${renderHomeCategoryResults(articles, validCategory)}</div></section>`;
  }

  function setupHomeArticleCategories(root, articles) {
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-home-article-category]");
      if (!button || !root.contains(button)) return;
      const category = button.dataset.homeArticleCategory || "all";
      root.querySelectorAll("[data-home-article-category]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      const result = root.querySelector("[data-home-category-result]");
      if (result) result.innerHTML = renderHomeCategoryResults(articles, category);
    });
  }

  async function loadHomeArticles() {
    const root = document.querySelector("#homeArticleGroups");
    if (!root) return;
    try {
      const response = await fetch("/data/sanity-articles/index.json", { credentials: "same-origin" });
      if (!response.ok) throw new Error("health library index unavailable");
      const payload = await response.json();
      let articles = Array.isArray(payload) ? payload : (payload.articles || []);
      if (["localhost", "127.0.0.1", "::1"].includes(location.hostname)) {
        try {
          const previewResponse = await fetch("/data/health-library-preview.json", { credentials: "same-origin" });
          if (previewResponse.ok) {
            const previewPayload = await previewResponse.json();
            articles = mergeHomeArticlePreviews(articles, previewPayload?.articles || {});
          }
        } catch (_) {}
      }
      root.innerHTML = renderHomeArticleExperience(articles);
      setupHomeArticleCategories(root, articles);
    } catch (_) {
      root.innerHTML = `<p class="home-article-empty">記事を読み込めませんでした。<a href="/health-library" data-link>健康情報ライブラリを見る</a></p>`;
    }
  }

  function homeMarkup() {
    return `<main class="home-light-shell" aria-label="Health Check Lab"><section class="home-selector-section"><div class="home-selector-inner"><div class="home-selector-intro"><div class="home-selector-intro-copy"><p class="home-selector-kicker">Health Check Labの身体セルフチェック</p><h1>動きから、<span class="home-selector-emphasis">気になる筋肉</span>を<br class="home-selector-title-break" />セルフチェック</h1><p class="home-selector-lead">気になる場所を選び、いくつかの動きに答えると、関係する可能性のある筋肉を人体図で確認できます。</p></div><ol class="home-selector-journey" aria-label="セルフチェックの流れ"><li><span aria-hidden="true">1</span><div><strong>場所を選ぶ</strong><small>人体図をタップ</small></div></li><li><span aria-hidden="true">2</span><div><strong>動きに答える</strong><small>気になる場面を整理</small></div></li><li><span aria-hidden="true">3</span><div><strong>筋肉を確認</strong><small>人体で分かりやすく表示</small></div></li></ol></div>${renderHomeBodySelector()}</div></section><section class="home-articles-section" aria-labelledby="home-articles-title"><div class="home-articles-inner"><div class="home-articles-heading"><div><h2 id="home-articles-title">身体の悩みについて読む</h2><p>腰と首・肩の最新記事を1本ずつ紹介しています。ほかの記事はカテゴリーから選べます。</p></div></div><div id="homeArticleGroups"><p class="home-article-empty" role="status">公開記事を読み込んでいます。</p></div></div></section></main>`;
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
    return `<article class="market-empty-card"><h3>記事を準備しています</h3><p>健康情報ライブラリの記事は順次追加されます。</p><div><a href="/health-library" data-link>記事を探索する</a><a href="/#body-selector" data-link>人体図から選ぶ</a></div></article>`;
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
    return `<article class="body-area-card"><h3>${escapeHtml(area.name)}</h3><p>${escapeHtml(area.description)}</p><div><a href="/#body-selector" data-link>人体図から選ぶ</a><a href="/health-library?search=${encodeURIComponent(area.name)}">関連記事</a></div></article>`;
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
        const targetUrl = new URL(link.href, location.href);
        document.body.classList.add("experience-entering");
        window.setTimeout(() => {
          document.body.classList.remove("experience-entering");
          history.pushState({}, "", `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, 950);
      });
    });
  }

  function renderEcHome(options = {}) {
    document.body.classList.add("home-light");
    document.querySelector("#app").innerHTML = homeMarkup();
    setupHomeBodySelector();
    bindSearchForms();
    loadHomeArticles();
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
      document.body.classList.toggle("home-light", path === "/");
      if (path === "/") {
        if (!document.querySelector(".home-light-shell")) renderEcHome();
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
  window.HealthCheckHomeExperience = {
    homeSelectorParts,
    homeDetailedParts,
    homeArticleGroups,
    homeDiagnosisHref,
    renderHomeBodySelector,
    selectHomeArticles,
    selectLatestHomeArticle,
    homeArticleCategories,
    selectHomeCategoryArticles,
    renderHomeArticleExperience,
    mergeHomeArticlePreviews,
    homeMarkup
  };
  window.renderSnsSearchPage = () => `${snsSearchPanel()}<div id="trustResult"></div>`;
  window.bindSnsSearchPage = bindSnsSearchPage;
})();
