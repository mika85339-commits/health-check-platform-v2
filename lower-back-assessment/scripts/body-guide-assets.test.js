const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SITE_URL } = require("./content-utils");
const { BODY_GUIDE_HUB_PATH, bodyGuidePath, bodySelectorParts, generateBodyGuideAssets, precisionGuideData, readGuides, relatedArticles } = require("./body-guide-assets");
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
  { slug: "lower-back-example", title: "朝の腰の状態を整理", publishedAt: "2026-09-01", diagnosisGuide: { bodyPart: "lower-back" }, categories: [{ slug: "慢性痛", title: "慢性痛" }] },
  { slug: "low-back-care", title: "腰痛で病院へ行くべき？", publishedAt: "2026-09-24", categories: [{ slug: "慢性痛", title: "慢性痛" }], tags: [{ slug: "腰痛" }] },
  { slug: "neck-example", title: "首の動きの記事", publishedAt: "2026-09-02", diagnosisGuide: { bodyPart: "neck" } },
  { slug: "side-sleep-shoulder", title: "横向きで寝ると肩が痛い", publishedAt: "2026-09-24", diagnosisGuide: { bodyPart: "shoulder" }, categories: [{ slug: "肩", title: "肩" }] },
  { slug: "hip-example", title: "股関節の場所", publishedAt: "2026-09-24", diagnosisGuide: { bodyPart: "hip" } },
  { slug: "knee-stairs", title: "階段で膝が痛いとき", publishedAt: "2026-09-24", diagnosisGuide: { bodyPart: "knee" }, categories: [{ slug: "膝", title: "膝" }] },
  { slug: "ear-ringing", title: "耳鳴りと肩こり", publishedAt: "2026-09-25", categories: [{ slug: "肩" }], tags: [{ slug: "首肩" }] },
  { slug: "wrong-body-part", title: "肩と腰の話", publishedAt: "2026-09-26", diagnosisGuide: { bodyPart: "shoulder" }, categories: [{ slug: "慢性痛" }], tags: [{ slug: "腰痛" }] },
  { slug: "noindex-knee", title: "膝の非公開記事", publishedAt: "2026-09-26", diagnosisGuide: { bodyPart: "knee" }, seo: { noIndex: true } }
];
assert(relatedArticles(guides[0], sampleArticles).some((article) => article.slug === "lower-back-example"));
assert(relatedArticles(guides[0], sampleArticles).some((article) => article.slug === "low-back-care"), "The lower-back guide must link to the consultation guidance article.");
assert(relatedArticles(guides.find((guide) => guide.slug === "shoulder"), sampleArticles).some((article) => article.slug === "side-sleep-shoulder"), "The shoulder guide must link to the specific side-sleep shoulder article.");
assert(relatedArticles(guides.find((guide) => guide.slug === "knee"), sampleArticles).some((article) => article.slug === "knee-stairs"), "The knee guide must link to the movement-specific knee article.");
assert(!relatedArticles(guides.find((guide) => guide.slug === "shoulder"), sampleArticles).some((article) => article.slug === "ear-ringing"), "Partial or broad category matching must not pull unrelated articles into shoulder.");
assert(!relatedArticles(guides[0], sampleArticles).some((article) => article.slug === "wrong-body-part"), "An explicit different body part must not be overridden by tags.");
assert(!relatedArticles(guides.find((guide) => guide.slug === "knee"), sampleArticles).some((article) => article.slug === "noindex-knee"), "Noindex articles must be excluded.");
assert.deepStrictEqual(relatedArticles(guides[0], []), [], "No related articles should leave the section absent.");
assert.deepStrictEqual(diagnosisEntry({ title: "肩こりの原因", keywords: ["腰痛"] }), { href: "/body-check/?part=shoulder&from=article-diagnosis", label: "肩のセルフチェックへ", bodyPart: "shoulder" });
assert.deepStrictEqual(diagnosisEntry({ title: "膝痛と生活習慣" }), { href: "/body-check/?part=knee&from=article-diagnosis", label: "膝のセルフチェックへ", bodyPart: "knee" });

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
assert(hubHtml.includes('<header class="site-header">'));
assert(hubHtml.includes('<footer class="site-footer">'));
assert(hubHtml.includes('/site-menu.js?v=mobile-nav-1'));
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
  assert(html.includes(`<title>${guide.title} | Health Check Lab</title>`));
  assert(html.includes(`<meta name="description" content="${guide.description}"`));
  assert(html.includes(`<h1>${guide.hero}</h1>`));
  assert.strictEqual((html.match(/<h1>/g) || []).length, 1, "Each guide must have one H1.");
  assert(html.includes(guide.lead));
  const precision = precisionGuideData(guide);
  guide.locationIds.forEach((id) => assert(html.includes(precision.locations.find((item) => item[0] === id)[1])));
  guide.movementIds.forEach((id) => assert(html.includes(precision.movements.find((item) => item[0] === id)[1])));
  guide.examples.forEach((example) => {
    example.candidateIds.forEach((id) => {
      const muscle = precision.muscles.find((item) => item.id === id);
      assert(html.includes(muscle.name), `${guide.slug} must show the runtime candidate ${id}.`);
    });
    assert(html.includes(example.note));
  });
  guide.faqs.forEach(({ question, answer }) => {
    assert(html.includes(question));
    assert(html.includes(answer));
  });
  assert(!html.includes('"@type":"FAQPage"'), "Visible FAQ alone does not justify adding FAQPage schema in this release.");
  assert(html.includes("分かること") && html.includes("分からないこと"));
  assert(html.includes('<header class="site-header">'));
  assert(html.includes('<footer class="site-footer">'));
  assert(html.includes('/styles.css?'));
  assert(html.includes('/ec-home.css?'));
  assert(html.includes('/site-menu.js?v=mobile-nav-1'));
  assert(!html.includes('class="guide-site-header"'));
  assert(!html.includes('data-body-selector'), "SEO entries use the current home selector instead of a separate body UI.");
  assert.strictEqual((html.match(new RegExp(`href="/body-check/\\?part=${guide.partId}" data-diagnosis-start`, "g")) || []).length, 2);
  assert(!html.includes(`part=${guide.partId}&`));
  assert(html.includes(`${guide.label}のセルフチェックを始める`));
  assert(!html.includes("body-map-"));
});
const lowerBackHtml = fs.readFileSync(path.join(dist, "body-check", "lower-back", "index.html"), "utf8");
assert(lowerBackHtml.includes('href="/health-library/lower-back-example/"'), "Body-guide article links must use their canonical trailing slash.");
assert(!lowerBackHtml.includes("wrong-body-part"));
assert(!fs.readFileSync(path.join(dist, "body-check", "hip", "index.html"), "utf8").includes("ear-ringing"));
const emptyArticleDist = fs.mkdtempSync(path.join(os.tmpdir(), "hcl-body-guide-no-articles-"));
generateBodyGuideAssets({ dist: emptyArticleDist, articles: [] });
assert(!fs.readFileSync(path.join(emptyArticleDist, "body-check", "neck", "index.html"), "utf8").includes("に関連する健康記事"));
fs.rmSync(emptyArticleDist, { recursive: true, force: true });

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
