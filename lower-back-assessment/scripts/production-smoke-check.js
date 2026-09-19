const BASE_URL = String(process.env.SITE_CHECK_BASE_URL || "https://health-check-platform-v2.netlify.app").replace(/\/$/, "");
const SITE_URL = "https://health-check-platform-v2.netlify.app";
const HUB_SLUGS = ["chronic-pain", "chronic-low-back-pain", "chronic-neck-shoulder-pain", "acupuncture-for-chronic-pain"];
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

async function run() {
  const errors = [];
  const checks = [];
  for (const pathname of ["/", "/health-library", "/body-check", "/about", "/health-library/acupuncture-care", "/sitemap.xml", "/robots.txt"]) {
    const result = await request(pathname);
    checks.push(`${pathname}: ${result.response.status}`);
    assert(result.response.ok, `${pathname} returned ${result.response.status}`, errors);
  }

  for (const [pathname, [title, description]] of Object.entries(ROUTE_METADATA)) {
    const result = await request(pathname);
    const canonical = `${SITE_URL}${pathname}`;
    checks.push(`${pathname} metadata: ${result.response.status}`);
    assert(result.response.ok, `${pathname} returned ${result.response.status}`, errors);
    assert(result.text.includes(`<title>${title}</title>`), `${pathname} has an incorrect title`, errors);
    assert(result.text.includes(`content="${description}"`), `${pathname} has an incorrect meta description`, errors);
    assert(result.text.includes(`rel="canonical" href="${canonical}"`), `${pathname} has an incorrect canonical`, errors);
    assert(!/name=["']robots["'][^>]+noindex/i.test(result.text), `${pathname} is marked noindex`, errors);
  }

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
    assert(/<link\s+rel="canonical"/i.test(result.text), `${pathname} is missing canonical`, errors);
    assert(/"@type":"Article"/.test(result.text), `${pathname} is missing Article JSON-LD`, errors);
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
  const sitemap = await request("/sitemap.xml");
  assert(sitemap.text.includes("<urlset"), "sitemap.xml is invalid", errors);
  assert((sitemap.text.match(/<lastmod>/g) || []).length > 0, "sitemap.xml has no lastmod values", errors);

  const missingPath = `/__health-check-not-found-${Date.now()}`;
  const missing = await request(missingPath);
  checks.push(`${missingPath}: ${missing.response.status}`);
  assert(missing.response.status === 404, `${missingPath} returned ${missing.response.status} instead of 404`, errors);
  assert(/data-page=["']not-found["']/.test(missing.text), `${missingPath} did not return the dedicated 404 page`, errors);

  console.log(`Production smoke check: ${BASE_URL}`);
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
