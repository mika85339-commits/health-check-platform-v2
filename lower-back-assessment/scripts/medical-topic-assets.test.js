const assert = require("assert");
const { isPublishable, relatedArticles, validateTopic } = require("./medical-topic-assets");

const topic = {
  title: "慢性腰痛",
  slug: "chronic-low-back-pain",
  status: "draft",
  description: "概要",
  conclusion: "結論",
  known: "現在分かっていること",
  researchResults: "研究結果",
  limitations: "研究の限界",
  author: "Health Check Lab編集部",
  reviewer: "",
  reviewedAt: "",
  updatedAt: "2026-09-18",
  articleMatchTerms: ["腰痛", "鍼灸"],
  references: [{ title: "Guideline", sourceUrl: "https://example.com/guideline" }]
};

assert.deepStrictEqual(validateTopic(topic), []);
assert.strictEqual(isPublishable(topic), false, "Draft topics must never be published.");
assert.strictEqual(isPublishable({ ...topic, status: "published" }), false, "Unreviewed topics must never be published.");
assert.strictEqual(isPublishable({ ...topic, status: "published", reviewer: "確認者", reviewedAt: "2026-09-18" }), true);

const related = relatedArticles(topic, [
  { title: "慢性腰痛と鍼灸", slug: "low-back", excerpt: "腰痛", publishedAt: "2026-09-02", categories: [] },
  { title: "肩こり", slug: "shoulder", excerpt: "首肩", publishedAt: "2026-09-03", categories: [] }
]);
assert.deepStrictEqual(related.map((article) => article.slug), ["low-back"]);

const invalidPublished = validateTopic({ ...topic, status: "published" });
assert.ok(invalidPublished.some((error) => error.includes("reviewer and reviewedAt")));

console.log("medical-topic-assets tests passed");
