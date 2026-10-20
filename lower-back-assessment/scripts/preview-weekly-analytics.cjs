const fs = require("node:fs");
const path = require("node:path");

function finish(root, env) {
  if (env.HCL_SAFE_PREVIEW !== "true" || env.CONTEXT === "production") {
    throw new Error("Synthetic weekly analytics is restricted to sealed previews.");
  }
  const { live, snapshot, kind } = require("./fixtures/weekly-provenance-preview.json");
  if (kind !== "synthetic-provenance") throw new Error("Unexpected weekly fixture.");
  // Use the real read-only composition and real dashboard, without credentials or API access.
  const { mergeSnapshotsWithCurrent } = require("../netlify/lib/weekly-analytics-store.mjs");
  const report = mergeSnapshotsWithCurrent({ ...live, source_audit: { ...live.source_audit, mode: "fixture" } }, [snapshot]);
  const source = path.join(root, "admin", "weekly-analytics");
  const target = path.join(root, "dist", "preview-weekly-analytics");
  fs.mkdirSync(path.join(target, "data"), { recursive: true });
  const html = fs.readFileSync(path.join(source, "index.html"), "utf8")
    .replace("<body>", '<body data-weekly-fixture="synthetic-provenance">')
    .replace("週次分析 | Health Check Lab 管理", "合成データ確認専用 | Health Check Lab")
    .replace("ローカル確認用の集計データを表示しています。", "プレビュー専用の合成データです。本番の取得結果・保存履歴ではありません。");
  fs.writeFileSync(path.join(target, "index.html"), html);
  for (const file of ["dashboard.css", "dashboard-model.js", "dashboard.js"]) fs.copyFileSync(path.join(source, file), path.join(target, file));
  fs.writeFileSync(path.join(target, "data", "weekly-analytics.json"), JSON.stringify(report));
}

module.exports = { finish };
