const { DEFAULT_SITE_URL, SITE_URL, normalizeSiteUrl } = require("./site-url");

const explicitCheckBase = String(process.env.SITE_CHECK_BASE_URL || "").trim();
const explicitSiteUrl = Boolean(process.env.SITE_URL || process.env.URL);
let BASE_URL = normalizeSiteUrl(explicitCheckBase || DEFAULT_SITE_URL);
let EXPECTED_SITE_URL = SITE_URL;
const HUB_SLUGS = ["chronic-pain", "chronic-low-back-pain", "chronic-neck-shoulder-pain", "acupuncture-for-chronic-pain"];
const BODY_GUIDE_ROUTES = ["/body-guide/", "/body-check/lower-back/", "/body-check/neck/", "/body-check/shoulder/", "/body-check/hip/", "/body-check/knee/"];
const RETIRED_LEGACY_ROUTES = [
  "/health-library/acupuncture-care",
  "/health-library/fascia-trigger-point",
  "/health-library/pain-nerve-signs",
  "/health-library/posture-pelvis-basics",
  "/health-library/sns-health-claims",
  "/health-library/stretch-basics",
  "/health-library/training-pain-care"
];
const ROUTE_METADATA = {
  "/about": ["このサイトについて | Health Check Lab", "Health Check Labの目的、医療診断ではないこと、匿名データの取り扱いについて説明します。"],
  "/body-check": ["原因筋診断・体のセルフチェック | Health Check Lab", "気になる部位・場面・症状を順番に選び、関係する可能性のある筋肉を整理するセルフチェックです。"],
  "/community": ["身体のサイン・匿名集計 | Health Check Lab", "匿名で集計した部位や不調の傾向を確認し、体のサインを整理するための参考情報を掲載しています。"],
  "/faq": ["よくある質問 | Health Check Lab", "Health Check Labの使い方、セルフチェックの位置づけ、匿名データの扱いなど、よくある質問に回答します。"],
  "/health-check": ["健康情報の参考度チェック | Health Check Lab", "SNS投稿や動画の内容を入力し、健康情報を参考にしやすいか整理するためのチェック機能です。"]
};

