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
const { SITE_ENTITY } = require("./site-entity");

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
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_ENTITY.clinicName,
    url,
    knowsAbout: SITE_ENTITY.specialties
  };
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
    <link rel="stylesheet" href="/styles.css?v=drop-2" />
    ${jsonLd(organizationLd)}
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
        <p>慢性痛や運動器症状では、痛みの場所だけでなく、筋肉の負担、動作のくせ、生活習慣を合わせて見ることが大切だと考えています。</p>
        <h2>情報発信の方針</h2>
        <p>断定的な表現や過度な不安をあおる表現を避け、研究で分かっていること、まだ判断が難しいこと、受診を考える目安を分けて伝えます。</p>
        <h2>慢性痛・運動器症状への考え方</h2>
        <p>長く続く痛みは、筋肉、関節、神経、生活習慣、ストレスなど複数の要素が関係することがあります。Health Check Labでは、回答内容から負担の傾向を整理します。</p>
        <h2>筋肉評価と動作分析</h2>
        <p>体の動き、痛みが出る場面、こりや動きにくさの傾向から、関係しやすい筋肉や負担パターンを考えます。結果は診断ではなく、状態を振り返るための参考情報です。</p>
        <h2>鍼灸師としての見解</h2>
        <p>鍼灸の視点では、局所のつらさだけでなく、周辺の筋肉や日常動作の影響も確認します。必要に応じて医療機関への相談を優先すべき症状も明示します。</p>
        <h2>Health Check Labを作った理由</h2>
        <p>SNSの健康情報は便利な一方で、根拠やリスクが分かりにくいことがあります。体のセルフチェックと情報の信頼度確認を、気軽に行える場所として作成しています。</p>
        <h2>よくある質問</h2>
        ${faq.map((item) => `<h3>${htmlEscape(item.question)}</h3><p>${htmlEscape(item.answer)}</p>`).join("")}
        <h2>院の基本情報</h2>
        <dl class="meta-list">
          <div><dt>名称</dt><dd>${SITE_ENTITY.clinicName}</dd></div>
          <div><dt>監修</dt><dd>${SITE_ENTITY.supervisorName}</dd></div>
          <div><dt>更新日</dt><dd>${SITE_ENTITY.updatedAt}</dd></div>
        </dl>
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
    about: (article.specialtyTags || []).map((name) => ({ "@type": "Thing", name })),
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

  const clinicDir = path.join(dist, SITE_ENTITY.clinicProfilePath.replace(/^\//, ""));
  fs.mkdirSync(clinicDir, { recursive: true });
  fs.writeFileSync(path.join(clinicDir, "index.html"), clinicProfileHtml(), "utf8");

  const staticPaths = ["", "body-check", "health-check", "health-library", "community", "about", "clinic-profile", "faq"];
  const articlePaths = publishedArticles.map((article) => `health-library/${article.slug}`);
  const urls = [...staticPaths, ...articlePaths].map((item) => `${SITE_URL}/${item}`.replace(/\/$/, ""));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((urlItem) => `  <url><loc>${xmlEscape(urlItem || SITE_URL)}</loc></url>`)
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
