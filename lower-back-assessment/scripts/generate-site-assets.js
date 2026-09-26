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

function clinicAddress() {
  const address = CLINIC_PROFILE.address;
  if (!address?.full) return null;
  return {
    full: address.full,
    display: `${address.prefecture || ""}${address.city || ""}${address.street || ""}`.trim(),
    building: address.building || "",
    schema: {
      "@type": "PostalAddress",
      addressRegion: address.prefecture,
      addressLocality: address.city,
      streetAddress: [address.street, address.building].filter(Boolean).join(" "),
      addressCountry: "JP"
    }
  };
}

function metaRow(label, value, extraClass = "") {
  if (!value || (Array.isArray(value) && value.length === 0)) return "";
  const content = Array.isArray(value) ? value.join("、") : value;
  return `<div${extraClass ? ` class="${extraClass}"` : ""}><dt>${htmlEscape(label)}</dt><dd>${content}</dd></div>`;
}

function clinicStructuredData(url) {
  const address = clinicAddress();
  const data = {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: CLINIC_PROFILE.name,
    url,
    areaServed: optional(CLINIC_PROFILE.serviceAreas),
    medicalSpecialty: SITE_ENTITY.specialties
  };
  if (address) data.address = address.schema;
  if (CLINIC_PROFILE.telephone) data.telephone = CLINIC_PROFILE.telephone;
  if (CLINIC_PROFILE.logo) data.logo = `${SITE_URL}${CLINIC_PROFILE.logo}`;
  if (CLINIC_PROFILE.images?.length) data.image = CLINIC_PROFILE.images.map((image) => `${SITE_URL}${image}`);
  if (CLINIC_PROFILE.officialUrl) data.sameAs = [CLINIC_PROFILE.officialUrl, ...(CLINIC_PROFILE.snsUrls || [])];
  if (CLINIC_PROFILE.latitude && CLINIC_PROFILE.longitude) {
    data.geo = { "@type": "GeoCoordinates", latitude: CLINIC_PROFILE.latitude, longitude: CLINIC_PROFILE.longitude };
  }
  if (CLINIC_PROFILE.openingHours?.length) data.openingHoursSpecification = CLINIC_PROFILE.openingHours;
  if (CLINIC_PROFILE.pricing?.length) data.priceRange = CLINIC_PROFILE.pricing.map((item) => item.label || item.name).filter(Boolean).join(" / ");
  return data;
}

