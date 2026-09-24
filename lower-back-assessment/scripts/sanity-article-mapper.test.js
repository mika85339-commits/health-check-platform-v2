const assert = require("assert");
const { DEFAULT_SITE_URL, SITE_URL } = require("./site-url");
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
  clinicalSummary: {
    conclusion: "鍼治療は選択肢の一つです。",
    known: "慢性痛には複数の要因が関係します。",
    researchFindings: "比較研究で平均的な改善が報告されています。",
    limitations: "個人の効果を保証しません。"
  },
  evidenceClaims: [
    {
      _key: "claim-1",
      claim: "鍼治療は慢性痛の選択肢になり得ます。",
      interpretation: "集団平均として改善が報告されています。",
      limitations: "対象や手技は研究ごとに異なります。",
      evidence: [
        {
          _id: "evidence-1",
          title: "Acupuncture for Chronic Pain",
          condition: ["慢性痛"],
          intervention: "鍼治療",
          studyType: "meta-analysis",
          effectSummary: "平均的な疼痛改善",
          certainty: "moderate",
          limitations: "研究間のばらつき",
          pubmedId: "29198932",
          sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/29198932/",
          publicationYear: 2018,
          reviewedAt: "2026-09-18",
          reviewer: { _id: "author-1", name: "ハリプラス鍼灸院", role: "確認" }
        }
      ]
    }
  ],
  reviewedAt: "2026-09-18",
  reviewer: { _id: "author-1", name: "ハリプラス鍼灸院", role: "確認" },
  diagnosisGuide: {
    heading: "肩の動きを確認する",
    description: "腕を上げた時の症状を整理します。",
    label: "肩のセルフチェックへ",
    bodyPart: "shoulder"
  },
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
assert.strictEqual(result.articles[0].clinicalSummary.limitations, "個人の効果を保証しません。");
assert.strictEqual(result.articles[0].evidenceClaims.length, 1);
assert.strictEqual(result.articles[0].evidenceClaims[0].evidence[0].pubmedId, "29198932");
assert.strictEqual(result.articles[0].reviewer.name, "ハリプラス鍼灸院");
assert.strictEqual(result.articles[0].diagnosisGuide.bodyPart, "shoulder");
assert.strictEqual(result.articles[0].diagnosisGuide.heading, "肩の動きを確認する");
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
            text: `Read [Autonomic article](${DEFAULT_SITE_URL}/health-library/autonomic) and ${DEFAULT_SITE_URL}/health-library/tinnitus.`
          }
        ]
      }
    ]
  }
]);

const linkBlock = markdownLinkResult.articles[0].body[0];
assert.strictEqual(linkBlock.markDefs.length, 2);
assert.strictEqual(linkBlock.children.some((span) => /\[[^\]]+\]\(https?:\/\//.test(span.text)), false);
assert.strictEqual(linkBlock.children.some((span) => span.text.includes(DEFAULT_SITE_URL)), false);
assert.deepStrictEqual(linkBlock.markDefs.map((mark) => mark.href), [
  `${SITE_URL}/health-library/autonomic`,
  `${SITE_URL}/health-library/tinnitus`
]);

console.log("sanity-article-mapper tests passed");