async function request(pathname) {
  const response = await fetch(`${BASE_URL}${pathname}`, { redirect: "follow" });
  return { response, text: await response.text() };
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

async function discoverSiteUrl() {
  const response = await fetch(`${BASE_URL}/site-config.json`, { redirect: "follow" });
  if (!response.ok) throw new Error(`site-config.json returned ${response.status}`);
  const config = await response.json();
  const discovered = normalizeSiteUrl(config.siteUrl);
  if (explicitSiteUrl && discovered !== SITE_URL) {
    throw new Error(`site-config.json (${discovered}) does not match SITE_URL (${SITE_URL})`);
  }
  EXPECTED_SITE_URL = explicitSiteUrl ? SITE_URL : discovered;
  if (!explicitCheckBase) BASE_URL = EXPECTED_SITE_URL;
  return config;
}

function assertNotFound(pathname, result, errors) {
  assert(result.response.status === 404, `${pathname} returned ${result.response.status} instead of 404`, errors);
  assert(/data-page=["']not-found["']/.test(result.text), `${pathname} did not return the dedicated 404 page`, errors);
  assert(/<title>ページが見つかりません \| Health Check Lab<\/title>/.test(result.text), `${pathname} has an incorrect 404 title`, errors);
  assert(/name=["']robots["'][^>]+content=["']noindex,follow["']/i.test(result.text), `${pathname} is missing noindex,follow`, errors);
  assert(!/<link\s+[^>]*rel=["']canonical["']/i.test(result.text), `${pathname} must not contain a canonical link`, errors);
}

async function run() {
  const errors = [];
  const checks = [];
  const siteConfig = await discoverSiteUrl();
  checks.push(`/site-config.json: ${siteConfig.siteUrl}`);
  for (const pathname of ["/", "/health-library", "/body-check", "/about", "/sitemap.xml", "/robots.txt"]) {
    const result = await request(pathname);
    checks.push(`${pathname}: ${result.response.status}`);
    assert(result.response.ok, `${pathname} returned ${result.response.status}`, errors);
  }

  for (const pathname of BODY_GUIDE_ROUTES) {
    const result = await request(pathname);
    checks.push(`${pathname}: ${result.response.status}`);
    assert(result.response.ok, `${pathname} returned ${result.response.status}`, errors);
    assert(result.text.includes(`rel="canonical" href="${EXPECTED_SITE_URL}${pathname}"`), `${pathname} has an incorrect canonical`, errors);
    assert(result.text.includes('"@type":"BreadcrumbList"'), `${pathname} is missing BreadcrumbList JSON-LD`, errors);
  }

  for (const [pathname, [title, description]] of Object.entries(ROUTE_METADATA)) {
    const result = await request(pathname);
    const canonical = `${EXPECTED_SITE_URL}${pathname}`;
    checks.push(`${pathname} metadata: ${result.response.status}`);
    assert(result.response.ok, `${pathname} returned ${result.response.status}`, errors);
    assert(result.text.includes(`<title>${title}</title>`), `${pathname} has an incorrect title`, errors);
    assert(result.text.includes(`content="${description}"`), `${pathname} has an incorrect meta description`, errors);
    assert(result.text.includes(`rel="canonical" href="${canonical}"`), `${pathname} has an incorrect canonical`, errors);
    assert(!/name=["']robots["'][^>]+noindex/i.test(result.text), `${pathname} is marked noindex`, errors);
  }

  const home = await request("/");
  assert(home.text.includes(`rel="canonical" href="${EXPECTED_SITE_URL}/"`), "Homepage canonical does not match SITE_URL", errors);
  assert(home.text.includes(`property="og:url" content="${EXPECTED_SITE_URL}/"`), "Homepage Open Graph URL does not match SITE_URL", errors);
  assert(home.text.includes(`"url": "${EXPECTED_SITE_URL}/"`), "Homepage JSON-LD does not match SITE_URL", errors);

  const library = await request("/health-library");
  assert(library.text.includes(`rel="canonical" href="${EXPECTED_SITE_URL}/health-library"`), "Health library canonical does not match SITE_URL", errors);
  assert(library.text.includes(`property="og:url" content="${EXPECTED_SITE_URL}/health-library"`), "Health library Open Graph URL does not match SITE_URL", errors);
  assert(library.text.includes(`"url":"${EXPECTED_SITE_URL}/health-library"`), "Health library JSON-LD does not match SITE_URL", errors);

  const articleIndex = await request("/data/sanity-articles/index.json");
  assert(articleIndex.response.ok, "Sanity article index is unavailable", errors);
  let articles = [];
  try {
    articles = JSON.parse(articleIndex.text);
  } catch (_) {
    errors.push("Sanity article index is not valid JSON");
  }
  assert(articles.length >= 3, `Expected at least 3 Sanity articles, received ${articles.length}`, errors);

  for (const article of articles.slice(0, 3)) {
    const pathname = `/health-library/${encodeURIComponent(article.slug)}`;
    const result = await request(pathname);
    checks.push(`${pathname}: ${result.response.status}`);
    assert(result.response.ok, `${pathname} returned ${result.response.status}`, errors);
    assert(result.text.includes(article.title), `${pathname} does not contain its article title`, errors);
    const canonical = `${EXPECTED_SITE_URL}/health-library/${article.slug.split("/").map(encodeURIComponent).join("/")}/`;
    assert(result.text.includes(`rel="canonical" href="${canonical}"`), `${pathname} has an incorrect canonical`, errors);
    assert(result.text.includes(`property="og:url" content="${canonical}"`), `${pathname} has an incorrect Open Graph URL`, errors);
    assert(/"@type":"Article"/.test(result.text), `${pathname} is missing Article JSON-LD`, errors);
    assert(result.text.includes(`"mainEntityOfPage":"${canonical}"`), `${pathname} Article JSON-LD does not match SITE_URL`, errors);
  }

  const topics = await request("/data/medical-topics/index.json");
  let publishedTopics = [];
  try {
    publishedTopics = JSON.parse(topics.text);
  } catch (_) {
    errors.push("Medical topic index is not valid JSON");
  }
  HUB_SLUGS.forEach((slug) => {
    const published = publishedTopics.some((topic) => topic.slug === slug);
    checks.push(`/health-library/topic/${slug}: ${published ? "published" : "review-gated"}`);
  });

  const robots = await request("/robots.txt");
  ["Googlebot", "Bingbot", "OAI-SearchBot"].forEach((bot) => assert(robots.text.includes(`User-agent: ${bot}`), `robots.txt is missing ${bot}`, errors));
  assert(robots.text.includes(`Sitemap: ${EXPECTED_SITE_URL}/sitemap.xml`), "robots.txt sitemap URL does not match SITE_URL", errors);
  const sitemap = await request("/sitemap.xml");
  assert(sitemap.text.includes("<urlset"), "sitemap.xml is invalid", errors);
  assert((sitemap.text.match(/<lastmod>/g) || []).length > 0, "sitemap.xml has no lastmod values", errors);
  const sitemapUrls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert(sitemapUrls.every((url) => url === EXPECTED_SITE_URL || url.startsWith(`${EXPECTED_SITE_URL}/`)), "sitemap.xml contains URLs outside SITE_URL", errors);
  BODY_GUIDE_ROUTES.forEach((pathname) => assert(sitemapUrls.includes(`${EXPECTED_SITE_URL}${pathname}`), `${pathname} is missing from sitemap.xml`, errors));

  for (const pathname of RETIRED_LEGACY_ROUTES) {
    const result = await request(pathname);
    checks.push(`${pathname}: ${result.response.status}`);
    assertNotFound(pathname, result, errors);
    assert(!sitemap.text.includes(`${pathname}</loc>`) && !sitemap.text.includes(`${pathname}/</loc>`), `${pathname} is still listed in sitemap.xml`, errors);
  }

  const missingPath = `/__health-check-not-found-${Date.now()}`;
  const missing = await request(missingPath);
  checks.push(`${missingPath}: ${missing.response.status}`);
  assertNotFound(missingPath, missing, errors);

  console.log(`Production smoke check: ${BASE_URL} (canonical origin: ${EXPECTED_SITE_URL})`);
  checks.forEach((item) => console.log(`- ${item}`));
  console.log("- Responsive overflow: verify at 375px and 1440px in a real browser");
  console.log("- Unknown paths: dedicated 404 page with HTTP 404 verified");
  if (errors.length) {
    errors.forEach((error) => console.error(`ERROR: ${error}`));
    process.exit(1);
  }
  console.log(`Production smoke check passed. Sanity articles: ${articles.length}. Published medical topics: ${publishedTopics.length}.`);
}

run().catch((error) => {
  console.error(`Production smoke check failed: ${error.message}`);
  process.exit(1);
});
