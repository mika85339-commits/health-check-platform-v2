const fs = require("fs");
const path = require("path");
const { SITE_URL } = require("./content-utils");

const CAT_ALIASES = new Map([["肩こり", "首・肩"], ["首こり", "首・肩"], ["首肩こり", "首・肩"], ["腰痛", "腰"], ["睡眠", "自律神経"], ["不眠", "自律神経"], ["耳鳴り", "耳の症状"], ["めまい", "耳の症状"], ["目の疲れ", "目の症状"], ["美容鍼", "美容"], ["鍼灸・治療", "鍼灸"], ["筋トレ・運動", "運動"], ["SNS健康情報", "健康情報"]]);
const CAT_SLUGS = new Map([["慢性痛", "chronic-pain"], ["頭痛", "headache"], ["首・肩", "neck-shoulder"], ["腰", "low-back"], ["膝", "knee"], ["自律神経", "autonomic"], ["目の症状", "eye-symptoms"], ["耳の症状", "ear-symptoms"], ["美容", "beauty"], ["鍼灸", "acupuncture"], ["運動", "exercise"], ["ストレッチ", "stretch"], ["健康情報", "health-info"]]);
const CAT_DESC = { "慢性痛": "慢性的な痛みや体の不調について、医学的な情報と鍼灸師の視点から整理した記事です。", "頭痛": "頭痛や首肩の緊張、日常生活との関係について分かりやすくまとめています。", "首・肩": "首こり、肩こり、姿勢や肩甲骨の動きに関する健康情報をまとめています。", "腰": "腰痛や股関節、骨盤、日常動作との関係を整理した記事です。", "膝": "膝の痛みや動作時の不安について、確認したいポイントをまとめています。", "自律神経": "自律神経に関わる不調や生活の中で気づきたい変化を整理しています。", "目の症状": "目の疲れや首肩との関係など、体の状態と合わせて考えたい情報です。", "耳の症状": "耳鳴りやめまいなど、耳まわりの不調について確認したい情報です。", "美容": "美容鍼や肌、表情筋、血流に関する健康情報をまとめています。", "鍼灸": "鍼灸について研究で確認されていることや、体の見方を整理しています。", "運動": "運動や筋力、体の使い方に関する記事をまとめています。", "ストレッチ": "ストレッチや柔軟性、動かしやすい体づくりに関する情報です。", "健康情報": "体の不調や健康情報の見方を幅広く整理した記事です。" };
const INITIAL_LIMIT = 12;
const HARIPLUS_HOME_URL = "https://hariplus-nagoya.com/";
const HARIPLUS_LINE_URL = "https://lin.ee/zjL9tPK";

