const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SITE_URL } = require("./content-utils");
const { BODY_GUIDE_HUB_PATH, bodyGuidePath, bodySelectorParts, generateBodyGuideAssets, readGuides, relatedArticles } = require("./body-guide-assets");
const { diagnosisEntry } = require("./sanity-site-assets");
const root = path.resolve(__dirname, "..");

const guides = readGuides();
assert.strictEqual(guides.length, 5, "Phase 1 should publish five supported body-part entries.");
assert.deepStrictEqual(guides.map((guide) => guide.partId), ["lowback", "neck", "shoulder", "hip", "knee"]);
assert.deepStrictEqual(new Set(bodySelectorParts.map((part) => part.partId)), new Set(guides.map((guide) => guide.partId)));
assert.deepStrictEqual(bodySelectorParts.map(({ partId, slug }) => [partId, slug]), [
  ["neck", "neck"],
  ["shoulder", "shoulder"],
  ["lowback", "lower-back"],
  ["hip", "hip"],
  ["knee", "knee"]
]);
assert.deepStrictEqual(Object.keys(bodySelectorParts.find((part) => part.partId === "lowback").views), ["back"], "The lower-back control must only appear on the rear view.");
bodySelectorParts.forEach((part) => {
  Object.values(part.views).forEach((position) => {
    assert(["left", "right"].includes(position.side));
    assert(position.labelY >= 0 && position.labelY <= 100);
    assert.strictEqual(position.line.length, 4);
    position.line.forEach((coordinate) => assert(coordinate >= 0 && coordinate <= 100));
    assert(position.markers.length >= 1);
    position.markers.flat().forEach((coordinate) => assert(coordinate >= 0 && coordinate <= 100));
    assert.strictEqual(position.line[1], position.line[3], "Guide lines should not cross other body-part rows.");
  });
});
assert.strictEqual(bodySelectorParts.find((part) => part.partId === "shoulder").views.front.markers.length, 2);
assert.strictEqual(bodySelectorParts.find((part) => part.partId === "hip").views.front.markers.length, 2);
assert.strictEqual(bodySelectorParts.find((part) => part.partId === "knee").views.front.markers.length, 2);

const selectorPart = (partId) => bodySelectorParts.find((part) => part.partId === partId);
const assertMarkerRange = (partId, view, { minY, maxY, minOuterX, maxOuterX }) => {
  const markers = selectorPart(partId).views[view].markers;
  markers.forEach(([x, y]) => {
    assert(y >= minY && y <= maxY, `${partId} ${view} marker must remain on its anatomical row.`);
    assert(x >= minOuterX && x <= maxOuterX, `${partId} ${view} marker must remain within its anatomical width.`);
  });
};

["front", "back"].forEach((view) => {
  assertMarkerRange("neck", view, { minY: 13, maxY: 16, minOuterX: 49, maxOuterX: 51 });
  assertMarkerRange("shoulder", view, { minY: 18, maxY: 21, minOuterX: 35, maxOuterX: 65 });
  assertMarkerRange("hip", view, { minY: 45, maxY: 49, minOuterX: 39, maxOuterX: 61 });
  assertMarkerRange("knee", view, { minY: 63, maxY: 67, minOuterX: 41, maxOuterX: 59 });
});
assertMarkerRange("lowback", "back", { minY: 35, maxY: 39, minOuterX: 49, maxOuterX: 51 });

