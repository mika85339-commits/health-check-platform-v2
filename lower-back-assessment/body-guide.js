(function () {
  function track(eventName, params = {}) {
    if (typeof window.hclTrackEvent === "function") {
      window.hclTrackEvent(eventName, { landing_type: "body-check-entry", ...params });
      return;
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, landing_type: "body-check-entry", ...params });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const landing = document.body.dataset.diagnosisLanding;
    const hub = document.body.hasAttribute("data-body-guide");
    if (landing) track("diagnosis_landing_view");
    if (hub) track("body_guide_view");

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

      const guide = hub ? event.target.closest(".body-guide-card") : null;
      if (guide) track("body_guide_select", { destination_type: "body-part-entry" });
    });
  });
})();
