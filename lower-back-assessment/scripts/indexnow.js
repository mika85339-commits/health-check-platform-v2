const fs = require("fs");
const path = require("path");
const { SITE_URL } = require("./content-utils");

function validKey(key) {
  return /^[A-Za-z0-9-]{8,128}$/.test(String(key || ""));
}

function writeIndexNowVerificationFile(dist, env = process.env) {
  const key = env.INDEXNOW_KEY || "";
  if (!key) return { enabled: false, reason: "INDEXNOW_KEY is not configured" };
  if (!validKey(key)) throw new Error("INDEXNOW_KEY must be 8-128 characters using letters, numbers, or hyphens.");
  const file = path.join(dist, `${key}.txt`);
  fs.writeFileSync(file, key, "utf8");
  return { enabled: true, file };
}

function sitemapUrls(dist) {
  const file = path.join(dist, "sitemap.xml");
  if (!fs.existsSync(file)) throw new Error("dist/sitemap.xml is missing. Run npm run build first.");
  return Array.from(fs.readFileSync(file, "utf8").matchAll(/<loc>(.*?)<\/loc>/g)).map((match) => match[1]);
}

async function submitIndexNow({ dist, env = process.env, urls = sitemapUrls(dist), logger = console }) {
  const key = env.INDEXNOW_KEY || "";
  if (!validKey(key)) throw new Error("A valid INDEXNOW_KEY is required for submission.");
  const site = new URL(SITE_URL);
  const ownedUrls = urls.filter((url) => {
    try {
      return new URL(url).host === site.host;
    } catch (_) {
      return false;
    }
  });
  if (!ownedUrls.length) return { submitted: 0, status: "skipped" };
  const endpoint = env.INDEXNOW_ENDPOINT || "https://api.indexnow.org/indexnow";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: site.host, key, keyLocation: `${site.origin}/${key}.txt`, urlList: ownedUrls.slice(0, 10000) })
  });
  if (!response.ok && response.status !== 202) throw new Error(`IndexNow submission failed with HTTP ${response.status}.`);
  logger.log(`[indexnow] Submitted ${ownedUrls.length} URL(s); response HTTP ${response.status}.`);
  return { submitted: ownedUrls.length, status: response.status };
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const dist = path.join(root, "dist");
  if (!process.argv.includes("--submit")) {
    const urls = sitemapUrls(dist);
    console.log(`[indexnow] Dry run only. ${urls.length} sitemap URL(s) are eligible for review. Add --submit to notify IndexNow.`);
  } else {
    submitIndexNow({ dist }).catch((error) => {
      console.error(`[indexnow] ${error.message}`);
      process.exit(1);
    });
  }
}

module.exports = { sitemapUrls, submitIndexNow, validKey, writeIndexNowVerificationFile };
