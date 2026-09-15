const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function functionPrefix(fileName, functionName, awaitExpression) {
  const source = fs.readFileSync(path.join(root, fileName), "utf8");
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`${fileName}: ${functionName} was not found`);
  const awaitAt = source.indexOf(awaitExpression, start);
  if (awaitAt < 0) throw new Error(`${fileName}: ${awaitExpression} was not found`);
  return source.slice(start, awaitAt);
}

const legacyPrefix = functionPrefix("app.js", "renderHealthLibraryArticle", "await loadHealthLibraryData()");
const sanityPrefix = functionPrefix("sanity-health-library.js", "renderArticle", "await loadData()");

for (const [fileName, prefix] of [["app.js", legacyPrefix], ["sanity-health-library.js", sanityPrefix]]) {
  if (/記事を読み込み中|記事データを読み込みます/.test(prefix)) {
    throw new Error(`${fileName}: article navigation still replaces prerendered content with a loading screen`);
  }
  if (/innerHTML\s*=/.test(prefix)) {
    throw new Error(`${fileName}: article navigation mutates the prerendered article before data is ready`);
  }
}

console.log("Article direct-navigation checks passed.");
