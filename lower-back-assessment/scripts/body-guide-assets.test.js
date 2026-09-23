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
assert(hubHtml.includes("body-selector-label-link"));
assert(hubHtml.includes("body-selector-guide"));
assert(hubHtml.includes("body-selector-marker"));
assert(hubHtml.includes("body-selector-front-480.webp"));
assert(hubHtml.includes("data-src=\"/assets/body-guide/body-selector-back-480.webp\""));
assert(!hubHtml.includes("body-map-overview.svg"));
assert(!hubHtml.includes("--selector-width"));
assert(!hubHtml.includes("--selector-height"));
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
