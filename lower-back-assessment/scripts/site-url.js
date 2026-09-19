const DEFAULT_SITE_URL = "https://health-check-platform-v2.netlify.app";
const SITE_URL_TOKEN = "__SITE_URL__";

function normalizeSiteUrl(value) {
  const candidate = String(value || DEFAULT_SITE_URL).trim();
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (_) {
    throw new Error(`SITE_URL must be an absolute URL: ${candidate}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`SITE_URL must use http or https: ${candidate}`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== "/")) {
    throw new Error(`SITE_URL must contain only the site origin: ${candidate}`);
  }
  return parsed.origin;
}

function resolveSiteUrl(env = process.env) {
  return normalizeSiteUrl(env.SITE_URL || env.URL || DEFAULT_SITE_URL);
}

const SITE_URL = resolveSiteUrl();

function injectSiteUrl(content, siteUrl = SITE_URL) {
  return String(content).split(SITE_URL_TOKEN).join(normalizeSiteUrl(siteUrl));
}

module.exports = { DEFAULT_SITE_URL, SITE_URL, SITE_URL_TOKEN, injectSiteUrl, normalizeSiteUrl, resolveSiteUrl };
