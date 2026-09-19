const fs = require("fs");
const path = require("path");
const { generateSiteAssets } = require("./generate-site-assets");
const { exportSanityArticles } = require("./sanity-export");
const { generateSanitySiteAssets } = require("./sanity-site-assets");
const { generateSanityMediaAssets } = require("./sanity-media-assets");
const { generateMedicalTopicAssets } = require("./medical-topic-assets");
const { writeIndexNowVerificationFile } = require("./indexnow");
const { validateContent } = require("./content-utils");
const { SITE_URL, SITE_URL_TOKEN, injectSiteUrl } = require("./site-url");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const files = [
  "index.html",
  "404.html",
  "analytics.js",
  "body-check-ui.js",
  "ec-home-ui.js",
  "app.js",
  "sanity-health-library.js",
  "sanity-health-library-toc-fix.js",
  "sanity-health-library-media.js",
  "entity-links.js",
  "styles.css",
  "sanity-health-library.css",
  "sanity-health-library-media.css",
  "ec-home.css",
  "_headers",
  "_redirects",
  "supabase-community-insights.sql",
  "supabase-muscle-diagnosis-analytics.sql"
];

const folders = ["about", "body-check", "clinic-profile", "community", "faq", "health-check", "health-library"];

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

function injectSiteUrlIntoBuild(directory) {
  const textExtensions = new Set([".html", ".js", ".json", ".xml", ".txt"]);
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      injectSiteUrlIntoBuild(file);
      return;
    }
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name))) return;
    const content = fs.readFileSync(file, "utf8");
    if (content.includes(SITE_URL_TOKEN)) fs.writeFileSync(file, injectSiteUrl(content), "utf8");
  });
}

async function build() {
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
  const sanityExport = await exportSanityArticles({ root, dist });
  const sanityAssets = generateSanitySiteAssets({ dist, articles: sanityExport.articles });
  const mediaAssets = generateSanityMediaAssets({ dist, articles: sanityExport.articles });
  const medicalTopics = generateMedicalTopicAssets({ root, dist, articles: sanityExport.articles });
  const indexNow = writeIndexNowVerificationFile(dist);
  injectSiteUrlIntoBuild(dist);
  fs.writeFileSync(path.join(dist, "site-config.json"), `${JSON.stringify({ siteUrl: SITE_URL }, null, 2)}\n`, "utf8");
  console.log(`Generated Sanity health-library pages: ${sanityAssets.sanityArticlePageCount}`);
  console.log(`Generated Sanity category pages: ${mediaAssets.categoryCount}`);
  if (mediaAssets.isolatedArticleCount) {
    console.warn(`Sanity isolated article warnings: ${mediaAssets.isolatedArticleCount}`);
  }
  console.log(`Generated medically reviewed topic hubs: ${medicalTopics.published.length}. Awaiting review: ${medicalTopics.pending.length}.`);
  console.log(indexNow.enabled ? "Generated IndexNow ownership verification file." : "IndexNow is disabled because INDEXNOW_KEY is not configured.");

  console.log(`Health Check Lab static files copied to dist for ${SITE_URL}.`);
}

build().catch((error) => {
  console.error(`Health Check Lab build failed: ${error.message}`);
  process.exit(1);
});
