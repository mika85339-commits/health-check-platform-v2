const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const bodyCheckSource = fs.readFileSync(path.join(rootDir, "body-check-ui.js"), "utf8");
const appSource = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const bodyCheckBootstrap = fs.readFileSync(path.join(rootDir, "body-check", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(rootDir, "styles.css"), "utf8");

function renderInitial(search) {
  const root = { innerHTML: "" };
  const windowStub = {
    location: { hostname: "127.0.0.1", search },
    HealthCheckBodyPlatform: null,
    setTimeout() {},
    scrollTo() {}
  };
  const sandbox = {
    console,
    window: windowStub,
    location: windowStub.location,
    document: { dispatchEvent() {} },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    URLSearchParams,
    encodeURIComponent,
    Date,
    Math,
    Intl
  };
  vm.runInNewContext(bodyCheckSource, sandbox, { filename: "body-check-ui.js" });
  const instance = windowStub.createBodyCheck({
    $: (selector) => selector === "#bodyCheckRoot" ? root : null,
    $$: () => [],
    STORAGE_KEY: "test-body-check",
    analyzeWithOpenAI: async () => ({}),
    setButtonLoading() {},
    copyText() {},
    encodeShare: encodeURIComponent,
    runWhenIdle(callback) { callback(); },
    getCommunityInsights: () => null
  });
  instance.init();
  return root.innerHTML;
}

const neckHtml = renderInitial("?part=neck&from=home-body-selector");
assert(neckHtml.includes("首のセルフチェック"), "The selected body part must appear in the page title.");
assert(neckHtml.includes("首を選択済みです。必要に応じて部位を追加・変更できます。"));
assert(/body-part-card selected[^>]*data-part="neck"/.test(neckHtml), "The incoming neck selection must remain selected.");
assert(!neckHtml.includes(">Ne<"), "Decorative English part codes must not be rendered.");
assert(neckHtml.includes("--step-count:5"), "A single-part check must render its five real steps without a scroller.");
["部位", "気になる場面", "症状", "追加確認", "結果"].forEach((label) => {
  assert(neckHtml.includes(`<strong>${label}</strong>`), `Missing Japanese progress label: ${label}`);
});
assert(!neckHtml.includes("BODY TRACE"));
assert(!neckHtml.includes("TRACE NODE"));
assert(!neckHtml.includes("LOCATION"));
assert(!neckHtml.includes("CONDITION"));
assert(!neckHtml.includes("SIGNAL"));

const directHtml = renderInitial("");
assert(directHtml.includes("症状のセルフチェック"), "Direct visits must keep the normal unselected flow.");
assert(!/body-part-card selected/.test(directHtml), "Direct visits must not invent a selected part.");
assert(directHtml.includes('id="bodyNextBtn" type="button" disabled'), "The direct flow must still require a part selection.");

assert(appSource.includes('document.body.classList.toggle("body-check-light", bodyCheck)'));
assert(appSource.includes('document.documentElement.classList.toggle("body-check-light", bodyCheck)'));
assert(indexHtml.includes('document.documentElement.classList.add("body-check-light")'), "Direct loads need the light class before first paint.");
assert(bodyCheckBootstrap.includes("background:#f7fbf8"), "The direct-route bootstrap must use the light surface.");
assert(!bodyCheckBootstrap.includes("#06171e"), "The retired dark bootstrap must not return.");
assert(bodyCheckBootstrap.includes("症状のセルフチェックを開く"));
assert(styles.includes("/* Body check: route-scoped light interface shared with the home experience. */"));
const scopedStyles = styles.split("/* Body check: route-scoped light interface shared with the home experience. */")[1];
assert(scopedStyles.includes("grid-template-columns: repeat(var(--step-count), minmax(0, 1fr));"));
assert(!scopedStyles.includes("overflow-x: auto"), "The light progress UI must not reintroduce an internal horizontal scroller.");
assert(!scopedStyles.includes("!important"), "The route theme must not depend on forced overrides.");

["YOUR BODY TRACE", "TRACE COMPLETE", "MY BODY / LOCAL RECORD", "HEALTH CHECK LAB TRENDS", "NEXT SIGNALS"].forEach((label) => {
  assert(!bodyCheckSource.includes(label), `Decorative English label remains: ${label}`);
});

console.log("Body-check light theme regression checks passed.");
