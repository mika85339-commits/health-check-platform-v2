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

function articleDescription(article) {
  return article.seo?.description || article.excerpt || article.summary || `${article.title}の記事です。`;
}

function articleImage(article) {
  return absoluteUrl(article.seo?.image?.url || article.mainImage?.url);
}

function articleAuthor(article) {
  return article.author?.name || "Health Check Lab";
}

function articleHtml(article) {
  const url = `${SITE_URL}/health-library/${article.slug}`;
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

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(title)} | Health Check Lab</title>
    <meta name="description" content="${htmlEscape(description)}" />
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
    <script>
      sessionStorage.setItem("health-check-lab-route", "/health-library/${article.slug}");
      location.replace("/");
    </script>
  </head>
  <body><a href="/">Health Check Labを開く</a></body>
</html>
`;
}

function readExistingSitemap(dist) {
  const sitemapPath = path.join(dist, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) return [];
  const xml = fs.readFileSync(sitemapPath, "utf8");
  return Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g)).map((match) => match[1]);
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
    fs.writeFileSync(path.join(articleDir, "index.html"), articleHtml(article), "utf8");
  });

  const existingUrls = readExistingSitemap(dist);
  const sanityUrls = sanityArticles.map((article) => `${SITE_URL}/health-library/${article.slug}`);
  writeSitemap(dist, [...existingUrls, ...sanityUrls]);

  return { sanityArticlePageCount: sanityArticles.length };
}

module.exports = { generateSanitySiteAssets };
