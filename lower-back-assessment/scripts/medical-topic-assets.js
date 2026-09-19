const fs = require("fs");
const path = require("path");
const { SITE_URL } = require("./content-utils");

const TOPIC_SOURCE = "content/medical-topics/topics.json";
const TOPIC_OUTPUT = "data/medical-topics";

function readTopics(root) {
  const file = path.join(root, TOPIC_SOURCE);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase();
}

function articleText(article) {
  return normalize([
    article.title,
    article.excerpt,
    article.summary,
    ...(article.categories || []).map((item) => item.title || item.slug),
    ...(article.tags || []).map((item) => item.title || item.slug),
    ...(article.keywords || []),
    ...(article.targetSymptoms || [])
  ].filter(Boolean).join(" "));
}

function relatedArticles(topic, articles) {
  const terms = (topic.articleMatchTerms || []).map(normalize).filter(Boolean);
  return (articles || [])
    .map((article) => ({ article, score: terms.reduce((score, term) => score + (articleText(article).includes(term) ? 1 : 0), 0) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(b.article.publishedAt || "").localeCompare(String(a.article.publishedAt || "")))
    .slice(0, 12)
    .map((entry) => ({
      title: entry.article.title,
      slug: entry.article.slug,
      excerpt: entry.article.excerpt || entry.article.summary || "",
      publishedAt: entry.article.publishedAt,
      updatedAt: entry.article.updatedAt,
      categories: entry.article.categories || []
    }));
}

function isPublishable(topic) {
  return topic.status === "published" && Boolean(topic.reviewer) && Boolean(topic.reviewedAt);
}

function validateTopic(topic) {
  const errors = [];
  ["title", "slug", "description", "conclusion", "known", "researchResults", "limitations", "author", "updatedAt"].forEach((field) => {
    if (!String(topic[field] || "").trim()) errors.push(`${topic.slug || "unknown"}: missing ${field}`);
  });
  if (!Array.isArray(topic.references) || topic.references.length === 0) errors.push(`${topic.slug || "unknown"}: references are required`);
  (topic.references || []).forEach((reference, index) => {
    if (!reference.title || !reference.sourceUrl) errors.push(`${topic.slug || "unknown"}: reference ${index + 1} needs title and sourceUrl`);
  });
  if (topic.status === "published" && (!topic.reviewer || !topic.reviewedAt)) {
    errors.push(`${topic.slug}: published topic needs reviewer and reviewedAt`);
  }
  return errors;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function topicMarkup(topic) {
  const references = (topic.references || []).map((reference) => `<li><a href="${escapeHtml(reference.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.title)}</a>${reference.publicationYear ? ` (${escapeHtml(reference.publicationYear)})` : ""}</li>`).join("");
  const related = (topic.relatedArticles || []).map((article) => `<li><a href="/health-library/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></li>`).join("");
  return `<div class="journal-page-shell library-page-shell"><article class="panel article-template sanity-article medical-topic-page" data-prerendered="medical-topic"><header class="article-head"><nav class="article-breadcrumb" aria-label="パンくず"><a href="/">トップ</a><span aria-hidden="true">&gt;</span><a href="/health-library">健康情報ライブラリ</a><span aria-hidden="true">&gt;</span><span aria-current="page">${escapeHtml(topic.title)}</span></nav><p class="eyebrow">医学情報トピック</p><h1>${escapeHtml(topic.title)}</h1><p>${escapeHtml(topic.description)}</p><div class="article-head-meta"><time datetime="${escapeHtml(topic.updatedAt)}">最終更新日 ${escapeHtml(topic.updatedAt)}</time><span>執筆 ${escapeHtml(topic.author)}</span><span>確認 ${escapeHtml(topic.reviewer)}</span></div></header><section class="article-key-takeaway"><h2>結論</h2><p>${escapeHtml(topic.conclusion)}</p></section><div class="sanity-body"><h2>現在分かっていること</h2><p>${escapeHtml(topic.known)}</p><h2>研究結果</h2><p>${escapeHtml(topic.researchResults)}</p><h2>研究の限界</h2><p>${escapeHtml(topic.limitations)}</p><h2>参考文献</h2><ol>${references}</ol>${related ? `<h2>関連する記事</h2><ul>${related}</ul>` : ""}</div></article></div>`;
}

function replaceMeta(html, topic) {
  const title = `${topic.title} | Health Check Lab`;
  const canonical = `${SITE_URL}/health-library/topic/${topic.slug}`;
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: topic.title,
    description: topic.description,
    dateModified: topic.updatedAt,
    author: { "@type": "Organization", name: topic.author },
    reviewedBy: { "@type": "Organization", name: topic.reviewer },
    publisher: { "@type": "Organization", name: "Health Check Lab", url: SITE_URL },
    mainEntityOfPage: canonical,
    citation: (topic.references || []).map((reference) => reference.sourceUrl)
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "トップ", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "健康情報ライブラリ", item: `${SITE_URL}/health-library` },
      { "@type": "ListItem", position: 3, name: topic.title, item: canonical }
    ]
  };
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?\/>/i, `<meta name="description" content="${escapeHtml(topic.description)}" />`)
    .replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
    .replace(/<meta\s+property="og:type"[^>]*>/i, '<meta property="og:type" content="article" />')
    .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtml(topic.description)}" />`)
    .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeHtml(canonical)}" />`)
    .replace("</head>", `${jsonLd(articleSchema)}\n${jsonLd(breadcrumbSchema)}\n</head>`)
    .replace('<main id="app" tabindex="-1"></main>', `<main id="app" tabindex="-1">${topicMarkup(topic)}</main>`);
}

