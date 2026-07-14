const fs = require("fs");
const path = require("path");
const {
  ARTICLE_DIR,
  ARTICLE_INDEX_PATH,
  SITE_URL,
  articlePath,
  readJson,
  validateContent
} = require("./content-utils");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const mode = process.argv.includes("--links") ? "links" : "seo";
const forbidden = [
  "必ず治る",
  "根本治療できる",
  "完全に改善する",
  "絶対に効果がある",
  "薬より優れている",
  "どんな人にも効く",
  "名古屋で一番",
  "名古屋で最も人気",
  "おすすめNo.1"
];
const placeholderPatterns = [/ここに記載します/, /仮文章/, /TODO/, /placeholder/i];

function flatten(value) {
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(flatten).join(" ");
  return String(value || "");
}

function isFilled(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function listHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(full);
    return entry.isFile() && entry.name.endsWith(".html") ? [full] : [];
  });
}

function validateJsonLd(errors) {
  listHtmlFiles(dist).forEach((file) => {
    const html = fs.readFileSync(file, "utf8");
    const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of matches) {
      try {
        JSON.parse(match[1]);
      } catch (error) {
        errors.push(`Invalid JSON-LD in ${path.relative(root, file)}: ${error.message}`);
      }
    }
  });
}

function validateCanonical(errors) {
  const seen = new Map();
  listHtmlFiles(dist).forEach((file) => {
    const html = fs.readFileSync(file, "utf8");
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];
    if (!canonical) return;
    if (seen.has(canonical)) {
      errors.push(`Duplicate canonical: ${canonical} in ${path.relative(root, file)} and ${path.relative(root, seen.get(canonical))}`);
    }
    seen.set(canonical, file);
  });
}

function validateLinks(errors) {
  if (!fs.existsSync(dist)) return;
  const htmlFiles = listHtmlFiles(dist);
  const paths = new Set(["/"]);
  htmlFiles.forEach((file) => {
    const relative = path.relative(dist, file).replace(/\\/g, "/");
    if (relative === "index.html") paths.add("/");
    else paths.add(`/${relative.replace(/\/index\.html$/, "/")}`);
  });
  ["body-check", "health-check", "health-library", "community", "about", "clinic-profile", "faq"].forEach((route) => paths.add(`/${route}`));

  htmlFiles.forEach((file) => {
    const html = fs.readFileSync(file, "utf8");
    const hrefs = [...html.matchAll(/\s(?:href|src)=["']([^"']+)["']/gi)].map((match) => match[1]);
    hrefs.forEach((href) => {
      if (/^(https?:|mailto:|tel:|#|data:)/.test(href)) return;
      const clean = href.split(/[?#]/)[0];
      if (!clean || clean.startsWith("/.netlify/")) return;
      if (clean.startsWith("/content/") && fs.existsSync(path.join(dist, clean))) return;
      if (clean.endsWith(".css") || clean.endsWith(".js") || clean.endsWith(".xml") || clean.endsWith(".txt") || clean.endsWith(".sql")) {
        if (!fs.existsSync(path.join(dist, clean))) errors.push(`Missing asset link ${clean} in ${path.relative(root, file)}`);
        return;
      }
      const normalized = clean.endsWith("/") ? clean : `${clean}/`;
      if (!paths.has(clean) && !paths.has(normalized)) {
        errors.push(`Missing internal link ${href} in ${path.relative(root, file)}`);
      }
    });
  });
}

function validateClinicAndRegions(errors, warnings) {
  const clinic = readJson(root, "content/clinic/clinic-profile.json", {});
  const regions = readJson(root, "content/region/nagoya-pages.json", []);
  if (!clinic.name) errors.push("Clinic profile missing name.");
  (clinic.todoFields || []).forEach((field) => warnings.push(`Clinic info TODO: ${field}`));
  regions.forEach((page) => {
    if (page.status !== "published") return;
    (page.requiredClinicFields || []).forEach((field) => {
      if (!isFilled(clinic[field])) errors.push(`${page.path} cannot be published because clinic.${field} is not confirmed.`);
    });
  });
}

function validateArticles(errors, warnings) {
  const { errors: baseErrors, warnings: baseWarnings, slugs } = validateContent(root);
  errors.push(...baseErrors);
  warnings.push(...baseWarnings);
  slugs.forEach((slug) => {
    const article = readJson(root, articlePath(slug), null);
    if (!article) return;
    const text = flatten(article);
    forbidden.forEach((phrase) => {
      if (text.includes(phrase)) errors.push(`${articlePath(slug)} contains forbidden expression: ${phrase}`);
    });
    if (article.status === "published") {
      if (article.noindex) errors.push(`${articlePath(slug)} is published but noindex is true.`);
      if (placeholderPatterns.some((pattern) => pattern.test(text))) errors.push(`${articlePath(slug)} contains placeholder text.`);
      if (!article.references || article.references.length === 0) errors.push(`${articlePath(slug)} published article needs references.`);
      if (!text.includes("医療診断")) errors.push(`${articlePath(slug)} needs medical disclaimer wording.`);
      if (text.length < 1800) warnings.push(`${articlePath(slug)} may be too short for a full article.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(article.publishedAt || ""))) errors.push(`${articlePath(slug)} publishedAt must be YYYY-MM-DD.`);
    }
  });

  if (fs.existsSync(dist)) {
    const publishedIndex = readJson(dist, ARTICLE_INDEX_PATH, []);
    publishedIndex.forEach((slug) => {
      const article = readJson(dist, `${ARTICLE_DIR}/${slug}.json`, null);
      if (!article || article.status !== "published") errors.push(`Draft or missing article leaked to dist: ${slug}`);
    });
  }
}

const errors = [];
const warnings = [];
validateArticles(errors, warnings);
validateClinicAndRegions(errors, warnings);
if (mode === "links") validateLinks(errors);
if (mode === "seo") {
  validateJsonLd(errors);
  validateCanonical(errors);
}

warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
if (errors.length) {
  console.error(`${mode} validation failed:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`${mode} validation passed.`);
