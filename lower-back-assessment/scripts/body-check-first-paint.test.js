"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { bodyCheckEntryHtml } = require("./body-check-entry-page");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "index.html"), "utf8");
const entry = bodyCheckEntryHtml(source);
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert(entry.includes('classList.add("body-check-light","body-check-route-pending")'));
assert(entry.includes('document.body.classList.add("body-check-light")'));
assert(entry.indexOf("body-check-route-pending") < entry.indexOf("/styles.css?"), "The route class must be set before CSS can paint.");
assert(entry.indexOf('document.body.classList.add("body-check-light")') < entry.indexOf('<header class="site-header">'));
assert(!entry.includes("セルフチェックを準備しています"));
assert(!entry.includes("まもなく質問が表示されます。"));
assert(!entry.includes("body-check-entry-state"), "The normal entry screen must be removed completely.");
assert(entry.includes('class="body-check-load-failure"'), "Only an error fallback may render after the watchdog.");
assert(entry.includes('root.classList.remove("body-check-route-pending")'), "A stalled route must reveal its error fallback.");
assert(entry.includes('}, 3000);'), "The error fallback must not appear during a normal render.");
assert(entry.includes('<a href="">再読み込み</a>'), "The error fallback needs a retry action.");
assert(entry.includes('<meta name="robots" content="noindex,follow"'));
assert(!entry.includes('<link rel="canonical"'));
assert(entry.includes('/body-check-ui.js?') && entry.includes('/app.js?'));
assert(styles.includes("html.body-check-light #app,"), "The first paint must use the light route background before app.js runs.");
assert(styles.includes("html.body-check-route-pending #app {\n  visibility: hidden;"), "The entry must stay hidden until the first diagnosis render.");
assert(app.indexOf("BodyCheck.init();") < app.indexOf('dataset.bodyCheckReady = "true"'), "Ready must follow the first synchronous diagnosis render.");
assert(app.indexOf('if (!rendered) throw new Error("The first body-check screen did not render")') < app.indexOf('dataset.bodyCheckReady = "true"'), "Ready requires rendered question or result content.");
assert(app.includes('classList.remove("body-check-route-pending")'));

const initialMain = entry.match(/<main id="app" tabindex="-1">([\s\S]*?)<\/main>/)?.[1] || "";
assert(!initialMain.includes("body-check-entry-state") && !initialMain.includes("role=\"status\""));
assert(!initialMain.includes("body-selector") || initialMain.includes("<noscript>"));
assert(!initialMain.includes("BODY NETWORK") && !initialMain.includes("body-network-hero"));

console.log("Body-check first-paint shell checks passed.");
