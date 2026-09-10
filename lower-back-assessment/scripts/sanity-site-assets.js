const fs = require("fs");
const path = require("path");
const { SITE_URL } = require("./content-utils");

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function absoluteUrl(value) {
  if (!value) return "";
  try {
    return new URL(value, SITE_URL).toString();
  } catch (_) {
    return "";
  }
}

function routeUrl(route) {
  const encoded = String(route || "").split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${SITE_URL}${encoded.replace(/\/+$/, "")}/`;
}

function portableTextHtml(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((block) => {
    if (!block || block._type !== "block") return "";
    const text = (Array.isArray(block.children) ? block.children : [])
      .map((child) => htmlEscape(child?.text || ""))
      .join("");
    if (!text) return "";
    if (/^h[2-4]$/.test(block.style || "")) return `<${block.style}>${text}</${block.style}>`;
    if (block.listItem) return `<p class="static-article-list-item">${text}</p>`;
    return `<p>${text}</p>`;
  }).join("\n");
}

function sharedChrome(main) {
  return `<header class="site-header"><a class="brand" href="/" data-link aria-label="Health Check Lab ホーム"><span class="brand-mark" aria-hidden="true">H</span><span><strong>Health Check Lab</strong><small>原因筋診断・健康記事探索</small></span></a><nav class="site-nav" aria-label="メインメニュー"><a href="/">ホーム</a><a href="/body-check">原因筋を探す</a><a href="/health-library">記事</a></nav></header><main id="app" tabindex="-1">${main}</main><footer class="site-footer"><strong>Health Check Lab</strong><p>原因筋診断と健康記事を通じて、体の中を探索する健康情報メディアです。</p></footer>`;
}

function articleDescription(article) {
  return article.seo?.description || article.excerpt || article.summary || `${article.title}の記事です。`;
}

function articleImage(article) {
  return absoluteUrl(article.seo?.image?.url || article.mainImage?.url);
}

function articleAuthor(article) {
  return article.author?.name || "Health Check Lab";
}

const RELATED_TOPIC_GROUPS = [
  ["肩こり", "首こり", "首肩", "肩甲骨"],
  ["眼精疲労", "目の疲れ", "頭痛", "首肩"],
  ["膝痛", "膝", "運動", "慢性痛", "腸腰筋"],
  ["自律神経", "睡眠", "生活習慣", "耳鳴り"],
  ["耳鳴り", "首肩", "自律神経", "血流"]
];

function relatedArticleText(article) {
  return [
    article.title,
    article.excerpt,
    article.summary,
    ...(article.categories || []).map((item) => item?.title),
    ...(Array.isArray(article.keywords) ? article.keywords : []),
    ...(Array.isArray(article.targetSymptoms) ? article.targetSymptoms : [])
  ].filter(Boolean).join(" ");
}

function selectRelatedArticles(article, allArticles) {
  const candidates = (allArticles || []).filter((candidate) => candidate.slug !== article.slug);
  const explicitSlugs = new Set((article.relatedPosts || []).map((item) => item?.slug).filter(Boolean));
  const categoryNames = new Set((article.categories || []).map((item) => item?.title).filter(Boolean));
  const sourceText = relatedArticleText(article);

  return candidates.map((candidate) => {
    const candidateText = relatedArticleText(candidate);
    let score = explicitSlugs.has(candidate.slug) ? 100 : 0;
    if ((candidate.categories || []).some((item) => categoryNames.has(item?.title))) score += 30;
    for (const group of RELATED_TOPIC_GROUPS) {
      if (group.some((term) => sourceText.includes(term)) && group.some((term) => candidateText.includes(term))) score += 10;
    }
    return {candidate, score};
  }).filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || String(right.candidate.publishedAt || "").localeCompare(String(left.candidate.publishedAt || "")))
    .slice(0, 4)
    .map((item) => item.candidate);
}

function articleHtml(article, allArticles) {
  const url = routeUrl(`/health-library/${article.slug}`);
  const description = articleDescription(article);
  const image = articleImage(article);
  const title = article.seo?.title || article.title;
  const ogTitle = article.seo?.ogTitle || title;
  const ogDescription = article.seo?.ogDescription || description;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt || article.publishedAt,
    author: { "@type": "Person", name: articleAuthor(article) },
    publisher: { "@type": "Organization", name: "Health Check Lab", url: SITE_URL },
    image: image || undefined,
    mainEntityOfPage: url,
    citation: (article.references || []).map((item) => item.url || item.pubMedUrl || item.journalUrl || item.title).filter(Boolean)
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "トップ", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "健康情報ライブラリ", item: `${SITE_URL}/health-library` },
      { "@type": "ListItem", position: 3, name: article.title, item: url }
    ]
  };
  const faqLd = article.faqs?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: article.faqs.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer }
        }))
      }
    : null;

  const categoryNames = (article.categories || []).map((item) => item?.title).filter(Boolean);
  const related = selectRelatedArticles(article, allArticles);
  const categoryLinks = categoryNames.map((name) => `<a href="/health-library?category=${encodeURIComponent(name)}">${htmlEscape(name)}</a>`).join(" ");
  const relatedLinks = related.map((item) => `<li><a href="/health-library/${item.slug.split("/").map(encodeURIComponent).join("/")}/">${htmlEscape(item.title)}</a></li>`).join("");

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(title)} | Health Check Lab</title>
    <meta name="description" content="${htmlEscape(description)}" />
    <meta name="robots" content="${article.seo?.noIndex ? "noindex,follow" : "index,follow"}" />
    <link rel="canonical" href="${htmlEscape(url)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${htmlEscape(ogTitle)} | Health Check Lab" />
    <meta property="og:description" content="${htmlEscape(ogDescription)}" />
    <meta property="og:url" content="${htmlEscape(url)}" />
    ${image ? `<meta property="og:image" content="${htmlEscape(image)}" />` : ""}
    <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />
    ${jsonLd(articleLd)}
    ${jsonLd(breadcrumbLd)}
    ${faqLd ? jsonLd(faqLd) : ""}
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/sanity-health-library.css" />
  </head>
  <body>${sharedChrome(`<article class="panel article-template static-article"><nav class="article-breadcrumb" aria-label="パンくず"><a href="/">トップ</a><span aria-hidden="true"> &gt; </span><a href="/health-library">健康情報ライブラリ</a></nav><p class="library-category">${categoryLinks}</p><h1>${htmlEscape(article.title)}</h1><p class="article-lead">${htmlEscape(description)}</p>${portableTextHtml(article.body)}${relatedLinks ? `<section><h2>関連記事</h2><ul>${relatedLinks}</ul></section>` : ""}</article>`)}<script src="/analytics.js" defer></script><script src="/body-check-ui.js" defer></script><script src="/app.js" defer></script><script src="/sanity-health-library.js" defer></script><script src="/sanity-health-library-toc-fix.js" defer></script><script src="/entity-links.js" defer></script></body>
</html>
`;
}

