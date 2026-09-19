const fs = require("fs");
const path = require("path");
const { SITE_URL, normalizeSiteUrl } = require("./site-url");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const liveArg = process.argv.find((arg) => arg.startsWith("--base-url="));
const productionMode = process.argv.includes("--production");
const liveBase = liveArg ? liveArg.split("=").slice(1).join("=") : productionMode ? SITE_URL : "";
const officialOrigin = normalizeSiteUrl(liveBase || SITE_URL);
const oldHost = "stunning-cassata-f82c76.netlify.app";

function match(html, expression) {
  return html.match(expression)?.[1]?.trim() || "";
}

function articleUrl(slug) {
  return `${officialOrigin}/health-library/${slug.split("/").map(encodeURIComponent).join("/")}/`;
}

async function source() {
  if (!liveBase) {
    const articles = JSON.parse(fs.readFileSync(path.join(dist, "data/sanity-articles/index.json"), "utf8"));
    const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
    return {
      articles,
      sitemap,
      html: async (article) => fs.readFileSync(path.join(dist, "health-library", article.slug, "index.html"), "utf8"),
      pageHtml: async (url) => {
        const pathname = new URL(url).pathname.replace(/^\//, "");
        return fs.readFileSync(path.join(dist, pathname, "index.html"), "utf8");
      },
      status: async () => 200
    };
  }
  const base = normalizeSiteUrl(liveBase);
  const indexResponse = await fetch(`${base}/data/sanity-articles/index.json`);
  const sitemapResponse = await fetch(`${base}/sitemap.xml`);
  if (!indexResponse.ok || !sitemapResponse.ok) throw new Error(`Audit discovery failed: index=${indexResponse.status}, sitemap=${sitemapResponse.status}`);
  const articles = await indexResponse.json();
  const sitemap = await sitemapResponse.text();
  return {
    articles,
    sitemap,
    html: async (article) => (await fetch(`${base}/health-library/${article.slug.split("/").map(encodeURIComponent).join("/")}/`)).text(),
    pageHtml: async (url) => (await fetch(url)).text(),
    status: async (article) => (await fetch(`${base}/health-library/${article.slug.split("/").map(encodeURIComponent).join("/")}/`, { redirect: "manual" })).status
  };
}

(async () => {
  const input = await source();
  const sitemapUrls = new Set(Array.from(input.sitemap.matchAll(/<loc>(.*?)<\/loc>/g)).map((item) => item[1]));
  const canonicalSeen = new Set();
  const incoming = new Map(input.articles.map((article) => [articleUrl(article.slug), 0]));
  const crawlUrls = Array.from(sitemapUrls).filter((url) => url === `${officialOrigin}/health-library` || url.includes("/health-library/category/"));
  for (const crawlUrl of crawlUrls) {
    const page = await input.pageHtml(crawlUrl);
    for (const link of page.matchAll(/<a[^>]+href=["']([^"']+)/gi)) {
      const absolute = new URL(link[1], officialOrigin).toString();
      if (incoming.has(absolute)) incoming.set(absolute, incoming.get(absolute) + 1);
    }
  }
  const audits = [];
  for (const article of input.articles) {
    const url = articleUrl(article.slug);
    const html = await input.html(article);
    const canonical = match(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i);
    const robots = match(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i) || "index,follow (default)";
    const links = Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)/gi)).map((item) => item[1]);
    const audit = {
      url,
      status: await input.status(article),
      canonical,
      robots,
      noindex: /noindex/i.test(robots),
      title: match(html, /<title>([^<]+)/i),
      description: match(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i),
      h1: match(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, "").trim(),
      internalLinks: links.filter((link) => link.startsWith("/")).length,
      incomingInternalLinks: incoming.get(url) || 0,
      inSitemap: sitemapUrls.has(url),
      structuredData: (html.match(/application\/ld\+json/gi) || []).length,
      canonicalDuplicate: canonicalSeen.has(canonical),
      trailingSlashMismatch: canonical.endsWith("/") !== url.endsWith("/"),
      encodingError: canonical !== url,
      oldHostPresent: html.includes(oldHost)
    };
    canonicalSeen.add(canonical);
    audits.push(audit);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    articleCount: audits.length,
    sitemapArticleCount: audits.filter((item) => item.inSitemap).length,
    indexableCount: audits.filter((item) => item.status === 200 && !item.noindex).length,
    noindexCount: audits.filter((item) => item.noindex).length,
    orphanCount: audits.filter((item) => item.incomingInternalLinks === 0).length,
    canonicalErrorCount: audits.filter((item) => item.canonical !== item.url || item.canonicalDuplicate).length,
    oldHostCount: audits.filter((item) => item.oldHostPresent).length,
    audits
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.sitemapArticleCount !== report.articleCount || report.orphanCount || report.canonicalErrorCount || report.oldHostCount || report.indexableCount + report.noindexCount !== report.articleCount) process.exitCode = 1;
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
