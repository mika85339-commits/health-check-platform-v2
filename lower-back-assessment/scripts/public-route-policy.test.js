const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { SITE_URL } = require("./site-url");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const html = (relative) => fs.readFileSync(path.join(dist, relative), "utf8");
const sitemap = html("sitemap.xml");
const shell = html("index.html");
const entry = html("body-check/index.html");
const redirects = html("_redirects");
const parts = ["neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip", "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"];

assert(fs.existsSync(path.join(dist, "clinic-profile", "index.html")));
assert(fs.existsSync(path.join(dist, "body-guide", "index.html")));
for (const guide of ["neck", "shoulder", "lower-back", "hip", "knee"]) {
  assert(fs.existsSync(path.join(dist, "body-check", guide, "index.html")), `Missing SEO guide: ${guide}`);
}
for (const route of ["about", "health-check", "community"]) {
  assert(!fs.existsSync(path.join(dist, route, "index.html")), `Retired page still exists: ${route}`);
}
assert(/^\/about\/ \/clinic-profile\/ 301$/m.test(redirects));
assert(/^\/about \/clinic-profile\/ 301$/m.test(redirects));
assert(!/^\/body-check\/?\s/m.test(redirects), "A server redirect could intercept ?part=");

assert(entry.includes('<meta name="robots" content="noindex,follow" data-route-noindex="body-check" />'));
assert(!/<link rel="canonical"/.test(entry));
for (const marker of ['<header class="site-header">', '<main id="app" tabindex="-1">', '<footer class="site-footer">', '/styles.css?', '/app.js?', '/body-check-ui.js?']) {
  assert(entry.includes(marker), `Body-check shell missing ${marker}`);
}
assert.deepEqual(
  [...entry.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]),
  [...shell.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]),
  "Body-check must retain the SPA script graph"
);
assert(shell.includes('id="body-selector"') || fs.readFileSync(path.join(root, "ec-home-ui.js"), "utf8").includes('id="body-selector"'));
assert(fs.readFileSync(path.join(root, "app.js"), "utf8").includes('location.replace("/#body-selector")'));

for (const route of ["body-check", "about", "health-check", "community"]) {
  assert(!sitemap.includes(`<loc>${SITE_URL}/${route}</loc>`));
  assert(!sitemap.includes(`<loc>${SITE_URL}/${route}/</loc>`));
}
assert(sitemap.includes(`<loc>${SITE_URL}/clinic-profile</loc>`));
for (const guide of ["neck", "shoulder", "lower-back", "hip", "knee"]) {
  assert(sitemap.includes(`<loc>${SITE_URL}/body-check/${guide}/</loc>`));
}

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? htmlFiles(target) : entry.name.endsWith(".html") ? [target] : [];
  });
}

for (const file of htmlFiles(dist)) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\bhref=["']([^"']+)["']/g)) {
    if (!match[1].startsWith("/")) continue;
    const link = new URL(match[1].replace(/&amp;/g, "&"), SITE_URL);
    assert(!["/about", "/health-check", "/community"].includes(link.pathname.replace(/\/$/, "")), `Retired internal link in ${path.relative(dist, file)}: ${match[1]}`);
    assert(link.pathname.replace(/\/$/, "") !== "/body-check" || link.searchParams.has("part"), `Unselected body-check link in ${path.relative(dist, file)}: ${match[1]}`);
    assert(link.pathname !== "/body-check" || !link.searchParams.has("part"), `Redirecting diagnosis link in ${path.relative(dist, file)}: ${match[1]}`);
  }
}

const bodyCheckSource = fs.readFileSync(path.join(root, "body-check-ui.js"), "utf8");
const partOrder = bodyCheckSource.match(/const partOrder = (\[[^;]+\]);/)?.[1];
assert(partOrder, "Body-check part order is unavailable");
assert.deepEqual(JSON.parse(partOrder), parts);

const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const renderBodyCheck = appSource.match(/function renderBodyCheck\(\) \{[\s\S]*?\n\}\n\nfunction renderSnsTrust/)?.[0].replace(/\n\nfunction renderSnsTrust$/, "");
assert(renderBodyCheck, "Body-check route handler is unavailable");
function runBodyCheckRoute(search) {
  const result = { replaced: null, initialized: 0, rendered: false };
  const sandbox = {
    URLSearchParams,
    location: { search, replace(url) { result.replaced = url; } },
    history: { replaceState() { throw new Error("Unexpected invalid-part fallback"); } },
    BodyCheck: {
      getPartMeta() { return parts.map((id) => ({ id })); },
      init() { result.initialized += 1; }
    },
    $() { return { set innerHTML(value) { result.rendered = value.includes('id="bodyCheckRoot"'); } }; }
  };
  vm.runInNewContext(`${renderBodyCheck}\nrenderBodyCheck();`, sandbox);
  return result;
}
assert.deepEqual(runBodyCheckRoute(""), { replaced: "/#body-selector", initialized: 0, rendered: false });
for (const part of parts) {
  assert.deepEqual(runBodyCheckRoute(`?part=${part}`), { replaced: null, initialized: 1, rendered: true }, `Broken diagnosis route: ${part}`);
}

const metadataSource = appSource.match(/const ROUTE_METADATA = \{[\s\S]*?\nconst routes = /)?.[0].replace(/\nconst routes = $/, "");
assert(metadataSource, "Route metadata handler is unavailable");
function headElement(tag, attributes = {}) {
  return {
    tag,
    attributes: { ...attributes },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] || null; },
    remove() { head.elements.splice(head.elements.indexOf(this), 1); }
  };
}
const head = {
  elements: [],
  appendChild(element) { this.elements.push(element); },
  querySelector(selector) {
    const match = selector.match(/^(\w+)\[([^=]+)="([^"]+)"\]$/);
    if (!match) throw new Error(`Unexpected head selector: ${selector}`);
    return this.elements.find((element) => element.tag === match[1] && element.getAttribute(match[2]) === match[3]) || null;
  }
};
head.appendChild(headElement("link", { rel: "canonical", href: `${SITE_URL}/` }));
const metadataDocument = { head, title: "", createElement: (tag) => headElement(tag) };
const metadataContext = vm.createContext({ document: metadataDocument, SITE_URL });
vm.runInContext(metadataSource, metadataContext);
vm.runInContext('applyRouteMetadata("/body-check")', metadataContext);
assert.equal(head.querySelector('meta[data-route-noindex="body-check"]')?.getAttribute("content"), "noindex,follow");
assert.equal(head.querySelector('link[rel="canonical"]'), null);
vm.runInContext('applyRouteMetadata("/")', metadataContext);
assert.equal(head.querySelector('meta[data-route-noindex="body-check"]'), null);
assert.equal(head.querySelector('link[rel="canonical"]')?.getAttribute("href"), `${SITE_URL}/`);
console.log("Public route policy checks passed: 13 functional parts, 5 SEO guides, 3 retired routes, no unselected body-check links.");
