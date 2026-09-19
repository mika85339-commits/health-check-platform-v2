const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const required = [
  "index.html",
  "404.html",
  "app.js",
  "body-check-ui.js",
  "ec-home-ui.js",
  "styles.css",
  "ec-home.css",
  "sitemap.xml",
  "robots.txt",
  "content/truth-check/articles/index.json",
  "content/truth-check/categories.json",
  "content/truth-check/related.json"
];

const missing = required.filter((file) => !fs.existsSync(path.join(dist, file)));
if (missing.length) {
  console.error("Missing dist files:");
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

const app = fs.readFileSync(path.join(dist, "app.js"), "utf8");
["renderHome", "renderBodyCheck", "renderSnsTrust", "renderHealthLibrary"].forEach((token) => {
  if (!app.includes(token)) {
    console.error(`Missing app route token: ${token}`);
    process.exit(1);
  }
});

const notFound = fs.readFileSync(path.join(dist, "404.html"), "utf8");
if (!/data-page=["']not-found["']/.test(notFound) || !/name=["']robots["'][^>]+noindex,follow/i.test(notFound)) {
  console.error("404.html must contain the dedicated not-found marker and noindex,follow.");
  process.exit(1);
}

const redirects = fs.readFileSync(path.join(dist, "_redirects"), "utf8");
if (/^\s*\/\*\s+\/index\.html\s+200\s*$/m.test(redirects)) {
  console.error("Catch-all SPA rewrite must not return index.html with HTTP 200.");
  process.exit(1);
}
const netlifyConfig = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
if (/\[\[redirects\]\][\s\S]*?from\s*=\s*["']\/\*["'][\s\S]*?status\s*=\s*200/i.test(netlifyConfig)) {
  console.error("netlify.toml must not contain a catch-all HTTP 200 rewrite.");
  process.exit(1);
}

const knownRoutes = ["/", "/health-library", "/body-check", "/about", "/health-library/acupuncture-care"];
const sanityArticles = JSON.parse(fs.readFileSync(path.join(dist, "data/sanity-articles/index.json"), "utf8"));
if (sanityArticles.length < 3) {
  console.error(`Expected at least 3 Sanity articles, received ${sanityArticles.length}.`);
  process.exit(1);
}
knownRoutes.push(`/health-library/${sanityArticles[0].slug}`);
knownRoutes.forEach((route) => {
  const relative = route === "/" ? "index.html" : path.join(route.replace(/^\//, ""), "index.html");
  if (!fs.existsSync(path.join(dist, relative))) {
    console.error(`Known public route is missing its static entry: ${route}`);
    process.exit(1);
  }
});

console.log("Dist page check passed.");
