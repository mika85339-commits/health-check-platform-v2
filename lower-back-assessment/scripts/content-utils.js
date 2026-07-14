const fs = require("fs");
const path = require("path");

const SITE_URL = process.env.SITE_URL || process.env.URL || "https://health-check-lab.netlify.app";
const CONTENT_DIR = "content/truth-check";
const ARTICLE_DIR = `${CONTENT_DIR}/articles`;
const TOPICS_PATH = `${CONTENT_DIR}/topics.json`;
const ARTICLE_INDEX_PATH = `${ARTICLE_DIR}/index.json`;
const VALID_TOPIC_STATUSES = new Set(["unused", "used"]);
const VALID_ARTICLE_STATUSES = new Set(["draft", "published"]);
const VALID_GENERATION_STATUSES = new Set(["not_generated", "draft", "reviewed", "published"]);
const REQUIRED_ARTICLE_FIELDS = [
  "title",
  "slug",
  "category",
  "verdict",
  "conclusion",
  "snsClaim",
  "whyItSpread",
  "currentEvidence",
  "commonMisunderstandings",
  "practicalView",
  "acupuncturistView",
  "faq",
  "summary",
  "references",
  "authorName",
  "authorUrl",
  "reviewedBy",
  "reviewerUrl",
  "clinicName",
  "clinicUrl",
  "specialtyTags",
  "datePublished",
  "dateModified",
  "citation",
  "relatedClinicPage",
  "reelTitle",
  "reelScript",
  "instagramCaption",
  "youtubeDescription",
  "generationStatus",
  "generatedAt",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "status"
];
const PLACEHOLDER_PATTERNS = [/ここに記載します/, /TODO/i, /仮文章/, /placeholder/i];

function readJson(root, relativePath, fallback = null) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function writeJson(root, relativePath, value) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function articlePath(slug) {
  return `${ARTICLE_DIR}/${slug}.json`;
}

function slugify(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `article-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readContent(root) {
  const topics = readJson(root, TOPICS_PATH, []);
  const slugs = readJson(root, ARTICLE_INDEX_PATH, []);
  const articles = slugs.map((slug) => ({ slug, data: readJson(root, articlePath(slug), null) }));
  return { topics, slugs, articles };
}

function articleDescription(article) {
  return article.description || article.summary || article.conclusion || `${article.title}の記事です。`;
}

function publicArticles(articles) {
  return articles
    .map((entry) => entry.data)
    .filter((article) => article && article.status === "published")
    .sort((a, b) => String(b.publishedAt || b.updatedAt).localeCompare(String(a.publishedAt || a.updatedAt)));
}

function buildCategories(articles) {
  const counts = new Map();
  articles.forEach((article) => counts.set(article.category, (counts.get(article.category) || 0) + 1));
  return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
}

function buildRelated(articles) {
  const related = {};
  articles.forEach((article) => {
    related[article.slug] = articles
      .filter((candidate) => candidate.slug !== article.slug && candidate.category === article.category)
      .slice(0, 3)
      .map((candidate) => candidate.slug);
  });
  return related;
}

function flattenText(value) {
  if (Array.isArray(value)) return value.map(flattenText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(flattenText).join(" ");
  return String(value || "");
}

function validateContent(root) {
  const { topics, slugs, articles } = readContent(root);
  const errors = [];
  const warnings = [];
  const slugSet = new Set();
  const titleSet = new Set();

  topics.forEach((topic, index) => {
    ["title", "slug", "category", "status"].forEach((field) => {
      if (!topic[field]) errors.push(`topics.json[${index}] missing ${field}`);
    });
    if (topic.status && !VALID_TOPIC_STATUSES.has(topic.status)) {
      errors.push(`topics.json[${index}] invalid status: ${topic.status}`);
    }
  });

  slugs.forEach((slug, index) => {
    if (slugSet.has(slug)) errors.push(`Duplicate article slug in index: ${slug}`);
    slugSet.add(slug);
    const entry = articles[index];
    if (!entry.data) {
      errors.push(`Missing article JSON: ${articlePath(slug)}`);
      return;
    }
    const article = entry.data;
    REQUIRED_ARTICLE_FIELDS.forEach((field) => {
      if (!(field in article)) errors.push(`${articlePath(slug)} missing ${field}`);
    });
    if (article.slug !== slug) errors.push(`${articlePath(slug)} slug mismatch: ${article.slug}`);
    if (article.status && !VALID_ARTICLE_STATUSES.has(article.status)) {
      errors.push(`${articlePath(slug)} invalid status: ${article.status}`);
    }
    if (article.generationStatus && !VALID_GENERATION_STATUSES.has(article.generationStatus)) {
      errors.push(`${articlePath(slug)} invalid generationStatus: ${article.generationStatus}`);
    }
    if (article.status === "published" && !article.publishedAt) {
      errors.push(`${articlePath(slug)} published article needs publishedAt`);
    }
    if (article.title) {
      if (titleSet.has(article.title)) errors.push(`Duplicate article title: ${article.title}`);
      titleSet.add(article.title);
    }
    if (!Array.isArray(article.faq)) errors.push(`${articlePath(slug)} faq must be an array`);
    if (!Array.isArray(article.references)) errors.push(`${articlePath(slug)} references must be an array`);
    if (!Array.isArray(article.specialtyTags)) errors.push(`${articlePath(slug)} specialtyTags must be an array`);
    if (!Array.isArray(article.citation)) errors.push(`${articlePath(slug)} citation must be an array`);
    if (article.status === "published") {
      if (!flattenText(article).includes("医療診断")) warnings.push(`${articlePath(slug)} medical disclaimer wording not found`);
      if (!article.references || article.references.length === 0) warnings.push(`${articlePath(slug)} references are empty`);
      if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(flattenText(article)))) {
        warnings.push(`${articlePath(slug)} still contains placeholder text`);
      }
    }
  });

  return { errors, warnings, topics, slugs, articles, publishedArticles: publicArticles(articles) };
}

module.exports = {
  ARTICLE_DIR,
  ARTICLE_INDEX_PATH,
  CONTENT_DIR,
  REQUIRED_ARTICLE_FIELDS,
  SITE_URL,
  VALID_GENERATION_STATUSES,
  TOPICS_PATH,
  articleDescription,
  articlePath,
  buildCategories,
  buildRelated,
  readContent,
  readJson,
  slugify,
  today,
  validateContent,
  writeJson
};
