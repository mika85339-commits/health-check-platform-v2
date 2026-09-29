const assert = require("assert");
const fs = require("fs");
const path = require("path");
const bodyPlatform = require("../body-platform");
const {
  ARTICLE_BODY_PART_IDS,
  articleDiagnosisUrl,
  linkNavigationMode,
  resolveArticleDiagnosisEntry,
  resolveDiagnosisGuide,
  selectRelatedArticles
} = require("../health-library-content");
const { articleHtml, articlePrerender } = require("./sanity-site-assets");

const current = {
  slug: "current",
  title: "Current",
  publishedAt: "2026-09-20T00:00:00.000Z",
  categories: [{ title: "肩こり" }],
  relatedPosts: [
    { slug: "explicit-second" },
    { slug: "explicit-first" },
    { slug: "current" },
    { slug: "explicit-second" },
    { slug: "unpublished-or-deleted" }
  ],
  diagnosisGuide: {
    heading: "肩の動きを先に確認する",
    description: "腕を上げた時の左右差を整理します。",
    label: "肩の動きを確認する",
    bodyPart: "shoulder"
  },
  body: []
};
const articles = [
  current,
  { slug: "fallback", title: "Fallback", publishedAt: "2026-09-19T00:00:00.000Z", categories: [{ title: "首・肩" }] },
  { slug: "explicit-first", title: "Explicit first", publishedAt: "2026-01-01T00:00:00.000Z", categories: [{ title: "腰" }] },
  { slug: "explicit-second", title: "Explicit second", publishedAt: "2025-01-01T00:00:00.000Z", categories: [{ title: "腰" }] },
  { slug: "latest-other", title: "Latest other", publishedAt: "2026-09-18T00:00:00.000Z", categories: [{ title: "膝" }] }
];

assert.deepStrictEqual(
  selectRelatedArticles(current, articles).map((article) => article.slug),
  ["explicit-second", "explicit-first", "fallback"],
  "Explicit related posts must keep their order and only use published candidates before fallback selection."
);

const previewArticle = {
  ...current,
  localPreview: { relatedSlugs: ["fallback"] }
};
assert.strictEqual(selectRelatedArticles(previewArticle, articles)[0].slug, "fallback");

assert.deepStrictEqual(
  resolveDiagnosisGuide(current, { href: "/body-guide/", label: "身体から探す" }, "汎用説明"),
  {
    heading: "肩の動きを先に確認する",
    description: "腕を上げた時の左右差を整理します。",
    label: "肩の動きを確認する",
    href: "/body-check?part=shoulder&from=article-diagnosis"
  }
);

assert.deepStrictEqual(ARTICLE_BODY_PART_IDS, bodyPlatform.CANONICAL_BODY_PARTS);
const bodyPartCases = [
  ["neck", "首の痛み"],
  ["shoulder", "肩の痛み"],
  ["elbow", "肘の痛み"],
  ["wrist", "手首の痛み"],
  ["back", "背中の痛み"],
  ["lowback", "腰痛"],
  ["hip", "股関節の痛み"],
  ["buttock", "お尻の痛み"],
  ["thigh", "太ももの痛み"],
  ["knee", "膝の痛み"],
  ["lowerleg", "すねの痛み"],
  ["ankle", "足首の痛み"],
  ["sole", "足裏の痛み"]
];
bodyPartCases.forEach(([bodyPart, title]) => {
  assert.strictEqual(articleDiagnosisUrl(bodyPart), `/body-check?part=${bodyPart}&from=article-diagnosis`);
  assert.strictEqual(resolveArticleDiagnosisEntry({ title }).href, `/body-check?part=${bodyPart}&from=article-diagnosis`);
});

[
  ["/body-check/lower-back/", "lowback"],
  ["/body-check/shoulder/", "shoulder"],
  ["/body-check/neck/", "neck"],
  ["/body-check/hip/", "hip"],
  ["/body-check/knee/", "knee"]
].forEach(([href, bodyPart]) => {
  const guide = resolveDiagnosisGuide(
    { diagnosisGuide: { heading: "案内", href } },
    { href: "/body-guide/", label: "身体から探す" },
    "汎用説明"
  );
  assert.strictEqual(guide.href, `/body-check?part=${bodyPart}&from=article-diagnosis`);
});

