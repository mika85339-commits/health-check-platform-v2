const path = require("path");
const {
  ARTICLE_INDEX_PATH,
  TOPICS_PATH,
  articlePath,
  readJson,
  slugify,
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

const title = args.title || process.env.CONTENT_TITLE;
const category = args.category || process.env.CONTENT_CATEGORY || "SNS健康情報";
const slug = args.slug || slugify(title);

if (!title) {
  console.error("Usage: npm run content:add -- --title=\"記事タイトル\" --category=\"SNS健康情報\" [--slug=\"custom-slug\"]");
  process.exit(1);
}

const current = validateContent(root);
if (current.slugs.includes(slug)) {
  console.error(`Slug already exists: ${slug}`);
  process.exit(1);
}

const article = {
  title,
  slug,
  category,
  tags: [],
  verdict: "⚠️ 一部正しい",
  description: "",
  conclusion: "ここに記載します。",
  snsClaim: "ここに記載します。",
  whyItSpread: "ここに記載します。",
  currentEvidence: "ここに記載します。",
  commonMisunderstandings: "ここに記載します。",
  practicalView: "ここに記載します。",
  acupuncturistView: "ここに記載します。",
  faq: [{ question: "ここに記載します。", answer: "ここに記載します。" }],
  summary: "ここに記載します。",
  references: [],
  createdAt: today(),
  updatedAt: today(),
  publishedAt: null,
  status: "draft"
};

const slugs = readJson(root, ARTICLE_INDEX_PATH, []);
writeJson(root, ARTICLE_INDEX_PATH, [...slugs, slug]);
writeJson(root, articlePath(slug), article);

const topics = readJson(root, TOPICS_PATH, []);
if (!topics.some((topic) => topic.slug === slug)) {
  topics.push({ title, slug, category, status: "unused" });
  writeJson(root, TOPICS_PATH, topics);
}

console.log(`Created draft article: ${articlePath(slug)}`);
