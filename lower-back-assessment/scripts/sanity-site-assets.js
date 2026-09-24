const fs = require("fs");
const path = require("path");
const { SITE_URL } = require("./content-utils");
const { resolveDiagnosisGuide, selectRelatedArticles } = require("../health-library-content");

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

function routeUrl(route) {
  const encoded = String(route || "").split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${SITE_URL}${encoded.replace(/\/+$/, "")}/`;
}

function portableTextHtml(blocks) {
  const output = [];
  let list = [];
  let listType = "";
  const flush = () => {
    if (!list.length) return;
    const tag = listType === "number" ? "ol" : "ul";
    output.push(`<${tag}>${list.map((item) => `<li>${item}</li>`).join("")}</${tag}>`);
    list = [];
    listType = "";
  };
  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    if (block?._type === "image") {
      flush();
      const url = block.url || block.asset?.url;
      if (url) output.push(`<figure><img src="${htmlEscape(url)}" alt="${htmlEscape(block.alt || block.caption || "")}" loading="lazy" />${block.caption ? `<figcaption>${htmlEscape(block.caption)}</figcaption>` : ""}</figure>`);
      return;
    }
    if (block?._type !== "block") return;
    const markDefs = new Map((block.markDefs || []).map((mark) => [mark._key, mark]));
    const content = (block.children || []).map((child) => {
      let value = htmlEscape(child.text || "");
      (child.marks || []).forEach((mark) => {
        if (mark === "strong") value = `<strong>${value}</strong>`;
        else if (mark === "em") value = `<em>${value}</em>`;
        else if (markDefs.get(mark)?._type === "link" && markDefs.get(mark).href) {
          const href = markDefs.get(mark).href;
          const external = /^https?:\/\//i.test(href);
          value = `<a href="${htmlEscape(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${value}</a>`;
        }
      });
      return value;
    }).join("");
    if (!content.trim()) return;
    if (block.listItem) {
      const type = block.listItem === "number" ? "number" : "bullet";
      if (listType && listType !== type) flush();
      listType = type;
      list.push(content);
      return;
    }
    flush();
    const style = block.style || "normal";
    if (["h2", "h3", "h4"].includes(style)) output.push(`<${style}>${content}</${style}>`);
    else if (style === "blockquote") output.push(`<blockquote>${content}</blockquote>`);
    else output.push(`<p>${content}</p>`);
  });
  flush();
  return output.join("");
}

function diagnosisEntry(article) {
  const categoryText = (article.categories || []).map((item) => item?.title || item?.slug).filter(Boolean);
  const title = String(article.title || "");
  const source = [article.excerpt, article.summary, ...categoryText, ...(article.tags || []).map((item) => item?.title || item?.slug), ...(article.keywords || []), ...(article.targetSymptoms || [])].filter(Boolean).join(" ");
  const entries = [
    { terms: ["膝"], slug: "knee", label: "膝" },
    { terms: ["股関節"], slug: "hip", label: "股関節" },
    { terms: ["腰痛", "腰の痛み", "腸腰筋", "腰"], slug: "lower-back", label: "腰" },
    { terms: ["肩こり", "肩甲骨", "肩の痛み", "肩"], slug: "shoulder", label: "肩" },
    { terms: ["首こり", "首の痛み", "眼精疲労", "耳鳴り", "頭痛", "首"], slug: "neck", label: "首" }
  ];
  const match = entries.find((entry) => entry.terms.some((term) => title.includes(term)))
    || entries.find((entry) => entry.terms.some((term) => source.includes(term)));
  return match ? { href: `/body-check/${match.slug}/`, label: `${match.label}のセルフチェックへ` } : { href: "/body-guide/", label: "身体の部位から探す" };
}

