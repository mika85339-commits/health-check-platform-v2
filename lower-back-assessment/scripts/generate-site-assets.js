const fs = require("fs");
const path = require("path");
const {
  ARTICLE_DIR,
  ARTICLE_INDEX_PATH,
  CONTENT_DIR,
  SITE_URL,
  TOPICS_PATH,
  articleDescription,
  buildCategories,
  buildRelated,
  readJson,
  validateContent,
  writeJson
} = require("./content-utils");
const { CLINIC_PROFILE, SITE_ENTITY } = require("./site-entity");

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

function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function optional(value, mapper = (item) => item) {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)
    ? undefined
    : mapper(value);
}

function clinicStructuredData(url) {
  const data = {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: CLINIC_PROFILE.name,
    url,
    areaServed: optional(CLINIC_PROFILE.serviceAreas),
    medicalSpecialty: SITE_ENTITY.specialties
  };
  if (CLINIC_PROFILE.telephone) data.telephone = CLINIC_PROFILE.telephone;
  if (CLINIC_PROFILE.logo) data.logo = `${SITE_URL}${CLINIC_PROFILE.logo}`;
  if (CLINIC_PROFILE.images?.length) data.image = CLINIC_PROFILE.images.map((image) => `${SITE_URL}${image}`);
  if (CLINIC_PROFILE.officialUrl) data.sameAs = [CLINIC_PROFILE.officialUrl, ...(CLINIC_PROFILE.snsUrls || [])];
  if (CLINIC_PROFILE.latitude && CLINIC_PROFILE.longitude) {
    data.geo = { "@type": "GeoCoordinates", latitude: CLINIC_PROFILE.latitude, longitude: CLINIC_PROFILE.longitude };
  }
  if (CLINIC_PROFILE.location) data.address = CLINIC_PROFILE.location;
  if (CLINIC_PROFILE.openingHours?.length) data.openingHoursSpecification = CLINIC_PROFILE.openingHours;
  if (CLINIC_PROFILE.pricing?.length) data.priceRange = CLINIC_PROFILE.pricing.map((item) => item.label || item.name).filter(Boolean).join(" / ");
  return data;
}

function clinicProfileHtml() {
  const url = `${SITE_URL}${SITE_ENTITY.clinicProfilePath}`;
  const description = "ハリプラス鍼灸院の考え方と、Health Check Labとの関係をまとめたページです。";
  const faq = [
    {
      question: "Health Check Labは医療診断ですか？",
      answer: "いいえ。Health Check Labは、体の状態や健康情報を整理するためのセルフチェック・情報サービスです。"
    },
    {
      question: "ハリプラス鍼灸院との関係は？",
      answer: SITE_ENTITY.relationship
    },
    {
      question: "診断結果だけで施術方針を決められますか？",
      answer: "いいえ。診断結果は参考情報です。実際の状態は、必要に応じて対面での確認や医療機関への相談も含めて判断する必要があります。"
    }
  ];
  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: SITE_ENTITY.clinicProfileTitle,
    url,
    description,
    dateModified: SITE_ENTITY.updatedAt,
    about: { "@type": "Organization", name: SITE_ENTITY.clinicName, url }
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: SITE_ENTITY.clinicProfileTitle, item: url }
    ]
  };

  const todo = (CLINIC_PROFILE.todoFields || []).map((field) => `<li>${htmlEscape(field)}</li>`).join("");
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${SITE_ENTITY.clinicProfileTitle} | Health Check Lab</title>
    <meta name="description" content="${htmlEscape(description)}" />
    <link rel="canonical" href="${htmlEscape(url)}" />
    <meta property="og:type" content="profile" />
    <meta property="og:title" content="${SITE_ENTITY.clinicProfileTitle} | Health Check Lab" />
    <meta property="og:description" content="${htmlEscape(description)}" />
    <meta property="og:url" content="${htmlEscape(url)}" />
    <meta name="twitter:card" content="summary" />
    <link rel="stylesheet" href="/styles.css?v=drop-2" />
    ${jsonLd(clinicStructuredData(url))}
    ${jsonLd(webPageLd)}
    ${jsonLd(faqLd)}
    ${jsonLd(breadcrumbLd)}
  </head>
  <body>
    <header class="site-header">
      <a class="brand" href="/" aria-label="Health Check Lab ホーム">
        <span class="brand-mark" aria-hidden="true">H</span>
        <span><strong>Health Check Lab</strong><small>健康セルフチェック・プラットフォーム</small></span>
      </a>
      <nav class="site-nav" aria-label="メインメニュー">
        <a href="/">ホーム</a>
        <a href="/body-check">体のセルフチェック</a>
        <a href="/health-check">SNS信頼度チェック</a>
        <a href="/health-library">健康情報ライブラリ</a>
        <a href="/faq">FAQ</a>
      </nav>
    </header>
    <main class="page">
      <section class="page-hero">
        <p class="eyebrow">Clinic Profile</p>
        <h1>${SITE_ENTITY.clinicProfileTitle}</h1>
        <p>筋肉評価と動作分析を重視する鍼灸院として、Health Check Labの情報発信を監修しています。</p>
      </section>
      <section class="panel prose">
        <h2>Health Check Labとの関係</h2>
        <p>${SITE_ENTITY.relationship}</p>
        <p>医療診断ではなく、体の状態や健康情報を整理するためのセルフチェックとして運営しています。</p>
        <h2>院の考え方</h2>
        <p>${htmlEscape(CLINIC_PROFILE.treatmentPolicy || "筋肉評価と動作分析を重視して状態を整理します。")}</p>
        <h2>情報発信の方針</h2>
        <p>断定的な表現や過度な不安をあおる表現を避け、研究で分かっていること、まだ判断が難しいこと、受診を考える目安を分けて伝えます。</p>
        <h2>よくある質問</h2>
        ${faq.map((item) => `<h3>${htmlEscape(item.question)}</h3><p>${htmlEscape(item.answer)}</p>`).join("")}
        <h2>院の基本情報</h2>
        <dl class="meta-list">
          <div><dt>名称</dt><dd>${htmlEscape(CLINIC_PROFILE.name)}</dd></div>
          <div><dt>監修</dt><dd>${htmlEscape(SITE_ENTITY.supervisorName)}</dd></div>
          <div><dt>得意とする相談内容</dt><dd>${htmlEscape((CLINIC_PROFILE.consultationFocus || []).join("、"))}</dd></div>
          <div><dt>更新日</dt><dd>${htmlEscape(SITE_ENTITY.updatedAt)}</dd></div>
        </dl>
        ${todo ? `<h2>確認が必要な院情報</h2><ul>${todo}</ul>` : ""}
      </section>
    </main>
  </body>
