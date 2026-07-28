(function () {
  const SITE_URL = "https://health-check-platform-v2.netlify.app";
  const EXISTING_BASE = "/content/truth-check/articles";
  const SANITY_BASE = "/data/sanity-articles";
  const CATEGORIES = ["ストレッチ", "姿勢・骨盤矯正", "筋膜・トリガーポイント", "筋トレ・運動", "痛み・神経", "鍼灸・治療", "SNS健康情報", "肩こり", "腰痛", "頭痛", "自律神経", "睡眠"];
  let state = null;
  let statePromise = null;

  const qs = (selector) => document.querySelector(selector);
  const qsa = (selector) => Array.from(document.querySelectorAll(selector));
  const arr = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
  const esc = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const attr = (value) => esc(value).replace(/`/g, "&#96;");

  async function json(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    return response.json();
  }

  function ptText(blocks) {
    return arr(blocks).map((block) => block?._type === "block" ? arr(block.children).map((child) => child.text || "").join("") : "").filter(Boolean).join(" ");
  }

  function summary(article) {
    return article.summary || article.excerpt || article.seo?.description || article.seoDescription || article.conclusion || ptText(article.body).slice(0, 120) || "記事の要点を確認できます。";
  }

  function category(article) {
    const categories = arr(article.categories);
    if (categories[0]?.title) return categories[0].title;
    return typeof article.category === "string" ? article.category : "健康情報";
  }

  function categories(article) {
    const values = arr(article.categories).map((item) => item.title || item.slug).filter(Boolean);
    return values.length ? values : [category(article)];
  }

  function tags(article) {
    return [...arr(article.tags).map((item) => item.title || item.slug), ...arr(article.keywords), ...arr(article.targetSymptoms)].filter(Boolean).slice(0, 10);
  }

  function dateValue(article) {
    return article.publishedAt || article.updatedAt || article._updatedAt || "";
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  }

  function image(article) {
    return article.mainImage?.asset?.url || article.seo?.image?.asset?.url || "";
  }

  function merge(existing, sanity) {
    const map = new Map();
    existing.forEach((article) => article?.slug && map.set(article.slug, { ...article, source: article.source || "json" }));
    sanity.forEach((article) => article?.slug && map.set(article.slug, { ...article, source: "sanity" }));
    return Array.from(map.values()).sort((a, b) => (new Date(dateValue(b)).getTime() || 0) - (new Date(dateValue(a)).getTime() || 0));
  }

  async function loadData() {
    if (statePromise) return statePromise;
    statePromise = Promise.all([
      json("/content/truth-check/topics.json").catch(() => []),
      json(`${EXISTING_BASE}/index.json`).catch(() => []),
      json("/content/truth-check/related.json").catch(() => ({})),
      json(`${SANITY_BASE}/index.json`).catch(() => [])
    ]).then(async ([topics, slugs, related, sanityIndex]) => {
      const existing = await Promise.all(arr(slugs).map((slug) => json(`${EXISTING_BASE}/${slug}.json`).catch(() => null)));
      state = { topics, related, articles: merge(existing.filter(Boolean), arr(sanityIndex)), existingCount: existing.filter(Boolean).length, sanityCount: arr(sanityIndex).length };
      return state;
    });
    return statePromise;
  }

  async function loadArticle(slug) {
    try {
      return await json(`${SANITY_BASE}/${encodeURIComponent(slug)}.json`);
    } catch (_) {
      return json(`${EXISTING_BASE}/${encodeURIComponent(slug)}.json`);
    }
  }

  function addMeta(selector, attrs, content) {
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement("meta");
      Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
      document.head.appendChild(element);
    }
    element.setAttribute("content", content || "");
  }

  function addJsonLd(data) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.dynamicSchema = "true";
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function updateSeo(article) {
    const title = article.seo?.title || article.seoTitle || article.title || "健康情報ライブラリ";
    const description = article.seo?.description || article.seoDescription || summary(article);
    const url = `${SITE_URL}/health-library/${article.slug}`;
    const img = image(article);
    document.title = `${title} | Health Check Lab`;
    addMeta('meta[name="description"]', { name: "description" }, description);
    addMeta('meta[property="og:type"]', { property: "og:type" }, "article");
    addMeta('meta[property="og:title"]', { property: "og:title" }, article.seo?.ogTitle || article.ogTitle || title);
    addMeta('meta[property="og:description"]', { property: "og:description" }, article.seo?.ogDescription || article.ogDescription || description);
    addMeta('meta[property="og:url"]', { property: "og:url" }, url);
    if (img) addMeta('meta[property="og:image"]', { property: "og:image" }, img);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
    document.head.querySelectorAll("script[data-dynamic-schema]").forEach((item) => item.remove());
    addJsonLd({ "@context": "https://schema.org", "@type": "Article", headline: article.title, description, datePublished: article.publishedAt || dateValue(article), dateModified: article.updatedAt || article._updatedAt || dateValue(article), image: img ? [img] : undefined, author: { "@type": "Organization", name: article.author?.name || "ハリプラス鍼灸院" }, publisher: { "@type": "Organization", name: "Health Check Lab", url: SITE_URL }, mainEntityOfPage: url });
    addJsonLd({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "トップ", item: `${SITE_URL}/` }, { "@type": "ListItem", position: 2, name: "健康情報ライブラリ", item: `${SITE_URL}/health-library` }, { "@type": "ListItem", position: 3, name: article.title, item: url }] });
    if (arr(article.faqs).length) addJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: arr(article.faqs).map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) });
  }

  function markSpan(child, markDefs) {
    let html = esc(child?.text || "");
    const marks = arr(child?.marks);
    if (marks.includes("strong")) html = `<strong>${html}</strong>`;
    if (marks.includes("em")) html = `<em>${html}</em>`;
    marks.forEach((key) => {
      const mark = markDefs.get(key);
      if (mark?._type === "link" && mark.href) html = `<a href="${attr(mark.href)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
    });
    return html;
  }

  function portableText(blocks) {
    const html = [];
    let list = [];
    let listType = null;
    const flush = () => {
      if (!list.length) return;
      const tag = listType === "number" ? "ol" : "ul";
      html.push(`<${tag}>${list.map((item) => `<li>${item}</li>`).join("")}</${tag}>`);
      list = [];
      listType = null;
    };
    arr(blocks).forEach((block) => {
      if (block?._type === "block") {
        const markDefs = new Map(arr(block.markDefs).map((mark) => [mark._key, mark]));
        const content = arr(block.children).map((child) => markSpan(child, markDefs)).join("");
        if (!content.trim()) return;
        if (block.listItem) {
          const next = block.listItem === "number" ? "number" : "bullet";
          if (listType && listType !== next) flush();
          listType = next;
          list.push(content);
          return;
        }
        flush();
        const style = block.style || "normal";
        if (["h2", "h3", "h4"].includes(style)) html.push(`<${style}>${content}</${style}>`);
        else if (style === "blockquote") html.push(`<blockquote>${content}</blockquote>`);
        else html.push(`<p>${content}</p>`);
        return;
      }
      flush();
      if (block?._type === "image") {
        const url = block.url || block.asset?.url;
        if (url) html.push(`<figure><img src="${attr(url)}" alt="${attr(block.alt || block.caption || "")}" loading="lazy" />${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ""}</figure>`);
      }
    });
    flush();
    return html.join("");
  }

  function card(article) {
    const img = image(article);
    const tagText = tags(article).slice(0, 4).join(" / ");
    return `<a class="library-card" href="/health-library/${attr(article.slug)}" data-link>${img ? `<img class="library-card-image" src="${attr(img)}" alt="${attr(article.title)}" loading="lazy" />` : ""}<div><span class="library-category">${esc(category(article))}</span><span class="judgement-label source-label">${esc(article.source === "sanity" ? "Sanity記事" : article.verdict || "既存記事")}</span></div><h3>${esc(article.title)}</h3><p>${esc(summary(article))}</p><div class="article-card-footer">${formatDate(dateValue(article)) ? `<span>${esc(formatDate(dateValue(article)))}</span>` : ""}${tagText ? `<span>${esc(tagText)}</span>` : ""}</div></a>`;
  }

  function renderListPage() {
    qs("#app").innerHTML = pageShell("健康情報ライブラリ", "健康情報をカテゴリ別に確認できます。", `<section class="panel library-controls"><label class="field"><span>検索</span><input id="librarySearch" type="search" placeholder="キーワードを入力" /></label><div class="category-pills" id="libraryCategories"><button class="category-pill active" type="button" data-category="all">すべて</button>${CATEGORIES.map((item) => `<button class="category-pill" type="button" data-category="${attr(item)}">${esc(item)}</button>`).join("")}</div></section><section class="library-layout"><aside class="panel library-category-list"><h2>カテゴリ</h2><ul>${CATEGORIES.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></aside><div class="library-list" id="libraryList"></div></section><section class="caution-card"><h2>読む前に</h2><p>このサイトは医療診断を行うものではありません。表示結果はセルフチェックの目安です。強い痛み、しびれ、麻痺、発熱などがある場合は医療機関へ相談してください。</p></section>`);
    bindList();
  }

  async function bindList() {
    const list = qs("#libraryList");
    const search = qs("#librarySearch");
    let active = "all";
    list.innerHTML = `<p class="empty-insight">記事データを読み込みます。</p>`;
    try { await loadData(); } catch (_) { list.innerHTML = `<p class="empty-state">記事データを読み込めませんでした。</p>`; return; }
    const render = () => {
      const keyword = (search?.value || "").trim().toLowerCase();
      const filtered = state.articles.filter((article) => {
        const cats = categories(article);
        const tagList = tags(article);
        const categoryMatch = active === "all" || cats.includes(active) || tagList.includes(active);
        const text = `${article.title} ${cats.join(" ")} ${tagList.join(" ")} ${summary(article)} ${article.verdict || ""}`.toLowerCase();
        return categoryMatch && (!keyword || text.includes(keyword));
      });
      list.innerHTML = filtered.length ? filtered.map(card).join("") : `<p class="empty-state">該当する記事はまだありません。</p>`;
    };
    search?.addEventListener("input", render);
    qsa("#libraryCategories .category-pill").forEach((button) => button.addEventListener("click", () => { active = button.dataset.category; qsa("#libraryCategories .category-pill").forEach((item) => item.classList.toggle("active", item === button)); render(); }));
    render();
  }

  function scoreRelated(article, candidate) {
    if (!candidate || article.slug === candidate.slug) return 0;
    const source = new Set([...categories(article), ...tags(article)]);
    const overlap = [...categories(candidate), ...tags(candidate)].filter((item) => source.has(item)).length;
    const words = String(article.title || "").split(/[、。・\s]+/).filter((word) => word.length >= 2);
    const text = `${candidate.title} ${summary(candidate)}`;
    return overlap * 4 + words.filter((word) => text.includes(word)).length;
  }

  function related(article) {
    const preset = arr(article.relatedPosts).filter((item) => item?.slug);
    const scored = (state?.articles || []).map((candidate) => ({ candidate, score: scoreRelated(article, candidate) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map((item) => item.candidate);
    const map = new Map();
    [...preset, ...scored].forEach((item) => item.slug && item.slug !== article.slug && !map.has(item.slug) && map.set(item.slug, item));
    const list = Array.from(map.values()).slice(0, 6);
    return `<section><h2>関連記事</h2>${list.length ? `<div class="library-list related-article-list">${list.map(card).join("")}</div>` : `<p class="empty-insight">関連記事はまだありません。</p>`}</section>`;
  }

  function references(article) {
    const refs = arr(article.references);
    if (!refs.length) return "";
    return `<section class="reference-list"><h2>参考文献</h2>${refs.map((ref) => { const item = ref.reference || ref; const link = item.pubMedUrl || item.url || item.journalUrl || (item.doi ? `https://doi.org/${item.doi}` : ""); return `<article class="reference-card"><h3>${esc(item.title || "参考文献")}</h3><p>${esc([arr(item.authors).join(", "), item.journal || item.source, item.year].filter(Boolean).join(" / "))}</p>${item.studyDesign || item.evidenceLevel ? `<p><strong>Study Design:</strong> ${esc(item.studyDesign || "-")} / <strong>Evidence Level:</strong> ${esc(item.evidenceLevel || "-")}</p>` : ""}${item.supports ? `<p>${esc(item.supports)}</p>` : ""}${item.doi ? `<p>DOI: ${esc(item.doi)}</p>` : ""}${link ? `<p><a href="${attr(link)}" target="_blank" rel="noopener noreferrer">参考文献を見る</a></p>` : ""}</article>`; }).join("")}</section>`;
  }

  function faq(article) {
    const faqs = arr(article.faqs);
    return faqs.length ? `<section><h2>よくある質問</h2><div class="faq-list">${faqs.map((item) => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join("")}</div></section>` : "";
  }

  function author(article) {
    const author = article.author || {};
    return `<section class="supervision-box author-box"><h2>監修者情報</h2><p><strong>${esc(author.name || "ハリプラス鍼灸院")}</strong>${author.role ? `<br>${esc(author.role)}` : ""}</p>${author.description ? `<p>${esc(author.description)}</p>` : ""}</section>`;
  }

  function sanityArticle(article) {
    const img = image(article);
    return `<article class="panel article-template"><div class="article-meta"><span class="library-category">${esc(category(article))}</span><span class="judgement-label source-label">Sanity記事</span>${formatDate(dateValue(article)) ? `<span>${esc(formatDate(dateValue(article)))}</span>` : ""}</div>${img ? `<img class="article-main-image" src="${attr(img)}" alt="${attr(article.mainImage?.alt || article.title)}" loading="lazy" />` : ""}${tags(article).length ? `<div class="article-tag-list">${tags(article).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>` : ""}<div class="sanity-body">${portableText(article.body)}</div>${related(article)}${references(article)}${author(article)}${faq(article)}</article>`;
  }

  function existingArticle(article) {
    const sections = [["1. 判定", `<p><span class="judgement-label large">${esc(article.verdict || "")}</span></p>`], ["2. 結論", `<p>${esc(article.conclusion || "")}</p>`], ["3. SNSでよく言われること", `<p>${esc(article.snsClaim || "")}</p>`], ["4. なぜそう言われるのか", `<p>${esc(article.whyItSpread || "")}</p>`], ["5. 現在の研究では", `<p>${esc(article.currentEvidence || "")}</p>`], ["6. 誤解されやすいポイント", `<p>${esc(article.commonMisunderstandings || "")}</p>`], ["7. 実際はどう考えればいいのか", `<p>${esc(article.practicalView || "")}</p>`], ["8. 鍼灸師としての見解", `<p>${esc(article.acupuncturistView || "")}</p>`], ["9. よくある質問", `<div class="faq-list">${arr(article.faq).map((item) => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join("")}</div>`], ["10. まとめ", `<p>${esc(article.summary || "")}</p>`], ["11. 参考文献・参考情報", `<ul class="trust-list">${arr(article.references).map((item) => `<li>${item.url ? `<a href="${attr(item.url)}" target="_blank" rel="noopener">${esc(item.title)}</a>` : esc(item.title)}</li>`).join("")}</ul>`]];
    return `<article class="panel article-template"><div class="article-meta"><span class="library-category">${esc(article.category || "健康情報")}</span><span class="judgement-label">${esc(article.verdict || "")}</span></div>${sections.map(([title, body]) => `<section><h2>${title}</h2>${body}</section>`).join("")}${author(article)}${related(article)}</article>`;
  }

  async function renderArticle(slug) {
    qs("#app").innerHTML = pageShell("記事を読み込み中", "健康情報ライブラリの記事データを確認しています。", `<section class="panel"><p class="empty-insight">記事データを読み込みます。</p></section>`, "/health-library");
    try {
      await loadData();
      const article = await loadArticle(slug);
      if (!article?.slug) throw new Error("not-found");
      updateSeo(article);
      qs("#app").innerHTML = pageShell(article.title, summary(article), article.source === "sanity" ? sanityArticle(article) : existingArticle(article), "/health-library");
    } catch (_) {
      qs("#app").innerHTML = pageShell("記事が見つかりません", "指定された記事はまだ作成されていません。", `<section class="panel"><a class="primary-button" href="/health-library" data-link>ライブラリへ戻る</a></section>`, "/health-library");
    }
  }

  if (typeof routes !== "undefined") routes["/health-library"] = renderListPage;
  if (typeof renderHealthLibraryArticle !== "undefined") renderHealthLibraryArticle = renderArticle;
})();
