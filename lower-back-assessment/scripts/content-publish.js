const path = require("path");
const {
  ARTICLE_INDEX_PATH,
  articlePath,
  readJson,
  today,
  validateContent,
  writeJson
} = require("./content-utils");

const root = path.resolve(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || true];
  })
);

const slug = args.slug;
if (!slug) {
  console.error("Usage: npm run content:publish -- --slug=article-slug");
  process.exit(1);
}

const slugs = readJson(root, ARTICLE_INDEX_PATH, []);
if (!slugs.includes(slug)) {
  console.error(`Article is not registered in index: ${slug}`);
  process.exit(1);
}

const article = readJson(root, articlePath(slug), null);
if (!article) {
  console.error(`Article not found: ${slug}`);
  process.exit(1);
}

if (article.status !== "published") {
  console.error(`Approval required: change status from ${article.status} to published in ${articlePath(slug)}.`);
  process.exit(1);
}

article.noindex = false;
article.publishedAt = article.publishedAt || today();
article.datePublished = article.datePublished || article.publishedAt;
article.updatedAt = today();
article.dateModified = today();
article.generationStatus = article.generationStatus === "published" ? "published" : "reviewed";
writeJson(root, articlePath(slug), article);

const result = validateContent(root);
if (result.errors.length) {
  result.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

writeJson(root, "content-notification.json", {
  event: "published",
  publishedAt: new Date().toISOString(),
  title: article.title,
  slug: article.slug,
  category: article.category,
  status: article.status,
  url: `/health-library/${article.slug}`,
  warnings: result.warnings
});

console.log(`Approved for publishing: /health-library/${article.slug}`);
