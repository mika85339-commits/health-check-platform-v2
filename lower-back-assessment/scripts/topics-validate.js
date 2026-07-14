const path = require("path");
const { readJson, TOPICS_PATH } = require("./content-utils");

const root = path.resolve(__dirname, "..");
const topics = readJson(root, TOPICS_PATH, []);
const allowedCategories = new Set([
  "ストレッチ",
  "姿勢・骨盤矯正",
  "筋膜・トリガーポイント",
  "筋トレ・運動",
  "痛み・神経",
  "鍼灸・治療",
  "SNS健康情報"
]);
const seedSlugs = new Set(["sns-health-claims"]);
const numberedTopics = topics.filter((topic) => !seedSlugs.has(topic.slug));
const errors = [];
const titles = new Set();
const slugs = new Set();
const categoryCounts = {};

topics.forEach((topic, index) => {
  ["title", "slug", "category", "status"].forEach((field) => {
    if (!topic[field]) errors.push(`topics[${index}] missing ${field}`);
  });
  if (topic.status !== "unused") errors.push(`${topic.slug} status must be unused`);
  if (!allowedCategories.has(topic.category)) errors.push(`${topic.slug} has invalid category: ${topic.category}`);
  if (titles.has(topic.title)) errors.push(`duplicate title: ${topic.title}`);
  if (slugs.has(topic.slug)) errors.push(`duplicate slug: ${topic.slug}`);
  titles.add(topic.title);
  slugs.add(topic.slug);
});

numberedTopics.forEach((topic) => {
  categoryCounts[topic.category] = (categoryCounts[topic.category] || 0) + 1;
});

if (numberedTopics.length !== 100) {
  errors.push(`numbered truth-check topics must be 100, found ${numberedTopics.length}`);
}

console.log(JSON.stringify({
  fileTotal: topics.length,
  numberedTopics: numberedTopics.length,
  categoryCounts,
  duplicateTitles: 0,
  duplicateSlugs: 0,
  allUnused: topics.every((topic) => topic.status === "unused")
}, null, 2));

if (errors.length) {
  console.error("\nTopic validation errors:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("Topic validation passed.");
