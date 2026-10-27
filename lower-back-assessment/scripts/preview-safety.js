const fs = require("node:fs");
const path = require("node:path");

// Only an explicit production build may contain the real backend.
function isSafePreview(env = process.env) {
  return env.CONTEXT !== "production";
}

function previewEnvironment(env) {
  const allowed = ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE", "CONTEXT"];
  const clean = Object.fromEntries(allowed.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]));
  clean.HCL_SAFE_PREVIEW = "true";
  if (clean.CONTEXT === "production") clean.CONTEXT = "deploy-preview";
  // No Sanity credentials or network request: the build reports incomplete article coverage.
  return clean;
}

function prepareFunctions(root, preview) {
  const source = path.join(root, "netlify", "functions");
  const target = path.join(root, "netlify", "safe-functions");
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const name of fs.readdirSync(source)) {
    if (!name.endsWith(".mjs")) throw new Error("Review new function format before deploying.");
    const original = fs.readFileSync(path.join(source, name), "utf8");
    if (!preview) {
      // Same directory depth preserves existing relative imports and behavior.
      fs.writeFileSync(path.join(target, name), original);
      continue;
    }
    const config = original.match(/export const config\s*=\s*(\{[\s\S]*?\});/);
    if (original.includes("export const config") && !config) throw new Error("Review function routing before previewing.");
    // Keep custom admin routes closed too; never register preview cron jobs.
    const routes = config && !/\bschedule\s*:/.test(config[1]) ? `export const config = ${config[1]};\n` : "";
    fs.writeFileSync(path.join(target, name), `// Safe preview artifact: intentionally no imports, secrets or external calls.\nexport default async function handler() {\n  return new Response(JSON.stringify({ error: "preview_disabled", stored: false }), {\n    status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" }\n  });\n}\n${routes}`);
  }
}

function sealPreview(root) {
  const dist = path.join(root, "dist");
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".html")) {
        const html = fs.readFileSync(file, "utf8");
        fs.writeFileSync(file, html
          .replace(/<\/head>/i, '<script src="/preview-browser-check.js"></script></head>')
          .replace(/<head([^>]*)>/i, '<head$1><meta name="robots" content="noindex,nofollow,noarchive">')
          .replace(/<body([^>]*)>/i, '<body$1><aside role="status" style="padding:8px;font-size:12px;background:#fff4cf;color:#352800">プレビュー：保存・AI・計測・管理機能は停止中。公開済み33記事の固定テストデータ＋旧形式検証1件（実データ取得ではありません）。3記事は未承認の集客改善案です。本番内容と異なります。</aside>'));
      }
    }
  };
  walk(dist);
  fs.writeFileSync(path.join(dist, "analytics-bootstrap.js"), 'window.__HCL_LOCAL_PREVIEW__ = true;\nwindow.__HCL_LOCAL_EVENTS__ = [];\nwindow.__HCL_LOCAL_REQUESTS__ = [];\n');
  fs.writeFileSync(path.join(dist, "site-config.json"), JSON.stringify({ siteUrl: "https://health-check-platform-v2.netlify.app", gaMeasurementId: null, mode: "safe-preview", articleCoverage: "public_snapshot_fixture", liveData: false }));
  // Crawlers must be able to read noindex; disallowing crawl can leave URL-only results.
  fs.writeFileSync(path.join(dist, "robots.txt"), "User-agent: *\nAllow: /\n");
  // Defense in depth: covers fetch/beacon/XHR, advertising scripts, forms and frames.
  // Static Sanity images remain displayable; scripts and connections are same-origin only.
  const headers = '\n/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  Content-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\'; connect-src \'self\'; img-src \'self\' data: blob: https://cdn.sanity.io; style-src \'self\' \'unsafe-inline\'; font-src \'self\' data:; frame-src \'none\'; object-src \'none\'; form-action \'self\'; base-uri \'self\'\n';
  fs.appendFileSync(path.join(dist, "_headers"), headers);
  // Ignore any future absolute proxy or redirect added to the production output.
  const redirects = fs.readFileSync(path.join(dist, "_redirects"), "utf8");
  if (/^\s*[^#\s]\S*\s+(?:https?:)?\/\//m.test(redirects)) throw new Error("External preview redirects require review.");
}

module.exports = { isSafePreview, previewEnvironment, prepareFunctions, sealPreview };
