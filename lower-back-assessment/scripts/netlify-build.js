const fs = require("fs");
const path = require("path");
const { generateSiteAssets } = require("./generate-site-assets");
const { validateContent } = require("./content-utils");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const files = [
  "index.html",
  "app.js",
  "styles.css",
  "_headers",
  "_redirects",
  "supabase-community-insights.sql"
];

const folders = ["about", "body-check", "community", "faq", "health-check", "health-library"];

function copyFile(name) {
  const from = path.join(root, name);
  const to = path.join(dist, name);
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function copyFolder(name) {
  const from = path.join(root, name);
  const to = path.join(dist, name);
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true });
}

const validation = validateContent(root);
if (validation.errors.length) {
  console.error("Build stopped because content validation failed:");
  validation.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
validation.warnings.forEach((warning) => console.warn(`Warning: ${warning}`));

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
files.forEach(copyFile);
folders.forEach(copyFolder);
generateSiteAssets();

console.log("Health Check Lab static files copied to dist.");