function readExistingSitemap(dist) {
  const sitemapPath = path.join(dist, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) return [];
  const xml = fs.readFileSync(sitemapPath, "utf8");
  return Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g)).map((match) => match[1]);
}

function isSanityArticleUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== SITE_URL) return false;
    if (!parsed.pathname.startsWith("/health-library/")) return false;
    if (parsed.pathname.startsWith("/health-library/category/")) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function writeSitemap(dist, urls) {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniqueUrls
    .map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap, "utf8");
}

function generateSanitySiteAssets({ dist, articles }) {
  const sanityArticles = Array.isArray(articles) ? articles : [];
  sanityArticles.forEach((article) => {
    const articleDir = path.join(dist, "health-library", article.slug);
    fs.mkdirSync(articleDir, { recursive: true });
    fs.writeFileSync(path.join(articleDir, "index.html"), articleHtml(article, sanityArticles), "utf8");
  });

  const baseUrls = readExistingSitemap(dist).filter((url) => !isSanityArticleUrl(url));
  const sanityUrls = sanityArticles.filter((article) => !article.seo?.noIndex).map((article) => routeUrl(`/health-library/${article.slug}`));
  writeSitemap(dist, [...baseUrls, ...sanityUrls]);

  return { sanityArticlePageCount: sanityArticles.length, removedStaleSitemapUrlCount: readExistingSitemap(dist).length - baseUrls.length };
}

module.exports = { generateSanitySiteAssets };