function diagnosisCta(article) {
  const entry = diagnosisEntry(article);
  const categoryName = article.categories?.[0]?.title || "症状";
  const guide = resolveDiagnosisGuide(article, entry, `${categoryName}や関連する動きから、関係している可能性がある筋肉を整理できます。`);
  return `<section class="article-diagnosis-cta" aria-labelledby="articleDiagnosisCtaTitle"><div><p class="section-kicker">BODY CHECK</p><h2 id="articleDiagnosisCtaTitle">${htmlEscape(guide.heading)}</h2><p>${htmlEscape(guide.description)}</p></div><a class="primary-button" href="${htmlEscape(guide.href)}">${htmlEscape(guide.label)}</a></section>`;
}

function articleGuideData(article) {
  return article.articleGuide || article.localPreview || {};
}

function referenceUrl(reference) {
  return reference?.pubMedUrl || reference?.url || reference?.journalUrl || (reference?.doi ? `https://doi.org/${reference.doi}` : "");
}

function articleReaderQuestion(article) {
  const guide = articleGuideData(article);
  if (!guide.readerQuestion || !guide.answer) return "";
  const details = (guide.details || []).map((paragraph) => `<p>${htmlEscape(paragraph)}</p>`).join("");
  const sources = (article.references || []).map((reference) => ({
    title: reference?.title,
    url: referenceUrl(reference),
    note: reference?.supports || reference?.note || ""
  })).filter((source) => source.title && source.url).map((source) => `<li><a href="${htmlEscape(source.url)}" target="_blank" rel="noopener noreferrer">${htmlEscape(source.title)}</a>${source.note ? `<span>${htmlEscape(source.note)}</span>` : ""}</li>`).join("");
  return `<section class="article-reader-answer" aria-labelledby="articleReaderQuestionTitle"><p class="article-reader-answer-label">この記事が答える疑問</p><h2 id="articleReaderQuestionTitle">${htmlEscape(guide.readerQuestion)}</h2><p class="article-reader-answer-conclusion">${htmlEscape(guide.answer)}</p>${details}${sources ? `<div class="article-reader-answer-sources"><p>確認した出典</p><ul>${sources}</ul></div>` : ""}</section>`;
}

function articleFocusMap(article) {
  const guide = articleGuideData(article).visualGuide;
  const items = (guide?.items || []).filter((item) => item?.label && item?.text).slice(0, 4);
  if (!guide?.heading || !items.length) return "";
  return `<figure class="article-focus-map" aria-labelledby="articleFocusMapTitle"><figcaption><strong id="articleFocusMapTitle">${htmlEscape(guide.heading)}</strong>${guide.lead ? `<span>${htmlEscape(guide.lead)}</span>` : ""}</figcaption><ol>${items.map((item, index) => `<li><span class="article-focus-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span><strong>${htmlEscape(item.label)}</strong><small>${htmlEscape(item.text)}</small></span></li>`).join("")}</ol>${guide.note ? `<p>${htmlEscape(guide.note)}</p>` : ""}</figure>`;
}

function articleKeyTakeaway(article) {
  const items = (articleGuideData(article).keyPoints || []).filter(Boolean).slice(0, 4);
  if (!items.length) return "";
  return `<section class="article-key-takeaway article-understanding-card"><p class="section-kicker">BODY MAP</p><h2>この記事でわかること</h2><ul>${items.map((item) => `<li><span class="takeaway-check" aria-hidden="true">✓</span><span>${htmlEscape(item)}</span></li>`).join("")}</ul></section>`;
}

