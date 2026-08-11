const assert = require("assert");
const { normalizeSanityArticles } = require("./sanity-article-mapper");

const publishedPost = {
  _id: "post-1",
  _type: "post",
  title: "肩こりの記事",
  slug: "shoulder-post",
  excerpt: "肩こりの概要です。",
  publishedAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T01:00:00.000Z",
  body: [
    {
      _type: "block",
      children: [{ _type: "span", text: "本文です。" }]
    }
  ],
  mainImage: {
    asset: {
      url: "https://cdn.sanity.io/images/69w0i1ba/production/sample-1200x630.jpg",
      metadata: { dimensions: { width: 1200, height: 630 } }
    },
    alt: "肩こりの記事画像"
  },
  categories: [{ _id: "cat-1", title: "肩", slug: "shoulder" }],
  tags: [{ _id: "tag-1", title: "肩こり", slug: "shoulder-stiffness" }],
  faqs: [{ question: "鍼は痛いですか？", answer: "できるだけ痛みが出にくい施術を心がけています。" }],
  references: [{ title: "Clinical guideline", year: "2026", url: "https://example.com" }],
  author: { _id: "author-1", name: "ハリプラス鍼灸院", role: "監修" },
  seo: { title: "SEO肩こり", description: "SEO説明", noIndex: false }
};

const result = normalizeSanityArticles(
  [
    publishedPost,
    { ...publishedPost, _id: "post-2" },
    { ...publishedPost, _id: "post-3", title: "", slug: "missing-title" }
  ],
  {
    projectId: "69w0i1ba",
    dataset: "production",
    existingSlugs: ["shoulder-post"]
  }
);

assert.strictEqual(result.articles.length, 1);
assert.strictEqual(result.articles[0].source, "sanity");
assert.strictEqual(result.articles[0].slug, "shoulder-post");
assert.strictEqual(result.articles[0].mainImage.alt, "肩こりの記事画像");
assert.strictEqual(result.articles[0].references.length, 1);
assert.strictEqual(result.excluded.length, 2);
assert.deepStrictEqual(
  result.duplicateSlugs.map((item) => item.source).sort(),
  ["existing-json", "sanity"].sort()
);

const markdownLinkResult = normalizeSanityArticles([
  {
    ...publishedPost,
    _id: "post-link-1",
    slug: "link-post",
    body: [
      {
        _type: "block",
        children: [
          {
            _type: "span",
            text: "Read [Autonomic article](https://health-check-platform-v2.netlify.app/health-library/autonomic) and https://health-check-platform-v2.netlify.app/health-library/tinnitus."
          }
        ]
      }
    ]
  }
]);

const linkBlock = markdownLinkResult.articles[0].body[0];
assert.strictEqual(linkBlock.markDefs.length, 2);
assert.strictEqual(linkBlock.children.some((span) => /\[[^\]]+\]\(https?:\/\//.test(span.text)), false);
assert.strictEqual(linkBlock.children.some((span) => /https:\/\/health-check-platform-v2\.netlify\.app/.test(span.text)), false);

console.log("sanity-article-mapper tests passed");
