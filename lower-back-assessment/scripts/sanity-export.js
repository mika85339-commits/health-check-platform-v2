const fs = require("fs");
const path = require("path");
const { fetchSanityPosts } = require("./sanity-client");
const { normalizeSanityArticles, summarizeArticle } = require("./sanity-article-mapper");
const { ARTICLE_INDEX_PATH, readJson, writeJson } = require("./content-utils");

const SANITY_ARTICLE_DATA_DIR = "data/sanity-articles";

function writeEmptyExport(dist, metadata) {
  writeJson(dist, `${SANITY_ARTICLE_DATA_DIR}/index.json`, []);
  writeJson(dist, `${SANITY_ARTICLE_DATA_DIR}/_meta.json`, metadata);
}

function removeOldSanityArticleDetails(dist) {
  const outputDir = path.join(dist, SANITY_ARTICLE_DATA_DIR);
  if (!fs.existsSync(outputDir)) return;
  fs.readdirSync(outputDir).forEach((file) => {
    if (file === "index.json" || file === "_meta.json") return;
    if (file.endsWith(".json")) fs.rmSync(path.join(outputDir, file), { force: true });
  });
}

async function exportSanityArticles(options = {}) {
  const root = options.root || path.resolve(__dirname, "..");
  const dist = options.dist || path.join(root, "dist");
  const logger = options.logger || console;
  const generatedAt = new Date().toISOString();
  const existingSlugs = readJson(root, ARTICLE_INDEX_PATH, []);

  fs.mkdirSync(path.join(dist, SANITY_ARTICLE_DATA_DIR), { recursive: true });

  let fetched;
  try {
    fetched = await fetchSanityPosts({ env: options.env || process.env, logger });
  } catch (error) {
    logger.error(`[sanity] Article export failed: ${error.message}`);
    throw error;
  }

  if (fetched.skipped) {
    writeEmptyExport(dist, {
      generatedAt,
      source: "sanity",
      skipped: true,
      missingEnvironmentVariables: fetched.missing,
      fetchedCount: 0,
      exportedCount: 0,
      excluded: [],
      duplicateSlugs: []
    });
    return {
      skipped: true,
      fetchedCount: 0,
      exportedCount: 0,
      excluded: [],
      duplicateSlugs: [],
      outputDir: path.join(dist, SANITY_ARTICLE_DATA_DIR)
    };
  }

  const normalized = normalizeSanityArticles(fetched.posts, {
    projectId: fetched.config.projectId,
    dataset: fetched.config.dataset,
    existingSlugs,
    image: { width: 1200, quality: 82 }
  });

  removeOldSanityArticleDetails(dist);

  const summaries = normalized.articles.map(summarizeArticle);
  writeJson(dist, `${SANITY_ARTICLE_DATA_DIR}/index.json`, summaries);
  normalized.articles.forEach((article) => {
    writeJson(dist, `${SANITY_ARTICLE_DATA_DIR}/${article.slug}.json`, article);
  });

  const metadata = {
    generatedAt,
    source: "sanity",
    skipped: false,
    projectId: fetched.config.projectId,
    dataset: fetched.config.dataset,
    apiVersion: fetched.config.apiVersion,
    fetchedCount: fetched.posts.length,
    exportedCount: normalized.articles.length,
    excluded: normalized.excluded,
    duplicateSlugs: normalized.duplicateSlugs,
    output: {
      index: `${SANITY_ARTICLE_DATA_DIR}/index.json`,
      details: `${SANITY_ARTICLE_DATA_DIR}/{slug}.json`
    }
  };
  writeJson(dist, `${SANITY_ARTICLE_DATA_DIR}/_meta.json`, metadata);

  normalized.duplicateSlugs.forEach((entry) => {
    logger.warn(`[sanity] Slug also exists in ${entry.source}: ${entry.slug}`);
  });
  normalized.excluded.forEach((entry) => {
    logger.warn(`[sanity] Excluded post ${entry.slug || entry.id || "unknown"}: ${entry.reasons.join(", ")}`);
  });
  logger.log(`[sanity] Exported ${normalized.articles.length} Sanity article JSON file(s) to ${SANITY_ARTICLE_DATA_DIR}.`);

  return {
    skipped: false,
    fetchedCount: fetched.posts.length,
    exportedCount: normalized.articles.length,
    excluded: normalized.excluded,
    duplicateSlugs: normalized.duplicateSlugs,
    outputDir: path.join(dist, SANITY_ARTICLE_DATA_DIR)
  };
}

if (require.main === module) {
  exportSanityArticles()
    .then((result) => {
      console.log(
        `[sanity] Export complete. fetched=${result.fetchedCount} exported=${result.exportedCount} excluded=${result.excluded.length} duplicates=${result.duplicateSlugs.length}`
      );
    })
    .catch(() => process.exit(1));
}

module.exports = { SANITY_ARTICLE_DATA_DIR, exportSanityArticles };
