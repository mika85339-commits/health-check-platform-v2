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
  return String(html || "").match(expression)?.[1]?.trim() || "";
}

function articleUrl(slug) {
  return `${officialOrigin}/health-library/${slug.split("/").map(encodeURIComponent).join("/")}/`;
}

function normalizeAuditUrl(value) {
  try {
    const url = new URL(value, officialOrigin);
    url.hash = "";
    url.search = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch (_) {
    return "";
  }
}

function visibleText(html) {
  return String(html || "")
    .replace(/<(?:script|style|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function articleLinks(html, expectedUrls) {
  const expected = new Set(expectedUrls.map(normalizeAuditUrl));
  const links = new Set();
  for (const item of String(html || "").matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const url = normalizeAuditUrl(item[1]);
    if (expected.has(url)) links.add(url);
  }
  return links;
}

function inspectInitialHtml(html, currentUrl, expectedUrls) {
  const withoutScripts = String(html || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const articleRoot = withoutScripts.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0] || "";
  const bodyRoot = articleRoot.match(/<div\b[^>]*class=["'][^"']*sanity-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || articleRoot;
  const relatedRoot = articleRoot.match(/<section\b[^>]*class=["'][^"']*related-section[^"']*["'][^>]*>[\s\S]*?<\/section>/i)?.[0] || "";
  const links = articleLinks(articleRoot, expectedUrls);
  const relatedLinks = articleLinks(relatedRoot, expectedUrls);
  const hasH1 = /<h1\b/i.test(articleRoot);
  const bodyTextLength = visibleText(bodyRoot).length;
  const contentPresent = Boolean(articleRoot) && hasH1 && bodyTextLength > 300;
  const reasons = [];
  if (!articleRoot) reasons.push("article要素がありません");
  if (!hasH1) reasons.push("H1がありません");
  if (bodyTextLength <= 300) reasons.push(`本文テキスト不足（${bodyTextLength}文字）`);
  if (!links.size) reasons.push("通常の記事リンクがありません");
  return {
    contentPresent,
    hasH1,
    bodyTextLength,
    normalArticleLinkCount: links.size,
    relatedArticleLinkCount: relatedLinks.size,
    reason: reasons.length ? reasons.join(" / ") : "H1・本文・通常リンクを確認"
  };
}

function localPathForUrl(url) {
  const pathname = new URL(url).pathname
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/")
    .replace(/^\/+|\/+$/g, "");
  return path.join(dist, pathname, "index.html");
}

async function source() {
  if (!liveBase) {
    const articles = JSON.parse(fs.readFileSync(path.join(dist, "data/sanity-articles/index.json"), "utf8"));
    const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
    return {
      articles,
      sitemap,
      page: async (url) => ({ status: 200, finalUrl: url, html: fs.readFileSync(localPathForUrl(url), "utf8") })
    };
  }
  const base = normalizeSiteUrl(liveBase);
  const indexResponse = await fetch(`${base}/data/sanity-articles/index.json`);
  const sitemapResponse = await fetch(`${base}/sitemap.xml`);
  if (!indexResponse.ok || !sitemapResponse.ok) throw new Error(`Audit discovery failed: index=${indexResponse.status}, sitemap=${sitemapResponse.status}`);
  return {
    articles: await indexResponse.json(),
    sitemap: await sitemapResponse.text(),
    page: async (url) => {
      const response = await fetch(url, { redirect: "follow" });
      return { status: response.status, finalUrl: response.url, html: await response.text() };
    }
  };
}

async function run() {
  const input = await source();
  const expectedUrls = input.articles.map((article) => articleUrl(article.slug));
  const sitemapUrls = new Set(Array.from(input.sitemap.matchAll(/<loc>(.*?)<\/loc>/g)).map((item) => item[1]));
  const canonicalSeen = new Set();
  const incoming = new Map(expectedUrls.map((url) => [normalizeAuditUrl(url), 0]));
  const crawlUrls = Array.from(sitemapUrls).filter((url) => url.replace(/\/$/, "") === `${officialOrigin}/health-library` || url.includes("/health-library/category/"));

  for (const crawlUrl of crawlUrls) {
    const page = await input.page(crawlUrl);
    for (const link of articleLinks(page.html, expectedUrls)) incoming.set(link, (incoming.get(link) || 0) + 1);
  }

  const audits = [];
  for (const article of input.articles) {
    const url = articleUrl(article.slug);
    const page = await input.page(url);
    const canonicalRaw = match(page.html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)
      || match(page.html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    const robots = match(page.html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i) || "index,follow (default)";
    const canonical = canonicalRaw ? new URL(canonicalRaw, officialOrigin).toString() : "";
    const ssr = inspectInitialHtml(page.html, url, expectedUrls);
    const normalizedCanonical = normalizeAuditUrl(canonical);
    const normalizedUrl = normalizeAuditUrl(url);
    const audit = {
      url,
      httpStatus: page.status,
      finalUrl: page.finalUrl,
      canonical,
      robots,
      noindex: /noindex/i.test(robots),
      title: match(page.html, /<title>([^<]+)/i),
      description: match(page.html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i),
      h1: match(page.html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, "").trim(),
      incomingInternalLinks: incoming.get(normalizedUrl) || 0,
      inSitemap: sitemapUrls.has(url),
      structuredData: (page.html.match(/application\/ld\+json/gi) || []).length,
      canonicalDuplicate: canonicalSeen.has(normalizedCanonical),
      canonicalSelf: normalizedCanonical === normalizedUrl,
      oldHostPresent: page.html.includes(oldHost),
      ssrContent: ssr.contentPresent,
      ssrBodyTextLength: ssr.bodyTextLength,
      normalArticleLinkCount: ssr.normalArticleLinkCount,
      relatedArticleLinkCount: ssr.relatedArticleLinkCount,
      ssrReason: ssr.reason,
      browserStatus: "not-run"
    };
    canonicalSeen.add(normalizedCanonical);
    audits.push(audit);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: liveBase ? "production" : "local",
    articleCount: audits.length,
    sitemapArticleCount: audits.filter((item) => item.inSitemap).length,
    httpOkCount: audits.filter((item) => item.httpStatus === 200).length,
    indexableCount: audits.filter((item) => item.httpStatus === 200 && !item.noindex).length,
    initialHtmlContentCount: audits.filter((item) => item.ssrContent).length,
    normalArticleLinksCount: audits.filter((item) => item.normalArticleLinkCount > 0).length,
    relatedLinksAtLeastTwoCount: audits.filter((item) => item.relatedArticleLinkCount >= 2).length,
    noindexCount: audits.filter((item) => item.noindex).length,
    orphanCount: audits.filter((item) => item.incomingInternalLinks === 0).length,
    canonicalErrorCount: audits.filter((item) => !item.canonicalSelf || item.canonicalDuplicate).length,
    oldHostCount: audits.filter((item) => item.oldHostPresent).length,
    audits
  };
  fs.writeFileSync(path.join(dist, "health-indexability-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (report.sitemapArticleCount !== report.articleCount
    || report.httpOkCount !== report.articleCount
    || report.orphanCount
    || report.canonicalErrorCount
    || report.oldHostCount
    || report.indexableCount !== report.articleCount
    || report.initialHtmlContentCount !== report.articleCount
    || report.normalArticleLinksCount !== report.articleCount
    || report.relatedLinksAtLeastTwoCount !== report.articleCount) process.exitCode = 1;
  return report;
}

if (require.main === module) run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

module.exports = { articleLinks, inspectInitialHtml, localPathForUrl, normalizeAuditUrl, run, visibleText };