function readSitemap(dist) {
  const file = path.join(dist, "sitemap.xml");
  if (!fs.existsSync(file)) return [];
  return Array.from(fs.readFileSync(file, "utf8").matchAll(/<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?\s*<\/url>/g)).map((match) => ({ loc: match[1], lastmod: match[2] || "" }));
}

function writeSitemap(dist, entries) {
  const seen = new Set();
  const rows = entries.filter((entry) => entry?.loc && !seen.has(entry.loc) && seen.add(entry.loc));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.map((entry) => `  <url><loc>${escapeHtml(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${escapeHtml(String(entry.lastmod).slice(0, 10))}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), xml, "utf8");
}

function generateMedicalTopicAssets({ root, dist, articles, logger = console }) {
  const topics = readTopics(root);
  const errors = topics.flatMap(validateTopic);
  if (errors.length) throw new Error(`Medical topic validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);

  const published = topics.filter(isPublishable).map((topic) => ({
    ...topic,
    url: `${SITE_URL}/health-library/topic/${topic.slug}`,
    relatedArticles: relatedArticles(topic, articles)
  }));
  const outputDir = path.join(dist, TOPIC_OUTPUT);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  writeJson(path.join(outputDir, "index.json"), published.map(({ relatedArticles: related, ...topic }) => ({
    ...topic,
    relatedArticleCount: related.length,
    articleSlugs: related.map((article) => article.slug)
  })));
  const baseHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  published.forEach((topic) => {
    writeJson(path.join(outputDir, `${topic.slug}.json`), topic);
    const pageDir = path.join(dist, "health-library", "topic", topic.slug);
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "index.html"), replaceMeta(baseHtml, topic), "utf8");
  });
  writeSitemap(dist, [
    ...readSitemap(dist).filter((entry) => !entry.loc.includes("/health-library/topic/")),
    ...published.map((topic) => ({ loc: topic.url, lastmod: topic.updatedAt }))
  ]);

  const pending = topics.filter((topic) => !isPublishable(topic));
  logger.log(`[medical-topics] Published ${published.length}; awaiting clinical review ${pending.length}.`);
  return { published, pending, errors: [] };
}

module.exports = { TOPIC_OUTPUT, TOPIC_SOURCE, generateMedicalTopicAssets, isPublishable, readTopics, relatedArticles, validateTopic };
