(function () {
  const SITE_URL = "https://health-check-platform-v2.netlify.app";
  const HARIPLUS_HOME_URL = "https://stunning-cassata-f82c76.netlify.app";
  const HARIPLUS_LINE_URL = "https://line.me/R/ti/p/@hari-plus";
  const EXISTING_BASE = "/content/truth-check/articles";
  const SANITY_BASE = "/data/sanity-articles";
  const CATEGORIES = ["ストレッチ", "姿勢・骨盤矯正", "筋膜・トリガーポイント", "筋トレ・運動", "痛み・神経", "鍼灸・治療", "SNS健康情報", "肩こり", "腰痛", "頭痛", "自律神経", "睡眠"];
  const SUMMARY_LIMIT = 110;
  const RELATED_LIMIT = 3;

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

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function truncate(value, limit = SUMMARY_LIMIT) {
    const text = cleanText(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).replace(/[、。,.，．\s]+$/, "")}…`;
  }

  function ptText(blocks) {
    return arr(blocks).map((block) => block?._type === "block" ? arr(block.children).map((child) => child.text || "").join("") : "").filter(Boolean).join(" ");
  }

  function summary(article, limit = SUMMARY_LIMIT) {
    return truncate(article.summary || article.excerpt || article.seo?.description || article.seoDescription || article.conclusion || ptText(article.body) || "記事の要点を確認できます。", limit);
  }

  function category(article) {
    const categoryItems = arr(article.categories);
    if (categoryItems[0]?.title) return categoryItems[0].title;
    return typeof article.category === "string" ? article.category : "健康情報";
  }

  function categories(article) {
    const values = arr(article.categories).map((item) => item.title || item.slug).filter(Boolean);
    return values.length ? values : [category(article)];
  }

  function tags(article) {
    return [...arr(article.tags).map((item) => item.title || item.slug), ...arr(article.keywords), ...arr(article.targetSymptoms)]
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 10);
  }

  function dateValue(article) {
    return article.publishedAt || article.updatedAt || article._updatedAt || "";
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  }

  function image(article) {
    return article.mainImage?.asset?.url || article.mainImage?.url || article.seo?.image?.asset?.url || article.seo?.image?.url || "";
  }

  function imageSize(article) {
    const dimensions = article.mainImage?.asset?.metadata?.dimensions || article.seo?.image?.asset?.metadata?.dimensions;
    return {
      width: Number(dimensions?.width) || 1200,
      height: Number(dimensions?.height) || 675
    };
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
      state = {
        topics,
        related,
        articles: merge(existing.filter(Boolean), arr(sanityIndex)),
        existingCount: existing.filter(Boolean).length,
        sanityCount: arr(sanityIndex).length
      };
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
    const description = article.seo?.description || article.seoDescription || summary(article, 150);
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
        const dimensions = block.asset?.metadata?.dimensions || {};
        if (url) {
          html.push(`<figure><img src="${attr(url)}" alt="${attr(block.alt || block.caption || "")}" loading="lazy" width="${Number(dimensions.width) || 1200}" height="${Number(dimensions.height) || 675}" />${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ""}</figure>`);
        }
      }
    });
    flush();
    return html.join("");
  }

  function cardMedia(article) {
    const img = image(article);
    const size = imageSize(article);
    if (img) {
      return `<img class="library-card-image" src="${attr(img)}" alt="${attr(article.title)}" loading="lazy" width="${size.width}" height="${size.height}" />`;
    }
    return `<div class="library-card-image library-card-placeholder" aria-hidden="true"><span>${esc(category(article)).slice(0, 2)}</span></div>`;
  }

  function card(article) {
    const published = formatDate(dateValue(article));
    return `
      <a class="library-card" href="/health-library/${attr(article.slug)}" data-link>
        ${cardMedia(article)}
        <div class="library-card-content">
          <div class="library-card-meta">
            <span class="library-category">${esc(category(article))}</span>
            ${published ? `<time datetime="${attr(dateValue(article))}">${esc(published)}</time>` : ""}
          </div>
          <h3>${esc(article.title)}</h3>
          <p>${esc(summary(article))}</p>
          <span class="library-read-more">記事を読む</span>
        </div>
      </a>
    `;
  }

  function renderListPage() {
    qs("#app").innerHTML = pageShell("健康情報ライブラリ", "症状や体のケア、健康情報の見方を読みやすく整理しています。", `
      <section class="library-intro panel">
        <div>
          <p class="eyebrow">Health Library</p>
          <h2>気になるテーマから記事を探す</h2>
          <p>検索やカテゴリから、体の不調やセルフチェックに役立つ記事を確認できます。</p>
        </div>
        <div class="library-count" id="libraryCount" aria-live="polite">記事を読み込み中</div>
      </section>
      <section class="panel library-controls" aria-label="記事検索とカテゴリ">
        <label class="field">
          <span>検索</span>
          <input id="librarySearch" type="search" placeholder="キーワードを入力" autocomplete="off" />
        </label>
        <div class="category-pills" id="libraryCategories" role="list" aria-label="カテゴリ">
          <button class="category-pill active" type="button" data-category="all" aria-pressed="true">すべて</button>
          ${CATEGORIES.map((item) => `<button class="category-pill" type="button" data-category="${attr(item)}" aria-pressed="false">${esc(item)}</button>`).join("")}
        </div>
      </section>
      <section class="library-layout">
        <aside class="panel library-category-list" aria-label="カテゴリ一覧">
          <h2>カテゴリ</h2>
          <ul>${CATEGORIES.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
        </aside>
        <div class="library-list" id="libraryList"></div>
      </section>
      <section class="caution-card">
        <h2>読む前に</h2>
        <p>このサイトは医療診断を行うものではありません。表示結果はセルフチェックの目安です。強い痛み、しびれ、麻痺、発熱などがある場合は医療機関へ相談してください。</p>
      </section>
    `);
    bindList();
  }

  async function bindList() {
    const list = qs("#libraryList");
    const count = qs("#libraryCount");
    const search = qs("#librarySearch");
    let active = "all";
    list.innerHTML = `<p class="empty-insight">記事データを読み込みます。</p>`;
    try {
      await loadData();
    } catch (_) {
      list.innerHTML = `<p class="empty-state">記事データを読み込めませんでした。</p>`;
      if (count) count.textContent = "記事を読み込めませんでした";
      return;
    }
    const render = () => {
      const keyword = (search?.value || "").trim().toLowerCase();
      const filtered = state.articles.filter((article) => {
        const cats = categories(article);
        const tagList = tags(article);
        const categoryMatch = active === "all" || cats.includes(active) || tagList.includes(active);
        const text = `${article.title} ${cats.join(" ")} ${tagList.join(" ")} ${summary(article)} ${article.verdict || ""}`.toLowerCase();
        return categoryMatch && (!keyword || text.includes(keyword));
      });
      if (count) count.textContent = `${filtered.length}件の記事`;
      list.innerHTML = filtered.length ? filtered.map(card).join("") : `<p class="empty-state">該当する記事はまだありません。</p>`;
    };
    search?.addEventListener("input", render);
    qsa("#libraryCategories .category-pill").forEach((button) => button.addEventListener("click", () => {
      active = button.dataset.category;
      qsa("#libraryCategories .category-pill").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      render();
    }));
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
    const list = Array.from(map.values()).slice(0, RELATED_LIMIT);
    return `<section class="article-support-section related-section"><h2>関連記事</h2>${list.length ? `<div class="library-list related-article-list">${list.map(card).join("")}</div>` : `<p class="empty-insight">関連記事はまだありません。</p>`}</section>`;
  }

  function references(article) {
    const refs = arr(article.references);
    if (!refs.length) return "";
    return `<section class="article-support-section reference-list"><h2>参考文献</h2><ol>${refs.map((ref) => {
      const item = ref.reference || ref;
      const link = item.pubMedUrl || item.url || item.journalUrl || (item.doi ? `https://doi.org/${item.doi}` : "");
      const meta = [arr(item.authors).join(", "), item.journal || item.source, item.year].filter(Boolean).join(" / ");
      return `<li class="reference-card"><h3>${esc(item.title || "参考文献")}</h3>${meta ? `<p class="reference-meta">${esc(meta)}</p>` : ""}${item.studyDesign || item.evidenceLevel ? `<p class="reference-design"><strong>Study Design:</strong> ${esc(item.studyDesign || "-")} <span>/</span> <strong>Evidence Level:</strong> ${esc(item.evidenceLevel || "-")}</p>` : ""}${item.supports ? `<p>${esc(item.supports)}</p>` : ""}${item.doi ? `<p class="reference-link-text">DOI: ${esc(item.doi)}</p>` : ""}${link ? `<p><a href="${attr(link)}" target="_blank" rel="noopener noreferrer">参考文献を見る</a></p>` : ""}</li>`;
    }).join("")}</ol></section>`;
  }

  function faq(article) {
    const faqs = arr(article.faqs || article.faq);
    if (!faqs.length) return "";
    return `<section class="article-support-section faq-section"><h2>よくある質問</h2><div class="faq-list">${faqs.map((item, index) => `<details><summary aria-expanded="false" id="faq-${index}">${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join("")}</div></section>`;
  }

  function author(article) {
    const author = article.author || {};
    return `<section class="article-support-section supervision-box author-box"><h2>監修者情報</h2><div class="author-card">${author.image?.asset?.url ? `<img src="${attr(author.image.asset.url)}" alt="${attr(author.name || "監修者")}" loading="lazy" width="72" height="72" />` : ""}<div><p><strong>${esc(author.name || "ハリプラス鍼灸院")}</strong>${author.role ? `<br><span>${esc(author.role)}</span>` : ""}</p>${author.description ? `<p>${esc(author.description)}</p>` : ""}</div></div></section>`;
  }

  function reservationCta() {
    return `
      <section class="article-support-section clinic-reservation-cta" aria-labelledby="clinicReservationCtaTitle">
        <div>
          <h2 id="clinicReservationCtaTitle">体の不調でお悩みの方へ</h2>
          <p>症状や体の状態を確認しながら、一人ひとりに合った施術をご提案します。</p>
        </div>
        <div class="clinic-reservation-actions">
          <a class="clinic-line-button" href="${attr(HARIPLUS_LINE_URL)}" aria-label="LINEでハリプラス鍼灸院を予約する">LINEで予約する</a>
          <a class="clinic-home-link" href="${attr(HARIPLUS_HOME_URL)}">ハリプラス鍼灸院のホームページを見る</a>
        </div>
      </section>
    `;
  }

  function breadcrumb(article) {
    return `<nav class="article-breadcrumb" aria-label="パンくず"><a href="/" data-link>トップ</a><span aria-hidden="true">&gt;</span><a href="/health-library" data-link>健康情報ライブラリ</a><span aria-hidden="true">&gt;</span><span>${esc(article.title)}</span></nav>`;
  }

  function articleHeader(article) {
    const img = image(article);
    const size = imageSize(article);
    const published = formatDate(article.publishedAt);
    const updated = article.updatedAt && article.updatedAt !== article.publishedAt ? formatDate(article.updatedAt) : "";
    return `
      <header class="article-head">
        ${breadcrumb(article)}
        <div class="article-head-meta">
          <span class="library-category">${esc(category(article))}</span>
          ${published ? `<time datetime="${attr(article.publishedAt)}">公開日 ${esc(published)}</time>` : ""}
          ${updated ? `<time datetime="${attr(article.updatedAt)}">更新日 ${esc(updated)}</time>` : ""}
        </div>
        <h2>${esc(article.title)}</h2>
        <p>${esc(summary(article, 150))}</p>
        ${tags(article).length ? `<div class="article-tag-list">${tags(article).slice(0, 8).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>` : ""}
        ${img ? `<img class="article-main-image" src="${attr(img)}" alt="${attr(article.mainImage?.alt || article.title)}" loading="lazy" width="${size.width}" height="${size.height}" />` : ""}
      </header>
    `;
  }

  function nextAction() {
    return `
      <section class="article-support-section article-next-action" aria-label="次にできること">
        <h2>次にできること</h2>
        <div class="button-row">
          <a class="primary-button" href="/body-check" data-link>体のセルフチェックをする</a>
          <a class="secondary-button" href="/health-library" data-link>ほかの記事を見る</a>
        </div>
      </section>
    `;
  }

  function enhanceDetails() {
    qsa(".faq-section details").forEach((detail) => {
      const summaryEl = detail.querySelector("summary");
      if (!summaryEl) return;
      summaryEl.setAttribute("aria-expanded", String(detail.open));
      detail.addEventListener("toggle", () => summaryEl.setAttribute("aria-expanded", String(detail.open)));
    });
  }

  function sanityArticle(article) {
    return `<article class="panel article-template sanity-article">${articleHeader(article)}<div class="sanity-body">${portableText(article.body)}</div>${faq(article)}${references(article)}${author(article)}${reservationCta()}${related(article)}</article>`;
  }

  function existingArticle(article) {
    const sections = [["1. 判定", `<p><span class="judgement-label large">${esc(article.verdict || "")}</span></p>`], ["2. 結論", `<p>${esc(article.conclusion || "")}</p>`], ["3. SNSでよく言われること", `<p>${esc(article.snsClaim || "")}</p>`], ["4. なぜそう言われるのか", `<p>${esc(article.whyItSpread || "")}</p>`], ["5. 現在の研究では", `<p>${esc(article.currentEvidence || "")}</p>`], ["6. 誤解されやすいポイント", `<p>${esc(article.commonMisunderstandings || "")}</p>`], ["7. 実際はどう考えればいいのか", `<p>${esc(article.practicalView || "")}</p>`], ["8. 鍼灸師としての見解", `<p>${esc(article.acupuncturistView || "")}</p>`], ["9. まとめ", `<p>${esc(article.summary || "")}</p>`]];
    return `<article class="panel article-template sanity-article">${articleHeader(article)}${sections.map(([title, body]) => `<section class="article-support-section"><h2>${title}</h2>${body}</section>`).join("")}${faq(article)}${references(article)}${author(article)}${reservationCta()}${related(article)}</article>`;
  }

  async function renderArticle(slug) {
    qs("#app").innerHTML = pageShell("記事を読み込み中", "健康情報ライブラリの記事データを確認しています。", `<section class="panel"><p class="empty-insight">記事データを読み込みます。</p></section>`, "/health-library");
    try {
      await loadData();
      const article = await loadArticle(slug);
      if (!article?.slug) throw new Error("not-found");
      updateSeo(article);
      qs("#app").innerHTML = pageShell(article.title, summary(article, 150), article.source === "sanity" ? sanityArticle(article) : existingArticle(article), "/health-library");
      enhanceDetails();
    } catch (_) {
      qs("#app").innerHTML = pageShell("記事が見つかりません", "指定された記事はまだ作成されていません。", `<section class="panel"><a class="primary-button" href="/health-library" data-link>ライブラリへ戻る</a></section>`, "/health-library");
    }
  }

  if (typeof routes !== "undefined") routes["/health-library"] = renderListPage;
  if (typeof renderHealthLibraryArticle !== "undefined") renderHealthLibraryArticle = renderArticle;
})();
