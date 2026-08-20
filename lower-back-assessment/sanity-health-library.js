(function () {
  const SITE_URL = "https://health-check-platform-v2.netlify.app";
  const SITE_NAME = "Health Check Lab";
  const HARIPLUS_HOME_URL = "https://stunning-cassata-f82c76.netlify.app";
  const HARIPLUS_LINE_URL = "https://line.me/R/ti/p/@hari-plus";
  const EXISTING_BASE = "/content/truth-check/articles";
  const SANITY_BASE = "/data/sanity-articles";
  const SUMMARY_LIMIT = 110;
  const RELATED_LIMIT = 3;
  const NEW_LIMIT = 3;
  const RECOMMENDED_ARTICLE_LIMIT = 3;
  const INITIAL_LIMIT = 12;
  const TAG_DISPLAY_LIMIT = 5;
  const RECOMMENDED_CATEGORY_NAMES = ["腰", "首・肩", "頭痛", "自律神経"];
  const CATEGORY_DESCRIPTIONS = {
    "慢性痛": "慢性的な痛みや体の不調について、医学的な情報と鍼灸師の視点から整理した記事です。",
    "頭痛": "頭痛や首肩の緊張、日常生活との関係について分かりやすくまとめています。",
    "首・肩": "首こり、肩こり、姿勢や肩甲骨の動きに関する健康情報をまとめています。",
    "腰": "腰痛や股関節、骨盤、日常動作との関係を整理した記事です。",
    "膝": "膝の痛みや動作時の不安について、確認したいポイントをまとめています。",
    "自律神経": "自律神経に関わる不調や生活の中で気づきたい変化を整理しています。",
    "目の症状": "目の疲れや首肩との関係など、体の状態と合わせて考えたい情報です。",
    "耳の症状": "耳鳴りやめまいなど、耳まわりの不調について確認したい情報です。",
    "美容": "美容鍼や肌、表情筋、血流に関する健康情報をまとめています。",
    "鍼灸": "鍼灸について研究で確認されていることや、体の見方を整理しています。",
    "運動": "運動や筋力、体の使い方に関する記事をまとめています。",
    "ストレッチ": "ストレッチや柔軟性、動かしやすい体づくりに関する情報です。",
    "健康情報": "体の不調や健康情報の見方を幅広く整理した記事です。"
  };
  const CATEGORY_ALIASES = new Map([
    ["肩こり", "首・肩"],
    ["首こり", "首・肩"],
    ["首肩こり", "首・肩"],
    ["首・肩こり", "首・肩"],
    ["首肩", "首・肩"],
    ["腰痛", "腰"],
    ["膝痛", "膝"],
    ["睡眠", "自律神経"],
    ["不眠", "自律神経"],
    ["耳鳴り", "耳の症状"],
    ["めまい", "耳の症状"],
    ["目の疲れ", "目の症状"],
    ["美容鍼", "美容"],
    ["鍼灸・治療", "鍼灸"],
    ["筋トレ・運動", "運動"],
    ["SNS健康情報", "健康情報"]
  ]);
  const CATEGORY_SLUGS = new Map([
    ["慢性痛", "chronic-pain"],
    ["頭痛", "headache"],
    ["首・肩", "neck-shoulder"],
    ["腰", "low-back"],
    ["膝", "knee"],
    ["自律神経", "autonomic"],
    ["目の症状", "eye-symptoms"],
    ["耳の症状", "ear-symptoms"],
    ["美容", "beauty"],
    ["鍼灸", "acupuncture"],
    ["運動", "exercise"],
    ["ストレッチ", "stretch"],
    ["健康情報", "health-info"]
  ]);

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

  function normalizeSearchText(value) {
    return cleanText(value).normalize("NFKC").toLowerCase();
  }

  function truncate(value, limit = SUMMARY_LIMIT) {
    const text = cleanText(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, limit).replace(/[、。,.，．\s]+$/, "")}…`;
  }

  function ptText(blocks) {
    return arr(blocks)
      .map((block) => block?._type === "block" ? arr(block.children).map((child) => child.text || "").join("") : "")
      .filter(Boolean)
      .join(" ");
  }

  function summary(article, limit = SUMMARY_LIMIT) {
    return truncate(article.summary || article.excerpt || article.seo?.description || article.seoDescription || article.conclusion || ptText(article.body) || "記事の要点を確認できます。", limit);
  }

  function readingMinutes(article) {
    const text = cleanText(`${article.title || ""} ${summary(article, 220)} ${ptText(article.body)} ${arr(article.faqs || article.faq).map((item) => `${item.question || ""} ${item.answer || ""}`).join(" ")}`);
    const minutes = Math.max(1, Math.ceil(text.length / 500));
    return `${minutes}分で読めます`;
  }

  function normalizeCategoryName(value) {
    const text = cleanText(value) || "健康情報";
    return CATEGORY_ALIASES.get(text) || text;
  }

  function stableSlug(value) {
    const text = cleanText(value);
    const mapped = CATEGORY_SLUGS.get(normalizeCategoryName(text));
    if (mapped) return mapped;
    const ascii = text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (ascii) return ascii;
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return `topic-${Math.abs(hash).toString(36)}`;
  }

  function category(article) {
    const categoryItems = arr(article.categories);
    const raw = categoryItems[0]?.title || categoryItems[0]?.slug || (typeof article.category === "string" ? article.category : "健康情報");
    return normalizeCategoryName(raw);
  }

  function categories(article) {
    const values = arr(article.categories).map((item) => item.title || item.slug).filter(Boolean);
    const normalized = (values.length ? values : [category(article)]).map(normalizeCategoryName);
    return [...new Set(normalized)];
  }

  function tags(article) {
    return [...arr(article.tags).map((item) => item.title || item.slug), ...arr(article.keywords), ...arr(article.targetSymptoms)]
      .map(cleanText)
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .slice(0, 12);
  }

  function dateValue(article) {
    return article.publishedAt || article.updatedAt || article._updatedAt || article.datePublished || "";
  }

  function effectiveUpdatedAt(article) {
    const values = [article.updatedAt, article._updatedAt, article.dateModified, article.publishedAt, article.datePublished]
      .map((value) => {
        const date = new Date(value || "");
        return Number.isNaN(date.getTime()) ? null : date;
      })
      .filter(Boolean);
    if (!values.length) return "";
    return new Date(Math.max(...values.map((date) => date.getTime()))).toISOString();
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });
  }

  function formatShortDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value || "";
    const month = parts.find((part) => part.type === "month")?.value || "";
    const day = parts.find((part) => part.type === "day")?.value || "";
    if (!year || !month || !day) return "";
    return `${year}/${month}/${day}`;
  }

  function shouldShowUpdated(article) {
    const published = new Date(article.publishedAt || article.datePublished || "");
    const updated = new Date(effectiveUpdatedAt(article));
    if (Number.isNaN(published.getTime()) || Number.isNaN(updated.getTime())) return false;
    return updated.toDateString() !== published.toDateString() && updated > published;
  }

  function image(article) {
    return article.mainImage?.url || article.mainImage?.asset?.url || article.seo?.image?.url || article.seo?.image?.asset?.url || "";
  }

  function imageSize(article) {
    const dimensions = article.mainImage?.dimensions || article.mainImage?.asset?.metadata?.dimensions || article.seo?.image?.dimensions || article.seo?.image?.asset?.metadata?.dimensions;
    return { width: Number(dimensions?.width) || 1200, height: Number(dimensions?.height) || 675 };
  }

  function articleUrl(article) {
    return `/health-library/${article.slug}`;
  }

  function absoluteArticleUrl(article) {
    return `${SITE_URL}${articleUrl(article)}`;
  }

  function categoryUrl(name) {
    return `/health-library/category/${stableSlug(name)}`;
  }

  function tagUrl(tag) {
    return `/health-library?tag=${encodeURIComponent(stableSlug(tag))}`;
  }

  function merge(existing, sanity) {
    const map = new Map();
    existing.forEach((article) => article?.slug && map.set(article.slug, { ...article, source: article.source || "json" }));
    sanity.forEach((article) => article?.slug && map.set(article.slug, { ...article, source: "sanity" }));
    return Array.from(map.values()).sort((a, b) => (new Date(dateValue(b)).getTime() || 0) - (new Date(dateValue(a)).getTime() || 0));
  }

  function buildCategoryList(articles) {
    const counts = new Map();
    articles.forEach((article) => categories(article).forEach((name) => counts.set(name, (counts.get(name) || 0) + 1)));
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, slug: stableSlug(name), description: CATEGORY_DESCRIPTIONS[name] || `${name}に関する健康情報をまとめています。` }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
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
      const articles = merge(existing.filter(Boolean), arr(sanityIndex));
      state = { topics, related, articles, categories: buildCategoryList(articles), existingCount: existing.filter(Boolean).length, sanityCount: arr(sanityIndex).length };
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

  function setCanonical(url) {
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }

  function addJsonLd(data) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.dynamicSchema = "true";
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function clearDynamicSchema() {
    document.head.querySelectorAll("script[data-dynamic-schema]").forEach((item) => item.remove());
  }

  function setRobots(noindex) {
    if (noindex) addMeta('meta[name="robots"]', { name: "robots" }, "noindex,follow");
    else document.head.querySelector('meta[name="robots"]')?.remove();
  }

  function updateListSeo(options = {}) {
    const categoryItem = options.category || null;
    const tag = options.tag || "";
    const search = options.search || "";
    const title = categoryItem ? `${categoryItem.name}の記事一覧｜健康情報ライブラリ` : tag ? `${tag}の記事一覧｜健康情報ライブラリ` : "健康情報ライブラリ｜痛み・体の不調を分かりやすく解説";
    const description = categoryItem ? categoryItem.description : tag ? `${tag}に関連する健康情報記事をまとめています。` : "慢性痛、肩こり、腰痛、自律神経など、体の不調に関する健康情報を、医学的な情報と鍼灸師の視点から分かりやすく解説します。";
    const path = categoryItem ? categoryUrl(categoryItem.name) : "/health-library";
    const canonical = `${SITE_URL}${path}`;
    document.title = `${title} | ${SITE_NAME}`;
    addMeta('meta[name="description"]', { name: "description" }, description);
    addMeta('meta[property="og:type"]', { property: "og:type" }, "website");
    addMeta('meta[property="og:title"]', { property: "og:title" }, `${title} | ${SITE_NAME}`);
    addMeta('meta[property="og:description"]', { property: "og:description" }, description);
    addMeta('meta[property="og:url"]', { property: "og:url" }, canonical);
    setCanonical(canonical);
    setRobots(Boolean(search || tag));
    clearDynamicSchema();
  }

  function collectionSchema(items, pageUrl, name, description) {
    return { "@context": "https://schema.org", "@type": "CollectionPage", name, description, url: pageUrl, mainEntity: { "@type": "ItemList", itemListElement: items.map((article, index) => ({ "@type": "ListItem", position: index + 1, url: absoluteArticleUrl(article), name: article.title })) } };
  }

  function breadcrumbSchema(items) {
    return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })) };
  }

  function updateArticleSeo(article) {
    const title = article.seo?.title || article.seoTitle || article.title || "健康情報ライブラリ";
    const description = article.seo?.description || article.seoDescription || summary(article, 150);
    const url = absoluteArticleUrl(article);
    const img = image(article);
    const primaryCategory = category(article);
    document.title = `${title} | ${SITE_NAME}`;
    addMeta('meta[name="description"]', { name: "description" }, description);
    addMeta('meta[property="og:type"]', { property: "og:type" }, "article");
    addMeta('meta[property="og:title"]', { property: "og:title" }, article.seo?.ogTitle || article.ogTitle || title);
    addMeta('meta[property="og:description"]', { property: "og:description" }, article.seo?.ogDescription || article.ogDescription || description);
    addMeta('meta[property="og:url"]', { property: "og:url" }, url);
    if (img) addMeta('meta[property="og:image"]', { property: "og:image" }, img);
    setCanonical(url);
    setRobots(Boolean(article.seo?.noIndex));
    clearDynamicSchema();
    const dateModified = shouldShowUpdated(article) ? article.updatedAt || article._updatedAt : article.publishedAt || dateValue(article);
    addJsonLd({ "@context": "https://schema.org", "@type": "Article", headline: article.title, description, datePublished: article.publishedAt || dateValue(article), dateModified, image: img ? [img] : undefined, author: { "@type": article.author?.name && article.author.name !== "ハリプラス鍼灸院" ? "Person" : "Organization", name: article.author?.name || "ハリプラス鍼灸院" }, publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL }, mainEntityOfPage: url, articleSection: primaryCategory, keywords: tags(article).join(", "), citation: arr(article.references).map((item) => item.url || item.pubMedUrl || item.journalUrl || item.doi || item.title).filter(Boolean) });
    addJsonLd(breadcrumbSchema([{ name: "トップ", url: `${SITE_URL}/` }, { name: "健康情報ライブラリ", url: `${SITE_URL}/health-library` }, { name: primaryCategory, url: `${SITE_URL}${categoryUrl(primaryCategory)}` }, { name: article.title, url }]));
    if (arr(article.faqs).length) addJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: arr(article.faqs).map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) });
  }

  const markdownLinkPattern = /\[([^\]\n]{1,160})\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g;
  const bareHealthLibraryUrlPattern = /https?:\/\/health-check-platform-v2\.netlify\.app\/health-library\/[^\s<>"')]+/g;

  function linkLabelFromUrl(url) {
    try {
      const parsed = new URL(url, SITE_URL);
      const slug = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
      const match = (state?.articles || []).find((article) => article.slug === slug);
      return match?.title || slug.replace(/[-_]+/g, " ") || "関連リンク";
    } catch (_) {
      return "関連リンク";
    }
  }

  function textWithSafeLinks(value) {
    const text = String(value || "");
    let html = "";
    let cursor = 0;
    let changed = false;
    let match;
    const appendPlainText = (plain) => {
      let plainCursor = 0;
      let plainChanged = false;
      let plainMatch;
      bareHealthLibraryUrlPattern.lastIndex = 0;
      while ((plainMatch = bareHealthLibraryUrlPattern.exec(plain))) {
        html += esc(plain.slice(plainCursor, plainMatch.index));
        const rawUrl = plainMatch[0];
        const url = rawUrl.replace(/[),.;。]+$/, "");
        const trailing = rawUrl.slice(url.length);
        html += `<a href="${attr(normalizeInternalLink(url))}" data-link>${esc(linkLabelFromUrl(url))}</a>${esc(trailing)}`;
        plainCursor = plainMatch.index + rawUrl.length;
        plainChanged = true;
      }
      html += esc(plain.slice(plainCursor));
      changed = changed || plainChanged;
    };
    markdownLinkPattern.lastIndex = 0;
    while ((match = markdownLinkPattern.exec(text))) {
      appendPlainText(text.slice(cursor, match.index));
      html += `<a href="${attr(normalizeInternalLink(match[2]))}"${isInternalLink(match[2]) ? " data-link" : ' target="_blank" rel="noopener noreferrer"'}>${esc(match[1])}</a>`;
      cursor = match.index + match[0].length;
      changed = true;
    }
    appendPlainText(text.slice(cursor));
    return changed ? html : esc(text);
  }

  function markSpan(child, markDefs) {
    let html = textWithSafeLinks(child?.text || "");
    const marks = arr(child?.marks);
    if (marks.includes("strong")) html = `<strong>${html}</strong>`;
    if (marks.includes("em")) html = `<em>${html}</em>`;
    marks.forEach((key) => {
      const mark = markDefs.get(key);
      if (mark?._type === "link" && mark.href) {
        html = `<a href="${attr(normalizeInternalLink(mark.href))}"${isInternalLink(mark.href) ? " data-link" : ' target="_blank" rel="noopener noreferrer"'}>${html}</a>`;
      }
    });
    return html;
  }

  function isInternalLink(href) {
    try {
      const url = new URL(href, SITE_URL);
      return url.origin === location.origin || url.origin === SITE_URL;
    } catch (_) {
      return String(href || "").startsWith("/");
    }
  }

  function normalizeInternalLink(href) {
    if (!href) return "";
    try {
      const url = new URL(href, SITE_URL);
      const slug = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
      const match = (state?.articles || []).find((article) => article.slug === slug);
      if (match && (/\/blog\//.test(url.pathname) || /\/health-library\//.test(url.pathname))) return articleUrl(match);
      return url.origin === location.origin || url.origin === SITE_URL ? `${url.pathname}${url.search}` : url.toString();
    } catch (_) {
      return href;
    }
  }

  function headingSlug(value, used) {
    const base = stableSlug(value).replace(/^topic-/, "section-") || "section";
    let id = base;
    let count = 2;
    while (used.has(id)) {
      id = `${base}-${count}`;
      count += 1;
    }
    used.add(id);
    return id;
  }

  function portableTextWithHeadings(blocks) {
    const html = [];
    const headings = [];
    const used = new Set();
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
        const plain = cleanText(arr(block.children).map((child) => child.text || "").join(""));
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
        if (["h2", "h3", "h4"].includes(style)) {
          const id = headingSlug(plain, used);
          headings.push({ id, text: plain, level: style });
          html.push(`<${style} id="${attr(id)}">${content}</${style}>`);
        } else if (style === "blockquote") html.push(`<blockquote>${content}</blockquote>`);
        else html.push(`<p>${content}</p>`);
        return;
      }
      flush();
      if (block?._type === "image") {
        const url = block.url || block.asset?.url;
        const dimensions = block.asset?.metadata?.dimensions || {};
        if (url) html.push(`<figure><img src="${attr(url)}" alt="${attr(block.alt || block.caption || "")}" loading="lazy" width="${Number(dimensions.width) || 1200}" height="${Number(dimensions.height) || 675}" />${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ""}</figure>`);
      }
    });
    flush();
    return { html: html.join(""), headings };
  }

  function cardMedia(article) {
    const img = image(article);
    const size = imageSize(article);
    if (img) return `<img class="library-card-image" src="${attr(img)}" alt="${attr(article.mainImage?.alt || article.title)}" loading="lazy" width="${size.width}" height="${size.height}" />`;
    const label = category(article);
    return `<div class="library-card-image library-card-placeholder ${attr(categoryArtClass(label))}" aria-hidden="true"><span>${esc(label.slice(0, 2))}</span><small>${esc(categoryEnglish(label))}</small></div>`;
  }

  function card(article) {
    const published = formatDate(dateValue(article));
    return `<a class="library-card" href="${attr(articleUrl(article))}" data-link aria-label="${attr(`${article.title}を読む`)}">${cardMedia(article)}<div class="library-card-content"><div class="library-card-meta"><span class="library-category">${esc(category(article))}</span>${published ? `<time datetime="${attr(dateValue(article))}">${esc(published)}</time>` : ""}</div><h3>${esc(article.title)}</h3><p>${esc(summary(article))}</p><span class="library-read-more">読む</span></div></a>`;
  }

  function categoryIcon(name) {
    if (/腰/.test(name)) return "腰";
    if (/肩|首/.test(name)) return "肩";
    if (/頭/.test(name)) return "頭";
    if (/自律|睡眠/.test(name)) return "自";
    if (/耳/.test(name)) return "耳";
    if (/目/.test(name)) return "目";
    if (/美容/.test(name)) return "美";
    if (/鍼/.test(name)) return "鍼";
    return "健";
  }

  function categoryEnglish(name) {
    if (/腰/.test(name)) return "LOW BACK";
    if (/肩|首/.test(name)) return "SHOULDER";
    if (/頭/.test(name)) return "HEADACHE";
    if (/自律|睡眠/.test(name)) return "AUTONOMIC";
    if (/耳/.test(name)) return "EAR";
    if (/目/.test(name)) return "EYE";
    if (/膝/.test(name)) return "KNEE";
    if (/美容/.test(name)) return "BEAUTY";
    if (/鍼/.test(name)) return "ACUPUNCTURE";
    return "BODY";
  }

  function categoryArtClass(name) {
    if (/腰/.test(name)) return "art-low-back";
    if (/肩|首/.test(name)) return "art-shoulder";
    if (/頭|自律|睡眠|耳|目/.test(name)) return "art-nerve";
    if (/膝/.test(name)) return "art-knee";
    if (/鍼|美容/.test(name)) return "art-ripple";
    return "art-body";
  }

  function categoryCards(items, activeSlug = "") {
    if (!items.length) return `<p class="empty-state">表示できるカテゴリーはまだありません。</p>`;
    return `<div class="library-category-grid">${items.map((item) => `<a class="library-category-card${activeSlug === item.slug ? " active" : ""}" href="${attr(categoryUrl(item.name))}" data-link><span class="category-card-icon" aria-hidden="true">${esc(categoryIcon(item.name))}</span><span><em>${esc(categoryEnglish(item.name))}</em><strong>${esc(item.name)}</strong><small>${item.count}件の記事</small></span></a>`).join("")}</div>`;
  }

  function categoryPills(items, activeSlug = "") {
    return `<div class="category-pills">${items.map((item) => `<a class="category-pill${activeSlug === item.slug ? " active" : ""}" href="${attr(categoryUrl(item.name))}" data-link>${esc(item.name)}<span>${item.count}</span></a>`).join("")}</div>`;
  }

  function recommendedArticles(articles, excluded = []) {
    const excludedSlugs = new Set(excluded.map((article) => article.slug));
    const picked = [];
    const seenCategories = new Set();
    articles.forEach((article) => {
      if (picked.length >= RECOMMENDED_ARTICLE_LIMIT || excludedSlugs.has(article.slug)) return;
      const primary = category(article);
      if (seenCategories.has(primary) && picked.length < 2) return;
      picked.push(article);
      seenCategories.add(primary);
    });
    articles.forEach((article) => {
      if (picked.length >= RECOMMENDED_ARTICLE_LIMIT) return;
      if (!excludedSlugs.has(article.slug) && !picked.some((item) => item.slug === article.slug)) picked.push(article);
    });
    return picked;
  }

  function recommendedCategoryCards(items) {
    const picked = RECOMMENDED_CATEGORY_NAMES.map((name) => items.find((item) => item.name === name)).filter(Boolean);
    if (!picked.length) return "";
    return `<div class="recommended-category-grid">${picked.map((item) => `<a class="recommended-category-card" href="${attr(categoryUrl(item.name))}" data-link><span aria-hidden="true">${esc(categoryIcon(item.name))}</span><em>${esc(categoryEnglish(item.name))}</em><strong>${esc(item.name)}</strong><small>${item.count}件の記事</small></a>`).join("")}</div>`;
  }

  function mediaClinicCta() {
    return `<section class="library-clinic-cta" aria-labelledby="libraryClinicCtaTitle"><div><p class="eyebrow">Hariplus Acupuncture Clinic</p><h2 id="libraryClinicCtaTitle">体の状態を整理したい方へ</h2><p>記事を読んで気になる症状がある方は、ハリプラス鍼灸院の予約導線もご利用いただけます。</p></div><div class="library-clinic-actions"><a class="primary-button" href="${attr(HARIPLUS_LINE_URL)}">LINE予約はこちら</a><a class="secondary-button" href="${attr(HARIPLUS_HOME_URL)}">ホームページを見る</a></div></section>`;
  }

  function bodyCheckBanner() {
    return `<section class="library-check-banner" aria-labelledby="libraryCheckTitle"><div><p class="section-kicker">Self Check</p><h2 id="libraryCheckTitle">記事を読む前に、体の状態を整理する。</h2><p>気になる部位や動作から、負担が出やすいポイントを短時間で確認できます。</p></div><a class="primary-button" href="/body-check" data-link>体の不調チェックへ</a></section>`;
  }

  function pageShell(title, lead, body, activePath = "/health-library") {
    return `<section class="page-hero compact journal-page-hero"><div class="bio-field" aria-hidden="true"><span class="cell c1"></span><span class="fiber f1"></span><span class="nerve n2"></span></div><p class="eyebrow">BODY KNOWLEDGE ARCHIVE</p><h1>${esc(title)}</h1><p>${esc(lead)}</p><div class="journal-hero-actions"><a href="/body-check" data-link>原因筋を探す</a><a href="/health-library" data-link${activePath === "/health-library" ? ' aria-current="page"' : ""}>記事を探索する</a></div></section>${body}`;
  }

  function renderListPage() {
    qs("#app").innerHTML = pageShell("HEALTH JOURNAL", "身体を、もう少し深く知る。", `<section class="panel"><p class="empty-insight">記事データを読み込みます。</p></section>`);
    loadData().then(() => renderLibraryList()).catch(() => {
      qs("#app").innerHTML = pageShell("HEALTH JOURNAL", "記事データを読み込めませんでした。", `<section class="panel"><p class="empty-state">記事データを読み込めませんでした。</p></section>`);
    });
  }

  function renderLibraryList() {
    const params = new URLSearchParams(location.search);
    const initialSearch = params.get("search") || "";
    const tagSlug = params.get("tag") || "";
    const tagName = tagSlug ? resolveTagName(tagSlug) : "";
    const newArticles = state.articles.slice(0, NEW_LIMIT);
    const recommended = recommendedArticles(state.articles, newArticles);
    updateListSeo({ tag: tagName, search: initialSearch });
    addJsonLd(collectionSchema(state.articles, `${SITE_URL}/health-library`, "HEALTH JOURNAL", "身体を、もう少し深く知る。症状・セルフケア・鍼灸・健康情報を医学的根拠をもとに分かりやすく解説しています。"));
    addJsonLd(breadcrumbSchema([{ name: "トップ", url: `${SITE_URL}/` }, { name: "健康情報ライブラリ", url: `${SITE_URL}/health-library` }]));
    qs("#app").innerHTML = pageShell("HEALTH JOURNAL", "身体を、もう少し深く知る。", `<section class="library-hero panel"><div class="library-signs" aria-hidden="true"><span>神経</span><span>血流</span><span>筋肉</span><span>関節</span><span>睡眠</span><span>痛み</span><span>鍼灸</span><span>自律神経</span></div><div class="library-hero-copy"><p class="eyebrow">HEALTH JOURNAL</p><h2>身体を、もう少し深く知る。</h2><p>症状・セルフケア・鍼灸・健康情報を医学的根拠をもとに分かりやすく解説しています。</p></div><div class="library-hero-search" role="search"><label class="field" for="librarySearch"><span>SEARCH THE BODY</span><input id="librarySearch" type="search" placeholder="肩こり、腰痛、自律神経など" autocomplete="off" value="${attr(initialSearch)}" aria-describedby="librarySearchHelp" /></label><p id="librarySearchHelp">タイトル、概要、カテゴリ、タグからすぐに探せます。</p><div class="library-count" id="libraryCount" aria-live="polite">${state.articles.length}件の記事</div></div></section><section class="library-section" aria-labelledby="categoryCardsTitle"><div class="section-heading-row"><div><p class="section-kicker">EXPLORATION TAGS</p><h2 id="categoryCardsTitle">カテゴリから探す</h2></div></div>${categoryCards(state.categories)}</section><section class="library-section" aria-labelledby="newArticlesTitle"><div class="section-heading-row"><div><p class="section-kicker">LATEST SIGNALS</p><h2 id="newArticlesTitle">新着記事</h2></div></div><div class="library-list recent-list">${newArticles.map(card).join("")}</div></section>${recommended.length ? `<section class="library-section" aria-labelledby="recommendedArticlesTitle"><div class="section-heading-row"><div><p class="section-kicker">RECOMMENDED PATH</p><h2 id="recommendedArticlesTitle">おすすめ</h2></div></div><div class="library-list recommended-list">${recommended.map(card).join("")}</div></section>` : ""}<section class="library-section recommended-category-section" aria-labelledby="recommendedCategoryTitle"><div class="section-heading-row"><div><p class="section-kicker">BODY ROUTES</p><h2 id="recommendedCategoryTitle">症状別おすすめ</h2></div></div>${recommendedCategoryCards(state.categories)}</section>${bodyCheckBanner()}<section class="library-section" aria-labelledby="allArticlesTitle"><div class="section-heading-row"><div><p class="section-kicker">ARCHIVE</p><h2 id="allArticlesTitle">${tagName ? `${esc(tagName)}の記事` : "すべての記事"}</h2></div><span class="library-result-count" id="libraryResultCount" aria-live="polite"></span></div><div class="library-list" id="libraryList"></div><div class="library-more-wrap" id="libraryMoreWrap"></div></section>${mediaClinicCta()}<section class="caution-card journal-note"><p class="eyebrow">MEDICAL NOTE</p><h2>読む前に</h2><p>このサイトは医療診断を行うものではありません。表示結果はセルフチェックの目安です。強い痛み、しびれ、麻痺、発熱などがある場合は医療機関へ相談してください。</p></section>`);
    bindList({ tagSlug, tagName });
  }

  function resolveTagName(slug) {
    const found = state.articles.flatMap(tags).find((tag) => stableSlug(tag) === slug || tag === slug);
    return found || slug;
  }

  function bindList({ tagSlug = "", tagName = "" } = {}) {
    const list = qs("#libraryList");
    const count = qs("#libraryCount");
    const resultCount = qs("#libraryResultCount");
    const search = qs("#librarySearch");
    const moreWrap = qs("#libraryMoreWrap");
    let visible = INITIAL_LIMIT;
    const render = () => {
      const keyword = normalizeSearchText(search?.value || "");
      const words = keyword.split(/\s+/).filter(Boolean);
      const filtered = state.articles.map((article) => {
        const cats = categories(article);
        const tagList = tags(article);
        const text = normalizeSearchText(`${article.title} ${cats.join(" ")} ${tagList.join(" ")} ${summary(article)} ${article.excerpt || ""}`);
        const tagMatch = !tagSlug || tagList.some((tag) => stableSlug(tag) === tagSlug || tag === tagName);
        const allWords = words.every((word) => text.includes(word));
        const score = words.reduce((total, word) => total + (normalizeSearchText(article.title).includes(word) ? 3 : 0) + (text.includes(word) ? 1 : 0), 0);
        return { article, match: tagMatch && (!words.length || allWords), score };
      }).filter((item) => item.match).sort((a, b) => b.score - a.score || (new Date(dateValue(b.article)).getTime() || 0) - (new Date(dateValue(a.article)).getTime() || 0)).map((item) => item.article);
      const shown = filtered.slice(0, visible);
      const label = filtered.length ? `${filtered.length}件の記事` : "該当する記事は見つかりませんでした";
      if (count) count.textContent = label;
      if (resultCount) resultCount.textContent = label;
      list.innerHTML = shown.length ? shown.map(card).join("") : `<p class="empty-state">該当する記事がありません。</p>`;
      moreWrap.innerHTML = filtered.length > visible ? `<button class="secondary-button" type="button" id="loadMoreArticles">もっと見る</button>` : "";
      qs("#loadMoreArticles")?.addEventListener("click", () => { visible += INITIAL_LIMIT; render(); });
      if (search && search.value.trim()) {
        const url = new URL(location.href);
        url.searchParams.set("search", search.value.trim());
        history.replaceState({}, "", `${url.pathname}${url.search}`);
      } else if (!tagSlug && location.search.includes("search=")) history.replaceState({}, "", "/health-library");
    };
    search?.addEventListener("input", () => { visible = INITIAL_LIMIT; render(); });
    render();
  }

  async function renderCategoryBySlug(slug) {
    await loadData();
    const categoryItem = state.categories.find((item) => item.slug === slug || item.name === slug);
    if (!categoryItem) {
      renderNotFound("カテゴリーが見つかりません", "指定されたカテゴリーの記事はまだありません。");
      return;
    }
    const articles = state.articles.filter((article) => categories(article).includes(categoryItem.name));
    updateListSeo({ category: categoryItem });
    addJsonLd(collectionSchema(articles, `${SITE_URL}${categoryUrl(categoryItem.name)}`, `${categoryItem.name}の記事一覧`, categoryItem.description));
    addJsonLd(breadcrumbSchema([{ name: "トップ", url: `${SITE_URL}/` }, { name: "健康情報ライブラリ", url: `${SITE_URL}/health-library` }, { name: categoryItem.name, url: `${SITE_URL}${categoryUrl(categoryItem.name)}` }]));
    qs("#app").innerHTML = pageShell(`${categoryItem.name}の記事一覧`, categoryItem.description, `<nav class="article-breadcrumb" aria-label="パンくず"><a href="/" data-link>トップ</a><span aria-hidden="true">&gt;</span><a href="/health-library" data-link>健康情報ライブラリ</a><span aria-hidden="true">&gt;</span><span aria-current="page">${esc(categoryItem.name)}</span></nav><section class="panel library-major-categories" aria-labelledby="categoryNavTitle"><h2 id="categoryNavTitle">カテゴリー</h2>${categoryCards(state.categories, categoryItem.slug)}</section><section class="library-section"><div class="section-heading-row"><h2>${esc(categoryItem.name)}の記事</h2><span class="library-result-count">${articles.length}件の記事</span></div><div class="library-list">${articles.length ? articles.map(card).join("") : `<p class="empty-state">該当する記事は見つかりませんでした。</p>`}</div></section>`, "/health-library");
  }

  function scoreRelated(article, candidate) {
    if (!candidate || article.slug === candidate.slug) return 0;
    const sourceCats = new Set(categories(article));
    const sourceTags = new Set(tags(article));
    const candidateCats = categories(candidate);
    const candidateTags = tags(candidate);
    let score = candidateCats.filter((item) => sourceCats.has(item)).length * 8;
    score += candidateTags.filter((item) => sourceTags.has(item)).length * 4;
    const words = normalizeSearchText(article.title).split(/[、。・\s-]+/).filter((word) => word.length >= 2);
    const text = normalizeSearchText(`${candidate.title} ${summary(candidate)} ${candidateTags.join(" ")}`);
    score += words.filter((word) => text.includes(word)).length;
    return score;
  }

  function relatedList(article) {
    const preset = arr(article.relatedPosts).filter((item) => item?.slug && item.slug !== article.slug);
    const scored = (state?.articles || []).map((candidate) => ({ candidate, score: scoreRelated(article, candidate) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map((item) => item.candidate);
    const map = new Map();
    [...preset, ...scored].forEach((item) => item.slug && item.slug !== article.slug && !map.has(item.slug) && map.set(item.slug, item));
    return Array.from(map.values()).slice(0, RELATED_LIMIT);
  }

  function related(article) {
    const list = relatedList(article);
    if (!list.length) return "";
    return `<section class="article-support-section related-section"><p class="section-kicker">NEXT SIGNALS</p><h2>次に読む記事</h2><div class="library-list related-article-list">${list.map(card).join("")}</div></section>`;
  }

  function normalizedReferences(article) {
    const seen = new Set();
    return arr(article.references).map((ref) => ref.reference || ref).filter((item) => item && item.title).filter((item) => {
      const key = String(item.doi || item.pmid || item.pubMedUrl || item.url || item.journalUrl || item.title).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function evidenceRank(article) {
    const refs = normalizedReferences(article);
    const text = refs.map((item) => `${item.studyDesign || ""} ${item.evidenceLevel || ""} ${item.title || ""}`).join(" ").toLowerCase();
    let score = 0;
    if (/guideline|診療ガイドライン|clinical practice/.test(text)) score = Math.max(score, 5);
    if (/systematic|システマティック|meta|メタ/.test(text)) score = Math.max(score, 4);
    if (/rct|randomized|ランダム化/.test(text)) score = Math.max(score, 4);
    if (/cohort|observational|観察/.test(text)) score = Math.max(score, 3);
    if (!score && refs.length >= 5) score = 4;
    if (!score && refs.length >= 3) score = 3;
    if (!score && refs.length >= 1) score = 2;
    if (!score) score = 1;
    const labels = { 5: "診療ガイドライン・高品質研究を含む", 4: "システマティックレビュー・RCTなどを含む", 3: "複数の医学文献を参照", 2: "参考文献を確認済み", 1: "参考文献の確認が必要" };
    return { score, stars: "★★★★★".slice(0, score) + "☆☆☆☆☆".slice(0, 5 - score), label: labels[score] };
  }

  function medicalPaperCount(article) {
    return normalizedReferences(article).filter((item) => item.doi || item.pmid || item.pubMedUrl || item.journal || item.studyDesign).length;
  }

  function references(article) {
    const refs = normalizedReferences(article);
    if (!refs.length) return "";
    return `<section class="article-support-section reference-list" id="references"><p class="section-kicker">REFERENCES</p><h2>参考文献</h2><ol>${refs.map((item) => {
      const link = item.pubMedUrl || item.url || item.journalUrl || (item.doi ? `https://doi.org/${item.doi}` : "");
      const meta = [arr(item.authors).join(", ") || item.authors, item.journal || item.source, item.year].filter(Boolean).join(" / ");
      const doiLink = item.doi ? `https://doi.org/${item.doi}` : "";
      const pubMedLink = item.pubMedUrl || (item.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/` : "");
      const journalLink = item.journalUrl || item.url || "";
      return `<li class="reference-card"><h3>${esc(item.title || "参考文献")}</h3>${meta ? `<p class="reference-meta">${esc(meta)}</p>` : ""}${item.studyDesign || item.evidenceLevel ? `<p class="reference-design"><strong>Study Design:</strong> ${esc(item.studyDesign || "-")} <span>/</span> <strong>Evidence Level:</strong> ${esc(item.evidenceLevel || "-")}</p>` : ""}${item.supports ? `<p>${esc(item.supports)}</p>` : ""}<div class="reference-links">${item.doi ? `<a href="${attr(doiLink)}" target="_blank" rel="noopener noreferrer">DOI: ${esc(item.doi)}</a>` : ""}${pubMedLink ? `<a href="${attr(pubMedLink)}" target="_blank" rel="noopener noreferrer">PubMedを見る</a>` : ""}${journalLink && journalLink !== pubMedLink && journalLink !== doiLink ? `<a href="${attr(journalLink)}" target="_blank" rel="noopener noreferrer">公式論文を見る</a>` : ""}${!doiLink && !pubMedLink && !journalLink && link ? `<a href="${attr(link)}" target="_blank" rel="noopener noreferrer">参考文献を見る</a>` : ""}</div></li>`;
    }).join("")}</ol></section>`;
  }

  function faq(article) {
    const faqs = arr(article.faqs || article.faq);
    if (!faqs.length) return "";
    return `<section class="article-support-section faq-section"><p class="section-kicker">FAQ</p><h2>よくある質問</h2><div class="faq-list">${faqs.map((item, index) => `<details><summary aria-expanded="false" id="faq-${index}">${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join("")}</div></section>`;
  }

  function author(article) {
    const author = article.author || {};
    return `<aside class="article-support-section supervision-box author-box"><h2>監修者情報</h2><div class="author-card">${author.image?.url || author.image?.asset?.url ? `<img src="${attr(author.image.url || author.image.asset.url)}" alt="${attr(author.name || "監修者")}" loading="lazy" width="72" height="72" />` : ""}<div><p><strong>${esc(author.name || "ハリプラス鍼灸院")}</strong>${author.role ? `<br><span>${esc(author.role)}</span>` : ""}</p>${author.description ? `<p>${esc(author.description)}</p>` : ""}</div></div></aside>`;
  }

  function reservationCta() {
    return `<section class="article-support-section clinic-reservation-cta" aria-labelledby="clinicReservationCtaTitle"><div><p class="section-kicker">HARIPLUS CLINIC</p><h2 id="clinicReservationCtaTitle">身体のことを、<br />もう少し詳しく相談する。</h2><p>症状や体の状態を確認しながら、一人ひとりに合った施術をご提案します。</p></div><div class="clinic-reservation-actions"><a class="clinic-home-link" href="${attr(HARIPLUS_HOME_URL)}">ハリプラス鍼灸院へ</a><a class="clinic-line-button" href="${attr(HARIPLUS_LINE_URL)}" aria-label="LINEでハリプラス鍼灸院を予約する">LINEで予約</a></div></section>`;
  }

  function articleDiagnosisCta(article) {
    return `<section class="article-diagnosis-cta" aria-labelledby="articleDiagnosisCtaTitle"><div><p class="section-kicker">TRACE THE MUSCLE</p><h2 id="articleDiagnosisCtaTitle">この症状から原因筋を探す</h2><p>${esc(category(article))}や関連する動きから、関係している可能性がある筋肉を整理できます。</p></div><a class="primary-button" href="/body-check" data-link>原因筋チェックへ</a></section>`;
  }

  function breadcrumb(article) {
    const primaryCategory = category(article);
    return `<nav class="article-breadcrumb" aria-label="パンくず"><a href="/" data-link>トップ</a><span aria-hidden="true">&gt;</span><a href="/health-library" data-link>健康情報ライブラリ</a>${primaryCategory ? `<span aria-hidden="true">&gt;</span><a href="${attr(categoryUrl(primaryCategory))}" data-link>${esc(primaryCategory)}</a>` : ""}<span aria-hidden="true">&gt;</span><span aria-current="page">${esc(article.title)}</span></nav>`;
  }

  function articleHeader(article) {
    const img = image(article);
    const size = imageSize(article);
    const publishedAt = article.publishedAt || article.datePublished || "";
    const updatedAt = effectiveUpdatedAt(article);
    const published = formatDate(publishedAt);
    const updated = formatDate(updatedAt);
    const tagList = tags(article).slice(0, TAG_DISPLAY_LIMIT);
    const authorName = cleanText(article.author?.name);
    const authorRole = cleanText(article.author?.role);
    return `<header class="article-head ${attr(categoryArtClass(category(article)))}"><div class="article-hero-orbit" aria-hidden="true"><span></span><span></span><span></span></div>${breadcrumb(article)}<p class="eyebrow">HEALTH JOURNAL</p><a class="library-category" href="${attr(categoryUrl(category(article)))}" data-link>${esc(category(article))}</a><h2>${esc(article.title)}</h2><p>${esc(summary(article, 150))}</p><div class="article-head-meta">${published ? `<time datetime="${attr(publishedAt)}">公開日 ${esc(published)}</time>` : ""}${updated ? `<time datetime="${attr(updatedAt)}">最終更新日 ${esc(updated)}</time>` : ""}<span>${esc(readingMinutes(article))}</span>${normalizedReferences(article).length ? `<span class="evidence-badge">参考文献 ${normalizedReferences(article).length}件</span>` : ""}</div>${authorName ? `<p class="article-author-summary">監修：${esc(authorName)}${authorRole ? `（${esc(authorRole)}）` : ""}</p>` : ""}${tagList.length ? `<div class="article-tag-list">${tagList.map((tag) => `<a href="${attr(tagUrl(tag))}">${esc(tag)}</a>`).join("")}</div>` : ""}${img ? `<img class="article-main-image" src="${attr(img)}" alt="${attr(article.mainImage?.alt || article.title)}" loading="lazy" width="${size.width}" height="${size.height}" />` : ""}</header>`;
  }

  function keyTakeaway(article, headings = []) {
    const candidates = headings
      .filter((item) => item.level === "h2")
      .map((item) => item.text)
      .filter((text) => !/参考文献|監修者|よくある質問|関連記事|まとめ/.test(text))
      .slice(0, 4);
    const fallback = ["原因", "セルフチェック", "医療機関へ行く目安", "鍼灸の可能性"];
    const items = (candidates.length ? candidates : fallback).slice(0, 4);
    return `<section class="article-key-takeaway article-understanding-card"><p class="section-kicker">BODY MAP</p><h2>この記事でわかること</h2><ul>${items.map((item) => `<li>✓ ${esc(item)}</li>`).join("")}</ul></section>`;
  }

  function trustCard(article) {
    const refs = normalizedReferences(article);
    const evidence = evidenceRank(article);
    const authorName = cleanText(article.author?.name) || "ハリプラス鍼灸院";
    const reviewer = authorName;
    const published = formatDate(article.publishedAt || article.datePublished);
    const updated = formatDate(effectiveUpdatedAt(article));
    const checked = updated || published;
    return `<section class="article-support-section article-trust-card" aria-labelledby="articleTrustTitle"><p class="section-kicker">EVIDENCE</p><h2 id="articleTrustTitle">記事の信頼性</h2><dl class="article-trust-grid">
      <div><dt>執筆者</dt><dd>${esc(authorName)}</dd></div>
      <div><dt>監修者</dt><dd>${esc(reviewer)}</dd></div>
      ${published ? `<div><dt>公開日</dt><dd>${esc(published)}</dd></div>` : ""}
      ${updated ? `<div><dt>最終更新日</dt><dd>${esc(updated)}</dd></div>` : ""}
      <div><dt>参考文献数</dt><dd>${refs.length}件</dd></div>
      <div><dt>エビデンスレベル</dt><dd><span class="evidence-stars" aria-label="エビデンスレベル ${evidence.score} / 5">${esc(evidence.stars)}</span><small>${esc(evidence.label)}</small></dd></div>
      <div><dt>医学論文数</dt><dd>${medicalPaperCount(article)}件</dd></div>
      ${checked ? `<div><dt>最終確認日</dt><dd>${esc(checked)}</dd></div>` : ""}
    </dl>${refs.length ? `<p class="article-trust-reference-link"><a href="#references">参考文献を見る</a></p>` : ""}</section>`;
  }

  function editorialPolicyCard() {
    return `<section class="article-support-section editorial-policy-card"><p class="section-kicker">EDITORIAL POLICY</p><h2>記事作成方針</h2><p>PubMed、診療ガイドライン、システマティックレビュー、RCT、メタアナリシスを優先して情報収集し、医療従事者が確認して公開しています。</p><p>この記事は医療診断ではなく、健康情報として提供しています。</p><p class="ai-transparency">AIが下書きを作成し、医療従事者が確認・編集・公開しています。</p></section>`;
  }

  function medicalDisclaimerCard() {
    return `<section class="article-support-section medical-disclaimer-card" aria-label="医療情報について"><p class="section-kicker">MEDICAL NOTE</p><h2>医療情報について</h2><ul><li>✓ 医療診断ではありません</li><li>✓ 症状が続く場合は医療機関へ相談してください</li><li>✓ 強い痛み・しびれ・麻痺・発熱などは早めの受診を推奨します</li></ul></section>`;
  }

  function updateHistory(article) {
    const published = article.publishedAt || article.datePublished || "";
    const updated = effectiveUpdatedAt(article);
    const rows = [];
    if (updated && shouldShowUpdated(article)) rows.push({ date: updated, label: "記事内容・参考文献を確認" });
    if (published) rows.push({ date: published, label: "初版公開" });
    if (!rows.length) return "";
    return `<section class="article-support-section update-history-card"><p class="section-kicker">UPDATE LOG</p><h2>更新履歴</h2><ul>${rows.map((row) => `<li><time datetime="${attr(row.date)}">${esc(formatShortDate(row.date))}</time><span>${esc(row.label)}</span></li>`).join("")}</ul></section>`;
  }

  function toc(headings) {
    const items = headings.filter((item) => item.level === "h2" || item.level === "h3");
    const h2Count = items.filter((item) => item.level === "h2").length;
    if (h2Count < 2 && items.length < 3) return "";
    return `<nav class="article-toc" aria-label="記事内目次"><details ${window.matchMedia("(min-width: 769px)").matches ? "open" : ""}><summary><span>ARTICLE MAP</span>目次</summary><ol>${items.map((item) => `<li class="${item.level === "h3" ? "toc-child" : ""}"><a href="#${attr(item.id)}">${esc(item.text)}</a></li>`).join("")}</ol></details></nav>`;
  }

  function libraryBackLink() {
    return `<nav class="article-support-section article-library-back" aria-label="健康情報ライブラリへ戻る"><a class="secondary-button" href="/health-library" data-link>健康情報ライブラリへ戻る</a></nav>`;
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
    const body = portableTextWithHeadings(article.body);
    return `<article class="panel article-template sanity-article">${articleHeader(article)}${articleDiagnosisCta(article)}${keyTakeaway(article, body.headings)}${toc(body.headings)}<div class="sanity-body">${body.html}</div>${faq(article)}${related(article)}${trustCard(article)}${editorialPolicyCard()}${references(article)}${updateHistory(article)}${medicalDisclaimerCard()}${reservationCta()}${libraryBackLink()}</article>`;
  }

  function existingArticle(article) {
    const sections = [["1. 判定", `<p><span class="judgement-label large">${esc(article.verdict || "")}</span></p>`], ["2. 結論", `<p>${esc(article.conclusion || "")}</p>`], ["3. SNSでよく言われること", `<p>${esc(article.snsClaim || "")}</p>`], ["4. なぜそう言われるのか", `<p>${esc(article.whyItSpread || "")}</p>`], ["5. 現在の研究では", `<p>${esc(article.currentEvidence || "")}</p>`], ["6. 誤解されやすいポイント", `<p>${esc(article.commonMisunderstandings || "")}</p>`], ["7. 実際はどう考えればいいのか", `<p>${esc(article.practicalView || "")}</p>`], ["8. 鍼灸師としての見解", `<p>${esc(article.acupuncturistView || "")}</p>`], ["9. まとめ", `<p>${esc(article.summary || "")}</p>`]];
    return `<article class="panel article-template sanity-article">${articleHeader(article)}${articleDiagnosisCta(article)}${keyTakeaway(article)}${sections.map(([title, body]) => `<section class="article-support-section"><h2>${title}</h2>${body}</section>`).join("")}${faq(article)}${related(article)}${trustCard(article)}${editorialPolicyCard()}${references(article)}${updateHistory(article)}${medicalDisclaimerCard()}${reservationCta()}${libraryBackLink()}</article>`;
  }

  function renderNotFound(title = "記事が見つかりません", lead = "指定されたページはまだ作成されていません。") {
    document.title = `${title} | ${SITE_NAME}`;
    addMeta('meta[name="robots"]', { name: "robots" }, "noindex,follow");
    qs("#app").innerHTML = pageShell(title, lead, `<section class="panel not-found-panel"><p>${esc(lead)}</p><div class="button-row"><a class="primary-button" href="/health-library" data-link>ライブラリへ戻る</a><a class="secondary-button" href="/body-check" data-link>原因筋を探す</a></div></section>`, "/health-library");
  }

  async function renderArticle(slug) {
    qs("#app").innerHTML = pageShell("記事を読み込み中", "健康情報ライブラリの記事データを確認しています。", `<section class="panel"><p class="empty-insight">記事データを読み込みます。</p></section>`, "/health-library");
    try {
      await loadData();
      const path = location.pathname.replace(/\/$/, "");
      if (path.startsWith("/health-library/category/")) {
        await renderCategoryBySlug(decodeURIComponent(path.split("/").pop() || ""));
        return;
      }
      const categoryItem = state.categories.find((item) => item.slug === slug && !state.articles.some((article) => article.slug === slug));
      if (categoryItem) {
        await renderCategoryBySlug(slug);
        return;
      }
      const article = await loadArticle(decodeURIComponent(slug));
      if (!article?.slug) throw new Error("not-found");
      updateArticleSeo(article);
      qs("#app").innerHTML = pageShell(article.title, summary(article, 150), article.source === "sanity" ? sanityArticle(article) : existingArticle(article), "/health-library");
      enhanceDetails();
    } catch (_) {
      renderNotFound();
    }
  }

  if (typeof routes !== "undefined") routes["/health-library"] = renderListPage;
  if (typeof renderHealthLibraryArticle !== "undefined") renderHealthLibraryArticle = renderArticle;
})();