function articlePrerender(article, allArticles) {
  const references = (article.references || []).map((reference) => {
    const url = reference.pubMedUrl || reference.url || reference.journalUrl || (reference.doi ? `https://doi.org/${reference.doi}` : "");
    return `<li>${url ? `<a href="${htmlEscape(url)}" target="_blank" rel="noopener noreferrer">${htmlEscape(reference.title)}</a>` : htmlEscape(reference.title)}</li>`;
  }).join("");
  const categoryNames = (article.categories || []).map((item) => item?.title).filter(Boolean);
  const categories = categoryNames.length ? categoryNames : ["健康情報"];
  const categoryLinks = categories.map((name) => `<a class="library-category" href="/health-library?category=${encodeURIComponent(name)}">${htmlEscape(name)}</a>`).join(" ");
  const relatedLinks = selectRelatedArticles(article, allArticles).map((item) => `<li><a href="${routeUrl(`/health-library/${item.slug}`).replace(SITE_URL, "")}">${htmlEscape(item.title)}</a></li>`).join("");
  return `<div class="journal-page-shell library-page-shell"><article class="panel article-template sanity-article" data-prerendered="sanity-article"><header class="article-head"><nav class="article-breadcrumb" aria-label="パンくず"><a href="/">トップ</a><span aria-hidden="true">&gt;</span><a href="/health-library">健康情報ライブラリ</a><span aria-hidden="true">&gt;</span><span aria-current="page">${htmlEscape(article.title)}</span></nav><p>${categoryLinks}</p><h1>${htmlEscape(article.title)}</h1><p>${htmlEscape(articleDescription(article))}</p><div class="article-head-meta">${article.publishedAt ? `<time datetime="${htmlEscape(article.publishedAt)}">公開日 ${htmlEscape(String(article.publishedAt).slice(0, 10))}</time>` : ""}${article.updatedAt ? `<time datetime="${htmlEscape(article.updatedAt)}">最終更新日 ${htmlEscape(String(article.updatedAt).slice(0, 10))}</time>` : ""}</div></header>${articleReaderQuestion(article)}${articleFocusMap(article)}${diagnosisCta(article)}${articleKeyTakeaway(article)}<div class="sanity-body">${portableTextHtml(article.body)}${references ? `<h2>参考文献</h2><ol>${references}</ol>` : ""}</div>${relatedLinks ? `<section><h2>関連記事</h2><ul>${relatedLinks}</ul></section>` : ""}${clinicContextLink(article)}</article></div>`;
}

function replaceDocumentMetadata(baseHtml, article, schemas, allArticles) {
  const url = routeUrl(`/health-library/${article.slug}`);
  const description = articleDescription(article);
  const image = articleImage(article);
  const title = `${article.seo?.title || article.title} | Health Check Lab`;
  return baseHtml
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(title)}</title>`)
    .replace(/<meta\s+name="description"[\s\S]*?\/>/i, `<meta name="description" content="${htmlEscape(description)}" />`)
    .replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${htmlEscape(url)}" />`)
    .replace(/<meta\s+property="og:type"[^>]*>/i, '<meta property="og:type" content="article" />')
    .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${htmlEscape(article.seo?.ogTitle || title)}" />`)
    .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${htmlEscape(article.seo?.ogDescription || description)}" />`)
    .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${htmlEscape(url)}" />`)
    .replace("</head>", `<meta name="robots" content="${article.seo?.noIndex ? "noindex,follow" : "index,follow"}" />\n${image ? `<meta property="og:image" content="${htmlEscape(image)}" />` : ""}\n${schemas.map(jsonLd).join("\n")}\n</head>`)
    .replace(/<main id="app" tabindex="-1">[\s\S]*?<\/main>/i, `<main id="app" tabindex="-1">${articlePrerender(article, allArticles)}</main>`);
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

const HARIPLUS_CHRONIC_PAIN_URL = "https://hariplus-nagoya.com/chronic-pain";
const SHOULDER_RELATED_TERMS = ["肩こり", "首こり", "首肩", "肩甲骨"];

