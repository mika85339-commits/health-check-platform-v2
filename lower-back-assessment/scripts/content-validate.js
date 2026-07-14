const path = require("path");
const { spawnSync } = require("child_process");
const { validateContent } = require("./content-utils");

const root = path.resolve(__dirname, "..");
const { errors, warnings, publishedArticles, slugs } = validateContent(root);

console.log(`Articles: ${slugs.length}`);
console.log(`Published: ${publishedArticles.length}`);

if (warnings.length) {
  console.warn("\nWarnings:");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (errors.length) {
  console.error("\nErrors:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const quality = spawnSync(process.execPath, ["scripts/quality-validate.js"], {
  cwd: root,
  stdio: "inherit",
  shell: false
});
if (quality.status !== 0) process.exit(quality.status || 1);

console.log("Content validation passed.");
