const fs = require("fs");
const path = require("path");
const { SITE_URL } = require("./site-url");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const reportDir = path.join(root, "reports");
const reportFile = path.join(reportDir, "site-audit-report.md");

function listHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(full);
    return entry.isFile() && entry.name === "index.html" ? [full] : [];
  });
}

function routeFor(file) {
  const relative = path.relative(dist, file).replace(/\\/g, "/").replace(/index\.html$/, "");
  return relative ? `/${relative.replace(/\/$/, "")}` : "/";
}

function cleanInternalUrl(value) {
  if (!value || /^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(value)) return "";
  return value.split(/[?#]/)[0];
}

function targetExists(url) {
  const relative = decodeURIComponent(url).replace(/^\//, "");
  const direct = path.join(dist, relative);
  return fs.existsSync(direct) || fs.existsSync(path.join(direct, "index.html"));
}

function finding({ page, cause, evidence, change, metric, severity = "warning" }) {
  return { page, cause, evidence, change, metric, severity };
}

function extractRedirectTarget(html) {
  return html.match(/sessionStorage\.setItem\(["']health-check-lab-route["']\s*,\s*["']([^"']+)["']\)/)?.[1] || "";
}

function sitemapUrls(xml) {
  return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(/\/$/, "")));
}

function audit() {
  if (!fs.existsSync(dist)) throw new Error("dist is missing. Run npm run build before npm run audit:site.");
  const findings = [];
  const files = listHtmlFiles(dist);
  const canonicals = new Map();

  files.forEach((file) => {
    const html = fs.readFileSync(file, "utf8");
    const page = routeFor(file);
    const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    const description = html.match(/<meta\s+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]?.trim();
    const canonical = html.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]?.trim();
    if (!title) findings.push(finding({ page, cause: "titleがありません", evidence: path.relative(root, file), change: "固有のtitleを設定する", metric: "title欠落数", severity: "error" }));
    if (!description) findings.push(finding({ page, cause: "meta descriptionがありません", evidence: path.relative(root, file), change: "本文と一致するdescriptionを設定する", metric: "description欠落数" }));
    if (!canonical) {
      findings.push(finding({ page, cause: "canonicalがありません", evidence: path.relative(root, file), change: "公開URLと一致するcanonicalを設定する", metric: "canonical欠落数", severity: "error" }));
    } else if (canonicals.has(canonical)) {
      findings.push(finding({ page, cause: "canonicalが他ページと重複しています", evidence: `${canonical} (${canonicals.get(canonical)})`, change: "ページ固有canonicalか意図した統合かを人が確認する", metric: "canonical重複数", severity: "error" }));
    } else {
      canonicals.set(canonical, page);
    }

    for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        JSON.parse(match[1]);
      } catch (error) {
        findings.push(finding({ page, cause: "JSON-LDが解析できません", evidence: error.message, change: "構造化データのJSON構文を修正する", metric: "JSON-LDエラー数", severity: "error" }));
      }
    }

    for (const match of html.matchAll(/\s(?:href|src)=["']([^"']+)["']/gi)) {
      const url = cleanInternalUrl(match[1]);
      if (url && url.startsWith("/") && !url.startsWith("/.netlify/") && !targetExists(url)) {
        findings.push(finding({ page, cause: "内部リンク先またはassetがdistにありません", evidence: url, change: "リンク先の生成またはリンク修正を確認する", metric: "内部404候補数", severity: "error" }));
      }
    }
  });

  const robots = fs.existsSync(path.join(dist, "robots.txt")) ? fs.readFileSync(path.join(dist, "robots.txt"), "utf8") : "";
  ["Googlebot", "Bingbot", "OAI-SearchBot"].forEach((bot) => {
    if (!robots.includes(`User-agent: ${bot}`)) findings.push(finding({ page: "/robots.txt", cause: `${bot}の明示ルールがありません`, evidence: "dist/robots.txt", change: "意図するクロール方針を明示する", metric: "crawler設定欠落数" }));
  });

  const sitemap = fs.existsSync(path.join(dist, "sitemap.xml")) ? fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8") : "";
  if (!sitemap.includes("<urlset")) findings.push(finding({ page: "/sitemap.xml", cause: "有効なXML sitemapがありません", evidence: "dist/sitemap.xml", change: "build時のsitemap生成を確認する", metric: "sitemap生成エラー", severity: "error" }));
  const indexedUrls = sitemapUrls(sitemap);
  const redirectLandings = files.flatMap((file) => {
    const html = fs.readFileSync(file, "utf8");
    const redirectTarget = extractRedirectTarget(html);
    if (!redirectTarget) return [];
    const page = routeFor(file);
    const canonical = html.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]?.trim() || "未設定";
    const description = html.match(/<meta\s+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]?.trim() || "未設定";
    const publicUrl = `${SITE_URL}${page}`.replace(/\/$/, "");
    const targetUrl = `${SITE_URL}${redirectTarget}`.replace(/\/$/, "");
    const indexTarget = indexedUrls.has(publicUrl) ? "対象（sitemap掲載）" : "対象外（sitemap未掲載）";
    const reasons = [];
    if (canonical === "未設定") reasons.push("canonical未設定");
    if (description === "未設定") reasons.push("description未設定");
    if (!indexedUrls.has(publicUrl)) reasons.push("sitemap未掲載の旧landing");
    return [{ page: publicUrl, redirectTarget: targetUrl, indexTarget, canonical, description, needsFix: reasons.length ? "要確認" : "不要", reason: reasons.join("、") || "問題候補なし" }];
  });

  const errors = findings.filter((item) => item.severity === "error");
  const now = new Date().toISOString();
  const rows = findings.length
    ? findings.map((item) => `| ${item.severity} | ${item.page} | ${item.cause} | ${item.evidence} | ${item.change} | ${item.metric} |`).join("\n")
    : "| info | - | 自動監査で問題候補は見つかりませんでした | dist全体 | 公開前に実ブラウザとRich Results Testも確認する | 継続監視 |";
  const redirectRows = redirectLandings.length
    ? redirectLandings.map((item) => `| ${item.page} | ${item.redirectTarget} | ${item.indexTarget} | ${item.canonical} | ${item.description} | ${item.needsFix} | ${item.reason} |`).join("\n")
    : "| - | - | - | - | - | 不要 | redirect landingは見つかりませんでした |";
  const report = `# Health Check Lab site audit\n\nGenerated: ${now}\n\nこのレポートは候補を提示するだけです。SEO変更および医学的主張の変更を自動公開しません。\n\n## Summary\n\n- HTML pages: ${files.length}\n- Errors: ${errors.length}\n- Warnings: ${findings.length - errors.length}\n- Legacy redirect landing pages: ${redirectLandings.length}\n\n## Findings\n\n| Severity | 候補ページ | 原因 | 根拠 | 変更案 | 期待する指標 |\n| --- | --- | --- | --- | --- | --- |\n${rows}\n\n## Legacy redirect landing page review\n\ncanonical / description候補をURL単位で整理します。この表は自動修正を行いません。\n\n| 現在のURL | redirect先 | index対象か | canonical | description | 修正が必要か | 修正理由 |\n| --- | --- | --- | --- | --- | --- | --- |\n${redirectRows}\n`;
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportFile, report, "utf8");
  console.log(`Site audit report: ${path.relative(root, reportFile)} (${findings.length} findings)`);
  if (errors.length && process.argv.includes("--strict")) process.exitCode = 1;
}

audit();
