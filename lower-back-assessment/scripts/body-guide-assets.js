const fs = require("fs");
const path = require("path");
const { SITE_URL } = require("./content-utils");

const root = path.resolve(__dirname, "..");
const guideDataPath = path.join(root, "content", "body-guides.json");
const BODY_GUIDE_HUB_PATH = "/body-guide/";
const bodySelectorAssetNames = [
  "body-selector-front-480.webp",
  "body-selector-front-768.webp",
  "body-selector-back-480.webp",
  "body-selector-back-768.webp"
];

function bodyGuidePath(slug) {
  return `/body-check/${slug}/`;
}

// Coordinates are percentages of the shared 2:3 front/back image canvas.
// Labels stay outside the body while guide lines point to anatomically relevant markers.
const bodySelectorParts = [
  {
    partId: "neck",
    slug: "neck",
    label: "首",
    views: {
      front: { side: "right", labelY: 14.8, line: [72, 14.8, 50, 14.8], markers: [[50, 14.8]] },
      back: { side: "right", labelY: 14.6, line: [72, 14.6, 50, 14.6], markers: [[50, 14.6]] }
    }
  },
  {
    partId: "shoulder",
    slug: "shoulder",
    label: "肩",
    views: {
      front: { side: "left", labelY: 19.3, line: [28, 19.3, 36.8, 19.3], markers: [[36.8, 19.3], [63.2, 19.3]] },
      back: { side: "left", labelY: 19.7, line: [28, 19.7, 36.5, 19.7], markers: [[36.5, 19.7], [63.5, 19.7]] }
    }
  },
  {
    partId: "lowback",
    slug: "lower-back",
    label: "腰",
    views: {
      back: { side: "right", labelY: 36.5, line: [72, 36.5, 50, 36.5], markers: [[50, 36.5]] }
    }
  },
  {
    partId: "hip",
    slug: "hip",
    label: "股関節",
    views: {
      front: { side: "left", labelY: 47.5, line: [28, 47.5, 40.5, 47.5], markers: [[40.5, 47.5], [59.5, 47.5]] },
      back: { side: "left", labelY: 46.8, line: [28, 46.8, 40, 46.8], markers: [[40, 46.8], [60, 46.8]] }
    }
  },
  {
    partId: "knee",
    slug: "knee",
    label: "膝",
    views: {
      front: { side: "right", labelY: 64.8, line: [72, 64.8, 57.6, 64.8], markers: [[42.4, 64.8], [57.6, 64.8]] },
      back: { side: "right", labelY: 65.2, line: [72, 65.2, 57.6, 65.2], markers: [[42.4, 65.2], [57.6, 65.2]] }
    }
  }
];

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
    <script src="/analytics-bootstrap.js?v=local-safe-1"></script>
    <link rel="stylesheet" href="/body-guide.css?v=body-selector-3" />`;
}

function siteHeader() {
  return `<header class="guide-site-header"><a class="guide-brand" href="/" aria-label="Health Check Lab ホーム"><span aria-hidden="true">H</span><strong>Health Check Lab</strong></a><nav aria-label="メインメニュー"><a href="${BODY_GUIDE_HUB_PATH}">身体から探す</a><a href="/body-check">セルフチェック</a><a href="/health-library">健康コラム</a></nav></header>`;
}

function siteFooter() {
  return `<footer class="guide-site-footer"><div><strong>Health Check Lab</strong><p>身体のサインを整理し、健康情報とセルフチェックをつなぐプラットフォームです。</p></div><nav aria-label="フッターメニュー"><a href="/body-check">体のセルフチェック</a><a href="/health-library">健康コラム</a><a href="/faq">よくある質問</a></nav></footer>`;
}

function selectorImage(view, initialView) {
  const alt = view === "front"
    ? "首、肩、股関節、膝を選べる正面の人体図"
    : "首、肩、腰、股関節、膝を選べる背面の人体図";
  const source480 = `/assets/body-guide/body-selector-${view}-480.webp`;
  const source768 = `/assets/body-guide/body-selector-${view}-768.webp`;
  const visible = view === initialView;
  return `<img class="body-selector-image" data-body-image="${view}" alt="${alt}" width="768" height="1152" decoding="async" sizes="(max-width: 620px) 250px, (max-width: 900px) 290px, 340px" ${visible ? `src="${source480}" srcset="${source480} 480w, ${source768} 768w" fetchpriority="high"` : `data-src="${source480}" data-srcset="${source480} 480w, ${source768} 768w" loading="lazy"`} />`;
}

function selectorHotspots(guides, view, selectedPartId) {
  return bodySelectorParts.filter((part) => part.views[view]).map((part) => {
    const guide = guides.find((item) => item.partId === part.partId);
    if (!guide) return "";
    const position = part.views[view];
    const selected = part.partId === selectedPartId;
    const [startX, startY, endX, endY] = position.line;
    const labelStyle = `--selector-label-y:${position.labelY}%;`;
    const markers = position.markers.map(([x, y]) => `<span class="body-selector-marker" style="--selector-marker-x:${x}%;--selector-marker-y:${y}%;" aria-hidden="true"></span>`).join("");
    return `<div class="body-selector-part body-selector-part-${position.side}" data-selector-part="${part.partId}"${selected ? ` data-selected="true"` : ""}><a class="body-selector-label-link" href="${bodyGuidePath(guide.slug)}" data-guide-link style="${labelStyle}" aria-label="${htmlEscape(`${part.label}のセルフチェックを見る`)}"${selected ? ` aria-current="page"` : ""}><span>${htmlEscape(part.label)}</span>${selected ? "<small>選択中</small>" : ""}</a><svg class="body-selector-guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M ${startX} ${startY} L ${endX} ${endY}" vector-effect="non-scaling-stroke" /></svg>${markers}</div>`;
  }).join("");
}

function bodySelector(guides, selectedPartId = "") {
  const initialView = selectedPartId === "lowback" ? "back" : "front";
  const fallbackLinks = guides.map((guide) => {
    const selected = guide.partId === selectedPartId;
    return `<a href="${bodyGuidePath(guide.slug)}" data-guide-link${selected ? ` aria-current="page"` : ""}>${htmlEscape(guide.label)}${selected ? "（選択中）" : ""}</a>`;
  }).join("");
  const viewPanel = (view) => `<div class="body-selector-view" data-body-view-panel="${view}"${view === initialView ? "" : " hidden"}><div class="body-selector-figure">${selectorImage(view, initialView)}${selectorHotspots(guides, view, selectedPartId)}</div></div>`;
  return `<section class="body-selector" data-body-selector data-initial-view="${initialView}" aria-labelledby="body-selector-title"><div class="body-selector-toolbar"><strong id="body-selector-title">人体図から部位を選ぶ</strong><div class="body-selector-switch" role="group" aria-label="人体図の向き"><button type="button" data-body-view-button="front" aria-pressed="${initialView === "front"}">正面</button><button type="button" data-body-view-button="back" aria-pressed="${initialView === "back"}">背面</button></div></div><div class="body-selector-canvas">${viewPanel("front")}${viewPanel("back")}</div><p class="body-selector-help">人体の外側にある部位ラベルを選んでください。腰は背面で確認できます。</p><nav class="body-selector-fallback" aria-label="テキストで部位を選ぶ"><span>テキストで選ぶ</span><div>${fallbackLinks}</div></nav></section>`;
}

function guideCards(guides, currentSlug = "") {
  return guides.filter((guide) => guide.slug !== currentSlug).map((guide) => `<a class="body-guide-card" href="${bodyGuidePath(guide.slug)}" data-guide-link><span>${htmlEscape(guide.label)}</span><strong>${htmlEscape(guide.hero)}</strong><small>${htmlEscape(guide.lead)}</small><b>セルフチェックを見る →</b></a>`).join("");
}

function relatedCards(articles, guide) {
  if (!articles.length) return `<a class="body-guide-text-link" href="/health-library?search=${encodeURIComponent(guide.label)}">${htmlEscape(guide.label)}に関連する記事を探す →</a>`;
  return articles.map((article) => `<a class="body-guide-article" href="/health-library/${encodeURIComponent(article.slug)}"><span>${htmlEscape((article.categories || [])[0]?.title || "健康情報")}</span><strong>${htmlEscape(article.title)}</strong><b>記事を読む →</b></a>`).join("");
}

function guidePage(guide, guides, articles) {
  const pathname = bodyGuidePath(guide.slug);
  const imagePath = guide.partId === "lowback" ? "/assets/body-guide/body-selector-back-768.webp" : "/assets/body-guide/body-selector-front-768.webp";
  const related = relatedArticles(guide, articles);
  const schema = [
    { "@context": "https://schema.org", "@type": "WebPage", name: guide.title, description: guide.description, url: `${SITE_URL}${pathname}`, isPartOf: { "@type": "WebSite", name: "Health Check Lab", url: SITE_URL } },
    breadcrumb([{ name: "トップ", path: "/" }, { name: "身体から探す", path: BODY_GUIDE_HUB_PATH }, { name: `${guide.label}のセルフチェック`, path: pathname }])
  ];
  return `<!doctype html><html lang="ja"><head>${pageHead({ title: `${guide.title} | Health Check Lab`, description: guide.description, pathname, jsonLd: schema, image: imagePath })}</head><body data-diagnosis-landing="${htmlEscape(guide.slug)}">${siteHeader()}<main>
    <section class="body-guide-hero"><div class="body-guide-inner body-guide-hero-layout"><nav class="body-guide-breadcrumb" aria-label="パンくず"><a href="/">トップ</a><span>›</span><a href="${BODY_GUIDE_HUB_PATH}">身体から探す</a><span>›</span><span>${htmlEscape(guide.label)}</span></nav><div class="body-guide-copy"><div class="body-guide-intro"><p class="body-guide-kicker">部位・左右・動作から整理</p><h1>${htmlEscape(guide.hero)}</h1><p>${htmlEscape(guide.lead)}</p></div><div class="body-guide-actions"><a class="body-guide-primary" href="/body-check?part=${encodeURIComponent(guide.partId)}&from=${encodeURIComponent(`body-guide-${guide.slug}`)}" data-diagnosis-start>${htmlEscape(guide.label)}のセルフチェックを始める</a><small>${htmlEscape(guide.label)}を選択した状態でセルフチェックを開きます。</small></div></div>${bodySelector(guides, guide.partId)}</div></section>
    <section class="body-guide-band body-guide-band-light"><div class="body-guide-inner"><h2>セルフチェックで確認すること</h2><ol class="body-guide-steps"><li><span>1</span><div><strong>どこが気になるか</strong><p>${htmlEscape(guide.label)}と、近くで気になる部位を整理します。</p></div></li><li><span>2</span><div><strong>右・左・両側</strong><p>左右差や中央など、気になる位置を選びます。</p></div></li><li><span>3</span><div><strong>どの動作で気になるか</strong><p>実際の動作と感じ方から候補を整理します。</p></div></li></ol></div></section>
    <section class="body-guide-band"><div class="body-guide-inner body-guide-two-column"><div><h2>${htmlEscape(guide.label)}が気になる動作</h2><p>同じ部位でも、気になる動作によって関係する可能性がある筋肉は変わります。</p><ul class="body-guide-chip-list">${guide.movements.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul></div><div><h2>検索するときの手がかり</h2><p>左右、姿勢、時間帯、動作を一緒に整理すると、自分の状態を振り返りやすくなります。</p><ul class="body-guide-intent-list">${guide.searchIntent.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ul></div></div></section>
    <section class="body-guide-band body-guide-band-light"><div class="body-guide-inner"><h2>負担に関係する可能性がある筋肉</h2><p>以下は代表例です。実際のセルフチェックでは、選んだ動作と感じ方を組み合わせて候補を表示します。</p><div class="body-guide-muscles">${guide.muscles.map((item) => `<article><strong>${htmlEscape(item.name)}</strong><p>${htmlEscape(item.text)}</p></article>`).join("")}</div></div></section>
    <section class="body-guide-band"><div class="body-guide-inner"><h2>診断結果で分かること</h2><div class="body-guide-result-list"><p><strong>選択した部位と左右</strong><span>身体図上で位置を確認できます。</span></p><p><strong>関連する可能性がある筋肉</strong><span>回答との関係とともに候補を表示します。</span></p><p><strong>前回との変化</strong><span>端末へ記録すると、同じ部位の結果を比較できます。</span></p></div><a class="body-guide-primary compact" href="/body-check?part=${encodeURIComponent(guide.partId)}&from=${encodeURIComponent(`body-guide-${guide.slug}`)}" data-diagnosis-start>${htmlEscape(guide.label)}のセルフチェックを始める</a></div></section>
    <section class="body-guide-band body-guide-band-light"><div class="body-guide-inner"><h2>${htmlEscape(guide.label)}に関連する健康記事</h2><div class="body-guide-articles">${relatedCards(related, guide)}</div></div></section>
    <section class="body-guide-band"><div class="body-guide-inner"><h2>ほかの部位から探す</h2><div class="body-guide-grid compact-grid">${guideCards(guides, guide.slug)}</div><aside class="body-guide-disclaimer"><strong>医療診断ではありません</strong><p>このセルフチェックは、回答から身体の状態を整理するための参考情報です。強い痛み、しびれ、麻痺、発熱、外傷後の症状、急な悪化がある場合は医療機関へ相談してください。</p></aside></div></section>
  </main>${siteFooter()}<script src="/analytics.js?v=analytics-1" defer></script><script src="/body-guide.js?v=body-selector-2" defer></script></body></html>`;
}

function hubPage(guides) {
  const pathname = BODY_GUIDE_HUB_PATH;
  const description = "身体のどこが気になるかを選び、部位別のセルフチェックから関連する可能性がある筋肉を確認できます。";
  const imagePath = "/assets/body-guide/body-selector-front-768.webp";
  const schema = [
    { "@context": "https://schema.org", "@type": "CollectionPage", name: "身体から探す", description, url: `${SITE_URL}${pathname}` },
    breadcrumb([{ name: "トップ", path: "/" }, { name: "身体から探す", path: pathname }])
  ];
  return `<!doctype html><html lang="ja"><head>${pageHead({ title: "身体から探す｜部位別セルフチェック | Health Check Lab", description, pathname, jsonLd: schema, image: imagePath })}</head><body data-body-guide>${siteHeader()}<main><section class="body-guide-hero"><div class="body-guide-inner body-guide-hero-layout"><nav class="body-guide-breadcrumb" aria-label="パンくず"><a href="/">トップ</a><span>›</span><span>身体から探す</span></nav><div class="body-guide-copy"><div class="body-guide-intro"><p class="body-guide-kicker">身体の場所からセルフチェックへ</p><h1>身体のどこが気になりますか？</h1><p>気になる部位を選ぶと、左右や動作から関連する可能性がある筋肉を確認できます。</p></div><div class="body-guide-actions"><a class="body-guide-primary" href="/body-check">全身から選んで診断する</a><small>図を操作できない場合も、下のテキストリンクから部位を選べます。</small></div></div>${bodySelector(guides)}</div></section><section class="body-guide-band body-guide-band-light"><div class="body-guide-inner"><h2>部位を選ぶ</h2><p>まずは、いちばん気になる場所から選んでください。</p><div class="body-guide-grid">${guideCards(guides)}</div></div></section><section class="body-guide-band"><div class="body-guide-inner body-guide-two-column"><div><h2>入力は診断結果の前に完了</h2><p>部位、気になる動作、感じ方、左右などを順番に選びます。同じ情報を入口ページで入力し直す必要はありません。</p></div><div><h2>結果を次回と比較</h2><p>結果を端末へ記録すると、同じ部位の前回結果と比較できます。ログインは不要です。</p></div></div></section></main>${siteFooter()}<script src="/analytics.js?v=analytics-1" defer></script><script src="/body-guide.js?v=body-selector-2" defer></script></body></html>`;
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

function copyBodySelectorAssets(assetDir) {
  const sourceDir = path.join(root, "assets", "body-guide");
  bodySelectorAssetNames.forEach((name) => {
    const source = path.join(sourceDir, name);
    if (!fs.existsSync(source)) throw new Error(`Body selector asset is missing: ${name}`);
    fs.copyFileSync(source, path.join(assetDir, name));
  });
}

function generateBodyGuideAssets({ dist, articles = [] }) {
  const guides = readGuides();
  const assetDir = path.join(dist, "assets", "body-guide");
  fs.mkdirSync(assetDir, { recursive: true });
  copyBodySelectorAssets(assetDir);

  guides.forEach((guide) => {
    const pageDir = path.join(dist, "body-check", guide.slug);
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, "index.html"), guidePage(guide, guides, articles), "utf8");
  });

  const hubDir = path.join(dist, "body-guide");
  fs.mkdirSync(hubDir, { recursive: true });
  fs.writeFileSync(path.join(hubDir, "index.html"), hubPage(guides), "utf8");

  const canonicalPaths = [BODY_GUIDE_HUB_PATH, ...guides.map((guide) => bodyGuidePath(guide.slug))];
  const managedUrls = new Set(canonicalPaths.flatMap((pathname) => [
    `${SITE_URL}${pathname}`,
    `${SITE_URL}${pathname.replace(/\/$/, "")}`
  ]));
  const sitemapEntries = readSitemap(dist).filter((entry) => !managedUrls.has(entry.loc));
  canonicalPaths.forEach((pathname) => sitemapEntries.push({ loc: `${SITE_URL}${pathname}` }));
  writeSitemap(dist, sitemapEntries);
  return { guideCount: guides.length, paths: canonicalPaths };
}

module.exports = { BODY_GUIDE_HUB_PATH, bodyGuidePath, bodySelectorParts, generateBodyGuideAssets, readGuides, relatedArticles };
