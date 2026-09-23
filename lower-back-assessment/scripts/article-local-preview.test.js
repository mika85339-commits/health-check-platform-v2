const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const previewPath = path.join(root, "content", "local-preview", "health-library-articles.json");
const preview = JSON.parse(fs.readFileSync(previewPath, "utf8"));
const healthLibrarySource = fs.readFileSync(path.join(root, "sanity-health-library.js"), "utf8");
const homeSource = fs.readFileSync(path.join(root, "ec-home-ui.js"), "utf8");
const buildSource = fs.readFileSync(path.join(root, "scripts", "netlify-build.js"), "utf8");

const cases = [
  {
    slug: "肩こりの原因と日常生活の工夫-鍼灸の可能性",
    href: "/body-check/shoulder/",
    distinction: "同じ状態とは限りません",
    source: "https://pubmed.ncbi.nlm.nih.gov/28224291/"
  },
  {
    slug: "腸腰筋の痛みの背景と日常で見直せること-鍼灸という選択肢",
    href: "/body-check/lower-back/",
    distinction: "原因と決めることはできません",
    source: "https://www.who.int/publications/i/item/9789240081789"
  }
];

cases.forEach(({ slug, href, distinction, source }) => {
  const article = preview.articles[slug];
  assert(article, `Missing local article preview: ${slug}`);
  assert(article.title.length >= 20 && article.title.length <= 60, `Preview title length is unsuitable: ${slug}`);
  assert(article.description.length >= 45 && article.description.length <= 140, `Preview description length is unsuitable: ${slug}`);
  assert.strictEqual(article.diagnosis.href, href, `Unexpected diagnosis entry for ${slug}`);
  assert.strictEqual(article.keyPoints.length, 3, `Three focused takeaways are required for ${slug}`);
  assert.strictEqual(article.visualGuide.items.length, 3, `Three visual guide items are required for ${slug}`);
  assert(
    [article.answer, ...article.details, article.diagnosis.description].join(" ").includes(distinction),
    `The article must preserve its medical distinction: ${slug}`
  );
  assert(article.sources.some((item) => item.url === source), `Missing verified source for ${slug}`);
  assert(article.relatedSlugs.every((relatedSlug) => relatedSlug !== slug), `An article cannot relate to itself: ${slug}`);
  assert(!/必ず|治る|原因筋を特定/.test(JSON.stringify(article)), `Unsupported certainty remains in ${slug}`);
});

assert(healthLibrarySource.includes("function displayTitle(article)"));
assert(healthLibrarySource.includes("function displayDescription(article"));
assert(healthLibrarySource.includes("function articleFocusMap(article)"));
assert(healthLibrarySource.includes("previewItems.length ? previewItems"));
assert(homeSource.includes("function mergeHomeArticlePreviews(articles, previews = {})"));
assert(buildSource.includes('process.env.HEALTH_LIBRARY_LOCAL_PREVIEW !== "true"'));
assert(buildSource.includes('path.join(root, "content", "local-preview", "health-library-articles.json")'));

console.log("Local health-library article preview checks passed.");
