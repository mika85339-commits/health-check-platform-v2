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
    .replace(main, '<main id="app" tabindex="-1"><noscript><p>セルフチェックはトップページの人体図から部位を選んで始めてください。</p><a href="/#body-selector">人体図から選ぶ</a></noscript></main>');
}

function generateBodyCheckEntryPage({ dist }) {
  const html = bodyCheckEntryHtml(fs.readFileSync(path.join(dist, "index.html"), "utf8"));
  const target = path.join(dist, "body-check", "index.html");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
}

module.exports = { bodyCheckEntryHtml, generateBodyCheckEntryPage };