function clinicProfileHtml() {
  const url = `${SITE_URL}${SITE_ENTITY.clinicProfilePath}`;
  const description = "Health Check Labとハリプラス鍼灸院の関係、セルフチェックと健康記事の運営方針、監修情報を掲載しています。";
  const address = clinicAddress();
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
      question: "セルフチェックの結果だけで受診や施術方針を決められますか？",
      answer: "いいえ。結果は回答内容を整理した参考情報です。実際の状態は、必要に応じて対面での確認や医療機関への相談も含めて判断する必要があります。"
    }
  ];
  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: SITE_ENTITY.clinicProfileTitle,
    url,
    description,
    dateModified: SITE_ENTITY.updatedAt,
    mainEntity: {
      "@type": "MedicalBusiness",
      name: SITE_ENTITY.clinicName,
      url,
      sameAs: SITE_ENTITY.officialUrl ? [SITE_ENTITY.officialUrl] : undefined,
      address: address?.schema
    }
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
    <meta name="twitter:card" content="summary" />
    <link rel="stylesheet" href="/styles.css?v=mobile-nav-1" />
    <link rel="stylesheet" href="/ec-home.css?v=mobile-selector-1" />
    ${jsonLd(clinicStructuredData(url))}
    ${jsonLd(webPageLd)}
    ${jsonLd(faqLd)}
    ${jsonLd(breadcrumbLd)}
  </head>
  <body class="home-light info-page-body">
    <header class="site-header">
      <a class="brand" href="/" aria-label="Health Check Lab ホーム">
        <span class="brand-mark" aria-hidden="true">H</span>
        <span><strong>Health Check Lab</strong><small>身体のセルフチェック・健康記事</small></span>
      </a>
      <nav class="site-nav" id="siteNav" aria-label="メインメニュー">
        <a href="/" data-nav-section="home">ホーム</a>
        <a href="/#body-selector" data-nav-section="check">セルフチェック</a>
        <a href="/health-library" data-nav-section="articles">健康記事</a>
        <a href="/faq#faq-records" data-nav-section="records">記録・比較について</a>
        <a href="/home-screen/" data-nav-section="home-screen">ホーム画面に追加</a>
      </nav>
      <div class="site-header-tools">
        <a class="home-screen-help-link" href="/home-screen/" aria-label="ホーム画面に追加する方法を見る">
          <span class="home-screen-help-icon" aria-hidden="true">⌂</span>
          <span class="home-screen-help-label"><span>ホーム画面に</span><span>追加</span></span>
        </a>
        <button class="menu-button" id="menuButton" type="button" aria-expanded="false" aria-controls="siteNav" aria-label="メニューを開く">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>
    <main class="info-page-shell" id="mainContent">
      <div class="info-page-hero">
        <div class="info-page-inner">
          <nav class="info-breadcrumb" aria-label="パンくず"><a href="/">ホーム</a><span aria-current="page">${SITE_ENTITY.clinicProfileTitle}</span></nav>
          <h1>${SITE_ENTITY.clinicProfileTitle}</h1>
          <p class="info-page-lead">Health Check Labとハリプラス鍼灸院の関係、セルフチェックと健康記事を届けるうえで大切にしていることを説明します。</p>
          <nav class="info-page-quick-nav" aria-label="ページ内メニュー"><a href="#relationship">運営と監修の関係</a><a href="#policy">情報の方針</a><a href="#profile">基本情報</a></nav>
        </div>
      </div>
      <div class="info-page-inner info-page-content">
        <section class="info-section" id="relationship" aria-labelledby="relationship-title">
          <div class="info-section-heading"><h2 id="relationship-title">Health Check Labとハリプラス鍼灸院</h2><p>${SITE_ENTITY.relationship}</p></div>
          <p>${htmlEscape(CLINIC_PROFILE.treatmentPolicy || "慢性痛や運動器症状について、痛む場所だけではなく、動作や筋肉の働きも含めて考えることを重視しています。")}</p>
        </section>
        <section class="info-section" id="policy" aria-labelledby="policy-title">
          <div class="info-section-heading"><h2 id="policy-title">情報を届けるときに大切にしていること</h2><p>短く強い表現だけに寄せず、分かっていることと判断できないことを分けて伝えます。</p></div>
          <div class="info-principle-grid">
            <article class="info-principle-item"><strong>根拠を確かめる</strong><p>研究や公的情報を確認し、参考文献や更新情報をたどれる形を目指します。</p></article>
            <article class="info-principle-item"><strong>断定しすぎない</strong><p>症状や一つの動作だけから、原因や病名、治療効果を決めつけません。</p></article>
            <article class="info-principle-item"><strong>次の行動につなげる</strong><p>セルフチェックで整理できる範囲と、医療機関への相談を考える場面を分けます。</p></article>
          </div>
          <p class="info-safety-note"><strong>セルフチェックの位置づけ：</strong>回答した部位や動作から、関わる可能性がある筋肉を整理する参考情報です。医療診断や施術方針の決定を行うものではありません。</p>
        </section>
        <section class="info-section" id="profile" aria-labelledby="profile-title">
          <div class="info-section-heading"><h2 id="profile-title">運営・監修の基本情報</h2><p>掲載済みの確認可能な情報のみを表示しています。</p></div>
          <dl class="info-meta-list">
            ${metaRow("名称", htmlEscape(CLINIC_PROFILE.name))}
            ${address ? `<div class="clinic-address-row"><dt>所在地</dt><dd><span>${htmlEscape(address.display)}</span> <span>${htmlEscape(address.building)}</span></dd></div>` : ""}
            ${metaRow("監修", htmlEscape(SITE_ENTITY.supervisorName))}
            ${metaRow("主な対象", (CLINIC_PROFILE.consultationFocus || []).map(htmlEscape))}
            ${metaRow("情報更新日", htmlEscape(SITE_ENTITY.updatedAt))}
          </dl>
          ${SITE_ENTITY.officialUrl ? `<p><a href="${htmlEscape(SITE_ENTITY.officialUrl)}" target="_blank" rel="noopener noreferrer">ハリプラス鍼灸院の公式サイトを見る</a></p>` : ""}
        </section>
        <section class="info-section" aria-labelledby="profile-faq-title">
          <div class="info-section-heading"><h2 id="profile-faq-title">このページについてよくある質問</h2></div>
          <div class="info-faq-list">${faq.map((item) => `<details><summary>${htmlEscape(item.question)}</summary><p>${htmlEscape(item.answer)}</p></details>`).join("")}</div>
        </section>
        <section class="info-section">
          <div class="info-action-band"><div><h2>使い方を確認する</h2><p>セルフチェックや記録、匿名データについては、よくある質問にまとめています。</p></div><div class="info-action-links"><a href="/faq">よくある質問を見る</a><a href="/health-library">健康記事を読む</a></div></div>
        </section>
      </div>
    </main>
    <footer class="site-footer">
      <div><strong>Health Check Lab</strong><p>原因筋診断と健康記事を通じて、体の中を探索する健康情報メディアです。</p></div>
      <div class="footer-links"><a href="/faq">よくある質問</a><a href="/health-library">健康記事を読む</a></div>
    </footer>
    <script src="/site-menu.js?v=mobile-nav-1" defer></script>
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

