const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SITE_URL } = require("./content-utils");
const { generateBodyGuideAssets, readGuides, relatedArticles } = require("./body-guide-assets");
const { diagnosisEntry } = require("./sanity-site-assets");
const root = path.resolve(__dirname, "..");

const guides = readGuides();
assert.strictEqual(guides.length, 5, "Phase 1 should publish five supported body-part entries.");
assert.deepStrictEqual(guides.map((guide) => guide.partId), ["lowback", "neck", "shoulder", "hip", "knee"]);

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
assert(fs.existsSync(path.join(dist, "body-guide", "index.html")));
guides.forEach((guide) => {
  const html = fs.readFileSync(path.join(dist, "body-check", guide.slug, "index.html"), "utf8");
  assert(html.includes(`<link rel="canonical" href="${SITE_URL}/body-check/${guide.slug}"`));
  assert(html.includes('"@type":"BreadcrumbList"'));
  assert(html.includes(`/body-check?part=${guide.partId}`));
  assert(html.includes(`alt="${guide.label}の位置を示す身体図"`));
  assert(fs.existsSync(path.join(dist, "assets", "body-guide", `body-map-${guide.slug}.svg`)));
});

const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
assert(sitemap.includes(`${SITE_URL}/body-guide`));
guides.forEach((guide) => assert(sitemap.includes(`${SITE_URL}/body-check/${guide.slug}`)));
fs.rmSync(dist, { recursive: true, force: true });
console.log("Body guide asset tests passed.");