function esc(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function catName(value) { const text = clean(value) || "健康情報"; return CAT_ALIASES.get(text) || text; }
function slugOf(value) {
  const name = catName(value);
  if (CAT_SLUGS.has(name)) return CAT_SLUGS.get(name);
  const ascii = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return `topic-${Math.abs(hash).toString(36)}`;
}
function categories(article) {
  const values = Array.isArray(article.categories) ? article.categories.map((item) => item.title || item.slug).filter(Boolean) : [];
  return Array.from(new Set((values.length ? values : [article.category || "健康情報"]).map(catName)));
}
function primaryCategory(article) { return categories(article)[0] || "健康情報"; }
function categoryIcon(name) {
  if (/腰/.test(name)) return "腰";
  if (/肩|首/.test(name)) return "肩";
  if (/慢性|痛/.test(name)) return "痛";
  if (/頭/.test(name)) return "頭";
  if (/自律|睡眠/.test(name)) return "整";
  if (/耳/.test(name)) return "耳";
  if (/目/.test(name)) return "目";
  if (/膝/.test(name)) return "膝";
  if (/美容/.test(name)) return "美";
  if (/鍼/.test(name)) return "鍼";
  return "知";
}
function encodedArticlePath(article) { return article.slug.split("/").map(encodeURIComponent).join("/"); }
function articleUrl(article) { return `${SITE_URL}/health-library/${encodedArticlePath(article)}/`; }
function categoryUrl(name) { return `${SITE_URL}/health-library/category/${slugOf(name)}`; }
function truncate(value, limit = 110) {
  const text = clean(value);
  return text.length > limit ? `${text.slice(0, limit).trim()}…` : text;
}
function cardDescription(article) { return truncate(article.summary || article.excerpt || article.seo?.description || `${article.title}の記事です。`); }
function dateValue(article) { return article.publishedAt || article.updatedAt || article._updatedAt || article.datePublished || ""; }
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });
}
function image(article) { return article.mainImage?.url || article.mainImage?.asset?.url || article.seo?.image?.url || article.seo?.image?.asset?.url || ""; }
function imageSize(article) {
  const dimensions = article.mainImage?.dimensions || article.mainImage?.asset?.metadata?.dimensions || article.seo?.image?.dimensions || article.seo?.image?.asset?.metadata?.dimensions;
  return { width: Number(dimensions?.width) || 1200, height: Number(dimensions?.height) || 675 };
}
function categoryArtClass(name) {
  if (/腰/.test(name)) return "art-low-back";
  if (/肩|首/.test(name)) return "art-shoulder";
  if (/頭|自律|睡眠|耳|目/.test(name)) return "art-nerve";
  if (/膝/.test(name)) return "art-knee";
  if (/鍼|美容/.test(name)) return "art-ripple";
  return "art-body";
}
function cardMedia(article) {
  const img = image(article);
  const size = imageSize(article);
  if (img) return `<img class="library-card-image" src="${esc(img)}" alt="${esc(article.mainImage?.alt || article.title)}" loading="lazy" width="${size.width}" height="${size.height}" />`;
  return `<div class="library-card-image library-card-placeholder ${esc(categoryArtClass(primaryCategory(article)))}" aria-hidden="true"><span>ハリプラス鍼灸院</span><small>健康コラム</small></div>`;
}
function articleCard(article) {
  const published = formatDate(dateValue(article));
  return `<a class="library-card" href="/health-library/${encodedArticlePath(article)}/" aria-label="${esc(`${article.title}を読む`)}">${cardMedia(article)}<div class="library-card-content"><div class="library-card-meta"><span class="library-category">${esc(primaryCategory(article))}</span>${published ? `<time datetime="${esc(dateValue(article))}">${esc(published)}</time>` : ""}</div><h3>${esc(article.title)}</h3><p>${esc(cardDescription(article))}</p><span class="library-read-more">続きを読む →</span></div></a>`;
}
function featuredArticle(article) {
  if (!article) return "";
  const published = formatDate(dateValue(article));
  return `<section class="library-section library-featured-section" aria-labelledby="featuredArticleTitle"><div class="section-heading-row"><div><h2 id="featuredArticleTitle">最新記事</h2></div></div><a class="library-featured-card" href="/health-library/${encodedArticlePath(article)}/" aria-label="${esc(`${article.title}を読む`)}">${cardMedia(article)}<div class="library-featured-content"><div class="library-card-meta"><span class="library-category">${esc(primaryCategory(article))}</span>${published ? `<time datetime="${esc(dateValue(article))}">${esc(published)}</time>` : ""}</div><h3>${esc(article.title)}</h3><p>${esc(cardDescription(article))}</p><span class="library-read-more">記事を読む →</span></div></a></section>`;
}
function categoryCards(categoryItems, activeSlug = "") {
  if (!categoryItems.length) return "";
  return `<div class="library-category-grid">${categoryItems.map((item) => {
    const categoryDescription = CAT_DESC[item.name] || `${item.name}に関する健康情報をまとめています。`;
    return `<a class="library-category-card${activeSlug === item.slug ? " active" : ""}" href="/health-library/category/${esc(item.slug)}" data-link><span class="library-category-card-icon" aria-hidden="true">${esc(categoryIcon(item.name))}</span><span class="library-category-card-copy"><span class="library-category-card-meta"><strong>${esc(item.name)}</strong><small>${item.articles.length}件</small></span><span class="library-category-card-description">${esc(categoryDescription)}</span></span><span class="library-category-card-arrow" aria-hidden="true">→</span></a>`;
  }).join("")}</div>`;
}
function hero(title, desc, marker) {
  return `<section class="page-hero compact journal-page-hero journal-list-hero"${marker ? ` data-prerendered="${esc(marker)}"` : ""}><div class="bio-field" aria-hidden="true"><span class="cell c1"></span><span class="fiber f1"></span><span class="nerve n2"></span></div><h1>${esc(title)}</h1><p>${esc(desc)}</p></section>`;
}
function bodyCheckBanner() {
  return `<section class="library-check-banner library-check-banner-top" aria-labelledby="libraryCheckTitle"><div><h2 id="libraryCheckTitle">人体図から体をチェック</h2><p>気になる場所を選んで、動きに関係する可能性のある筋肉を確認できます。</p></div><a class="primary-button" href="/#body-selector" data-link>体をチェックする</a></section>`;
}
function clinicCta() {
  return `<section class="library-clinic-cta" aria-labelledby="libraryClinicCtaTitle"><div><p class="eyebrow">Hariplus Acupuncture Clinic</p><h2 id="libraryClinicCtaTitle">体の状態を整理したい方へ</h2><p>記事を読んで気になる症状がある方は、ハリプラス鍼灸院の予約導線もご利用いただけます。</p></div><div class="library-clinic-actions"><a class="primary-button" href="${HARIPLUS_LINE_URL}">LINE予約はこちら</a><a class="secondary-button" href="${HARIPLUS_HOME_URL}">ホームページを見る</a></div></section>`;
}
function latestDate(article) {
  const p = new Date(article.publishedAt || "");
  const u = new Date(article.updatedAt || "");
  if (!Number.isNaN(u.getTime()) && !Number.isNaN(p.getTime()) && u > p && u.toDateString() !== p.toDateString()) return article.updatedAt;
  return article.publishedAt || article.updatedAt || "";
}
function jsonLd(data) { return `<script type="application/ld+json">${JSON.stringify(data)}</script>`; }
function breadcrumbs(items) { return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })) }; }
function itemList(articles) { return { "@type": "ItemList", itemListElement: articles.map((article, index) => ({ "@type": "ListItem", position: index + 1, url: articleUrl(article), name: article.title })) }; }
function htmlShell({ title, desc, displayTitle = title, displayDesc = desc, url, schemas, baseHtml, articles = [], categories: categoryItems = [], layout = "root", activeCategory = null }) {
  const sortedArticles = [...articles].sort((a, b) => (new Date(dateValue(b)).getTime() || 0) - (new Date(dateValue(a)).getTime() || 0));
  let prerender;
  if (layout === "category" && activeCategory) {
    prerender = `${hero(displayTitle, displayDesc, "health-library-category")}<nav class="article-breadcrumb" aria-label="パンくず"><a href="/" data-link>トップ</a><span aria-hidden="true">&gt;</span><a href="/health-library" data-link>健康情報ライブラリ</a><span aria-hidden="true">&gt;</span><span aria-current="page">${esc(activeCategory.name)}</span></nav><section class="panel library-major-categories" aria-labelledby="categoryNavTitle"><h2 id="categoryNavTitle">カテゴリー</h2>${categoryCards(categoryItems, activeCategory.slug)}</section><section class="library-section"><div class="section-heading-row"><h2>${esc(activeCategory.name)}の記事</h2><span class="library-result-count">${sortedArticles.length}件の記事</span></div><div class="library-list">${sortedArticles.map(articleCard).join("")}</div></section>`;
  } else {
    const shown = sortedArticles.slice(0, INITIAL_LIMIT);
    const moreButton = sortedArticles.length > INITIAL_LIMIT ? `<button class="secondary-button" type="button" id="loadMoreArticles">さらに記事を表示</button>` : "";
    prerender = `${hero(displayTitle, displayDesc, "health-library-list")}${bodyCheckBanner()}${featuredArticle(sortedArticles[0])}<section class="library-section library-category-filter-section" aria-labelledby="categoryCardsTitle"><div class="section-heading-row"><div><h2 id="categoryCardsTitle">カテゴリー</h2><p>悩みやテーマから記事を選べます。</p></div></div>${categoryCards(categoryItems)}</section><section class="library-section" aria-labelledby="allArticlesTitle"><div class="section-heading-row"><div><h2 id="allArticlesTitle">すべての記事</h2></div><span class="library-result-count" id="libraryResultCount" aria-live="polite">${sortedArticles.length}件の記事</span></div><div class="library-list" id="libraryList">${shown.map(articleCard).join("")}</div><div class="library-more-wrap" id="libraryMoreWrap">${moreButton}</div></section>${clinicCta()}`;
  }
  return baseHtml
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)} | Health Check Lab</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?\/>/i, `<meta name="description" content="${esc(desc)}" />`)
    .replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${esc(url)}" />`)
    .replace(/<meta\s+property="og:type"[^>]*>/i, '<meta property="og:type" content="website" />')
    .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${esc(title)} | Health Check Lab" />`)
    .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${esc(desc)}" />`)
    .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${esc(url)}" />`)
    .replace("</head>", `${schemas.map(jsonLd).join("\n")}\n</head>`)
    .replace(/<main id="app" tabindex="-1">[\s\S]*?<\/main>/i, `<main id="app" tabindex="-1">${prerender}</main>`);
}
function buildCategories(articles) {
  const map = new Map();
  articles.forEach((article) => categories(article).forEach((name) => { if (!map.has(name)) map.set(name, { name, slug: slugOf(name), articles: [] }); map.get(name).articles.push(article); }));
  return Array.from(map.values()).sort((a, b) => b.articles.length - a.articles.length || a.name.localeCompare(b.name, "ja"));
}
function readSitemap(dist) {
  const file = path.join(dist, "sitemap.xml");
  if (!fs.existsSync(file)) return [];
  return Array.from(fs.readFileSync(file, "utf8").matchAll(/<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?\s*<\/url>/g))
    .map((match) => ({ loc: match[1], lastmod: match[2] || "" }));
}
function writeSitemap(dist, entries) {
  const seen = new Set();
  const unique = entries.filter((entry) => entry?.loc && !seen.has(entry.loc) && seen.add(entry.loc));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map((entry) => `  <url><loc>${esc(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${esc(String(entry.lastmod).slice(0, 10))}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), xml, "utf8");
}
function writeRobots(dist) {
  fs.writeFileSync(path.join(dist, "robots.txt"), `User-agent: Googlebot\nAllow: /\n\nUser-agent: Bingbot\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: *\nAllow: /\nDisallow: /*?search=\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf8");
}
function generateSanityMediaAssets({ dist, articles }) {
  const published = Array.isArray(articles) ? articles : [];
  const cats = buildCategories(published);
  const libraryUrl = `${SITE_URL}/health-library`;
  const baseHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  fs.mkdirSync(path.join(dist, "health-library"), { recursive: true });
  fs.writeFileSync(path.join(dist, "health-library", "index.html"), htmlShell({
    title: "健康情報ライブラリ｜痛み・体の不調を分かりやすく解説",
    desc: "慢性痛、肩こり、腰痛、自律神経など、体の不調に関する健康情報を、医学的な情報と鍼灸師の視点から分かりやすく解説します。",
    displayTitle: "健康コラム",
    displayDesc: "鍼灸や身体の健康について、分かりやすくお届けします。",
    url: libraryUrl,
    schemas: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "健康情報ライブラリ", description: "体の不調に関する健康情報をまとめたライブラリです。", url: libraryUrl, mainEntity: itemList(published) }, breadcrumbs([{ name: "トップ", url: SITE_URL }, { name: "健康情報ライブラリ", url: libraryUrl }])],
    baseHtml,
    articles: published,
    categories: cats
  }), "utf8");
  cats.forEach((cat) => {
    const url = categoryUrl(cat.name);
    const dir = path.join(dist, "health-library", "category", cat.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), htmlShell({
      title: `${cat.name}の記事一覧`,
      desc: CAT_DESC[cat.name] || `${cat.name}に関する健康情報をまとめています。`,
      url,
      schemas: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: `${cat.name}の記事一覧`, description: CAT_DESC[cat.name] || `${cat.name}に関する健康情報をまとめています。`, url, mainEntity: itemList(cat.articles) }, breadcrumbs([{ name: "トップ", url: SITE_URL }, { name: "健康情報ライブラリ", url: libraryUrl }, { name: cat.name, url }])],
      baseHtml,
      articles: cat.articles,
      categories: cats,
      layout: "category",
      activeCategory: cat
    }), "utf8");
  });
  const linkedByCategory = new Set(cats.flatMap((cat) => cat.articles.map((article) => article.slug)));
  const isolated = published.filter((article) => !linkedByCategory.has(article.slug));
  isolated.forEach((article) => console.warn(`[sanity] Isolated article warning: ${article.slug} - ${article.title}`));
  writeSitemap(dist, [...readSitemap(dist), { loc: libraryUrl }, ...cats.map((cat) => ({ loc: categoryUrl(cat.name), lastmod: cat.articles.map(latestDate).filter(Boolean).sort().pop() })), ...published.map((article) => ({ loc: articleUrl(article), lastmod: latestDate(article) }))]);
  writeRobots(dist);
  return { categoryCount: cats.length, isolatedArticleCount: isolated.length };
}
module.exports = { generateSanityMediaAssets };
