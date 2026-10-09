(function (root, factory) {
  const bodyPlatform = typeof module === "object" && module.exports
    ? require("./body-platform")
    : root?.HealthCheckBodyPlatform;
  const api = factory(bodyPlatform);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HealthLibraryContent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (bodyPlatform) {
  const RELATED_LIMIT = 3;
  const ARTICLE_DIAGNOSIS_FROM = "article-diagnosis";
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
  const BODY_PART_LABELS = new Map([
    ["neck", "首"],
    ["shoulder", "肩"],
    ["elbow", "肘"],
    ["wrist", "手首"],
    ["back", "背中"],
    ["lowback", "腰"],
    ["hip", "股関節"],
    ["buttock", "お尻"],
    ["thigh", "太もも"],
    ["knee", "膝"],
    ["lowerleg", "すね・ふくらはぎ"],
    ["ankle", "足首"],
    ["sole", "足裏"]
  ]);
  const BODY_PART_ALIASES = new Map([
    ["lower-back", "lowback"],
    ["lower_back", "lowback"],
    ["lumbar", "lowback"],
    ["scapula", "shoulder"],
    ["glute", "buttock"],
    ["glutes", "buttock"],
    ["calf", "lowerleg"],
    ["shin", "lowerleg"],
    ["foot", "sole"]
  ]);
  const ARTICLE_BODY_PART_RULES = [
    { bodyPart: "wrist", terms: ["手首"] },
    { bodyPart: "ankle", terms: ["足首"] },
    { bodyPart: "sole", terms: ["足裏", "足底"] },
    { bodyPart: "lowerleg", terms: ["すね", "ふくらはぎ", "下腿"] },
    { bodyPart: "elbow", terms: ["テニス肘", "ゴルフ肘", "肘"] },
    { bodyPart: "knee", terms: ["膝"] },
    { bodyPart: "hip", terms: ["股関節", "脚の付け根"] },
    { bodyPart: "buttock", terms: ["お尻", "臀部"] },
    { bodyPart: "thigh", terms: ["太もも", "大腿"] },
    { bodyPart: "lowback", terms: ["腰痛", "腰の痛み", "腸腰筋", "腰"] },
    { bodyPart: "shoulder", terms: ["肩こり", "肩甲骨", "肩の痛み", "肩"] },
    { bodyPart: "neck", terms: ["首こり", "首の痛み", "眼精疲労", "耳鳴り", "頭痛", "首"] },
    { bodyPart: "back", terms: ["背中", "胸椎"] }
  ];

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

  function normalizeArticleBodyPart(value) {
    const raw = text(value).toLowerCase();
    if (!raw) return "";
    if (typeof bodyPlatform?.normalizeBodyPart === "function") {
      const normalized = bodyPlatform.normalizeBodyPart(raw);
      if (normalized && normalized !== "unknown") return normalized;
    }
    const normalized = BODY_PART_ALIASES.get(raw) || raw;
    return BODY_PART_LABELS.has(normalized) ? normalized : "";
  }

  function articleDiagnosisUrl(value) {
    const bodyPart = normalizeArticleBodyPart(value);
    if (!bodyPart) return "";
    return `/body-check/?part=${encodeURIComponent(bodyPart)}&from=${ARTICLE_DIAGNOSIS_FROM}`;
  }

  function diagnosisPartFromHref(value) {
    const href = text(value);
    if (!href) return "";
    try {
      const url = new URL(href, "https://health-check.local");
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      if (pathname === "/body-check") return normalizeArticleBodyPart(url.searchParams.get("part"));
      const match = pathname.match(/^\/body-check\/([^/]+)$/);
      return match ? normalizeArticleBodyPart(decodeURIComponent(match[1])) : "";
    } catch (_) {
      return "";
    }
  }

  function safeCheckHref(source, fallbackHref) {
    const sourcePart = normalizeArticleBodyPart(source?.bodyPart) || diagnosisPartFromHref(source?.href);
    if (sourcePart) return articleDiagnosisUrl(sourcePart);
    const fallbackPart = diagnosisPartFromHref(fallbackHref);
    return fallbackPart ? articleDiagnosisUrl(fallbackPart) : "/body-guide/";
  }

  function resolveArticleDiagnosisEntry(article) {
    const title = text(article?.title);
    const categoryText = categoriesOf(article).join(" ");
    const source = [
      article?.excerpt,
      article?.summary,
      categoryText,
      ...array(article?.tags).map((item) => text(item?.title || item?.slug || item)),
      ...array(article?.keywords),
      ...array(article?.targetSymptoms)
    ].map(text).filter(Boolean).join(" ");
    const match = ARTICLE_BODY_PART_RULES.find((entry) => entry.terms.some((term) => title.includes(term)))
      || ARTICLE_BODY_PART_RULES.find((entry) => entry.terms.some((term) => source.includes(term)));
    if (!match) return { href: "/body-guide/", label: "身体の部位から探す", bodyPart: "" };
    return {
      href: articleDiagnosisUrl(match.bodyPart),
      label: `${BODY_PART_LABELS.get(match.bodyPart)}のセルフチェックへ`,
      bodyPart: match.bodyPart
    };
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
    ARTICLE_BODY_PART_IDS: Object.freeze([...BODY_PART_LABELS.keys()]),
    articleDiagnosisUrl,
    diagnosisPartFromHref,
    explicitRelatedSlugs,
    linkNavigationMode,
    normalizeArticleBodyPart,
    resolveArticleDiagnosisEntry,
    resolveDiagnosisGuide,
    safeCheckHref,
    selectRelatedArticles
  };
});
