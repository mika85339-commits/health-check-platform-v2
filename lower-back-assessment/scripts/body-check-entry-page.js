const fs = require("fs");
const path = require("path");

function bodyCheckEntryHtml(shell) {
  const canonical = /<link rel="canonical"[^>]*\/?>/i;
  const main = /<main id="app" tabindex="-1">[\s\S]*?<\/main>/i;
  if (!canonical.test(shell) || !main.test(shell)) {
    throw new Error("Body-check entry requires the current SPA shell and canonical");
  }

  return shell
    .replace(canonical, '<meta name="robots" content="noindex,follow" data-route-noindex="body-check" />')
    .replace(main, `<main id="app" tabindex="-1">
      <section class="body-check-entry-state" role="status" aria-live="polite">
        <div class="body-check-entry-inner">
          <p class="body-check-entry-context">Health Check Lab</p>
          <h1>セルフチェックを準備しています</h1>
          <p>まもなく質問が表示されます。</p>
          <div class="body-check-entry-actions">
            <a href="">再読み込み</a>
            <a href="/#body-selector">部位を選び直す</a>
          </div>
        </div>
      </section>
      <noscript><p>セルフチェックにはJavaScriptが必要です。トップページの人体図から部位を選んでください。</p><a href="/#body-selector">人体図から選ぶ</a></noscript>
    </main>`);
}

function generateBodyCheckEntryPage({ dist }) {
  const html = bodyCheckEntryHtml(fs.readFileSync(path.join(dist, "index.html"), "utf8"));
  const target = path.join(dist, "body-check", "index.html");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
}

module.exports = { bodyCheckEntryHtml, generateBodyCheckEntryPage };
