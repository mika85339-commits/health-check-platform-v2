const path = require("path");
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

console.log("Content validation passed.");
