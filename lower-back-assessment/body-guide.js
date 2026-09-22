(function () {
  function track(eventName, params = {}) {
    if (typeof window.hclTrackEvent === "function") {
      window.hclTrackEvent(eventName, { landing_type: "body-check-entry", ...params });
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, landing_type: "body-check-entry", ...params });
  }

  function loadSelectorImage(image) {
    if (!image || image.getAttribute("src")) return;
    const source = image.dataset.src;
    const sourceSet = image.dataset.srcset;
    if (sourceSet) image.setAttribute("srcset", sourceSet);
    if (source) image.setAttribute("src", source);
    image.hidden = false;
  }

  function showBodyView(selector, view) {
    const panels = selector.querySelectorAll("[data-body-view-panel]");
    const buttons = selector.querySelectorAll("[data-body-view-button]");
    const target = selector.querySelector(`[data-body-view-panel="${view}"]`);
    if (!target) return;

    loadSelectorImage(target.querySelector("[data-body-image]"));
    panels.forEach((panel) => {
      panel.hidden = panel !== target;
    });
    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.bodyViewButton === view));
    });
    selector.dataset.currentView = view;
  }

  function setupBodySelector(selector) {
    showBodyView(selector, selector.dataset.initialView || "front");
    selector.querySelectorAll("[data-body-view-button]").forEach((button) => {
      button.addEventListener("click", () => showBodyView(selector, button.dataset.bodyViewButton));
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const landing = document.body.dataset.diagnosisLanding;
    const hub = document.body.hasAttribute("data-body-guide");
    if (landing) track("diagnosis_landing_view");
    if (hub) track("body_guide_view");
    document.querySelectorAll("[data-body-selector]").forEach(setupBodySelector);

    document.addEventListener("click", (event) => {
      const diagnosisStart = event.target.closest("[data-diagnosis-start]");
      if (diagnosisStart) {
        try {
          sessionStorage.setItem("health_check_lab_diagnosis_landing", location.pathname);
        } catch (_) {
          // Attribution must never prevent navigation.
        }
        track("diagnosis_landing_start", { destination_type: "body-check" });
      }

      const guide = event.target.closest("[data-guide-link]");
      if (guide) track("body_guide_select", { destination_type: "body-part-entry" });
    });
  });
})();
