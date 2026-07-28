const DEFAULT_API_VERSION = "2026-07-15";

const SANITY_POSTS_QUERY = /* groq */ `
  *[
    _type == "post" &&
    !(_id in path("drafts.**")) &&
    defined(slug.current) &&
    defined(publishedAt) &&
    dateTime(publishedAt) <= dateTime(now())
  ] | order(publishedAt desc) {
    _id,
    _type,
    title,
    "slug": slug.current,
    excerpt,
    summary,
    publishedAt,
    updatedAt,
    _updatedAt,
    body,
    mainImage {
      asset->{_id, url, metadata {dimensions}},
      alt,
      caption
    },
    categories[]->{_id, title, "slug": slug.current},
    tags[]->{_id, title, "slug": slug.current},
    faqs[] {question, answer},
    references[] {
      _key,
      _type,
      title,
      authors,
      year,
      source,
      journal,
      studyDesign,
      doi,
      pmid,
      pubMedUrl,
      url,
      journalUrl,
      supports,
      evidenceLevel,
      verified,
      note,
      "reference": @->{
        _id,
        title,
        authors,
        year,
        source,
        journal,
        studyDesign,
        doi,
        pmid,
        pubMedUrl,
        url,
        journalUrl,
        supports,
        evidenceLevel,
        verified,
        note
      }
    },
    relatedPosts[]->{
      _id,
      title,
      "slug": slug.current,
      excerpt,
      summary,
      publishedAt,
      updatedAt,
      mainImage {
        asset->{_id, url, metadata {dimensions}},
        alt,
        caption
      }
    },
    author->{
      _id,
      name,
      role,
      description,
      image {asset->{_id, url, metadata {dimensions}}, alt}
    },
    seo {
      title,
      description,
      ogTitle,
      ogDescription,
      noIndex,
      image {asset->{_id, url, metadata {dimensions}}, alt}
    },
    seoTitle,
    seoDescription,
    ogTitle,
    ogDescription,
    keywords,
    targetSymptoms
  }
`;

function getSanityConfig(env = process.env) {
  return {
    projectId: env.SANITY_PROJECT_ID || "",
    dataset: env.SANITY_DATASET || "",
    apiVersion: env.SANITY_API_VERSION || DEFAULT_API_VERSION,
    token: env.SANITY_READ_TOKEN || ""
  };
}

function missingSanityConfig(config) {
  return [
    ["SANITY_PROJECT_ID", config.projectId],
    ["SANITY_DATASET", config.dataset],
    ["SANITY_API_VERSION", config.apiVersion]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

function isProductionSanityRequired(env = process.env) {
  return env.SANITY_EXPORT_REQUIRED === "true" || (env.NETLIFY === "true" && env.CONTEXT === "production");
}

function sanityQueryUrl(config, query = SANITY_POSTS_QUERY) {
  const apiVersion = String(config.apiVersion || DEFAULT_API_VERSION).replace(/^v/, "");
  const params = new URLSearchParams({ query });
  return `https://${config.projectId}.api.sanity.io/v${apiVersion}/data/query/${config.dataset}?${params.toString()}`;
}

function safeErrorMessage(error) {
  if (!error) return "Unknown Sanity error";
  const message = error.message || String(error);
  return message.replace(/Bearer\s+[A-Za-z0-9._\-]+/g, "Bearer [redacted]");
}

async function fetchSanityPosts(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const config = options.config || getSanityConfig(env);
  const missing = missingSanityConfig(config);

  if (missing.length) {
    const message = `Missing required Sanity environment variables: ${missing.join(", ")}`;
    if (isProductionSanityRequired(env)) throw new Error(message);
    logger.warn(`[sanity] ${message}. Skipping Sanity article export for this build.`);
    return { posts: [], config, skipped: true, missing };
  }

  const headers = { Accept: "application/json" };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  logger.log(`[sanity] Fetching published posts from project ${config.projectId}, dataset ${config.dataset}, api ${config.apiVersion}`);

  let response;
  try {
    response = await fetch(sanityQueryUrl(config), { headers });
  } catch (error) {
    throw new Error(`Sanity request failed: ${safeErrorMessage(error)}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Sanity returned a non-JSON response. HTTP ${response.status}. ${safeErrorMessage(error)}`);
  }

  if (!response.ok) {
    const message = payload?.error?.description || payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(`Sanity query failed: ${message}`);
  }

  const posts = Array.isArray(payload.result) ? payload.result : [];
  logger.log(`[sanity] Retrieved ${posts.length} published post(s).`);
  return { posts, config, skipped: false, missing: [] };
}

module.exports = {
  DEFAULT_API_VERSION,
  SANITY_POSTS_QUERY,
  fetchSanityPosts,
  getSanityConfig,
  isProductionSanityRequired,
  missingSanityConfig,
  sanityQueryUrl,
  safeErrorMessage
};
