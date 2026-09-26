(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HealthCheckSponsor = api;
})(typeof window !== "undefined" ? window : null, function (root) {
  const CANONICAL_BODY_PARTS = Object.freeze([
    "neck", "shoulder", "elbow", "wrist", "back", "lowback", "hip",
    "buttock", "thigh", "knee", "lowerleg", "ankle", "sole"
  ]);
  const BODY_PART_ALIASES = Object.freeze({
    scapula: "shoulder",
    "lower-back": "lowback",
    lower_back: "lowback",
    lumbar: "lowback",
    glute: "buttock",
    glutes: "buttock",
    calf: "lowerleg",
    shin: "lowerleg",
    foot: "sole"
  });
  const EVENT_TYPES = Object.freeze({
    impression: "sponsor_banner_impression",
    click: "sponsor_banner_click"
  });
  const SPONSOR = Object.freeze({
    sponsorId: "hariplus",
    name: "ハリプラス鍼灸院",
    descriptor: "はり・きゅう｜予約制",
    href: "https://hariplus-nagoya.com/"
  });
  const CREATIVE = Object.freeze({
    creativeId: "hariplus_result_top_v1",
    placementId: "result_top",
    disclosureLabel: "広告",
    activeFrom: null,
    activeTo: null,
    supportedBodyParts: CANONICAL_BODY_PARTS
  });
  const REGION_FIXTURES = Object.freeze({
    "JP-23": Object.freeze({ countryCode: "JP", regionCode: "JP-23", regionName: "Aichi" }),
    "JP-13": Object.freeze({ countryCode: "JP", regionCode: "JP-13", regionName: "Tokyo" }),
    "JP-27": Object.freeze({ countryCode: "JP", regionCode: "JP-27", regionName: "Osaka" })
  });
  const DEFAULT_LOCAL_REGION = REGION_FIXTURES["JP-23"];
  const FORBIDDEN_PAYLOAD_FIELDS = Object.freeze([
    "pain", "pain_level", "symptom", "symptoms", "answers", "candidate_muscles",
    "muscles", "score", "result", "result_text", "age", "sex", "gender",
    "name", "email", "phone", "address", "postal_code", "city", "latitude",
    "longitude", "ip", "diagnosis_id"
  ]);
  const viewIds = new WeakMap();

  function normalizeBodyPart(value) {
    const raw = String(value || "").trim().toLowerCase();
    const normalized = BODY_PART_ALIASES[raw] || raw;
    return CANONICAL_BODY_PARTS.includes(normalized) ? normalized : "unknown";
  }

  function safeText(value, max = 120) {
    return String(value == null ? "" : value).trim().slice(0, max);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createId(prefix = "sponsor_view") {
    const cryptoApi = root?.crypto || (typeof crypto !== "undefined" ? crypto : null);
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") return `${prefix}_${cryptoApi.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function resultViewId(result) {
    if (result && typeof result === "object") {
      if (!viewIds.has(result)) viewIds.set(result, createId());
      return viewIds.get(result);
    }
    return createId();
  }

  function isLocalPreview(runtime = root) {
    const hostname = runtime?.location?.hostname || "";
    return Boolean(runtime?.__HCL_LOCAL_PREVIEW__) || ["localhost", "127.0.0.1", "::1"].includes(hostname);
  }

  function normalizeGeo(value = {}) {
    return Object.freeze({
      countryCode: safeText(value.countryCode || value.country_code, 8),
      regionCode: safeText(value.regionCode || value.region_code, 16),
      regionName: safeText(value.regionName || value.region_name, 80)
    });
  }

  function localRegionFixture(runtime = root) {
    const explicit = runtime?.__HCL_SPONSOR_GEO_FIXTURE__;
    if (explicit) return normalizeGeo(explicit);
    try {
      const code = new URLSearchParams(runtime?.location?.search || "").get("sponsor_region");
      if (code && REGION_FIXTURES[code]) return REGION_FIXTURES[code];
    } catch {
      // A malformed local URL should not prevent the result from rendering.
    }
    return DEFAULT_LOCAL_REGION;
  }

  function eventKey(eventType, context) {
    return [
      safeText(context.resultViewId, 100),
      eventType,
      safeText(context.placementId || CREATIVE.placementId, 80),
      safeText(context.creativeId || CREATIVE.creativeId, 100)
    ].join(":");
  }

  function buildEvent(eventType, context = {}, options = {}) {
    if (!Object.values(EVENT_TYPES).includes(eventType)) throw new Error(`Unsupported sponsor event: ${eventType}`);
    const local = options.local ?? isLocalPreview(options.runtime || root);
    const geo = normalizeGeo(options.geo || (local ? localRegionFixture(options.runtime || root) : {}));
    const key = eventKey(eventType, context);
    return Object.freeze({
      event_type: eventType,
      event_id: safeText(key, 240),
      sponsor_id: safeText(context.sponsorId || SPONSOR.sponsorId, 80),
      creative_id: safeText(context.creativeId || CREATIVE.creativeId, 100),
      placement_id: safeText(context.placementId || CREATIVE.placementId, 80),
      body_part: normalizeBodyPart(context.bodyPart),
      region_code: geo.regionCode,
      region_name: geo.regionName,
      country_code: geo.countryCode,
      occurred_at: safeText(options.occurredAt || new Date().toISOString(), 40)
    });
  }

  function bannerContext(element) {
    return {
      resultViewId: element?.dataset?.resultViewId || "",
      sponsorId: element?.dataset?.sponsorId || SPONSOR.sponsorId,
      creativeId: element?.dataset?.creativeId || CREATIVE.creativeId,
      placementId: element?.dataset?.placementId || CREATIVE.placementId,
      bodyPart: element?.dataset?.bodyPart || "unknown"
    };
  }

  function renderBanner(result = {}) {
    const bodyPart = normalizeBodyPart(result.regionId || result.bodyPart || result.answers?.primaryPart);
    const viewId = resultViewId(result);
    return `<aside class="sponsor-banner" aria-label="広告" data-sponsor-banner data-result-view-id="${escapeHtml(viewId)}" data-sponsor-id="${SPONSOR.sponsorId}" data-creative-id="${CREATIVE.creativeId}" data-placement-id="${CREATIVE.placementId}" data-body-part="${bodyPart}">
      <div class="sponsor-banner-copy">
        <span class="sponsor-disclosure">${CREATIVE.disclosureLabel}</span>
        <div><strong>${SPONSOR.name}</strong><span>${SPONSOR.descriptor}</span></div>
      </div>
      <a class="sponsor-banner-cta" href="${SPONSOR.href}" target="_blank" rel="noopener noreferrer sponsored" data-sponsor-cta>ハリプラス鍼灸院を見る<span aria-hidden="true">↗</span></a>
    </aside>`;
  }

  function createEventTracker({ send, runtime = root, geo } = {}) {
    const sent = new Set();
    const deliver = typeof send === "function" ? send : (payload) => sendEvent(payload, runtime);
    function record(eventType, context) {
      const key = eventKey(eventType, context);
      if (sent.has(key)) return false;
      sent.add(key);
      const payload = buildEvent(eventType, context, { runtime, geo });
      try {
        const delivery = deliver(payload);
        if (delivery && typeof delivery.catch === "function") delivery.catch(() => {});
      } catch {
        // Advertising analytics must never block result viewing or navigation.
      }
      return true;
    }
    return Object.freeze({
      impression: (context) => record(EVENT_TYPES.impression, context),
      click: (context) => record(EVENT_TYPES.click, context),
      count: () => sent.size,
      has: (eventType, context) => sent.has(eventKey(eventType, context))
    });
  }

  function sendEvent(payload, runtime = root) {
    if (!runtime) return Promise.resolve(false);
    if (isLocalPreview(runtime)) {
      runtime.__HCL_LOCAL_SPONSOR_EVENTS__ = runtime.__HCL_LOCAL_SPONSOR_EVENTS__ || [];
      runtime.__HCL_LOCAL_SPONSOR_EVENTS__.push(payload);
      try {
        runtime.document?.dispatchEvent(new runtime.CustomEvent("hcl:sponsor-event", { detail: payload }));
      } catch {
        // The in-memory event remains available even if CustomEvent is unavailable.
      }
      return Promise.resolve(true);
    }
    if (typeof runtime.fetch !== "function") return Promise.resolve(false);
    return runtime.fetch("/.netlify/functions/track-sponsor-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "same-origin"
    }).then((response) => response.ok).catch(() => false);
  }

  function visibleRatio(element, runtime = root) {
    if (!element || typeof element.getBoundingClientRect !== "function") return 0;
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, runtime?.innerWidth || 0) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, runtime?.innerHeight || 0) - Math.max(rect.top, 0));
    const area = Math.max(1, rect.width * rect.height);
    return (width * height) / area;
  }

  function createBrowserController({ runtime = root, document: documentRef = root?.document, tracker, delayMs = 1000 } = {}) {
    if (!runtime || !documentRef) return null;
    const eventTracker = tracker || createEventTracker({ runtime });
    const timers = new Map();
    const visibleElements = new Map();
    const observed = new WeakSet();

    function clearVisibility(key, element) {
      if (visibleElements.get(key) === element) visibleElements.delete(key);
      const timer = timers.get(element);
      if (timer) runtime.clearTimeout(timer);
      timers.delete(element);
    }

    function beginVisibility(element) {
      const context = bannerContext(element);
      const key = eventKey(EVENT_TYPES.impression, context);
      if (eventTracker.has(EVENT_TYPES.impression, context) || visibleElements.get(key) === element) return;
      visibleElements.set(key, element);
      const timer = runtime.setTimeout(() => {
        timers.delete(element);
        if (visibleElements.get(key) !== element || !element.isConnected) return;
        eventTracker.impression(context);
      }, delayMs);
      timers.set(element, timer);
    }

    const observer = typeof runtime.IntersectionObserver === "function"
      ? new runtime.IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) beginVisibility(entry.target);
          else clearVisibility(eventKey(EVENT_TYPES.impression, bannerContext(entry.target)), entry.target);
        });
      }, { threshold: [0, 0.5, 1] })
      : null;

    function observe(element) {
      if (!element || observed.has(element)) return;
      observed.add(element);
      if (observer) observer.observe(element);
      else if (visibleRatio(element, runtime) >= 0.5) beginVisibility(element);
    }

    function scan(container = documentRef) {
      if (container?.matches?.("[data-sponsor-banner]")) observe(container);
      container?.querySelectorAll?.("[data-sponsor-banner]").forEach(observe);
    }

    function onClick(event) {
      const cta = event.target?.closest?.("[data-sponsor-cta]");
      if (!cta) return;
      const banner = cta.closest("[data-sponsor-banner]");
      if (banner) eventTracker.click(bannerContext(banner));
    }

    const mutationObserver = typeof runtime.MutationObserver === "function"
      ? new runtime.MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node?.nodeType === 1) scan(node);
      })))
      : null;
    documentRef.addEventListener("click", onClick, true);
    mutationObserver?.observe(documentRef.documentElement || documentRef.body, { childList: true, subtree: true });
    scan();

    return Object.freeze({
      tracker: eventTracker,
      scan,
      beginVisibility,
      stop() {
        observer?.disconnect();
        mutationObserver?.disconnect();
        documentRef.removeEventListener("click", onClick, true);
        timers.forEach((timer) => runtime.clearTimeout(timer));
        timers.clear();
        visibleElements.clear();
      }
    });
  }

  function init() {
    if (!root?.document || root.__HCL_SPONSOR_CONTROLLER__) return root?.__HCL_SPONSOR_CONTROLLER__ || null;
    root.__HCL_SPONSOR_CONTROLLER__ = createBrowserController();
    return root.__HCL_SPONSOR_CONTROLLER__;
  }

  if (root?.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  return Object.freeze({
    BODY_PART_ALIASES,
    CANONICAL_BODY_PARTS,
    CREATIVE,
    DEFAULT_LOCAL_REGION,
    EVENT_TYPES,
    FORBIDDEN_PAYLOAD_FIELDS,
    REGION_FIXTURES,
    SPONSOR,
    bannerContext,
    buildEvent,
    createBrowserController,
    createEventTracker,
    eventKey,
    init,
    isLocalPreview,
    localRegionFixture,
    normalizeBodyPart,
    normalizeGeo,
    renderBanner,
    resultViewId,
    sendEvent,
    visibleRatio
  });
});
