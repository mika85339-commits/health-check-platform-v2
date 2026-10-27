// Copied only into sealed safe previews. Never included by the production build.
(function () {
  if (window.__HCL_LOCAL_PREVIEW__ !== true) return;
  // Article hydration may replace ordinary robots metadata. Keep an independent
  // preview-only noindex tag in addition to the server X-Robots-Tag header.
  const protectRobots = () => {
    let meta = document.head.querySelector('meta[data-hcl-preview-robots]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('data-hcl-preview-robots', 'true');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    if (meta.content !== 'noindex,nofollow,noarchive') meta.content = 'noindex,nofollow,noarchive';
  };
  protectRobots();
  new MutationObserver(protectRobots).observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
  const root = document.documentElement;
  const value = new URLSearchParams(location.search).get("preview-json-delay");
  let delay = value === "5000" ? 5000 : 0;
  try {
    if (value === "0") sessionStorage.removeItem("hcl-preview-json-delay");
    else if (delay) sessionStorage.setItem("hcl-preview-json-delay", "5000");
    delay = sessionStorage.getItem("hcl-preview-json-delay") === "5000" ? 5000 : 0;
  } catch (_) { /* Query parameter still works without storage. */ }
  root.dataset.previewJsonDelay = String(delay);
  root.dataset.previewJsonDelayed = "0";
  root.dataset.previewJsonPending = "0";
  root.dataset.previewHomeDetected = "false";
  // A DOM-backed diagnostic makes even a transient home insertion observable.
  if (/^\/health-library\/.+/.test(location.pathname)) {
    const detect = () => {
      if (document.querySelector("#home-articles-title")) root.dataset.previewHomeDetected = "true";
    };
    detect();
    new MutationObserver(detect).observe(root, { childList: true, subtree: true });
  }
  if (!delay) return;
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async function (input, options) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith(".json")) return fetchOriginal(input, options);
    root.dataset.previewJsonDelayed = String(Number(root.dataset.previewJsonDelayed) + 1);
    root.dataset.previewJsonPending = String(Number(root.dataset.previewJsonPending) + 1);
    try {
      await new Promise(resolve => setTimeout(resolve, delay));
      return await fetchOriginal(input, options);
    } finally {
      root.dataset.previewJsonPending = String(Number(root.dataset.previewJsonPending) - 1);
    }
  };
})();
