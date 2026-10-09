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
assert(entry.includes('<section class="body-check-entry-state" role="status"'));
assert(entry.includes("セルフチェックを準備しています"));
assert(entry.includes('<a href="">再読み込み</a>'), "The static entry needs a usable fallback if scripts fail.");
assert(entry.includes('<meta name="robots" content="noindex,follow"'));
assert(!entry.includes('<link rel="canonical"'));
assert(entry.includes('/body-check-ui.js?') && entry.includes('/app.js?'));
assert(styles.includes("html.body-check-light #app,"), "The first paint must use the light route background before app.js runs.");
assert(app.indexOf("BodyCheck.init();") < app.indexOf('dataset.bodyCheckReady = "true"'), "Ready must follow the first synchronous diagnosis render.");
assert(app.includes('classList.remove("body-check-route-pending")'));

const initialMain = entry.match(/<main id="app" tabindex="-1">([\s\S]*?)<\/main>/)?.[1] || "";
assert(initialMain.includes("body-check-entry-state"));
assert(!initialMain.includes("body-selector") || initialMain.includes("<noscript>"));
assert(!initialMain.includes("BODY NETWORK") && !initialMain.includes("body-network-hero"));

console.log("Body-check first-paint shell checks passed.");
