(function () {
  const DIAGNOSIS_VERSION = "bodycheck-v2.1";
  const SESSION_KEY = "health_check_lab_analytics_session";
  const BODY_CHECK_PATH = "/body-check";

  let runId = "";
  let startedAt = 0;
  let completed = false;
  let aiClicked = false;
  let viewedSteps = new Set();
  let lastStep = -1;
  let resultTracked = false;
  let observer = null;

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
  document.addEventListener("DOMContentLoaded", () => setTimeout(watchBodyCheck, 0));
})();