</html>
`;
}

function articleHtml(article) {
  const url = `${SITE_URL}/health-library/${article.slug}`;
  const description = articleDescription(article);
  const authorName = article.authorName || SITE_ENTITY.supervisorName;
  const reviewerName = article.reviewedBy || authorName;
  const datePublished = article.datePublished || article.publishedAt || article.createdAt;
  const dateModified = article.dateModified || article.updatedAt || article.createdAt;
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description,
    datePublished,
    dateModified,
    author: { "@type": "Person", name: authorName, url: `${SITE_URL}${article.authorUrl || SITE_ENTITY.clinicProfilePath}` },
    reviewedBy: { "@type": "Person", name: reviewerName, url: `${SITE_URL}${article.reviewerUrl || SITE_ENTITY.clinicProfilePath}` },
    publisher: { "@type": "Organization", name: "Health Check Lab", url: SITE_URL },
    about: [...(article.specialtyTags || []), ...(article.symptomTags || [])].map((name) => ({ "@type": "Thing", name })),
    citation: (article.citation || article.references || []).map((item) => item.url || item.title).filter(Boolean),
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
    <meta name="twitter:card" content="summary" />
    ${jsonLd(articleLd)}
    ${jsonLd(breadcrumbLd)}
    <script>
      sessionStorage.setItem("health-check-lab-route", "/health-library/${article.slug}");
      location.replace("/");
    </script>
  </head>
  <body><a href="/">Health Check Labを開く</a></body>
</html>
`;
}

function regionHtml(page, relatedArticles) {
  const cleanPath = page.path.replace(/\/$/, "");
  const url = `${SITE_URL}${cleanPath}`;
  const description = `${page.title}。一般的な相談内容、受診目安、セルフケア、鍼灸を検討できる状況を整理します。`;
  const faq = [
    { question: "まず医療機関へ相談すべき症状はありますか？", answer: "強いしびれ、筋力低下、発熱、外傷後の症状、急激な悪化などがある場合は医療機関での評価を優先してください。" },
    { question: "鍼灸を検討できるのはどのような場合ですか？", answer: "緊急性が高くなく、慢性的な筋肉のこわばりや動作時のつらさが続く場合は選択肢の一つになり得ます。" }
  ];
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: page.title, item: url }
    ]
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } }))
  };
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(page.title)} | Health Check Lab</title>
    <meta name="description" content="${htmlEscape(description)}" />
    <link rel="canonical" href="${htmlEscape(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${htmlEscape(page.title)} | Health Check Lab" />
    <meta property="og:description" content="${htmlEscape(description)}" />
    <meta property="og:url" content="${htmlEscape(url)}" />
    <meta name="twitter:card" content="summary" />
    <link rel="stylesheet" href="/styles.css?v=drop-2" />
    ${jsonLd({ "@context": "https://schema.org", "@type": "WebPage", name: page.title, url, description })}
    ${jsonLd(breadcrumbLd)}
    ${jsonLd(faqLd)}
  </head>
  <body>
    <main class="page">
      <section class="page-hero">
        <p class="eyebrow">Nagoya Area Guide</p>
        <h1>${htmlEscape(page.title)}</h1>
        <p>${htmlEscape(description)}</p>
      </section>
      <section class="panel prose">
        <h2>一般的な相談内容</h2>
        <p>${htmlEscape(page.symptom)}では、痛みの強さ、しびれの有無、動作で悪化するか、生活への影響を整理することが大切です。</p>
        <h2>最初に医療機関を受診すべき症状</h2>
        <p>強いしびれ、筋力低下、発熱、外傷後の症状、急激な悪化がある場合は医療機関での評価を優先してください。</p>
        <h2>病院で行われる主な検査</h2>
        <p>問診、身体診察、必要に応じた画像検査や血液検査などが検討されます。</p>
        <h2>セルフケア</h2>
        <p>症状が強くならない範囲で体を動かし、睡眠や休息も含めて状態を見直します。</p>
        <h2>鍼灸を検討できるケース</h2>
        <p>緊急性が高くなく、慢性的な筋肉のこわばりや動作時のつらさが続く場合は、鍼灸が選択肢の一つになり得ます。</p>
        <h2>${htmlEscape(CLINIC_PROFILE.name)}の施術方針</h2>
        <p>${htmlEscape(CLINIC_PROFILE.treatmentPolicy || "")}</p>
        <h2>アクセス・料金・予約方法</h2>
        <p>この情報は確認後に掲載します。未確認情報は推測で公開しません。</p>
        <h2>よくある質問</h2>
        ${faq.map((item) => `<h3>${htmlEscape(item.question)}</h3><p>${htmlEscape(item.answer)}</p>`).join("")}
        <h2>関連する健康記事</h2>
        ${relatedArticles.length ? `<ul>${relatedArticles.map((article) => `<li><a href="/health-library/${article.slug}">${htmlEscape(article.title)}</a></li>`).join("")}</ul>` : "<p>関連する公開記事はまだありません。</p>"}
      </section>
    </main>
  </body>
