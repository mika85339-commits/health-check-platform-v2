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
      <noscript><p>セルフチェックにはJavaScriptが必要です。トップページの人体図から部位を選んでください。</p><a href="/#body-selector">人体図から選ぶ</a></noscript>
    </main>
    <script>
      window.setTimeout(() => {
        const root = document.documentElement;
        if (!root.classList.contains("body-check-route-pending") || root.dataset.bodyCheckReady === "true") return;
        const app = document.getElementById("app");
        if (!app) return;
        app.innerHTML = '<section class="body-check-load-failure" role="alert"><div class="body-check-load-failure-inner"><h1>セルフチェックを読み込めませんでした</h1><p>ページを再読み込みしてお試しください。</p><div class="body-check-load-failure-actions"><a href="">再読み込み</a><a href="/#body-selector">部位を選び直す</a></div></div></section>';
        root.classList.remove("body-check-route-pending");
      }, 3000);
    </script>`);
}

function generateBodyCheckEntryPage({ dist }) {
  const html = bodyCheckEntryHtml(fs.readFileSync(path.join(dist, "index.html"), "utf8"));
  const target = path.join(dist, "body-check", "index.html");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
}

module.exports = { bodyCheckEntryHtml, generateBodyCheckEntryPage };
