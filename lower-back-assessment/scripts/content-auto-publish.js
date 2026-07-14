const { spawnSync } = require("child_process");
const path = require("path");
const {
  ARTICLE_INDEX_PATH,
  REQUIRED_ARTICLE_FIELDS,
  articlePath,
  readJson,
  today,
  validateContent,
  writeJson
} = require("./content-utils");

const root = path.resolve(__dirname, "..");
const notificationPath = "content-notification.json";
const reelTitlePrefix = "鍼灸師が考える";
const forbiddenExpressions = [
  "必ず治る",
  "根本治療できる",
  "完全に改善する",
  "絶対に効果がある",
  "薬より優れている",
  "どんな人にも効く",
  "名古屋で一番",
  "おすすめNo.1"
];
const placeholderPatterns = [/TODO/i, /placeholder/i, /ここに記載します/, /仮文章/];

function flatten(value) {
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(flatten).join(" ");
  return String(value || "");
}

function hasText(value, min = 1) {
  return typeof value === "string" && value.trim().length >= min;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function npmRun(script) {
  run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script]);
}

function writeNotification(article, status, reasons) {
  writeJson(root, notificationPath, {
    event: status === "published" ? "published" : "publish_skipped",
    checkedAt: new Date().toISOString(),
    title: article?.title || "",
    slug: article?.slug || "",
    category: article?.category || "",
    status: article?.status || "unknown",
    url: status === "published" ? `/health-library/${article.slug}` : "",
    warnings: reasons,
    previewCommand: article?.slug ? `npm run content:preview -- --slug=${article.slug}` : "",
    approval: article?.slug ? `Review ${articlePath(article.slug)} before publishing.` : ""
  });
}

function generatedSlug() {
  const note = readJson(root, notificationPath, {});
  if (note.slug) return note.slug;
  const slugs = readJson(root, ARTICLE_INDEX_PATH, []);
  return slugs[slugs.length - 1] || "";
}

function referenceIsValid(item) {
  if (!item || typeof item !== "object") return false;
  if (!hasText(item.title, 8)) return false;
  if (!hasText(item.url, 12)) return false;
  try {
    const url = new URL(item.url);
    return ["https:", "http:"].includes(url.protocol) && !/example\.com|localhost/i.test(url.hostname);
  } catch {
    return false;
  }
}

function safetyReasons(article) {
  const reasons = [];
  const content = validateContent(root);
  reasons.push(...content.errors);

  REQUIRED_ARTICLE_FIELDS.forEach((field) => {
    if (!(field in article)) reasons.push(`Missing required field: ${field}`);
  });
  if (article.status !== "draft") reasons.push(`Expected draft status before auto publish, got ${article.status}`);
  if ((article.qualityWarnings || []).length) reasons.push(`qualityWarnings remain: ${article.qualityWarnings.join(" / ")}`);
  if (!Array.isArray(article.references) || article.references.length < 1) reasons.push("References are missing.");
  if (Array.isArray(article.references) && !article.references.every(referenceIsValid)) {
    reasons.push("Every reference must include a realistic title and http(s) URL.");
  }
  if (!Array.isArray(article.faq) || article.faq.length < 1) reasons.push("FAQ is missing.");
  if (!Array.isArray(article.selfCare) || article.selfCare.length < 1) reasons.push("selfCare is missing.");
  if (!Array.isArray(article.doctorVisitSigns) || article.doctorVisitSigns.length < 1) reasons.push("doctorVisitSigns is missing.");
  if (!hasText(article.reelTitle, 8) || !article.reelTitle.startsWith(reelTitlePrefix)) {
    reasons.push(`reelTitle must start with ${reelTitlePrefix}`);
  }
  if (!hasText(article.reelScript, 120)) reasons.push("reelScript is too short.");
  if (!hasText(article.instagramCaption, 80)) reasons.push("instagramCaption is too short.");
  if (!hasText(article.youtubeDescription, 60)) reasons.push("youtubeDescription is too short.");
  if (!hasText(article.medicalDisclaimer, 20)) reasons.push("medicalDisclaimer is missing.");

  const text = flatten(article);
  forbiddenExpressions.forEach((phrase) => {
    if (text.includes(phrase)) reasons.push(`Forbidden medical or ranking expression: ${phrase}`);
  });
  placeholderPatterns.forEach((pattern) => {
    if (pattern.test(text)) reasons.push(`Placeholder text remains: ${pattern}`);
  });

  return [...new Set(reasons)];
}

function main() {
  const slug = generatedSlug();
  if (!slug) {
    console.log("No generated article slug found.");
    return;
  }
  const article = readJson(root, articlePath(slug), null);
  if (!article) {
    throw new Error(`Generated article not found: ${slug}`);
  }

  const reasons = safetyReasons(article);
  if (reasons.length) {
    console.log(`Auto publish skipped for ${slug}.`);
    reasons.forEach((reason) => console.log(`- ${reason}`));
    writeNotification(article, "skipped", reasons);
    return;
  }

  article.status = "published";
  article.noindex = false;
  article.publishedAt = article.publishedAt || today();
  article.datePublished = article.datePublished || article.publishedAt;
  article.updatedAt = today();
  article.dateModified = today();
  article.generationStatus = "published";
  writeJson(root, articlePath(slug), article);

  npmRun("content:validate");
  npmRun("build");
  npmRun("seo:validate");
  npmRun("links:check");

  writeNotification(article, "published", []);
  console.log(`Auto published article: /health-library/${slug}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
