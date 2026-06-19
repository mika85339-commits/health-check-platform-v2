const fs = require("fs");
const path = require("path");

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

const folders = ["about", "body-check", "community", "faq", "health-check"];

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

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
files.forEach(copyFile);
folders.forEach(copyFolder);

console.log("Health Check Lab static files copied to dist.");
