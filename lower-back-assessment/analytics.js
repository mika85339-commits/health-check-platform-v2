(function () {
  const DIAGNOSIS_VERSION = "bodycheck-v2.1";
  const SESSION_KEY = "health_check_lab_analytics_session";
  const BODY_CHECK_PATH = "/body-check";
  const JOURNEY_KEY = "health_check_lab_journey_attribution";

  function journeyAttribution() {
    try {
      const stored = sessionStorage.getItem(JOURNEY_KEY);
      if (stored) return JSON.parse(stored);
      const params = new URLSearchParams(location.search);
      const referrerHost = document.referrer ? new URL(document.referrer).hostname : "";
      const value = {
        session_source: params.get("utm_source") || (referrerHost.includes("google.") ? "google" : referrerHost || "direct"),
        session_medium: params.get("utm_medium") || (referrerHost.includes("google.") ? "organic" : referrerHost ? "referral" : "none"),
        landing_page: `${location.pathname}${location.search}`
      };
      sessionStorage.setItem(JOURNEY_KEY, JSON.stringify(value));
      return value;
    } catch { return { session_source: "unknown", session_medium: "unknown", landing_page: location.pathname }; }
  }

  function trackJourney(eventName, extra = {}) {
    const params = { page_path: `${location.pathname}${location.search}`, page_location: location.href, page_referrer: document.referrer || "", host_name: location.hostname, ...journeyAttribution(), ...extra };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, ...params });
    if (typeof window.gtag === "function") window.gtag("event", eventName, params);
    document.dispatchEvent(new CustomEvent("hcl:measurement", { detail: { eventName, ...params } }));
  }

  let runId = "";
  let startedAt = 0;
  let completed = false;
  let aiClicked = false;
  let viewedSteps = new Set();
  let lastStep = -1;
  let resultTracked = false;
  let observer = null;
  const measurementEvents = new Set();

  function trackMeasurement(eventName, extra = {}, onceKey = "") {
    if (onceKey && measurementEvents.has(onceKey)) return;
    if (onceKey) measurementEvents.add(onceKey);
    const params = new URLSearchParams(location.search);
    let referrerHost = "";
    try {
      referrerHost = document.referrer ? new URL(document.referrer).hostname : "";
    } catch {
      referrerHost = "";
    }
    trackJourney(eventName, {
      referrer_host: referrerHost,
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      ...extra
    });
  }

  window.hclTrackEvent = trackMeasurement;

  function sessionId() {
    try {
      const current = localStorage.getItem(SESSION_KEY);
      if (current) return current;
      const next = `hcl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, next);
      return next;
    } catch {
      return `hcl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function isBodyCheck() {
    return location.pathname.replace(/\/$/, "") === BODY_CHECK_PATH;
  }

  function resetRun() {
    runId = `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    startedAt = Date.now();
    completed = false;
    aiClicked = false;
    viewedSteps = new Set();
    lastStep = -1;
    resultTracked = false;
  }

  function currentStep() {
    const active = Array.from(document.querySelectorAll(".progress span.active")).pop();
    if (!active) return 0;
    const match = active.textContent.match(/^(\d+)/);
    return match ? Number(match[1]) - 1 : 0;
  }

  function selectedRegion() {
    const checked = document.querySelector('input[name="primaryPart"]:checked');
    return checked?.closest("label")?.textContent.trim() || "";
  }

  function selectedDetails() {
    return Array.from(document.querySelectorAll('input[name="selectedPart"]:checked')).map((input) =>
      input.closest("label")?.textContent.trim() || input.value
    );
  }

  function selectedMovements(limit = 30) {
    return Array.from(document.querySelectorAll('input[type="radio"][name*="_"]:checked'))
      .filter((input) => input.value !== "none")
      .slice(0, limit)
      .map((input) => ({ key: input.name, answer: input.value }));
  }

  function selectedTiming() {
    return Array.from(document.querySelectorAll('input[name="timing"]:checked')).map((input) =>
      input.closest("label")?.textContent.trim() || input.value
    );
  }

  function painType() {
    const pain = Number(document.querySelector("#painScore")?.value || 0);
    const duration = document.querySelector("#durationSelect");
    const numbness = document.querySelector("#numbnessSelect");
    const dangerCount = Array.from(document.querySelectorAll('input[name="danger"]:checked')).filter((input) => input.value !== "none").length;
    const lifestyleTags = Array.from(document.querySelectorAll('input[name="lifestyle"]:checked')).map((input) => input.value);
    return {
      intensityRange: pain <= 0 ? "" : pain <= 3 ? "low" : pain <= 7 ? "middle" : "high",
      duration: duration?.selectedOptions?.[0]?.textContent || "",
      numbness: numbness?.selectedOptions?.[0]?.textContent || "",
      dangerCount,
      lifestyleTags
    };
  }

  function resultSummary() {
    const title = document.querySelector(".result-hero h2")?.textContent || "";
    const score = title.match(/(\d+)点/)?.[1] || "";
    const metrics = Array.from(document.querySelectorAll(".metric-card"));
    const bodyType = metrics.find((card) => card.textContent.includes("タイプ名"))?.querySelector("strong")?.textContent || "";
    const danger = metrics.find((card) => card.textContent.includes("危険症状判定"))?.querySelector("strong")?.textContent || "";
    return {
      burdenScoreRange: Number(score) >= 80 ? "high" : Number(score) >= 50 ? "middle" : "low",
      bodyType,
      dangerStatus: danger
    };
  }

  function topMuscle() {
    return document.querySelector(".ranking-list li span")?.textContent || "";
  }

  function payload(extra = {}) {
    return {
      anonymousSessionId: sessionId(),
      diagnosisRunId: runId,
      timestamp: new Date().toISOString(),
      diagnosisVersion: DIAGNOSIS_VERSION,
      currentStep: currentStep(),
      selectedRegion: selectedRegion(),
      selectedDetails: selectedDetails(),
      movements: selectedMovements(),
      timing: selectedTiming(),
      painType: painType(),
      usedAiExplanation: aiClicked,
      ...extra
    };
  }

  function track(eventName, extra = {}, immediate = false) {
    const body = JSON.stringify({ eventName, ...payload(extra) });
    try {
      if (eventName === "diagnosis_started") trackMeasurement("muscle_check_start", extra, `muscle-check-start:${runId}`);
      if (eventName === "diagnosis_completed") trackMeasurement("muscle_check_complete", extra, `muscle-check-complete:${runId}`);
      if (immediate && navigator.sendBeacon) {
        navigator.sendBeacon("/.netlify/functions/track-diagnosis-event", new Blob([body], { type: "application/json" }));
        return;
      }
      fetch("/.netlify/functions/track-diagnosis-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: immediate
      }).catch(() => {});
    } catch {
      // Analytics failures must never affect the diagnosis.
    }
  }

  function trackStep() {
    if (!isBodyCheck()) return;
    const step = currentStep();
    if (viewedSteps.has(step)) return;
    viewedSteps.add(step);
    lastStep = step;
    track(step === 0 ? "diagnosis_started" : "step_viewed", { currentStep: step });
  }

  function trackCompletionIfNeeded() {
    if (!isBodyCheck() || resultTracked || !document.querySelector(".result-panel")) return;
    resultTracked = true;
    completed = true;
    track("diagnosis_completed", {
      currentStep: 4,
      results: resultSummary(),
      topMuscle: topMuscle(),
      usedAiExplanation: aiClicked
    });
  }

  function watchBodyCheck() {
    if (!isBodyCheck()) return;
    if (!runId || completed) resetRun();
    trackStep();
    trackCompletionIfNeeded();
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      trackStep();
      trackCompletionIfNeeded();
    });
    const root = document.querySelector("#bodyCheckRoot") || document.querySelector("#app");
    if (root) observer.observe(root, { childList: true, subtree: true });
  }

  document.addEventListener("change", (event) => {
    if (!isBodyCheck()) return;
    const input = event.target.closest("input, select");
    if (!input) return;
    const type = input.name || input.id || "unknown";
    const value = input.type === "range" ? painType().intensityRange : input.value;
    track("option_selected", {
      selectedOptionType: type,
      selectedOption: value,
      movements: type.includes("_") ? [{ key: type, answer: input.value }] : selectedMovements(5)
    });
  });

  document.addEventListener("hcl:diagnosis-event", (event) => {
    if (!isBodyCheck()) return;
    const detail = event.detail || {};
    const eventName = detail.eventName;
    if (!eventName) return;
    if (eventName === "diagnosis_started") resetRun();
    if (eventName === "diagnosis_completed") {
      completed = true;
      resultTracked = true;
    }
    if (eventName === "ai_explanation_clicked") aiClicked = true;
    track(eventName, {
      currentStep: detail.currentStep ?? currentStep(),
      questionId: detail.questionId || "",
      selectedOptionType: detail.selectedOptionType || "",
      selectedOption: detail.selectedOption || "",
      diagnosisVersion: detail.diagnosisVersion || DIAGNOSIS_VERSION,
      results: detail.results || resultSummary(),
      topMuscle: detail.topMuscle || topMuscle(),
      usedAiExplanation: aiClicked
    });
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (link) {
      const href = new URL(link.href, location.href);
      const linkData = { link_url: href.href, link_text: (link.textContent || link.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim() };
      if (link.closest(".related-section")) trackJourney("related_article_click", linkData);
      if (href.hostname === "hariplus-nagoya.com") trackJourney("clinic_site_click", linkData);
      if (href.hostname === "hariplus-nagoya.com" && ["/chronic-pain", "/autonomic", "/eyes", "/ears", "/beauty"].includes(href.pathname.replace(/\/$/, ""))) trackJourney("symptom_page_click", linkData);
      if (href.hostname === "line.me" || href.hostname === "lin.ee") {
        trackMeasurement("line_click", { ...linkData, reservation_type: "line" });
        trackMeasurement("reservation_click", { ...linkData, reservation_type: "line" });
      }
      const isArticle = location.pathname.startsWith("/health-library/") && location.pathname !== "/health-library/";
      if (isArticle && href.hostname === "hariplus-nagoya.com") {
        trackMeasurement("article_to_hariplus", { ...linkData, article_slug: decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "") });
      }
      if (isArticle && href.origin === location.origin && href.pathname.replace(/\/$/, "") === BODY_CHECK_PATH) {
        trackMeasurement("article_to_diagnosis", { ...linkData, article_slug: decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "") });
      }
    }
    if (!isBodyCheck()) return;
    if (event.target.closest("#bodyAiBtn") && !aiClicked) {
      aiClicked = true;
      track("ai_explanation_clicked", {
        results: resultSummary(),
        topMuscle: topMuscle(),
        usedAiExplanation: true
      });
    }
  });

  window.addEventListener("pagehide", () => {
    if (!isBodyCheck() || completed || !runId || Date.now() - startedAt < 1500) return;
    track("diagnosis_abandoned", { currentStep: lastStep, movements: selectedMovements(), usedAiExplanation: aiClicked }, true);
  });

  window.addEventListener("popstate", () => setTimeout(watchBodyCheck, 0));
  document.addEventListener("click", (event) => {
    if (event.target.closest("a[data-link]")) setTimeout(watchBodyCheck, 0);
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (location.pathname.startsWith("/health-library/") && location.pathname !== "/health-library/") trackJourney("article_view");
    const params = new URLSearchParams(location.search);
    let source = params.get("utm_source") || "";
    try {
      const host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : "";
      if (!source && /(google\.|bing\.|search\.yahoo\.)/.test(host)) source = "organic-search";
      if (!source && /(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com)/.test(host)) source = "ai-referral";
    } catch {
      source = source || "";
    }
    if (source) trackMeasurement("organic_landing_page", { acquisition_source: source }, `landing:${location.pathname}:${source}`);
    setTimeout(watchBodyCheck, 0);
  });
})();
