const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { bodySelectorParts } = require("./body-guide-assets");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "ec-home-ui.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const documentStub = {
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const windowStub = {
  addEventListener() {},
  setTimeout() {},
  matchMedia() { return { matches: false }; }
};
const context = {
  console,
  document: documentStub,
  window: windowStub,
  location: { pathname: "/", search: "" },
  history: { pushState() {} },
  PopStateEvent: function PopStateEvent() {},
  URLSearchParams,
  encodeURIComponent,
  fetch: async () => ({ ok: false, json: async () => [] })
};
vm.runInNewContext(source, context, { filename: "ec-home-ui.js" });

const api = windowStub.HealthCheckHomeExperience;
assert(api, "The home experience test API must be available.");

const normalizeParts = (parts) => parts.map(({ partId, label, views }) => ({ partId, label, views }));
assert.strictEqual(
  JSON.stringify(normalizeParts(api.homeSelectorParts)),
  JSON.stringify(normalizeParts(bodySelectorParts)),
  "The home selector must use the approved body-guide coordinates."
);

assert.deepStrictEqual(
  Object.keys(api.homeSelectorParts.find((part) => part.partId === "lowback").views),
  ["back"],
  "The lower-back label must only appear on the rear view."
);

const selectorHtml = api.renderHomeBodySelector();
const homeHtml = api.homeMarkup();
assert.strictEqual((homeHtml.match(/data-home-body-selector/g) || []).length, 1, "The home page must contain one body selector.");
assert(homeHtml.includes("気になる場所を選んでください"));
assert(homeHtml.includes("身体の悩みについて読む"));
assert(!homeHtml.includes("原因筋チェック"), "The retired competing start label must not return.");
assert(!homeHtml.includes("2つの入口"), "The retired two-entry section must not return.");
assert(!selectorHtml.includes("/body-check/lower-back/"), "The search landing slug must not be used as the diagnosis part id.");

["neck", "shoulder", "lowback", "hip", "knee"].forEach((partId) => {
  const expected = `/body-check?part=${partId}&from=home-body-selector`;
  assert(selectorHtml.includes(expected), `Missing direct diagnosis link for ${partId}.`);
  assert.strictEqual(api.homeDiagnosisHref(partId), expected);
});

const frontHtml = selectorHtml.split('data-home-body-view-panel="front"')[1].split('data-home-body-view-panel="back"')[0];
const backHtml = selectorHtml.split('data-home-body-view-panel="back"')[1];
assert(!frontHtml.includes("part=lowback"), "The front view must not expose the lower-back marker.");
assert(backHtml.includes("part=lowback"), "The rear view must expose the lower-back marker.");

const sampleArticles = [
  { title: "腰痛と日常生活", slug: "low-back", publishedAt: "2026-09-20", categories: [{ title: "慢性痛" }], tags: [], seo: {} },
  { title: "肩こりを整理する", slug: "shoulder", publishedAt: "2026-09-21", categories: [{ title: "肩" }], tags: [], seo: {} },
  { title: "肩こりを整理する", slug: "shoulder-old", publishedAt: "2026-09-01", categories: [{ title: "肩" }], tags: [], seo: {} },
  { title: "頭痛を整理する", slug: "headache", publishedAt: "2026-09-23", categories: [{ title: "慢性痛" }], tags: [{ title: "腰痛" }], seo: {} },
  { title: "別の健康記事", slug: "other", publishedAt: "2026-09-22", categories: [{ title: "健康情報" }], tags: [], seo: {} }
];
assert.deepStrictEqual(
  Array.from(api.selectHomeArticles(sampleArticles, ["腰痛", "腰"]), (article) => article.slug),
  ["low-back"],
  "A related tag alone must not place an unrelated article in a body-area group."
);
assert.deepStrictEqual(
  Array.from(api.selectHomeArticles(sampleArticles, ["肩こり", "肩"]), (article) => article.slug),
  ["shoulder"],
  "Duplicate article titles must not be repeated on the home page."
);

const previewedArticles = api.mergeHomeArticlePreviews(sampleArticles, {
  shoulder: { title: "肩こりは姿勢だけが原因？", description: "動きと生活場面から整理します。" }
});
assert.strictEqual(previewedArticles[1].title, "肩こりは姿勢だけが原因？");
assert.strictEqual(previewedArticles[1].summary, "動きと生活場面から整理します。");
assert.strictEqual(previewedArticles[0], sampleArticles[0], "Articles without a local preview must remain untouched.");

assert(indexHtml.includes('href="/#body-selector">症状をチェック</a>'));
assert(indexHtml.includes('href="/health-library" data-link>健康記事を読む</a>'));
assert(indexHtml.includes("<noscript>"), "Text diagnosis links must remain available without JavaScript.");

console.log("Home experience regression checks passed.");
