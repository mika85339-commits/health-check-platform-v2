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
const { SITE_ENTITY } = require("./site-entity");

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

function specialtyTagsForCategory(value) {
  const base = {
    "ストレッチ": ["運動器", "筋肉評価"],
    "姿勢・骨盤矯正": ["運動器", "動作分析"],
    "筋膜・トリガーポイント": ["慢性痛", "筋肉評価"],
    "筋トレ・運動": ["運動器", "動作分析"],
    "痛み・神経": ["慢性痛", "運動器"],
    "鍼灸・治療": ["鍼灸", "慢性痛"],
    "SNS健康情報": ["健康情報検証"]
  };
  return base[value] || [];
}

if (!title) {
  console.error('Usage: npm run content:add -- --title="記事タイトル" --category="SNS健康情報" [--slug="custom-slug"]');
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
  conclusion: "ここに結論を記載します。",
  snsClaim: "SNSでよく言われることを記載します。",
  whyItSpread: "なぜそう言われるのかを記載します。",
  currentEvidence: "現在の研究で分かっていることを記載します。確認できない文献は作らないでください。",
  commonMisunderstandings: "誤解されやすいポイントを記載します。",
  practicalView: "実際はどう考えればよいかを記載します。",
  acupuncturistView: "鍼灸師としての見解を記載します。",
  faq: [{ question: "よくある質問を記載します。", answer: "回答を記載します。" }],
  summary: "まとめを記載します。",
  references: [],
  authorName: SITE_ENTITY.supervisorName,
  authorUrl: SITE_ENTITY.clinicProfilePath,
  reviewedBy: SITE_ENTITY.supervisorName,
  reviewerUrl: SITE_ENTITY.clinicProfilePath,
  clinicName: SITE_ENTITY.clinicName,
  clinicUrl: SITE_ENTITY.clinicProfilePath,
  specialtyTags: specialtyTagsForCategory(category),
  datePublished: null,
  dateModified: today(),
  citation: [],
  relatedClinicPage: SITE_ENTITY.clinicProfilePath,
  reelTitle: "",
  reelScript: "",
  instagramCaption: "",
  youtubeDescription: "",
  generationStatus: "not_generated",
  generatedAt: null,
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
