(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HealthCheckMuscleImages = api;
})(typeof window !== "undefined" ? window : null, function (root) {
  const DEFAULT_RESULT_WAIT_MS = 180;

  function clock(runtime) {
    return runtime?.performance && typeof runtime.performance.now === "function"
      ? runtime.performance.now()
      : Date.now();
  }

  function createLoader(options = {}) {
    const runtime = options.runtime || root;
    const ImageCtor = options.ImageCtor || runtime?.Image;
    const onMetric = typeof options.onMetric === "function" ? options.onMetric : null;
    const cache = new Map();

    function emit(metric) {
      if (onMetric) onMetric(Object.freeze({ ...metric }));
    }

    function load(source, loadOptions = {}) {
      const src = String(source || "").trim();
      if (!src) return Promise.resolve(Object.freeze({ ok: false, source: src, reason: "missing_source", totalMs: 0 }));
      const cached = cache.get(src);
      if (cached) {
        if (loadOptions.priority === "high" && "fetchPriority" in cached.image) cached.image.fetchPriority = "high";
        return cached.promise;
      }
      if (typeof ImageCtor !== "function") {
        const unavailable = Promise.resolve(Object.freeze({ ok: false, source: src, reason: "image_unavailable", totalMs: 0 }));
        cache.set(src, { image: null, promise: unavailable });
        return unavailable;
      }

      const startedAt = clock(runtime);
      const image = new ImageCtor();
      image.decoding = "async";
      image.loading = "eager";
      if ("fetchPriority" in image) image.fetchPriority = loadOptions.priority || "auto";

      let finished = false;
      const promise = new Promise((resolve) => {
        async function finish(loaded) {
          if (finished) return;
          finished = true;
          const loadedAt = clock(runtime);
          let decoded = loaded;
          if (loaded && typeof image.decode === "function") {
            try {
              await image.decode();
            } catch {
              decoded = Boolean(image.complete && image.naturalWidth);
            }
          }
          const completedAt = clock(runtime);
          const metric = Object.freeze({
            ok: Boolean(decoded),
            source: src,
            reason: decoded ? "ready" : "load_failed",
            loadMs: Math.max(0, Math.round(loadedAt - startedAt)),
            decodeMs: Math.max(0, Math.round(completedAt - loadedAt)),
            totalMs: Math.max(0, Math.round(completedAt - startedAt))
          });
          emit(metric);
          resolve(metric);
        }

        image.onload = () => finish(true);
        image.onerror = () => finish(false);
        image.src = src;
        if (image.complete) Promise.resolve().then(() => finish(Boolean(image.naturalWidth)));
      });
      cache.set(src, { image, promise });
      return promise;
    }

    function loadInOrder(sources, loadOptions = {}) {
      const unique = [...new Set((sources || []).map((source) => String(source || "").trim()).filter(Boolean))];
      const first = unique[0]
        ? load(unique[0], { priority: "high" })
        : Promise.resolve(Object.freeze({ ok: false, source: "", reason: "missing_source", totalMs: 0 }));
      const background = unique.slice(1).reduce(
        (chain, source) => chain.then(() => load(source, { priority: loadOptions.backgroundPriority || "low" })),
        first.catch(() => null)
      );
      return Object.freeze({ sources: unique, first, background });
    }

    function waitFor(promise, timeoutMs = DEFAULT_RESULT_WAIT_MS) {
      const schedule = typeof runtime?.setTimeout === "function" ? runtime.setTimeout.bind(runtime) : setTimeout;
      return Promise.race([
        Promise.resolve(promise),
        new Promise((resolve) => schedule(() => resolve(Object.freeze({ ok: false, reason: "timeout", totalMs: timeoutMs })), timeoutMs))
      ]);
    }

    return Object.freeze({
      load,
      loadInOrder,
      waitFor,
      has: (source) => cache.has(String(source || "").trim()),
      size: () => cache.size
    });
  }

  return Object.freeze({ DEFAULT_RESULT_WAIT_MS, createLoader });
});