function clinicContextLink(article) {
  const source = String(article.title || "");
  if (!SHOULDER_RELATED_TERMS.some((term) => source.includes(term))) return "";

  let label = "慢性的な肩のつらさへの鍼灸施術を見る";
  if (source.includes("肩こりの原因")) label = "肩こり・腰痛への鍼灸の考え方を見る";
  if (source.includes("ストレッチ")) label = "慢性的な肩のつらさへの施術を見る";
  if (source.includes("肩こり・首こり")) label = "首こりと肩こりの鍼灸施術を見る";
  if (source.includes("首肩") && source.includes("血流")) label = "首肩の緊張を含めた鍼灸施術を見る";
  else if (source.includes("首肩")) label = "首肩のつらさへの鍼灸施術を見る";
  return `<p class="article-clinic-context-link"><a href="${HARIPLUS_CHRONIC_PAIN_URL}">${htmlEscape(label)}</a></p>`;
}

function articleHtml(article, baseHtml, allArticles) {
  const url = routeUrl(`/health-library/${article.slug}`);
  const description = articleDescription(article);
  const image = articleImage(article);
  const title = article.seo?.title || article.title;
  const ogTitle = article.seo?.ogTitle || title;
  const ogDescription = article.seo?.ogDescription || description;
  const authorName = articleAuthor(article);
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt || article.publishedAt,
    author: { "@type": /鍼灸院|Health Check Lab/.test(authorName) ? "Organization" : "Person", name: authorName },
    reviewedBy: article.reviewer?.name ? { "@type": "Person", name: article.reviewer.name } : undefined,
    publisher: { "@type": "Organization", name: "Health Check Lab", url: SITE_URL },
    image: image || undefined,
    mainEntityOfPage: url,
    citation: [
      ...(article.references || []).map((item) => item.url || item.pubMedUrl || item.journalUrl || item.title),
      ...(article.evidenceClaims || []).flatMap((claim) => (claim.evidence || []).map((item) => item.sourceUrl || item.title))
    ].filter(Boolean)
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

  return replaceDocumentMetadata(baseHtml, article, [articleLd, breadcrumbLd, ...(faqLd ? [faqLd] : [])], allArticles);
}

function readExistingSitemap(dist) {
  const sitemapPath = path.join(dist, "sitemap.xml");
  if (!fs.existsSync(sitemapPath)) return [];
  const xml = fs.readFileSync(sitemapPath, "utf8");
  return Array.from(xml.matchAll(/<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?\s*<\/url>/g)).map((match) => ({ loc: match[1], lastmod: match[2] || "" }));
}

function isSanityArticleUrl(entry) {
  try {
    const parsed = new URL(entry.loc);
    if (parsed.origin !== SITE_URL) return false;
    if (!parsed.pathname.startsWith("/health-library/")) return false;
    if (parsed.pathname.startsWith("/health-library/category/")) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function writeSitemap(dist, urls) {
  const seen = new Set();
  const uniqueUrls = urls.filter((entry) => entry?.loc && !seen.has(entry.loc) && seen.add(entry.loc));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniqueUrls
    .map((entry) => `  <url><loc>${xmlEscape(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${xmlEscape(String(entry.lastmod).slice(0, 10))}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap, "utf8");
}

function generateSanitySiteAssets({ dist, articles }) {
  const sanityArticles = Array.isArray(articles) ? articles : [];
  const baseHtml = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  sanityArticles.forEach((article) => {
    const articleDir = path.join(dist, "health-library", article.slug);
    fs.mkdirSync(articleDir, { recursive: true });
    fs.writeFileSync(path.join(articleDir, "index.html"), articleHtml(article, baseHtml, sanityArticles), "utf8");
  });

  const baseUrls = readExistingSitemap(dist).filter((url) => !isSanityArticleUrl(url));
  const sanityUrls = sanityArticles.filter((article) => !article.seo?.noIndex).map((article) => ({ loc: routeUrl(`/health-library/${article.slug}`), lastmod: article.updatedAt || article.publishedAt }));
  writeSitemap(dist, [...baseUrls, ...sanityUrls]);

  return { sanityArticlePageCount: sanityArticles.length, removedStaleSitemapUrlCount: readExistingSitemap(dist).length - baseUrls.length };
}

module.exports = { articleHtml, articlePrerender, diagnosisEntry, generateSanitySiteAssets };