const sampleArticles = [
  { slug: "lower-back-example", title: "腰と腸腰筋の記事", publishedAt: "2026-09-01", categories: [{ title: "慢性痛" }] },
  { slug: "low-back-care", title: "腰痛で病院へ行くべき？", publishedAt: "2026-09-24", categories: [{ title: "慢性痛" }] },
  { slug: "neck-example", title: "首こりと生活習慣の記事", publishedAt: "2026-09-02", categories: [{ title: "健康情報" }] },
  { slug: "side-sleep-shoulder", title: "横向きで寝ると肩が痛い", summary: "夜間に気になる肩の状態を整理します。", publishedAt: "2026-09-24", categories: [{ title: "慢性痛" }] },
  { slug: "knee-stairs", title: "階段で膝が痛いとき", summary: "立ち上がりや曲げ伸ばしとの違いを整理します。", publishedAt: "2026-09-24", categories: [{ title: "膝" }] },
  { slug: "unrelated-newest", title: "耳鳴りと自律神経", summary: "生活習慣と鍼灸について整理します。", publishedAt: "2026-09-25", categories: [{ title: "自律神経" }] }
];
assert(relatedArticles(guides[0], sampleArticles).some((article) => article.slug === "lower-back-example"));
assert(relatedArticles(guides[0], sampleArticles).some((article) => article.slug === "low-back-care"), "The lower-back guide must link to the consultation guidance article.");
assert(relatedArticles(guides.find((guide) => guide.slug === "shoulder"), sampleArticles).some((article) => article.slug === "side-sleep-shoulder"), "The shoulder guide must link to the specific side-sleep shoulder article.");
assert(relatedArticles(guides.find((guide) => guide.slug === "knee"), sampleArticles).some((article) => article.slug === "knee-stairs"), "The knee guide must link to the movement-specific knee article.");
assert(!relatedArticles(guides.find((guide) => guide.slug === "knee"), sampleArticles).some((article) => article.slug === "unrelated-newest"), "Generic lifestyle terms must not pull unrelated articles into the knee guide.");
assert.deepStrictEqual(diagnosisEntry({ title: "肩こりの原因", keywords: ["腰痛"] }), { href: "/body-check/shoulder/", label: "肩のセルフチェックへ" });
assert.deepStrictEqual(diagnosisEntry({ title: "膝痛と生活習慣" }), { href: "/body-check/knee/", label: "膝のセルフチェックへ" });

const trackingSource = fs.readFileSync(path.join(root, "body-guide.js"), "utf8");
["diagnosis_landing_view", "diagnosis_landing_start", "body_guide_view", "body_guide_select"].forEach((eventName) => {
  assert(trackingSource.includes(`\"${eventName}\"`), `${eventName} tracking is missing.`);
});
["symptom", "muscle", "pain_score", "health_data"].forEach((sensitiveKey) => {
  assert(!trackingSource.includes(sensitiveKey), `${sensitiveKey} must not be included in body-guide analytics.`);
});

const dist = fs.mkdtempSync(path.join(os.tmpdir(), "hcl-body-guide-"));
fs.writeFileSync(path.join(dist, "sitemap.xml"), `<?xml version="1.0"?><urlset><url><loc>${SITE_URL}</loc></url><url><loc>${SITE_URL}/health-library</loc><lastmod>2026-09-01</lastmod></url><url><loc>${SITE_URL}/body-guide</loc><lastmod>2026-09-23</lastmod></url><url><loc>${SITE_URL}/body-check/neck/</loc><lastmod>2026-09-23</lastmod></url></urlset>`, "utf8");
const result = generateBodyGuideAssets({ dist, articles: sampleArticles });

