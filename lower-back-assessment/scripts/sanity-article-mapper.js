function compactString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined);
  if (value === null || value === undefined) return [];
  return [value];
}

function isoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function assetRefToUrl(ref, projectId, dataset, options = {}) {
  if (!ref || !projectId || !dataset) return "";
  const match = String(ref).match(/^image-([a-f0-9]+)-(\d+x\d+)-([a-z0-9]+)$/i);
  if (!match) return "";
  const [, assetId, dimensions, format] = match;
  const params = new URLSearchParams();
  if (options.width) params.set("w", String(options.width));
  if (options.quality) params.set("q", String(options.quality));
  params.set("auto", "format");
  const query = params.toString();
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${assetId}-${dimensions}.${format}${query ? `?${query}` : ""}`;
}

function resizeSanityImageUrl(url, options = {}) {
  if (!url) return "";
  try {
    const imageUrl = new URL(url);
    if (options.width) imageUrl.searchParams.set("w", String(options.width));
    if (options.quality) imageUrl.searchParams.set("q", String(options.quality));
    imageUrl.searchParams.set("auto", "format");
    return imageUrl.toString();
  } catch (_) {
    return url;
  }
}

function mapImage(image, fallbackAlt, context = {}) {
  if (!image) return null;
  const rawUrl = image.asset?.url || image.url || assetRefToUrl(image.asset?._ref || image.asset?._id, context.projectId, context.dataset, context.image || {});
  const url = resizeSanityImageUrl(rawUrl, context.image || { width: 1200, quality: 82 });
  if (!url) return null;
  return {
    url,
    alt: compactString(image.alt) || compactString(fallbackAlt),
    caption: compactString(image.caption),
    dimensions: image.asset?.metadata?.dimensions || null
  };
}

function mapTaxonomyItem(item) {
  if (!item) return null;
  const title = compactString(item.title || item.name);
  const slug = compactString(item.slug?.current || item.slug);
  if (!title && !slug) return null;
  return { id: compactString(item._id), title, slug };
}

function mapReference(item) {
  if (!item) return null;
  const ref = item.reference && typeof item.reference === "object" ? { ...item, ...item.reference } : item;
  const title = compactString(ref.title);
  if (!title) return null;
  return {
    id: compactString(ref._id),
    title,
    authors: compactString(ref.authors),
    year: compactString(ref.year),
    source: compactString(ref.source || ref.journal),
    journal: compactString(ref.journal),
    studyDesign: compactString(ref.studyDesign),
    doi: compactString(ref.doi),
    pmid: compactString(ref.pmid),
    pubMedUrl: compactString(ref.pubMedUrl),
    url: compactString(ref.url),
    journalUrl: compactString(ref.journalUrl),
    supports: compactString(ref.supports),
    evidenceLevel: compactString(ref.evidenceLevel),
    verified: Boolean(ref.verified),
    note: compactString(ref.note)
  };
}

function mapFaq(item) {
  const question = compactString(item?.question);
  const answer = compactString(item?.answer);
  return question && answer ? { question, answer } : null;
}

function mapAuthor(author, title, context) {
  if (!author) return {};
  return {
    id: compactString(author._id),
    name: compactString(author.name),
    role: compactString(author.role),
    description: compactString(author.description),
    image: mapImage(author.image, author.name || title, context)
  };
}

function mapRelatedPost(post, context) {
  if (!post) return null;
  const title = compactString(post.title);
  const slug = compactString(post.slug?.current || post.slug);
  if (!title || !slug) return null;
  return {
    id: compactString(post._id),
    title,
    slug,
    excerpt: compactString(post.excerpt || post.summary),
    summary: compactString(post.summary || post.excerpt),
    publishedAt: isoDate(post.publishedAt),
    updatedAt: isoDate(post.updatedAt),
    mainImage: mapImage(post.mainImage, title, context)
  };
}

function hasPortableText(body) {
  return Array.isArray(body) && body.some((block) => block && typeof block === "object");
}

function normalizeSanityArticle(post, context = {}) {
  const warnings = [];
  const title = compactString(post?.title);
  const slug = compactString(post?.slug?.current || post?.slug);
  const body = Array.isArray(post?.body) ? post.body : [];

  if (!title) warnings.push("missing title");
  if (!slug) warnings.push("missing slug");
  if (!hasPortableText(body)) warnings.push("missing body");

  if (warnings.length) return { article: null, warnings };

  const seo = post.seo || {};
  const article = {
    id: compactString(post._id),
    type: compactString(post._type || "post"),
    title,
    slug,
    excerpt: compactString(post.excerpt || post.summary),
    summary: compactString(post.summary || post.excerpt),
    publishedAt: isoDate(post.publishedAt),
    updatedAt: isoDate(post.updatedAt || post._updatedAt),
    body,
    mainImage: mapImage(post.mainImage, title, context),
    categories: asArray(post.categories).map(mapTaxonomyItem).filter(Boolean),
    tags: asArray(post.tags).map(mapTaxonomyItem).filter(Boolean),
    faqs: asArray(post.faqs).map(mapFaq).filter(Boolean),
    references: asArray(post.references).map(mapReference).filter(Boolean),
    relatedPosts: asArray(post.relatedPosts).map((item) => mapRelatedPost(item, context)).filter(Boolean),
    author: mapAuthor(post.author, title, context),
    seo: {
      title: compactString(seo.title || post.seoTitle || title),
      description: compactString(seo.description || post.seoDescription || post.excerpt || post.summary),
      ogTitle: compactString(seo.ogTitle || post.ogTitle || seo.title || post.seoTitle || title),
      ogDescription: compactString(seo.ogDescription || post.ogDescription || seo.description || post.seoDescription || post.excerpt || post.summary),
      noIndex: Boolean(seo.noIndex),
      canonical: compactString(seo.canonical),
      image: mapImage(seo.image, title, context)
    },
    keywords: asArray(post.keywords).map(compactString).filter(Boolean),
    targetSymptoms: asArray(post.targetSymptoms).map(compactString).filter(Boolean),
    source: "sanity"
  };

  return { article, warnings };
}

function normalizeSanityArticles(posts, options = {}) {
  const existingSlugs = new Set(options.existingSlugs || []);
  const seenSlugs = new Set();
  const articles = [];
  const excluded = [];
  const duplicateSlugs = [];

  asArray(posts).forEach((post) => {
    const { article, warnings } = normalizeSanityArticle(post, options);
    const rawSlug = compactString(post?.slug?.current || post?.slug || post?._id);

    if (!article) {
      excluded.push({ id: compactString(post?._id), slug: rawSlug, reasons: warnings });
      return;
    }

    if (seenSlugs.has(article.slug)) {
      duplicateSlugs.push({ slug: article.slug, source: "sanity" });
      excluded.push({ id: article.id, slug: article.slug, reasons: ["duplicate Sanity slug"] });
      return;
    }

    if (existingSlugs.has(article.slug)) {
      duplicateSlugs.push({ slug: article.slug, source: "existing-json" });
    }

    seenSlugs.add(article.slug);
    articles.push(article);
  });

  return { articles, excluded, duplicateSlugs };
}

function summarizeArticle(article) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    summary: article.summary,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    mainImage: article.mainImage,
    categories: article.categories,
    tags: article.tags,
    author: article.author,
    seo: article.seo,
    source: article.source
  };
}

module.exports = {
  assetRefToUrl,
  mapImage,
  normalizeSanityArticle,
  normalizeSanityArticles,
  summarizeArticle
};
