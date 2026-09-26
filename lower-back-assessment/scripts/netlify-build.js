const fs = require("fs");
const path = require("path");
const { generateSiteAssets } = require("./generate-site-assets");
const { exportSanityArticles } = require("./sanity-export");
const { generateSanitySiteAssets } = require("./sanity-site-assets");
const { generateSanityMediaAssets } = require("./sanity-media-assets");
const { generateMedicalTopicAssets } = require("./medical-topic-assets");
const { generateBodyGuideAssets } = require("./body-guide-assets");
const { writeIndexNowVerificationFile } = require("./indexnow");
const { validateContent } = require("./content-utils");
const { SITE_URL, SITE_URL_TOKEN, injectSiteUrl } = require("./site-url");
const { GA_MEASUREMENT_ID_TOKEN, injectGaMeasurementId, resolveGaMeasurementId } = require("./analytics-config");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const files = [
  "index.html",
  "404.html",
  "analytics-bootstrap.js",
  "analytics.js",
  "body-platform.js",
  "sponsor-platform.js",
  "muscle-image-loader.js",
  "body-check-ui.js",
  "body-guide.js",
  "ec-home-ui.js",
  "site-menu.js",
  "app.js",
  "health-library-content.js",
  "sanity-health-library.js",
  "sanity-health-library-toc-fix.js",
  "sanity-health-library-media.js",
  "entity-links.js",
  "styles.css",
  "body-guide.css",
  "sanity-health-library.css",
  "sanity-health-library-media.css",
  "ec-home.css",
  "_headers",
  "_redirects",
  "supabase-community-insights.sql",
  "supabase-muscle-diagnosis-analytics.sql",
  "supabase-body-platform.sql",
  "supabase-sponsor-phase1.sql"
];

const folders = ["about", "body-check", "clinic-profile", "community", "faq", "health-check", "health-library", "home-screen"];

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

function copyWeeklyAnalyticsAssets() {
  const source = path.join(root, "admin", "weekly-analytics");
  const target = path.join(dist, "admin", "weekly-analytics-assets");
  ["dashboard.css", "dashboard-model.js", "dashboard.js"].forEach((name) => {
    const from = path.join(source, name);
    if (!fs.existsSync(from)) throw new Error(`Missing weekly analytics asset: ${name}`);
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(from, path.join(target, name));
  });
}

function copyLocalHealthLibraryPreview() {
  if (process.env.HEALTH_LIBRARY_LOCAL_PREVIEW !== "true") return {};
  const from = path.join(root, "content", "local-preview", "health-library-articles.json");
  const to = path.join(dist, "data", "health-library-preview.json");
  if (!fs.existsSync(from)) return {};
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return JSON.parse(fs.readFileSync(from, "utf8")).articles || {};
}

function injectBuildConfiguration(directory) {
  const textExtensions = new Set([".html", ".js", ".json", ".xml", ".txt"]);
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      injectBuildConfiguration(file);
      return;
    }
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name))) return;
    let content = fs.readFileSync(file, "utf8");
    if (content.includes(SITE_URL_TOKEN)) content = injectSiteUrl(content);
    if (content.includes(GA_MEASUREMENT_ID_TOKEN)) content = injectGaMeasurementId(content);
    fs.writeFileSync(file, content, "utf8");
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
  copyWeeklyAnalyticsAssets();
  const localHealthLibraryPreviews = copyLocalHealthLibraryPreview();
  generateSiteAssets();
  const sanityExport = await exportSanityArticles({ root, dist });
  const sanityArticlesForSite = sanityExport.articles.map((article) => (
    localHealthLibraryPreviews[article.slug]
      ? { ...article, localPreview: localHealthLibraryPreviews[article.slug] }
      : article
  ));
  const sanityAssets = generateSanitySiteAssets({ dist, articles: sanityArticlesForSite });
  const bodyGuides = generateBodyGuideAssets({ dist, articles: sanityExport.articles });
  const mediaAssets = generateSanityMediaAssets({ dist, articles: sanityExport.articles });
  const medicalTopics = generateMedicalTopicAssets({ root, dist, articles: sanityExport.articles });
  const indexNow = writeIndexNowVerificationFile(dist);
  injectBuildConfiguration(dist);
  fs.writeFileSync(path.join(dist, "site-config.json"), `${JSON.stringify({ siteUrl: SITE_URL, gaMeasurementId: resolveGaMeasurementId() }, null, 2)}\n`, "utf8");
  console.log(`Generated Sanity health-library pages: ${sanityAssets.sanityArticlePageCount}`);
  console.log(`Generated Sanity category pages: ${mediaAssets.categoryCount}`);
  console.log(`Generated body-check search entry pages: ${bodyGuides.guideCount}.`);
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
