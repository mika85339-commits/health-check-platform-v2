const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const vm = require("vm");
const { articleHtml } = require("./generate-site-assets");

const root = path.resolve(__dirname, "..");

function functionPrefix(fileName, functionName, awaitExpression) {
  const source = fs.readFileSync(path.join(root, fileName), "utf8");
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`${fileName}: ${functionName} was not found`);
  const awaitAt = source.indexOf(awaitExpression, start);
  if (awaitAt < 0) throw new Error(`${fileName}: ${awaitExpression} was not found`);
  return source.slice(start, awaitAt);
}

const legacyPrefix = functionPrefix("app.js", "renderHealthLibraryArticle", "await loadHealthLibraryData()");
const sanityPrefix = functionPrefix("sanity-health-library.js", "renderArticle", "await loadData()");

for (const [fileName, prefix] of [["app.js", legacyPrefix], ["sanity-health-library.js", sanityPrefix]]) {
  if (/記事を読み込み中|記事データを読み込みます/.test(prefix)) {
    throw new Error(`${fileName}: article navigation still replaces prerendered content with a loading screen`);
  }
  if (/innerHTML\s*=/.test(prefix)) {
    throw new Error(`${fileName}: article navigation mutates the prerendered article before data is ready`);
  }
}

const legacyHtml = articleHtml({ slug: "legacy-navigation-fixture", title: "旧記事の遷移検証（非公開テスト）", summary: "ローカル検証用", conclusion: "本文を初期HTMLで表示", references: [{title:"テスト出典",url:"https://example.com/reference"}] });
assert(legacyHtml.includes('data-prerendered="legacy-article"'));
assert(legacyHtml.includes("本文を初期HTMLで表示"));
assert(legacyHtml.includes('href="https://example.com/reference"'));
assert(!/sessionStorage|location\.replace/.test(legacyHtml));
assert(legacyHtml.includes('/health-library/legacy-navigation-fixture"'));

const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
assert(!appSource.includes('sessionStorage.getItem("health-check-lab-route")'));
const listenerStart = appSource.lastIndexOf('document.addEventListener("click", (event) => {');
const listenerEnd = appSource.indexOf('\nwindow.addEventListener("popstate"', listenerStart);
let click;
let navigationCount = 0;
vm.runInNewContext(appSource.slice(listenerStart, listenerEnd), {
  document: {addEventListener: (_name, callback) => {click = callback;}},
  location: {origin:"https://hcl.test"}, URL,
  history: {pushState: () => {navigationCount++;}}, route: () => {}
});
function clickUrl(href, options = {}) {
  let prevented = false;
  click({button:0,target:{closest:()=>({href,target:"",hasAttribute:()=>false})},preventDefault:()=>{prevented=true;},...options});
  return prevented;
}
for (const href of ["https://hcl.test/health-library/article/", "https://hcl.test/health-library/肩の記事/", "https://hcl.test/health-library/article/#section"]) assert.equal(clickUrl(href),false);
assert.equal(navigationCount,0,"Article clicks must use the browser's document navigation, including leftover data-link anchors.");
assert.equal(clickUrl("https://external.test/article/"),false);
assert.equal(clickUrl("https://hcl.test/",{ctrlKey:true}),false);
assert.equal(clickUrl("https://hcl.test/"),true);
assert.equal(navigationCount,1,"Existing non-article SPA navigation is preserved.");

const sanitySource=fs.readFileSync(path.join(root,"sanity-health-library.js"),"utf8");
const renderStart=sanitySource.indexOf("  async function renderArticle(slug) {");
const renderEnd=sanitySource.indexOf('\n  if (typeof routes',renderStart);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function verifyLateArticle(stage){
  const data=deferred(), article=deferred();
  const location={pathname:"/health-library/article/"};
  let writes=0;
  const render=vm.runInNewContext(`(${sanitySource.slice(renderStart,renderEnd).trim()})`,{
    location,loadData:()=>data.promise,loadArticle:()=>article.promise,
    qs:selector=>selector==="#app"?{set innerHTML(_value){writes++;}}:{},
    state:{categories:[],articles:[]},updateArticleSeo:()=>{writes++;},
    pageShell:()=>"article",displayTitle:()=>"Article",displayDescription:()=>"",sanityArticle:()=>"",existingArticle:()=>"",enhanceDetails:()=>{},renderNotFound:()=>{writes++;}
  });
  const pending=render("article");
  assert.equal(writes,0,"Prerendered content must remain while data is pending.");
  if(stage==="data"){location.pathname="/";data.resolve();}
  else {data.resolve();await Promise.resolve();location.pathname="/";article.resolve({slug:"article"});}
  await pending;
  assert.equal(writes,0,"Late article data must not replace a newer route.");
}
(async()=>{
  await verifyLateArticle("data");
  await verifyLateArticle("article");
  console.log("Article direct-navigation checks passed: native navigation, legacy initial HTML, no home detour, preserved prerender and stale-route protection.");
})().catch(error=>{console.error(error);process.exitCode=1;});
