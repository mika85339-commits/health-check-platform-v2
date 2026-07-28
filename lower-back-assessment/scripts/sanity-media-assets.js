const fs = require("fs");
const path = require("path");
const { SITE_URL } = require("./content-utils");

const CAT_ALIASES = new Map([["肩こり", "首・肩"], ["首こり", "首・肩"], ["首肩こり", "首・肩"], ["腰痛", "腰"], ["睡眠", "自律神経"], ["不眠", "自律神経"], ["耳鳴り", "耳の症状"], ["めまい", "耳の症状"], ["目の疲れ", "目の症状"], ["美容鍼", "美容"], ["鍼灸・治療", "鍼灸"], ["筋トレ・運動", "運動"], ["SNS健康情報", "健康情報"]]);
const CAT_SLUGS = new Map([["慢性痛", "chronic-pain"], ["頭痛", "headache"], ["首・肩", "neck-shoulder"], ["腰", "low-back"], ["膝", "knee"], ["自律神経", "autonomic"], ["目の症状", "eye-symptoms"], ["耳の症状", "ear-symptoms"], ["美容", "beauty"], ["鍼灸", "acupuncture"], ["運動", "exercise"], ["ストレッチ", "stretch"], ["健康情報", "health-info"]]);
const CAT_DESC = { "慢性痛": "慢性的な痛みや体の不調について、医学的な情報と鍼灸師の視点から整理した記事です。", "頭痛": "頭痛や首肩の緊張、日常生活との関係について分かりやすくまとめています。", "首・肩": "首こり、肩こり、姿勢や肩甲骨の動きに関する健康情報をまとめています。", "腰": "腰痛や股関節、骨盤、日常動作との関係を整理した記事です。", "自律神経": "自律神経に関わる不調や生活の中で気づきたい変化を整理しています。", "健康情報": "体の不調や健康情報の見方を幅広く整理した記事です。" };

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
function articleUrl(article) { return `${SITE_URL}/health-library/${article.slug}`; }
function categoryUrl(name) { return `${SITE_URL}/health-library/category/${slugOf(name)}`; }
function description(article) { return article.seo?.description || article.excerpt || article.summary || `${article.title}の記事です。`; }
function latestDate(article) {
  const p = new Date(article.publishedAt || "");
  const u = new Date(article.updatedAt || "");
  if (!Number.isNaN(u.getTime()) && !Number.isNaN(p.getTime()) && u > p && u.toDateString() !== p.toDateString()) return article.updatedAt;
  return article.publishedAt || article.updatedAt || "";
}
function jsonLd(data) { return `<script type="application/ld+json">${JSON.stringify(data)}</script>`; }
function breadcrumbs(items) { return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })) }; }
function itemList(articles) { return { "@type": "ItemList", itemListElement: articles.map((article, index) => ({ "@type": "ListItem", position: index + 1, url: articleUrl(article), name: article.title })) }; }
function htmlShell({ title, desc, url, route, schemas }) {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} | Health Check Lab</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(title)} | Health Check Lab" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${esc(url)}" />
    ${schemas.map(jsonLd).join("\n    ")}
    <script>sessionStorage.setItem("health-check-lab-route", "${route}"); location.replace("/");</script>
  </head>
  <body><a href="${esc(route)}">${esc(title)}を開く</a></body>
</html>
`;
}
function buildCategories(articles) {
  const map = new Map();
  articles.forEach((article) => categories(article).forEach((name) => { if (!map.has(name)) map.set(name, { name, slug: slugOf(name), articles: [] }); map.get(name).articles.push(article); }));
  return Array.from(map.values()).sort((a, b) => b.articles.length - a.articles.length || a.name.localeCompare(b.name, "ja"));
}
function readSitemap(dist) {
  const file = path.join(dist, "sitemap.xml");
  if (!fs.existsSync(file)) return [];
  return Array.from(fs.readFileSync(file, "utf8").matchAll(/<loc>(.*?)<\/loc>/g)).map((m) => ({ loc: m[1] }));
}
function writeSitemap(dist, entries) {
  const seen = new Set();
  const unique = entries.filter((entry) => entry?.loc && !seen.has(entry.loc) && seen.add(entry.loc));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.map((entry) => `  <url><loc>${esc(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${esc(String(entry.lastmod).slice(0, 10))}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), xml, "utf8");
}
function writeRobots(dist) {
  fs.writeFileSync(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /*?search=\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf8");
}
function generateSanityMediaAssets({ dist, articles }) {
  const published = Array.isArray(articles) ? articles : [];
  const cats = buildCategories(published);
  const libraryUrl = `${SITE_URL}/health-library`;
  fs.mkdirSync(path.join(dist, "health-library"), { recursive: true });
  fs.writeFileSync(path.join(dist, "health-library", "index.html"), htmlShell({
    title: "健康情報ライブラリ｜痛み・体の不調を分かりやすく解説",
    desc: "慢性痛、肩こり、腰痛、自律神経など、体の不調に関する健康情報を、医学的な情報と鍼灸師の視点から分かりやすく解説します。",
    url: libraryUrl,
    route: "/health-library",
    schemas: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "健康情報ライブラリ", description: "体の不調に関する健康情報をまとめたライブラリです。", url: libraryUrl, mainEntity: itemList(published.slice(0, 12)) }, breadcrumbs([{ name: "トップ", url: SITE_URL }, { name: "健康情報ライブラリ", url: libraryUrl }])]
  }), "utf8");
  cats.forEach((cat) => {
    const url = categoryUrl(cat.name);
    const dir = path.join(dist, "health-library", "category", cat.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), htmlShell({
      title: `${cat.name}の記事一覧`,
      desc: CAT_DESC[cat.name] || `${cat.name}に関する健康情報をまとめています。`,
      url,
      route: `/health-library/category/${cat.slug}`,
      schemas: [{ "@context": "https://schema.org", "@type": "CollectionPage", name: `${cat.name}の記事一覧`, description: CAT_DESC[cat.name] || `${cat.name}に関する健康情報をまとめています。`, url, mainEntity: itemList(cat.articles) }, breadcrumbs([{ name: "トップ", url: SITE_URL }, { name: "健康情報ライブラリ", url: libraryUrl }, { name: cat.name, url }])]
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
