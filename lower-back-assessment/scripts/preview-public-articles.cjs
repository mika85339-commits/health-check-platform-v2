const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const legacySlug = "preview-legacy-shoulder";
function assertPreview(env) {
  if (env.HCL_SAFE_PREVIEW !== "true" || env.CONTEXT === "production") {
    throw new Error("Public article fixtures are restricted to isolated previews.");
  }
}
function snapshot() {
  const bytes = require("node:zlib").gunzipSync(fs.readFileSync(path.join(__dirname, "fixtures", "preview-public-articles.json.gz")));
  const data = JSON.parse(bytes);
  if (data.kind !== "public-preview-snapshot" || data.source !== "https://health-check-platform-v2.netlify.app" || data.posts.length !== 33 ||
      data.posts.some(p => p._id.startsWith("drafts.") || !Number.isFinite(Date.parse(p.publishedAt)) || Date.parse(p.publishedAt) > Date.parse(data.capturedAt) || !p.slug || /[/\\]/.test(p.slug))) {
    throw new Error("Invalid public preview snapshot.");
  }
  return { ...data, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}
function install(env = process.env) {
  assertPreview(env);
  const data = snapshot();
  // Feed the existing exporter, mapper and HTML renderer; never query Sanity here.
  require("./sanity-client").fetchSanityPosts = async () => ({
    config: { projectId: "69w0i1ba", dataset: "production", apiVersion: "2026-07-15" },
    posts: require("./acquisition-review.cjs").previewPosts(data.posts, env), skipped: false, missing: []
  });
}
function finish(root, env) {
  assertPreview(env);
  const data = snapshot();
  const dist = path.join(root, "dist");
  const post = data.posts.find(p => p.title === "肩こりとストレッチの関係を考える｜慢性痛の背景と対策");
  if (!post) throw new Error("Missing shoulder preview source.");
  // No legacy source articles are publicly published. Exercise the legacy renderer
  // with the public shoulder excerpt only, clearly identified as a format fixture.
  const legacy = {
    slug: legacySlug, title: post.title, source: "preview-format-fixture",
    summary: post.summary || post.excerpt, conclusion: post.summary || post.excerpt,
    publishedAt: post.publishedAt, updatedAt: post._updatedAt,
    diagnosisGuide: post.diagnosisGuide, symptomTags: ["肩こり"], references: []
  };
  const articleDir = path.join(dist, "health-library", legacySlug);
  fs.mkdirSync(articleDir, { recursive: true });
  const builtShell = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  fs.writeFileSync(path.join(articleDir, "index.html"), require("./generate-site-assets").articleHtml(legacy, builtShell));
  const existing = path.join(dist, "content", "truth-check", "articles");
  fs.writeFileSync(path.join(existing, legacySlug + ".json"), JSON.stringify(legacy));
  const indexPath = path.join(existing, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath));
  fs.writeFileSync(indexPath, JSON.stringify([...index, legacySlug]));
  const metadataPath = path.join(dist, "data", "sanity-articles", "_meta.json");
  const metadata = JSON.parse(fs.readFileSync(metadataPath));
  Object.assign(metadata, { source: data.kind, state: "fixture", fixture: true, liveFetchedCount: null, capturedAt: data.capturedAt, snapshotSha256: data.sha256 });
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  fs.writeFileSync(path.join(dist, "preview-fixture.json"), JSON.stringify({
    kind: data.kind, capturedAt: data.capturedAt, sha256: data.sha256, publicArticleCount: data.posts.length,
    source: data.source, legacyFormatFixture: "/health-library/" + legacySlug + "/",
    legacySource: "/health-library/" + post.slug + "/", liveData: false,
    editorialReview: { approved: false, sourceCapturedAt: require("./acquisition-review.cjs").data().capturedAt, ids: require("./acquisition-review.cjs").data().proposals.map(p => p.id) }
  }, null, 2));
  fs.copyFileSync(path.join(__dirname, "preview-browser-check.js"), path.join(dist, "preview-browser-check.js"));
}
module.exports = { install, finish, snapshot, legacySlug, assertPreview };
