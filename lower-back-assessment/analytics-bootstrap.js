(function () {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const localPreview = localHosts.has(location.hostname);

  window.__HCL_LOCAL_PREVIEW__ = localPreview;
  window.__HCL_LOCAL_EVENTS__ = window.__HCL_LOCAL_EVENTS__ || [];
  window.__HCL_LOCAL_REQUESTS__ = window.__HCL_LOCAL_REQUESTS__ || [];

  if (localPreview) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=__GA_MEASUREMENT_ID__";
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", "__GA_MEASUREMENT_ID__");
})();
