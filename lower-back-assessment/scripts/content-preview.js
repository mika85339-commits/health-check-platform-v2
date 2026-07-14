const fs = require("fs");
const path = require("path");
const { articlePath, readJson } = require("./content-utils");

const root = path.resolve(__dirname, "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || true];
  })
);

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const slug = args.slug;
if (!slug) {
  console.error("Usage: npm run content:preview -- --slug=article-slug");
  process.exit(1);
}

const article = readJson(root, articlePath(slug), null);
if (!article) {
  console.error(`Article not found: ${slug}`);
  process.exit(1);
}

const previewDir = path.join(root, ".content-preview");
fs.mkdirSync(previewDir, { recursive: true });
const out = path.join(previewDir, `${slug}.html`);

const warnings = article.qualityWarnings || [];
const references = article.references || [];
const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>確認用: ${escapeHtml(article.title)}</title>
    <style>
      body { font-family: system-ui, "Yu Gothic", sans-serif; line-height: 1.8; margin: 0; background: #f6fbfd; color: #14262f; }
      main { max-width: 880px; margin: 0 auto; padding: 28px 18px 60px; }
      section { background: #fff; border: 1px solid #dcebf0; border-radius: 18px; padding: 18px; margin: 14px 0; }
      dt { color: #647984; font-weight: 700; } dd { margin: 0 0 10px; }
      .warn { background: #fff6e3; }
      .danger { background: #fff0ef; }
    </style>
  </head>
  <body>
    <main>
      <h1>承認前確認</h1>
      <section>
        <dl>
          <dt>記事タイトル</dt><dd>${escapeHtml(article.title)}</dd>
          <dt>カテゴリ</dt><dd>${escapeHtml(article.category)}</dd>
          <dt>要約</dt><dd>${escapeHtml(article.summary || article.description)}</dd>
          <dt>公開予定URL</dt><dd>/health-library/${escapeHtml(article.slug)}</dd>
          <dt>公開状態</dt><dd>${escapeHtml(article.status)}</dd>
          <dt>地域ページとの関連</dt><dd>${escapeHtml((article.relatedRegionPages || []).join(", ") || "なし")}</dd>
        </dl>
      </section>
      <section class="${warnings.length ? "warn" : ""}">
        <h2>警告</h2>
        ${warnings.length ? `<ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>警告はありません。</p>"}
      </section>
      <section>
        <h2>院への案内文</h2>
        <p>${escapeHtml(article.clinicGuide || "この記事では院への案内文は表示しません。")}</p>
      </section>
      <section>
        <h2>参考文献</h2>
        ${references.length ? `<ul>${references.map((item) => `<li>${escapeHtml(item.title || item.url)}</li>`).join("")}</ul>` : "<p>参考文献が未設定です。公開前に確認してください。</p>"}
      </section>
      <section>
        <h2>本文確認</h2>
        <h3>読者の疑問</h3><p>${escapeHtml(article.readerQuestion)}</p>
        <h3>結論</h3><p>${escapeHtml(article.conclusion)}</p>
        <h3>医学的な解説</h3><p>${escapeHtml(article.medicalExplanation || article.currentEvidence)}</p>
        <h3>セルフケア</h3><ul>${(article.selfCare || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        <h3>受診すべき症状</h3><ul>${(article.doctorVisitSigns || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>
    </main>
  </body>
</html>`;

fs.writeFileSync(out, html, "utf8");
console.log(`Preview generated: ${out}`);
