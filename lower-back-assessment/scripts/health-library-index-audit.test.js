const assert = require("assert");
const path = require("path");
const { inspectInitialHtml, localPathForUrl, normalizeAuditUrl } = require("./health-library-index-audit");

const first = "https://health-check-platform-v2.netlify.app/health-library/first/";
const second = "https://health-check-platform-v2.netlify.app/health-library/second/";
const third = "https://health-check-platform-v2.netlify.app/health-library/third/";
const body = `<article><h1>記事タイトル</h1><div class="sanity-body"><p>${"本文".repeat(180)}</p></div><section class="related-section"><h2>関連記事</h2><a href="/health-library/second/">関連記事2</a><a href="/health-library/third/">関連記事3</a></section></article>`;

assert.equal(normalizeAuditUrl(`${first}?preview=1#top`), first.replace(/\/$/, ""));
assert.equal(path.basename(path.dirname(localPathForUrl("https://health-check-platform-v2.netlify.app/health-library/%E8%82%A9%E3%81%93%E3%82%8A/"))), "肩こり");
const inspected = inspectInitialHtml(body, first, [first, second, third]);
assert.equal(inspected.contentPresent, true);
assert.equal(inspected.hasH1, true);
assert.equal(inspected.normalArticleLinkCount, 2);
assert.equal(inspected.relatedArticleLinkCount, 2);

const loading = inspectInitialHtml("<main><p>記事データを読み込みます。</p></main>", first, [first]);
assert.equal(loading.contentPresent, false);
assert.match(loading.reason, /article要素/);

console.log("Health library indexability unit checks passed.");
