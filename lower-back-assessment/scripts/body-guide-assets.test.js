const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SITE_URL } = require("./content-utils");
const { bodySelectorParts, generateBodyGuideAssets, readGuides, relatedArticles } = require("./body-guide-assets");
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
    assert(position.x >= 0 && position.x <= 100);
    assert(position.y >= 0 && position.y <= 100);
    assert(position.width > 0 && position.height > 0);
  });
});

const sampleArticles = [
  { slug: "lower-back-example", title: "腰と腸腰筋の記事", publishedAt: "2026-09-01", categories: [{ title: "慢性痛" }] },
  { slug: "neck-example", title: "首こりと生活習慣の記事", publishedAt: "2026-09-02", categories: [{ title: "健康情報" }] }
];
assert.strictEqual(relatedArticles(guides[0], sampleArticles)[0].slug, "lower-back-example");
assert.deepStrictEqual(diagnosisEntry({ title: "肩こりの原因", keywords: ["腰痛"] }), { href: "/body-check/shoulder", label: "肩のセルフチェックへ" });
assert.deepStrictEqual(diagnosisEntry({ title: "膝痛と生活習慣" }), { href: "/body-check/knee", label: "膝のセルフチェックへ" });

const trackingSource = fs.readFileSync(path.join(root, "body-guide.js"), "utf8");
["diagnosis_landing_view", "diagnosis_landing_start", "body_guide_view", "body_guide_select"].forEach((eventName) => {
  assert(trackingSource.includes(`\"${eventName}\"`), `${eventName} tracking is missing.`);
});
["symptom", "muscle", "pain_score", "health_data"].forEach((sensitiveKey) => {
  assert(!trackingSource.includes(sensitiveKey), `${sensitiveKey} must not be included in body-guide analytics.`);
});

const dist = fs.mkdtempSync(path.join(os.tmpdir(), "hcl-body-guide-"));
fs.writeFileSync(path.join(dist, "sitemap.xml"), `<?xml version="1.0"?><urlset><url><loc>${SITE_URL}</loc></url></urlset>`, "utf8");
const result = generateBodyGuideAssets({ dist, articles: sampleArticles });

assert.strictEqual(result.guideCount, 5);
const hubHtml = fs.readFileSync(path.join(dist, "body-guide", "index.html"), "utf8");
assert(hubHtml.includes("data-body-selector"));
assert(hubHtml.includes("data-body-view-button=\"front\""));
assert(hubHtml.includes("data-body-view-button=\"back\""));
assert(hubHtml.includes("body-selector-front-480.webp"));
assert(hubHtml.includes("data-src=\"/assets/body-guide/body-selector-back-480.webp\""));
assert(!hubHtml.includes("body-map-overview.svg"));
guides.forEach((guide) => assert(hubHtml.includes(`href="/body-check/${guide.slug}"`)));
["front", "back"].forEach((view) => [480, 768].forEach((width) => {
  assert(fs.existsSync(path.join(dist, "assets", "body-guide", `body-selector-${view}-${width}.webp`)));
}));
guides.forEach((guide) => {
  const html = fs.readFileSync(path.join(dist, "body-check", guide.slug, "index.html"), "utf8");
  assert(html.includes(`<link rel="canonical" href="${SITE_URL}/body-check/${guide.slug}"`));
  assert(html.includes('"@type":"BreadcrumbList"'));
  assert(html.includes(`/body-check?part=${guide.partId}`));
  assert(html.includes("data-body-selector"));
  assert(html.includes(`data-selector-part="${guide.partId}"`));
  assert(html.includes(`${guide.label}のセルフチェックを始める`));
  assert(html.includes(`href="/body-check?part=${guide.partId}`));
  assert(!html.includes("body-map-"));
});

const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
assert(sitemap.includes(`${SITE_URL}/body-guide`));
guides.forEach((guide) => assert(sitemap.includes(`${SITE_URL}/body-check/${guide.slug}`)));
fs.rmSync(dist, { recursive: true, force: true });
console.log("Body guide asset tests passed.");
