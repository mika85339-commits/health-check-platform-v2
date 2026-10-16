const fs = require("fs");
const path = require("path");
function coverage(dist) {
  let meta;
  try {
    meta = JSON.parse(
      fs.readFileSync(
        path.join(dist, "data/sanity-articles/_meta.json"),
        "utf8",
      ),
    );
  } catch {
    return {
      state: "missing_metadata",
      complete: false,
      reason: "取得結果メタデータがありません",
      article_count: null,
    };
  }
  const state =
    meta.state ||
    (meta.skipped
      ? "missing_configuration"
      : meta.exportedCount === 0
        ? "empty"
        : "complete");
  const complete =
    ["complete", "empty"].includes(state) &&
    !meta.excluded?.length &&
    !meta.duplicateSlugs?.length;
  return {
    state,
    complete,
    article_count: complete ? meta.exportedCount : null,
    exported_count: meta.exportedCount ?? null,
    fetched_count: meta.fetchedCount ?? null,
    attempted_at: meta.generatedAt || null,
    missing: meta.missingEnvironmentVariables || [],
    reason: complete
      ? state === "empty"
        ? "接続成功・公開対象記事0件"
        : "公開対象の取得完了"
      : "記事監査は不完全です。未接続・取得失敗・除外を確認してください",
  };
}
if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const r = coverage(path.join(root, "dist"));
  fs.mkdirSync(path.join(root, "reports"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "reports/sanity-audit-coverage.json"),
    JSON.stringify(r, null, 2) + "\n",
  );
  console.log(JSON.stringify(r, null, 2));
  if (!r.complete) {
    console.error("::warning::Sanity article audit coverage is incomplete");
    process.exitCode = 1;
  }
}
module.exports = { coverage };
