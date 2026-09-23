const fs = require("fs");
const path = require("path");
const { SITE_URL, SITE_URL_TOKEN } = require("./site-url");
const { GA_MEASUREMENT_ID_TOKEN, resolveGaMeasurementId } = require("./analytics-config");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const retiredLegacyRoutes = [
  "/health-library/acupuncture-care",
  "/health-library/fascia-trigger-point",
  "/health-library/pain-nerve-signs",
  "/health-library/posture-pelvis-basics",
  "/health-library/sns-health-claims",
  "/health-library/stretch-basics",
  "/health-library/training-pain-care"
];
const required = [
  "index.html",
  "404.html",
  "app.js",
  "body-platform.js",
  "body-check-ui.js",
  "body-guide.js",
  "body-guide.css",
  "ec-home-ui.js",
  "styles.css",
  "ec-home.css",
  "sitemap.xml",
  "robots.txt",
  "site-config.json",
  "content/truth-check/articles/index.json",
  "content/truth-check/categories.json",
  "content/truth-check/related.json"
];

const missing = required.filter((file) => !fs.existsSync(path.join(dist, file)));
if (missing.length) {
  console.error("Missing dist files:");
  missing.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

const app = fs.readFileSync(path.join(dist, "app.js"), "utf8");
["renderHome", "renderBodyCheck", "renderSnsTrust", "renderHealthLibrary"].forEach((token) => {
  if (!app.includes(token)) {
    console.error(`Missing app route token: ${token}`);
    process.exit(1);
  }
});

const notFound = fs.readFileSync(path.join(dist, "404.html"), "utf8");
if (!/data-page=["']not-found["']/.test(notFound) || !/name=["']robots["'][^>]+noindex,follow/i.test(notFound)) {
  console.error("404.html must contain the dedicated not-found marker and noindex,follow.");
  process.exit(1);
}
if (/<link\s+[^>]*rel=["']canonical["']/i.test(notFound)) {
  console.error("404.html must not contain a canonical link.");
  process.exit(1);
}

const redirects = fs.readFileSync(path.join(dist, "_redirects"), "utf8");
if (/^\s*\/\*\s+\/index\.html\s+200\s*$/m.test(redirects)) {
  console.error("Catch-all SPA rewrite must not return index.html with HTTP 200.");
  process.exit(1);
}
const netlifyConfig = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");
if (/\[\[redirects\]\][\s\S]*?from\s*=\s*["']\/\*["'][\s\S]*?status\s*=\s*200/i.test(netlifyConfig)) {
  console.error("netlify.toml must not contain a catch-all HTTP 200 rewrite.");
  process.exit(1);
}

const bodyGuideRoutes = ["/body-guide/", "/body-check/lower-back/", "/body-check/neck/", "/body-check/shoulder/", "/body-check/hip/", "/body-check/knee/"];
const knownRoutes = ["/", "/health-library", "/body-check", "/about", ...bodyGuideRoutes];
const sanityArticles = JSON.parse(fs.readFileSync(path.join(dist, "data/sanity-articles/index.json"), "utf8"));
if (sanityArticles.length < 3) {
  console.error(`Expected at least 3 Sanity articles, received ${sanityArticles.length}.`);
  process.exit(1);
}
knownRoutes.push(`/health-library/${sanityArticles[0].slug}`);
knownRoutes.forEach((route) => {
  const relative = route === "/" ? "index.html" : path.join(route.replace(/^\//, ""), "index.html");
  if (!fs.existsSync(path.join(dist, relative))) {
    console.error(`Known public route is missing its static entry: ${route}`);
    process.exit(1);
  }
});

bodyGuideRoutes.forEach((route) => {
  const relative = path.join(route.replace(/^\//, ""), "index.html");
  const html = fs.readFileSync(path.join(dist, relative), "utf8");
  if (!html.includes(`rel="canonical" href="${SITE_URL}${route}"`) || !html.includes('"@type":"BreadcrumbList"')) {
    console.error(`${route} is missing its canonical or BreadcrumbList.`);
    process.exit(1);
  }
});

const lowerBackGuide = fs.readFileSync(path.join(dist, "body-check", "lower-back", "index.html"), "utf8");
if (
  !lowerBackGuide.includes('/body-check?part=lowback') ||
  !lowerBackGuide.includes('alt="首、肩、腰、股関節、膝を選べる背面の人体図"') ||
  !lowerBackGuide.includes('data-selector-part="lowback"') ||
  !lowerBackGuide.includes('data-initial-view="back"')
) {
  console.error("Lower-back search entry is missing its diagnosis handoff or descriptive image alt text.");
  process.exit(1);
}

const bodyPlatform = fs.readFileSync(path.join(dist, "body-platform.js"), "utf8");
if (!bodyPlatform.includes("normalizeRecord") || !bodyPlatform.includes("sponsorContext")) {
  console.error("Body platform history or sponsor-ready context is missing.");
  process.exit(1);
}
const homeScripts = fs.readFileSync(path.join(dist, "index.html"), "utf8");
if (!homeScripts.includes("/body-platform.js") || homeScripts.indexOf("/body-platform.js") > homeScripts.indexOf("/body-check-ui.js")) {
  console.error("body-platform.js must load before body-check-ui.js.");
  process.exit(1);
}
if (app.includes(SITE_URL_TOKEN)) {
  console.error("app.js still contains an unresolved SITE_URL token.");
  process.exit(1);
}

const siteConfig = JSON.parse(fs.readFileSync(path.join(dist, "site-config.json"), "utf8"));
if (siteConfig.siteUrl !== SITE_URL) {
  console.error(`site-config.json has an incorrect siteUrl: ${siteConfig.siteUrl}`);
  process.exit(1);
}
const gaMeasurementId = resolveGaMeasurementId();
if (siteConfig.gaMeasurementId !== gaMeasurementId) {
  console.error(`site-config.json has an incorrect GA4 measurement ID: ${siteConfig.gaMeasurementId}`);
  process.exit(1);
}
const homeWithAnalytics = fs.readFileSync(path.join(dist, "index.html"), "utf8");
if (homeWithAnalytics.includes(GA_MEASUREMENT_ID_TOKEN) || !homeWithAnalytics.includes(`googletagmanager.com/gtag/js?id=${gaMeasurementId}`) || !homeWithAnalytics.includes(`window.gtag("config", "${gaMeasurementId}")`)) {
  console.error("Homepage GA4 bootstrap is missing or unresolved.");
  process.exit(1);
}
const libraryScript = fs.readFileSync(path.join(dist, "sanity-health-library.js"), "utf8");
if (libraryScript.includes("line.me/R/ti/p/") || !libraryScript.includes("https://lin.ee/zjL9tPK")) {
  console.error("Health library LINE reservation URL is incorrect.");
  process.exit(1);
}

const sitemap = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
if ([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].some((match) => !match[1].startsWith(`${SITE_URL}/`) && match[1] !== SITE_URL)) {
  console.error(`sitemap.xml contains a URL outside SITE_URL (${SITE_URL}).`);
  process.exit(1);
}
bodyGuideRoutes.forEach((route) => {
  if (!sitemap.includes(`<loc>${SITE_URL}${route}</loc>`)) {
    console.error(`${route} is missing from sitemap.xml.`);
    process.exit(1);
  }
});
const robots = fs.readFileSync(path.join(dist, "robots.txt"), "utf8");
if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) {
  console.error("robots.txt has an incorrect sitemap URL.");
  process.exit(1);
}
retiredLegacyRoutes.forEach((route) => {
  const relative = path.join(route.replace(/^\//, ""), "index.html");
  if (fs.existsSync(path.join(dist, relative))) {
    console.error(`Retired placeholder route still has a static entry: ${route}`);
    process.exit(1);
  }
  if (sitemap.includes(`${route}</loc>`) || sitemap.includes(`${route}/</loc>`)) {
    console.error(`Retired placeholder route is still listed in sitemap.xml: ${route}`);
    process.exit(1);
  }
});

const routeMetadata = {
  "/about": {
    title: "このサイトについて | Health Check Lab",
    description: "Health Check Labの目的、医療診断ではないこと、匿名データの取り扱いについて説明します。"
  },
  "/body-check": {
    title: "原因筋診断・体のセルフチェック | Health Check Lab",
    description: "気になる部位・場面・症状を順番に選び、関係する可能性のある筋肉を整理するセルフチェックです。"
  },
  "/community": {
    title: "身体のサイン・匿名集計 | Health Check Lab",
    description: "匿名で集計した部位や不調の傾向を確認し、体のサインを整理するための参考情報を掲載しています。"
  },
  "/faq": {
    title: "よくある質問 | Health Check Lab",
    description: "Health Check Labの使い方、セルフチェックの位置づけ、匿名データの扱いなど、よくある質問に回答します。"
  },
  "/health-check": {
    title: "健康情報の参考度チェック | Health Check Lab",
    description: "SNS投稿や動画の内容を入力し、健康情報を参考にしやすいか整理するためのチェック機能です。"
  }
};
const descriptions = new Set();
Object.entries(routeMetadata).forEach(([route, metadata]) => {
  const relative = path.join(route.replace(/^\//, ""), "index.html");
  const html = fs.readFileSync(path.join(dist, relative), "utf8");
  const canonical = `${SITE_URL}${route}`;
  if (!html.includes(`<title>${metadata.title}</title>`)) {
    console.error(`${route} has an incorrect title.`);
    process.exit(1);
  }
  if (!html.includes(`content="${metadata.description}"`)) {
    console.error(`${route} has an incorrect meta description.`);
    process.exit(1);
  }
  if (!html.includes(`rel="canonical" href="${canonical}"`)) {
    console.error(`${route} has an incorrect canonical.`);
    process.exit(1);
  }
  if (descriptions.has(metadata.description)) {
    console.error(`${route} reuses another page's meta description.`);
    process.exit(1);
  }
  descriptions.add(metadata.description);
});

const home = fs.readFileSync(path.join(dist, "index.html"), "utf8");
if (!home.includes(`rel="canonical" href="${SITE_URL}/"`) || !home.includes(`property="og:url" content="${SITE_URL}/"`)) {
  console.error("Homepage canonical or Open Graph URL does not match SITE_URL.");
  process.exit(1);
}
if (!home.includes(`"url": "${SITE_URL}/"`) || home.includes(SITE_URL_TOKEN)) {
  console.error("Homepage JSON-LD or SITE_URL token replacement is incorrect.");
  process.exit(1);
}

console.log("Dist page check passed.");
