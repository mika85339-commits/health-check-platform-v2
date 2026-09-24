(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthLibraryContent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const RELATED_LIMIT = 3;
  const CATEGORY_ALIASES = new Map([
    ["肩こり", "首・肩"],
    ["首こり", "首・肩"],
    ["首肩こり", "首・肩"],
    ["首・肩こり", "首・肩"],
    ["首肩", "首・肩"],
    ["腰痛", "腰"],
    ["膝痛", "膝"],
    ["睡眠", "自律神経"],
    ["不眠", "自律神経"],
    ["耳鳴り", "耳の症状"],
    ["めまい", "耳の症状"],
    ["目の疲れ", "目の症状"],
    ["美容鍼", "美容"],
    ["鍼灸・治療", "鍼灸"],
    ["筋トレ・運動", "運動"],
    ["SNS健康情報", "健康情報"]
  ]);
  const BODY_CHECK_PATHS = new Map([
    ["neck", "/body-check/neck/"],
    ["shoulder", "/body-check/shoulder/"],
    ["lower-back", "/body-check/lower-back/"],
    ["hip", "/body-check/hip/"],
    ["knee", "/body-check/knee/"]
  ]);

  function array(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function text(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function slugOf(value) {
    return text(typeof value === "string" ? value : value?.slug?.current || value?.slug);
  }

  function categoriesOf(article) {
    const values = array(article?.categories)
      .map((item) => text(typeof item === "string" ? item : item?.title || item?.slug?.current || item?.slug))
      .filter(Boolean);
    return [...new Set(values.map((value) => CATEGORY_ALIASES.get(value) || value))];
  }

  function timestamp(article) {
    const value = article?.publishedAt || article?.updatedAt || article?._updatedAt || article?.datePublished || "";
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function dateDistance(article, candidate) {
    const sourceTime = timestamp(article);
    const candidateTime = timestamp(candidate);
    if (!sourceTime || !candidateTime) return Number.MAX_SAFE_INTEGER;
    return Math.abs(sourceTime - candidateTime);
  }

  function explicitRelatedSlugs(article) {
    const previewSlugs = array(article?.localPreview?.relatedSlugs).map(slugOf).filter(Boolean);
    const source = previewSlugs.length ? previewSlugs : array(article?.relatedPosts).map(slugOf).filter(Boolean);
    const seen = new Set();
    return source.filter((slug) => slug && !seen.has(slug) && seen.add(slug));
  }

  function selectRelatedArticles(article, allArticles, limit = RELATED_LIMIT) {
    const articleSlug = slugOf(article);
    const candidates = array(allArticles).filter((candidate) => slugOf(candidate) && slugOf(candidate) !== articleSlug);
    const bySlug = new Map(candidates.map((candidate) => [slugOf(candidate), candidate]));
    const selected = [];
    const selectedSlugs = new Set();
    const add = (candidate) => {
      const slug = slugOf(candidate);
      if (!candidate || !slug || slug === articleSlug || selectedSlugs.has(slug) || selected.length >= limit) return;
      selectedSlugs.add(slug);
      selected.push(candidate);
    };

    explicitRelatedSlugs(article).forEach((slug) => add(bySlug.get(slug)));

    const sourceCategories = new Set(categoriesOf(article));
    const sameCategory = candidates
      .filter((candidate) => categoriesOf(candidate).some((category) => sourceCategories.has(category)))
      .sort((left, right) => dateDistance(article, left) - dateDistance(article, right));
    const remainingByDate = candidates
      .filter((candidate) => !sameCategory.some((item) => slugOf(item) === slugOf(candidate)))
      .sort((left, right) => dateDistance(article, left) - dateDistance(article, right));
    const latest = [...candidates].sort((left, right) => timestamp(right) - timestamp(left));

    [...sameCategory, ...remainingByDate, ...latest].forEach(add);
    return selected;
  }

  function safeCheckHref(source, fallbackHref) {
    const bodyPart = text(source?.bodyPart);
    if (BODY_CHECK_PATHS.has(bodyPart)) return BODY_CHECK_PATHS.get(bodyPart);
    const href = text(source?.href);
    if ([...BODY_CHECK_PATHS.values()].includes(href)) return href;
    return fallbackHref;
  }

  function resolveDiagnosisGuide(article, fallbackEntry, fallbackDescription) {
    const source = article?.localPreview?.diagnosis || article?.diagnosisGuide || {};
    return {
      heading: text(source.heading) || "この症状に関連する筋肉を確認",
      description: text(source.description) || text(fallbackDescription),
      label: text(source.label) || text(fallbackEntry?.label),
      href: safeCheckHref(source, fallbackEntry?.href || "/body-guide/")
    };
  }

  function linkNavigationMode(href, siteUrl, currentOrigin) {
    const value = text(href);
    if (!value) return "external";
    try {
      const baseUrl = currentOrigin || siteUrl || "http://localhost";
      const url = new URL(value, baseUrl);
      const internalOrigins = new Set(
        [siteUrl, currentOrigin]
          .filter(Boolean)
          .map((origin) => new URL(origin, baseUrl).origin)
      );
      if (!internalOrigins.has(url.origin)) return "external";
      const path = url.pathname.replace(/\/+$/, "") || "/";
      return path === "/health-library" || path.startsWith("/health-library/") ? "library" : "document";
    } catch (_) {
      if (value === "/health-library" || value.startsWith("/health-library/")) return "library";
      return value.startsWith("/") ? "document" : "external";
    }
  }

  return {
    explicitRelatedSlugs,
    linkNavigationMode,
    resolveDiagnosisGuide,
    selectRelatedArticles
  };
});