assert.strictEqual(
  resolveDiagnosisGuide(
    { diagnosisGuide: { bodyPart: "lower-back" } },
    { href: "/body-guide/", label: "身体から探す" },
    "汎用説明"
  ).href,
  "/body-check?part=lowback&from=article-diagnosis"
);

const unsafeGuide = resolveDiagnosisGuide(
  { diagnosisGuide: { heading: "案内", href: "https://example.com/body-check" } },
  { href: "/body-guide/", label: "身体から探す" },
  "汎用説明"
);
assert.strictEqual(unsafeGuide.href, "/body-guide/");

const productionUrl = "https://health-check-platform-v2.netlify.app";
const localUrl = "http://127.0.0.1:4177";
assert.strictEqual(linkNavigationMode("/health-library/article/", productionUrl, localUrl), "library");
assert.strictEqual(linkNavigationMode(`${productionUrl}/health-library/article/`, productionUrl, localUrl), "library");
assert.strictEqual(linkNavigationMode(`${localUrl}/health-library/article/`, productionUrl, localUrl), "library");
assert.strictEqual(linkNavigationMode("/body-check/shoulder/", productionUrl, localUrl), "document");
assert.strictEqual(linkNavigationMode("/body-check?part=shoulder", productionUrl, localUrl), "document");
assert.strictEqual(linkNavigationMode("https://hariplus-nagoya.com/", productionUrl, localUrl), "external");

const prerender = articlePrerender(current, articles);
assert(prerender.includes("肩の動きを先に確認する"));
assert(prerender.includes('href="/body-check?part=shoulder&amp;from=article-diagnosis"'));
assert(prerender.includes('from=article-diagnosis" data-link'), "The article CTA must enter the current in-app diagnosis flow directly.");
assert(prerender.indexOf("Explicit second") < prerender.indexOf("Explicit first"));
assert(prerender.indexOf("Explicit first") < prerender.indexOf("Fallback"));
assert(!prerender.includes('class="section-kicker"'), "Article prerender must not repeat headings with decorative kicker copy.");

const baseHtml = '<!doctype html><html><head><title>Base</title><meta name="description" content="Base" /><link rel="canonical" href="https://example.com/" /><meta property="og:type" content="website" /><meta property="og:title" content="Base" /><meta property="og:description" content="Base" /><meta property="og:url" content="https://example.com/" /></head><body><main id="app" tabindex="-1"><noscript>Home fallback</noscript></main></body></html>';
const staticHtml = articleHtml(current, baseHtml, articles);
assert(staticHtml.includes('data-prerendered="sanity-article"'));
assert(!staticHtml.includes("Home fallback"));
assert(staticHtml.includes("肩の動きを先に確認する"));

const browserSource = fs.readFileSync(path.resolve(__dirname, "..", "sanity-health-library.js"), "utf8");
const homeSource = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
assert(browserSource.includes("healthLibraryContent.selectRelatedArticles(article, state?.articles, RELATED_LIMIT)"));
assert(browserSource.includes("healthLibraryContent.resolveDiagnosisGuide(article, entry"));
assert(browserSource.includes("healthLibraryContent.linkNavigationMode(href, SITE_URL, location.origin)"));
assert(!browserSource.includes('class="section-kicker"'), "Browser rendering must not restore duplicate section labels.");
assert(homeSource.includes('/body-check?part=neck&amp;from=home-body-selector'), "The home selector route must remain unchanged.");
[
  "REFERENCES",
  "BODY CHECK",
  "BODY MAP",
  "EDITORIAL POLICY",
  "UPDATE LOG"
].forEach((copy) => assert(!browserSource.includes(`>${copy}<`), `Decorative duplicate label remains: ${copy}`));

console.log("Health-library content connection tests passed.");