function sourceLastModified(relativePath, fallback = SITE_ENTITY.updatedAt) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return fallback;
  return fs.statSync(file).mtime.toISOString().slice(0, 10);
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

  const staticPaths = ["", "body-check", "health-check", "health-library", "community", "about", "clinic-profile", "faq", "home-screen"];
  const staticEntries = staticPaths.map((item) => ({
    loc: item === "home-screen" ? `${SITE_URL}/home-screen/` : (`${SITE_URL}/${item}`.replace(/\/$/, "") || SITE_URL),
    lastmod: item ? sourceLastModified(`${item}/index.html`) : sourceLastModified("index.html")
  }));
  const articleEntries = publishedArticles.map((article) => ({ loc: `${SITE_URL}/health-library/${article.slug}`, lastmod: article.dateModified || article.updatedAt || article.publishedAt }));
  const regionEntries = publishedRegions.map((page) => ({ loc: `${SITE_URL}${page.path}`.replace(/\/$/, ""), lastmod: page.updatedAt || SITE_ENTITY.updatedAt }));
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticEntries, ...articleEntries, ...regionEntries]
    .map((entry) => `  <url><loc>${xmlEscape(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${xmlEscape(String(entry.lastmod).slice(0, 10))}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(dist, "sitemap.xml"), sitemap, "utf8");
  fs.writeFileSync(path.join(dist, "robots.txt"), `User-agent: Googlebot\nAllow: /\n\nUser-agent: Bingbot\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: *\nAllow: /\nDisallow: /*?search=\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, "utf8");
  fs.writeFileSync(path.join(dist, "rss.xml"), rssXml(publishedArticles), "utf8");

  return { publishedCount: publishedArticles.length, regionCount: publishedRegions.length, distContent };
}

if (require.main === module) {
  const result = generateSiteAssets();
  console.log(`Generated site assets. Published articles: ${result.publishedCount}. Published region pages: ${result.regionCount}`);
}

module.exports = { generateSiteAssets };
