const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {normalizeSanityArticles, summarizeArticle} = require("./sanity-article-mapper");
const {articleHtml, articlePrerender} = require("./sanity-site-assets");
const source = fs.readFileSync("sanity-health-library.js", "utf8");
const raw = {_id:"phase-b-test", _type:"post", title:"検証用の記事", slug:"phase-b-test", excerpt:"検証用の説明",
  publishedAt:"2026-10-01T00:00:00Z", author:{name:"AI記事生成（自動検証）"},
  body:[{_type:"block", children:[{_type:"span",text:"既存の医学本文は変更しません。"}]}],
  authorship:{method:"ai-automated",verification:"independent-evidence-v1",humanReview:false}};
const article = normalizeSanityArticles([raw]).articles[0];
assert.equal(article.authorship.humanReview,false);
assert.deepEqual(summarizeArticle(article).authorship,article.authorship);
const staticHtml = articlePrerender(article, [article]);
assert.match(staticHtml,/個別の医療専門職による監修は受けていません/);
assert.match(staticHtml,/既存の医学本文は変更しません/);
const base = '<html><head><title>Test</title><meta name="description" content=""><link rel="canonical" href="/"></head><body><main id="app" tabindex="-1"></main></body></html>';
const html=articleHtml(article,base,[article]);
const schemas=Array.from(html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),m=>JSON.parse(m[1]));
const schema=schemas.find(s=>s["@type"]==="Article");
assert.equal(schema.author["@type"],"Organization");
assert.equal(schema.reviewedBy,undefined);
function snippet(name) {
 const start=source.indexOf("  function "+name+"(");
 const end=source.indexOf("\n  function ",start+10);
 assert.ok(start>=0 && end>start);
 return source.slice(start,end);
}
const context={image:()=>"",imageSize:()=>({}),effectiveUpdatedAt:()=>"",formatDate:()=>"",tags:()=>[],
 TAG_DISPLAY_LIMIT:5,cleanText:s=>s||"",attr:s=>s||"",esc:s=>s||"",categoryArtClass:()=>"",
 category:()=>"健康",categoryUrl:()=>"",breadcrumb:()=>"",displayTitle:a=>a.title,
 displayDescription:a=>a.excerpt,readingMinutes:()=>"",normalizedReferences:()=>[]};
vm.createContext(context);
vm.runInContext(snippet("isAutomatedArticle")+"\n"+snippet("articleHeader")+"\nthis.header=articleHeader",context);
assert.match(context.header(article),/個別の医療専門職による監修は受けていません/);
assert.doesNotMatch(context.header(article),/監修：/);
const old = normalizeSanityArticles([{...raw, authorship:undefined, author:{name:"既存の著者"}}]).articles[0];
assert.equal("authorship" in old,false);
assert.doesNotMatch(articlePrerender(old,[old]),/article-ai-disclosure/);
assert.match(context.header(old),/監修：既存の著者/);
const futureReviewed=normalizeSanityArticles([{...raw,authorship:{...raw.authorship,humanReview:true}}]).articles[0];
assert.equal("authorship" in futureReviewed,false);
console.log("AI authorship static/runtime/schema and legacy-preservation checks passed.");
