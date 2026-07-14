const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const required = [
  "index.html",
  "app.js",
  "styles.css",
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

console.log("Dist page check passed.");
