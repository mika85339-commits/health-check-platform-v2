const fs = require("fs");
const path = require("path");
const { SITE_URL } = require("./content-utils");

const root = path.resolve(__dirname, "..");
const guideDataPath = path.join(root, "content", "body-guides.json");
const markerPositions = {
  neck: [180, 103],
  shoulder: [221, 150],
  lowback: [180, 274],
  hip: [215, 323],
  knee: [214, 444]
};

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlEscape(value) {
  return htmlEscape(value).replace(/'/g, "&apos;");
}

function readGuides() {
  return JSON.parse(fs.readFileSync(guideDataPath, "utf8"));
}

function articleText(article) {
  return [
    article?.title,
    article?.excerpt,
    article?.summary,
    ...(article?.categories || []).map((item) => item?.title),
    ...(article?.keywords || []),
    ...(article?.targetSymptoms || [])
  ].filter(Boolean).join(" ");
}

function relatedArticles(guide, articles) {
  return (articles || [])
    .map((article) => ({
      article,
      score: guide.articleTerms.reduce((total, term) => total + (articleText(article).includes(term) ? 1 : 0), 0)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || String(right.article.publishedAt || "").localeCompare(String(left.article.publishedAt || "")))
    .slice(0, 3)
    .map((item) => item.article);
}

function breadcrumb(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`
    }))
  };
}

function pageHead({ title, description, pathname, jsonLd, image = "" }) {
  const canonical = `${SITE_URL}${pathname}`;
  return `<meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(title)}</title>
    <meta name="description" content="${htmlEscape(description)}" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="${htmlEscape(canonical)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${htmlEscape(title)}" />
    <meta property="og:description" content="${htmlEscape(description)}" />
    <meta property="og:url" content="${htmlEscape(canonical)}" />
    ${image ? `<meta property="og:image" content="${htmlEscape(`${SITE_URL}${image}`)}" />` : ""}
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <script>window.__HEALTH_CHECK_SITE_URL__ = "__SITE_URL__";</script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=__GA_MEASUREMENT_ID__"></script>
    <script>window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};window.gtag("js",new Date());window.gtag("config","__GA_MEASUREMENT_ID__");</script>
    <link rel="stylesheet" href="/body-guide.css?v=access-growth-1" />`;
}

function siteHeader() {
  return `<header class="guide-site-header"><a class="guide-brand" href="/" aria-label="Health Check Lab ホーム"><span aria-hidden="true">H</span><strong>Health Check Lab</strong></a><nav aria-label="メインメニュー"><a href="/body-guide">身体から探す</a><a href="/body-check">セルフチェック</a><a href="/health-library">健康コラム</a></nav></header>`;
}

function siteFooter() {
  return `<footer class="guide-site-footer"><div><strong>Health Check Lab</strong><p>身体のサインを整理し、健康情報とセルフチェックをつなぐプラットフォームです。</p></div><nav aria-label="フッターメニュー"><a href="/body-check">体のセルフチェック</a><a href="/health-library">健康コラム</a><a href="/faq">よくある質問</a></nav></footer>`;
}

function bodyMapSvg(guide) {
  const [x, y] = markerPositions[guide.partId] || [180, 280];
  const title = `${guide.label}の位置を示す身体図`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560" role="img" aria-labelledby="title desc">
  <title id="title">${xmlEscape(title)}</title>
  <desc id="desc">全身のシルエット上で${xmlEscape(guide.label)}の位置を緑色の印で示しています。</desc>
  <rect width="360" height="560" fill="#f4f9f5" rx="24"/>
  <g fill="#dcebe2" stroke="#17633a" stroke-width="3">
    <ellipse cx="180" cy="64" rx="35" ry="42"/>
    <path d="M130 118 Q180 88 230 118 L247 300 Q220 328 180 332 Q140 328 113 300 Z"/>
    <path d="M126 127 Q91 173 76 284 Q72 305 92 310 Q108 312 116 291 L148 163 Z"/>
    <path d="M234 127 Q269 173 284 284 Q288 305 268 310 Q252 312 244 291 L212 163 Z"/>
    <path d="M143 318 L112 510 Q110 534 134 537 Q153 536 159 514 L181 342 Z"/>
    <path d="M217 318 L248 510 Q250 534 226 537 Q207 536 201 514 L179 342 Z"/>
  </g>
  <g aria-hidden="true">
    <circle cx="${x}" cy="${y}" r="24" fill="#34d399" opacity=".2"/>
    <circle cx="${x}" cy="${y}" r="12" fill="#17633a" stroke="#ffffff" stroke-width="5"/>
  </g>
  <text x="180" y="538" text-anchor="middle" fill="#17633a" font-family="system-ui,sans-serif" font-size="18" font-weight="700">${xmlEscape(guide.label)}</text>
</svg>`;
}

function overviewSvg(guides) {
  const marks = guides.map((guide) => {
    const [x, y] = markerPositions[guide.partId];
    return `<circle cx="${x}" cy="${y}" r="9" fill="#17633a" stroke="#ffffff" stroke-width="4"><title>${xmlEscape(guide.label)}</title></circle>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560" role="img" aria-labelledby="title desc"><title id="title">セルフチェック対応部位の身体図</title><desc id="desc">首、肩、腰、股関節、膝の位置を示す身体図です。</desc><rect width="360" height="560" fill="#f4f9f5" rx="24"/><g fill="#dcebe2" stroke="#17633a" stroke-width="3"><ellipse cx="180" cy="64" rx="35" ry="42"/><path d="M130 118 Q180 88 230 118 L247 300 Q220 328 180 332 Q140 328 113 300 Z"/><path d="M126 127 Q91 173 76 284 Q72 305 92 310 Q108 312 116 291 L148 163 Z"/><path d="M234 127 Q269 173 284 284 Q288 305 268 310 Q252 312 244 291 L212 163 Z"/><path d="M143 318 L112 510 Q110 534 134 537 Q153 536 159 514 L181 342 Z"/><path d="M217 318 L248 510 Q250 534 226 537 Q207 536 201 514 L179 342 Z"/></g>${marks}</svg>`;
}

function guideCards(guides, currentSlug = "") {
  return guides.filter((guide) => guide.slug !== currentSlug).map((guide) => `<a class="body-guide-card" href="/body-check/${guide.slug}"><span>${htmlEscape(guide.label)}</span><strong>${htmlEscape(guide.hero)}</strong><small>${htmlEscape(guide.lead)}</small><b>セルフチェックを見る →</b></a>`).join("");
}

function relatedCards(articles, guide) {
  if (!articles.length) return `<a class="body-guide-text-link" href="/health-library?search=${encodeURIComponent(guide.label)}">${htmlEscape(guide.label)}に関連する記事を探す →</a>`;
  return articles.map((article) => `<a class="body-guide-article" href="/health-library/${encodeURIComponent(article.slug)}"><span>${htmlEscape((article.categories || [])[0]?.title || "健康情報")}</span><strong>${htmlEscape(article.title)}</strong><b>記事を読む →</b></a>`).join("");
}

function guidePage(guide, guides, articles) {
  const pathname = `/body-check/${guide.slug}`;
  const imagePath = `/assets/body-guide/body-map-${guide.slug}.svg`;
  const related = relatedArticles(guide, articles);
  const schema = [
    { "@context": "https://schema.org", "@type": "WebPage", name: guide.title, description: guide.description, url: `${SITE_URL}${pathname}`, isPartOf: { "@type": "WebSite", name: "Health Check Lab", url: SITE_URL } },
    breadcrumb([{ name: "トップ", path: "/" }, { name: "身体から探す", path: "/body-guide" }, { name: `${guide.label}のセルフチェック`, path: pathname }])
  ];
  return `<!doctype html><html lang="ja"><head>${pageHead({ title: `${guide.title} | Health Check Lab`, description: guide.description, pathname, jsonLd: schema, image: imagePath })}</head><body data-diagnosis-landing="${htmlEscape(guide.slug)}">${siteHeader()}<main>
    <section class="body-guide-hero"><div class="body-guide-inner body-guide-hero-grid"><div><nav class="body-guide-breadcrumb" aria-label="パンくず"><a href="/">トップ</a><span>›</span><a href="/body-guide">身体から探す</a><span>›</span><span>${htmlEscape(guide.label)}</span></nav><p class="body-guide-kicker">部位・左右・動作から整理</p><h1>${htmlEscape(guide.hero)}</h1><p>${htmlEscape(guide.lead)}</p><div class="body-guide-actions"><a class="body-guide-primary" href="/body-check?part=${encodeURIComponent(guide.partId)}&from=${encodeURIComponent(`body-guide-${guide.slug}`)}" data-diagnosis-start>この部位を選んで診断を始める</a><small>${htmlEscape(guide.label)}を選択した状態でセルフチェックを開きます。</small></div></div><figure class="body-guide-visual"><img src="${imagePath}" alt="${htmlEscape(`${guide.label}の位置を示す身体図`)}" width="360" height="560" loading="eager" decoding="async" fetchpriority="high" /><figcaption>${htmlEscape(guide.label)}の位置を確認してから、左右や気になる動作を選びます。</figcaption></figure></div></section>
    <section class="body-guide-band body-guide-band-light"><div class="body-guide-inner"><h2>セルフチェックで確認すること</h2><ol class="body-guide-steps"><li><span>1</span><div><strong>どこが気になるか</strong><p>${htmlEscape(guide.label)}と、近くで気になる部位を整理します。</p></div></li><li><span>2</span><div><strong>右・左・両側</strong><p>左右差や中央など、気になる位置を選びます。</p></div></li><li><span>3</span><div><strong>どの動作で気になるか</strong><p>実際の動作と感じ方から候補を整理します。</p></div></li></ol></div></section>
    <section class="body-guide-band"><div class="body-guide-inner body-guide-two-column"><div><h2>${htmlEscape(guide.label)}が気になる動作</h2><p>同じ部位でも、気になる動作によって関係する可能性がある筋肉は変わります。</p><ul class="body-guide-chip-list">${guide.movements.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul></div><div><h2>検索するときの手がかり</h2><p>左右、姿勢、時間帯、動作を一緒に整理すると、自分の状態を振り返りやすくなります。</p><ul class="body-guide-intent-list">${guide.searchIntent.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul></div></div></section>
    <section class="body-guide-band body-guide-band-light"><div class="body-guide-inner"><h2>負担に関係する可能性がある筋肉</h2><p>以下は代表例です。実際のセルフチェックでは、選んだ動作と感じ方を組み合わせて候補を表示します。</p><div class="body-guide-muscles">${guide.muscles.map((item) => `<article><strong>${htmlEscape(item.name)}</strong><p>${htmlEscape(item.text)}</p></article>`).join("")}</div></div></section>
    <section class="body-guide-band"><div class="body-guide-inner"><h2>診断結果で分かること</h2><div class="body-guide-result-list"><p><strong>選択した部位と左右</strong><span>身体図上で位置を確認できます。</span></p><p><strong>関連する可能性がある筋肉</strong><span>回答との関係とともに候補を表示します。</span></p><p><strong>前回との変化</strong><span>端末へ記録すると、同じ部位の結果を比較できます。</span></p></div><a class="body-guide-primary compact" href="/body-check?part=${encodeURIComponent(guide.partId)}&from=${encodeURIComponent(`body-guide-${guide.slug}`)}" data-diagnosis-start>${htmlEscape(guide.label)}のセルフチェックを始める</a></div></section>
    <section class="body-guide-band body-guide-band-light"><div class="body-guide-inner"><h2>${htmlEscape(guide.label)}に関連する健康記事</h2><div class="body-guide-articles">${relatedCards(related, guide)}</div></div></section>
    <section class="body-guide-band"><div class="body-guide-inner"><h2>ほかの部位から探す</h2><div class="body-guide-grid compact-grid">${guideCards(guides, guide.slug)}</div><aside class="body-guide-disclaimer"><strong>医療診断ではありません</strong><p>このセルフチェックは、回答から身体の状態を整理するための参考情報です。強い痛み、しびれ、麻痺、発熱、外傷後の症状、急な悪化がある場合は医療機関へ相談してください。</p></aside></div></section>
  </main>${siteFooter()}<script src="/analytics.js?v=analytics-1" defer></script><script src="/body-guide.js?v=access-growth-1" defer></script></body></html>`;
}

function hubPage(guides) {
  const pathname = "/body-guide";
  const description = "身体のどこが気になるかを選び、部位別のセルフチェックから関連する可能性がある筋肉を確認できます。";
  const imagePath = "/assets/body-guide/body-map-overview.svg";
  const schema = [
    { "@context": "https://schema.org", "@type": "CollectionPage", name: "身体から探す", description, url: `${SITE_URL}${pathname}` },
    breadcrumb([{ name: "トップ", path: "/" }, { name: "身体から探す", path: pathname }])
  ];
  return `<!doctype html><html lang="ja"><head>${pageHead({ title: "身体から探す｜部位別セルフチェック | Health Check Lab", description, pathname, jsonLd: schema, image: imagePath })}</head><body data-body-guide>${siteHeader()}<main><section class="body-guide-hero"><div class="body-guide-inner body-guide-hero-grid"><div><nav class="body-guide-breadcrumb" aria-label="パンくず"><a href="/">トップ</a><span>›</span><span>身体から探す</span></nav><p class="body-guide-kicker">身体の場所からセルフチェックへ</p><h1>身体のどこが気になりますか？</h1><p>気になる部位を選ぶと、左右や動作から関連する可能性がある筋肉を確認できます。</p><a class="body-guide-primary compact" href="/body-check">全身から選んで診断する</a></div><figure class="body-guide-visual"><img src="${imagePath}" alt="セルフチェックに対応する首、肩、腰、股関節、膝を示す身体図" width="360" height="560" loading="eager" decoding="async" fetchpriority="high" /><figcaption>現在の診断ロジックで詳しく確認できる主要部位です。</figcaption></figure></div></section><section class="body-guide-band body-guide-band-light"><div class="body-guide-inner"><h2>部位を選ぶ</h2><p>まずは、いちばん気になる場所から選んでください。</p><div class="body-guide-grid">${guideCards(guides)}</div></div></section><section class="body-guide-band"><div class="body-guide-inner body-guide-two-column"><div><h2>入力は診断結果の前に完了</h2><p>部位、気になる動作、感じ方、左右などを順番に選びます。同じ情報を入口ページで入力し直す必要はありません。</p></div><div><h2>結果を次回と比較</h2><p>結果を端末へ記録すると、同じ部位の前回結果と比較できます。ログインは不要です。</p></div></div></section></main>${siteFooter()}<script src="/analytics.js?v=analytics-1" defer></script><script src="/body-guide.js?v=access-growth-1" defer></script></body></html>`;
}

function readSitemap(dist) {
  const file = path.join(dist, "sitemap.xml");
  if (!fs.existsSync(file)) return [];
  const xml = fs.readFileSync(file, "utf8");
  return Array.from(xml.matchAll(/<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?\s*<\/url>/g)).map((match) => ({ loc: match[1], lastmod: match[2] || "" }));
}

function writeSitemap(dist, entries) {
  const seen = new Set();
  const body = entries.filter((entry) => entry?.loc && !seen.has(entry.loc) && seen.add(entry.loc)).map((entry) => `  <url><loc>${xmlEscape(entry.loc)}</loc>${entry.lastmod ? `<lastmod>${xmlEscape(entry.lastmod)}</lastmod>` : ""}</url>`).join("\n");
  fs.writeFileSync(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, "utf8");
}

function generateBodyGuideAssets({ dist, articles = [] }) {
  const guides = readGuides();
  const assetDir = path.join(dist, "assets", "body-guide");
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(assetDir, "body-map-overview.svg"), overviewSvg(guides), "utf8");

  guides.forEach((guide) => {
    const pageDir = path.join(dist, "body-check", guide.slug);
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "index.html"), guidePage(guide, guides, articles), "utf8");
    fs.writeFileSync(path.join(assetDir, `body-map-${guide.slug}.svg`), bodyMapSvg(guide), "utf8");
  });

  const hubDir = path.join(dist, "body-guide");
  fs.mkdirSync(hubDir, { recursive: true });
  fs.writeFileSync(path.join(hubDir, "index.html"), hubPage(guides), "utf8");

  const lastmod = new Date().toISOString().slice(0, 10);
  const sitemapEntries = readSitemap(dist);
  sitemapEntries.push({ loc: `${SITE_URL}/body-guide`, lastmod });
  guides.forEach((guide) => sitemapEntries.push({ loc: `${SITE_URL}/body-check/${guide.slug}`, lastmod }));
  writeSitemap(dist, sitemapEntries);
  return { guideCount: guides.length, paths: ["/body-guide", ...guides.map((guide) => `/body-check/${guide.slug}`)] };
}

module.exports = { generateBodyGuideAssets, readGuides, relatedArticles };
