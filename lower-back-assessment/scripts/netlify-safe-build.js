const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { isSafePreview, previewEnvironment, prepareFunctions, sealPreview } = require("./preview-safety");

function build(env = process.env) {
  const root = path.resolve(__dirname, "..");
  const preview = process.argv.includes("--preview") || isSafePreview(env);
  // Remove cached production functions before doing any work, including on failed builds.
  prepareFunctions(root, true);
  const args = preview ? ["--require", path.join(__dirname, "preview-build-network.cjs")] : [];
  const result = spawnSync(process.execPath, [...args, path.join(__dirname, "netlify-build.js")], {
    cwd: root, env: preview ? previewEnvironment(env) : env, stdio: "inherit"
  });
  if (result.error || result.status !== 0) throw new Error("Static build failed; deployment must stop.");
  if (preview) {
    require("./preview-public-articles.cjs").finish(root, previewEnvironment(env));
    sealPreview(root);
  }
  else prepareFunctions(root, false);
  console.log(preview ? "Safe preview: backend disabled, analytics disabled, noindex enabled; fixed public article fixtures; no live article fetch." : "Production build completed.");
}

if (require.main === module) {
  try { build(); } catch (_) { console.error("Safe build failed. No deployment allowed."); process.exitCode = 1; }
}
module.exports = { build };
