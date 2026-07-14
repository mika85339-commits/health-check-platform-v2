const fs = require("fs");
const path = require("path");
const {
  ARTICLE_DIR,
  ARTICLE_INDEX_PATH,
  CONTENT_DIR,
  SITE_URL,
  articleDescription,
  buildCategories,
  buildRelated,
  validateContent,
  writeJson
} = require("./content-utils");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

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

function articleHtml(article) {
  const url = `${SITE_URL}/health-library/${article.slug}`;
  const description = articleDescription(article);
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description,
    datePublished: article.publishedAt || article.createdAt,
    dateModified: article.updatedAt,
    author: { "@type": "Organization", name: "ハリプラス鍼灸院" },
    publisher: { "@type": "Organization", name: "Health Check Lab" },
    mainEntityOfPage: url
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "健康情報ライブラリ", item: `${SITE_URL}/health-library` },
      { "@type": "ListItem", position: 3, name: article.title, item: url }
    ]
  };

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(article.title)} | Health Check Lab</title>
    <meta name="description" content="${htmlEscape(description)}" />
    <link rel="canonical" href="${htmlEscape(url)}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${htmlEscape(article.title)} | Health Check Lab" />
    <meta property="og:description" content="${htmlEscape(description)}" />
    <meta property="og:url" content="${htmlEscape(url)}" />
    <script type="application/ld+json">${JSON.stringify(articleLd)}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
    <script>
      sessionStorage.setItem("health-check-lab-route", "/health-library/${article.slug}");
      location.replace("/");
    </script>
  </head>
  <body><a href="/">Health Check Labを開く</a></body>
</html>
`;
}

function generateSiteAssets() {
  const { errors, warnings, publishedArticles } = validateContent(root);
  if (errors.length) {
    errors.forEach((error) => console.error(`- ${error}`));
    throw new Error("Content validation failed.");
  }
  warnings.forEach((warning) => console.warn(`Warning: ${warning}`));

  const distContent = path.join(dist, CONTENT_DIR);
  const distArticles = path.join(dist, ARTICLE_DIR);
  fs.mkdirSync(distArticles, { recursive: true });

  writeJson(dist, ARTICLE_INDEX_PATH, publishedArticles.map((article) => article.slug));
  writeJson(dist, `${CONTENT_DIR}/categories.json`, buildCategories(publishedArticles));
  writeJson(dist, `${CONTENT_DIR}/related.json`, buildRelated(publishedArticles));

  publishedArticles.forEach((article) => {
    writeJson(dist, `${ARTICLE_DIR}/${article.slug}.json`, article);
    const articleDir = path.join(dist, "health-library", article.slug);
    fs.mkdirSync(articleDir, { recursive: true });
    fs.writeFileSync(path.join(articleDir, "index.html"), articleHtml(article), "utf8");
  });

  const staticPaths = ["", "body-check", "health-check", "health-library", "community", "about", "faq"];
  const articlePaths = publishedArticles.map((article) => `health-library/${article.slug}`);
  const urls = [...staticPaths, ...articlePaths].map((item) => `${SITE_URL}/${item}`.replace(/\/$/, ""));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${xmlEscape(url || SITE_URL)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap, "utf8");
  fs.writeFileSync(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf8");

  return { publishedCount: publishedArticles.length, distContent };
}

if (require.main === module) {
  const result = generateSiteAssets();
  console.log(`Generated site assets. Published articles: ${result.publishedCount}`);
}

module.exports = { generateSiteAssets };
