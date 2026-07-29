(function () {
  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function headingKey(value) {
    const text = clean(value).replace(/[「」『』【】[\]（）()、。・\s]/g, "").toLowerCase();
    if (/研究で確認|研究から分か|医学研究で示|研究報告/.test(text)) return "research-findings";
    if (/期待できる作用|期待される作用|期待できる効果|期待される変化|期待できる変化/.test(text)) return "expected-effects";
    if (/考えられているメカニズム|作用の仕組み|働く仕組み|作用機序/.test(text)) return "mechanism";
    return text;
  }

  function textKey(value) {
    return clean(value).replace(/[「」『』【】[\]（）()、。・\s,.，．]/g, "").toLowerCase();
  }

  function dedupeToc(root) {
    root.querySelectorAll(".article-toc ol").forEach((list) => {
      const seenIds = new Set();
      const seenTitles = new Set();
      list.querySelectorAll("li").forEach((item) => {
        const link = item.querySelector("a");
        const id = clean((link?.getAttribute("href") || "").replace(/^#/, ""));
        const title = headingKey(link?.textContent || item.textContent || "");
        if (!title || seenIds.has(id) || seenTitles.has(title)) {
          item.remove();
          return;
        }
        if (id) seenIds.add(id);
        seenTitles.add(title);
      });
    });
  }

  function dedupeBody(root) {
    root.querySelectorAll(".sanity-body").forEach((body) => {
      const seenHeadings = new Set();
      const seenText = new Set();

      body.querySelectorAll("h2, h3, h4").forEach((heading) => {
        const key = headingKey(heading.textContent);
        if (key && seenHeadings.has(key)) {
          heading.remove();
          return;
        }
        if (key) seenHeadings.add(key);
      });

      body.querySelectorAll("p, li, blockquote").forEach((node) => {
        const key = textKey(node.textContent);
        if (key.length <= 32) return;
        if (seenText.has(key)) {
          node.remove();
          return;
        }
        seenText.add(key);
      });
    });
  }

  function normalizeArticle() {
    const app = document.querySelector("#app");
    if (!app) return;
    dedupeBody(app);
    dedupeToc(app);
  }

  document.addEventListener("DOMContentLoaded", normalizeArticle);
  window.addEventListener("popstate", () => setTimeout(normalizeArticle, 0));

  const target = document.querySelector("#app");
  if (target) {
    new MutationObserver(normalizeArticle).observe(target, { childList: true, subtree: true });
  }
})();