assert.strictEqual(result.guideCount, 5);
assert.deepStrictEqual(result.paths, [BODY_GUIDE_HUB_PATH, ...guides.map((guide) => bodyGuidePath(guide.slug))]);
const hubHtml = fs.readFileSync(path.join(dist, "body-guide", "index.html"), "utf8");
assert(hubHtml.includes('/analytics-bootstrap.js?v=local-safe-1'));
assert(!hubHtml.includes('<script async src="https://www.googletagmanager.com/gtag/js'));
assert(hubHtml.includes("data-body-selector"));
assert(hubHtml.includes("data-body-view-button=\"front\""));
assert(hubHtml.includes("data-body-view-button=\"back\""));
assert(hubHtml.includes("body-selector-label-link"));
assert(hubHtml.includes("body-selector-guide"));
assert(hubHtml.includes("body-selector-marker"));
assert(hubHtml.includes("body-selector-front-480.webp"));
assert(hubHtml.includes("data-src=\"/assets/body-guide/body-selector-back-480.webp\""));
assert(!hubHtml.includes("body-map-overview.svg"));
assert(!hubHtml.includes("--selector-width"));
assert(!hubHtml.includes("--selector-height"));
assert.strictEqual((hubHtml.match(/<link rel="canonical"/g) || []).length, 1);
assert(hubHtml.includes(`<link rel="canonical" href="${SITE_URL}${BODY_GUIDE_HUB_PATH}"`));
assert(hubHtml.includes(`<meta property="og:url" content="${SITE_URL}${BODY_GUIDE_HUB_PATH}"`));
assert(hubHtml.includes(`"url":"${SITE_URL}${BODY_GUIDE_HUB_PATH}"`));
guides.forEach((guide) => {
  assert(hubHtml.includes(`href="${bodyGuidePath(guide.slug)}"`));
  assert(!hubHtml.includes(`href="${bodyGuidePath(guide.slug).replace(/\/$/, "")}"`));
});
["front", "back"].forEach((view) => [480, 768].forEach((width) => {
  assert(fs.existsSync(path.join(dist, "assets", "body-guide", `body-selector-${view}-${width}.webp`)));
}));
["front", "back"].forEach((view) => {
  assert(fs.existsSync(path.join(dist, "assets", "body-guide", `body-muscles-${view}-1536.png`)), `Missing generated muscle body asset: ${view}`);
});
assert(fs.existsSync(path.join(dist, "assets", "body-guide", "body-muscles-front-face-1536.png")), "Missing generated front muscle body with facial features.");
guides.forEach((guide) => {
  const html = fs.readFileSync(path.join(dist, "body-check", guide.slug, "index.html"), "utf8");
  const pathname = bodyGuidePath(guide.slug);
  assert.strictEqual((html.match(/<link rel="canonical"/g) || []).length, 1);
  assert(html.includes(`<link rel="canonical" href="${SITE_URL}${pathname}"`));
  assert(html.includes(`<meta property="og:url" content="${SITE_URL}${pathname}"`));
  assert(html.includes(`"url":"${SITE_URL}${pathname}"`));
  assert(html.includes(`"item":"${SITE_URL}${pathname}"`));
  assert(html.includes(`href="${BODY_GUIDE_HUB_PATH}"`));
  assert(html.includes('"@type":"BreadcrumbList"'));
  assert(html.includes(`/body-check?part=${guide.partId}`));
  assert(html.includes("data-body-selector"));
  assert(html.includes(`data-selector-part="${guide.partId}"`));
  assert(html.includes(`${guide.label}のセルフチェックを始める`));
  assert(html.includes(`href="/body-check?part=${guide.partId}`));
  assert(!html.includes("body-map-"));
});
const lowerBackHtml = fs.readFileSync(path.join(dist, "body-check", "lower-back", "index.html"), "utf8");
assert(lowerBackHtml.includes('href="/health-library/lower-back-example/"'), "Body-guide article links must use their canonical trailing slash.");

const sitemapPath = path.join(dist, "sitemap.xml");
const sitemap = fs.readFileSync(sitemapPath, "utf8");
const sitemapEntries = Array.from(sitemap.matchAll(/<url>\s*<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?\s*<\/url>/g)).map((match) => ({ loc: match[1], lastmod: match[2] || "" }));
const canonicalUrls = [BODY_GUIDE_HUB_PATH, ...guides.map((guide) => bodyGuidePath(guide.slug))].map((pathname) => `${SITE_URL}${pathname}`);
canonicalUrls.forEach((url) => {
  const matches = sitemapEntries.filter((entry) => entry.loc === url);
  assert.strictEqual(matches.length, 1, `${url} must appear in the sitemap exactly once.`);
  assert.strictEqual(matches[0].lastmod, "", `${url} must not receive a build-time lastmod.`);
  assert(!sitemapEntries.some((entry) => entry.loc === url.replace(/\/$/, "")), `${url} has a non-canonical duplicate.`);
});
assert(sitemapEntries.some((entry) => entry.loc === `${SITE_URL}/health-library` && entry.lastmod === "2026-09-01"), "Unrelated sitemap entries and lastmod values must remain unchanged.");

generateBodyGuideAssets({ dist, articles: sampleArticles });
assert.strictEqual(fs.readFileSync(sitemapPath, "utf8"), sitemap, "Rebuilding unchanged body-guide pages must not alter their sitemap entries.");
fs.rmSync(dist, { recursive: true, force: true });
console.log("Body guide asset tests passed.");