</html>`;
}

function rssXml(articles) {
  const items = articles.map((article) => {
    const url = `${SITE_URL}/health-library/${article.slug}`;
    return `<item><title>${xmlEscape(article.title)}</title><link>${xmlEscape(url)}</link><guid>${xmlEscape(url)}</guid><pubDate>${new Date(article.publishedAt || article.updatedAt).toUTCString()}</pubDate><description>${xmlEscape(articleDescription(article))}</description></item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Health Check Lab</title><link>${SITE_URL}</link><description>健康情報ライブラリの公開記事</description>${items}</channel></rss>\n`;
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
  fs.mkdirSync(distContent, { recursive: true });
  fs.mkdirSync(distArticles, { recursive: true });

  writeJson(dist, ARTICLE_INDEX_PATH, publishedArticles.map((article) => article.slug));
  writeJson(dist, TOPICS_PATH, []);
  writeJson(dist, `${CONTENT_DIR}/categories.json`, buildCategories(publishedArticles));
  writeJson(dist, `${CONTENT_DIR}/related.json`, buildRelated(publishedArticles));

  publishedArticles.forEach((article) => {
    writeJson(dist, `${ARTICLE_DIR}/${article.slug}.json`, article);
    const articleDir = path.join(dist, "health-library", article.slug);
    fs.mkdirSync(articleDir, { recursive: true });
    fs.writeFileSync(path.join(articleDir, "index.html"), articleHtml(article), "utf8");
  });

  const clinicDir = path.join(dist, SITE_ENTITY.clinicProfilePath.replace(/^\//, ""));
  fs.mkdirSync(clinicDir, { recursive: true });
  fs.writeFileSync(path.join(clinicDir, "index.html"), clinicProfileHtml(), "utf8");

  const regionPages = readJson(root, "content/region/nagoya-pages.json", []);
  const publishedRegions = regionPages.filter((page) => page.status === "published");
  publishedRegions.forEach((page) => {
    const pageDir = path.join(dist, page.path.replace(/^\//, ""));
    fs.mkdirSync(pageDir, { recursive: true });
    const relatedArticles = publishedArticles
      .filter((article) => (page.relatedTags || []).some((tag) => [...(article.tags || []), ...(article.symptomTags || []), ...(article.regionTags || [])].includes(tag)))
      .slice(0, 6);
    fs.writeFileSync(path.join(pageDir, "index.html"), regionHtml(page, relatedArticles), "utf8");
  });

  const staticPaths = ["", "body-check", "health-check", "health-library", "community", "about", "clinic-profile", "faq"];
  const articlePaths = publishedArticles.map((article) => `health-library/${article.slug}`);
  const regionPaths = publishedRegions.map((page) => page.path.replace(/^\//, "").replace(/\/$/, ""));
  const urls = [...staticPaths, ...articlePaths, ...regionPaths].map((item) => `${SITE_URL}/${item}`.replace(/\/$/, ""));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((urlItem) => `  <url><loc>${xmlEscape(urlItem || SITE_URL)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap, "utf8");
  fs.writeFileSync(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf8");
  fs.writeFileSync(path.join(dist, "rss.xml"), rssXml(publishedArticles), "utf8");

  return { publishedCount: publishedArticles.length, regionCount: publishedRegions.length, distContent };
}

if (require.main === module) {
  const result = generateSiteAssets();
  console.log(`Generated site assets. Published articles: ${result.publishedCount}. Published region pages: ${result.regionCount}`);
}

module.exports = { generateSiteAssets };
