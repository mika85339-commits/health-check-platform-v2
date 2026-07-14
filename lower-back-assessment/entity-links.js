(function () {
  const CLINIC_PATH = "/clinic-profile";
  const CLINIC_NAME = "ハリプラス鍼灸院";
  const SUPERVISOR = "ハリプラス鍼灸院 鍼灸師";

  function createElement(tag, className, html) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (html) element.innerHTML = html;
    return element;
  }

  function addResultContext() {
    const resultPanel = document.querySelector(".result-panel");
    if (!resultPanel || resultPanel.querySelector(".clinic-context-card")) return;

    const card = createElement(
      "article",
      "info-card clinic-context-card",
      `
        <h3>この結果について</h3>
        <p>この結果は医療診断ではなく、回答内容から負担が考えられる筋肉を推定した参考情報です。</p>
        <p>Health Check Labは、${CLINIC_NAME}の鍼灸師が監修する筋肉評価・健康情報サービスです。</p>
        <div class="inline-actions">
          <a class="ghost-link" href="/health-library">関連する健康情報を見る</a>
          <a class="ghost-link" href="${CLINIC_PATH}">${CLINIC_NAME}について</a>
        </div>
      `
    );

    const saveStrip = resultPanel.querySelector(".save-strip");
    if (saveStrip) {
      resultPanel.insertBefore(card, saveStrip);
    } else {
      resultPanel.appendChild(card);
    }
  }

  function currentArticleSlug() {
    const match = location.pathname.match(/^\/health-library\/([^/]+)/);
    if (match) return decodeURIComponent(match[1]);
    const stored = sessionStorage.getItem("health-check-lab-route") || "";
    const storedMatch = stored.match(/^\/health-library\/([^/]+)/);
    return storedMatch ? decodeURIComponent(storedMatch[1]) : "";
  }

  async function loadArticle(slug) {
    if (!slug) return null;
    try {
      const response = await fetch(`/content/truth-check/articles/${encodeURIComponent(slug)}.json`, {
        cache: "force-cache"
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (_error) {
      return null;
    }
  }

  function formatDate(value) {
    if (!value) return "未公開";
    return String(value).slice(0, 10);
  }

  async function addArticleTrust() {
    const articlePage = document.querySelector(".article-template");
    if (!articlePage || articlePage.querySelector(".article-trust-card")) return;

    const slug = currentArticleSlug();
    const article = await loadArticle(slug);
    if (!document.body.contains(articlePage) || articlePage.querySelector(".article-trust-card")) return;

    const author = article?.authorName || SUPERVISOR;
    const reviewer = article?.reviewedBy || author;
    const published = formatDate(article?.datePublished || article?.publishedAt);
    const modified = formatDate(article?.dateModified || article?.updatedAt);
    const citations = Array.isArray(article?.citation) ? article.citation : [];
    const references = Array.isArray(article?.references) ? article.references : [];
    const referenceCount = citations.length || references.length;

    const card = createElement(
      "section",
      "supervision-box article-trust-card",
      `
        <h2>記事の信頼性について</h2>
        <dl class="meta-list">
          <div><dt>執筆者</dt><dd>${author}</dd></div>
          <div><dt>監修者</dt><dd>${reviewer}</dd></div>
          <div><dt>公開日</dt><dd>${published}</dd></div>
          <div><dt>最終更新日</dt><dd>${modified}</dd></div>
          <div><dt>参考文献</dt><dd>${referenceCount ? `${referenceCount}件` : "公開前に確認予定"}</dd></div>
        </dl>
        <h3>記事作成方針</h3>
        <p>この記事は${CLINIC_NAME}の鍼灸師が、運動器・慢性痛・筋肉評価の視点から作成しています。</p>
        <p>医療診断ではなく、健康情報を整理するための一般情報です。強い痛み、しびれ、麻痺、発熱などがある場合は医療機関へ相談してください。</p>
        <p><a class="ghost-link" href="${CLINIC_PATH}">${CLINIC_NAME}について</a></p>
      `
    );

    articlePage.appendChild(card);
  }

  function enhance() {
    addResultContext();
    addArticleTrust();
  }

  document.addEventListener("DOMContentLoaded", enhance);
  window.addEventListener("popstate", () => setTimeout(enhance, 0));

  const observer = new MutationObserver(() => enhance());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
