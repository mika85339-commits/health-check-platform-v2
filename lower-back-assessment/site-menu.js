(function () {
  function normalizePath(pathname) {
    const value = String(pathname || "/").replace(/\/+$/, "");
    return value || "/";
  }

  function resolveSection(pathname, hash) {
    const path = normalizePath(pathname);
    const currentHash = String(hash || "");
    if (path === "/" && currentHash === "#body-selector") return "check";
    if (path === "/") return "home";
    if (path === "/body-guide" || path === "/body-check" || path.startsWith("/body-check/")) return "check";
    if (path === "/health-library" || path.startsWith("/health-library/")) return "articles";
    if (path === "/faq") return "records";
    if (path === "/home-screen") return "home-screen";
    return "";
  }

  const body = document.body;
  const header = document.querySelector(".site-header");
  const nav = document.getElementById("siteNav");
  const button = document.getElementById("menuButton");
  const homeScreenLink = document.querySelector(".home-screen-help-link");

  function setOpen(open, restoreFocus) {
    if (!body || !button || !nav) return;
    body.classList.toggle("menu-open", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    if (!open && restoreFocus) button.focus();
  }

  function sync() {
    const section = resolveSection(window.location.pathname, window.location.hash);
    nav?.querySelectorAll("[data-nav-section]").forEach((link) => {
      const active = link.dataset.navSection === section;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    if (homeScreenLink) {
      if (section === "home-screen") homeScreenLink.setAttribute("aria-current", "page");
      else homeScreenLink.removeAttribute("aria-current");
    }
  }

  window.HealthCheckSiteMenu = { close: () => setOpen(false, false), resolveSection, sync };
  if (!body || !header || !nav || !button) return;

  button.addEventListener("click", () => {
    setOpen(!body.classList.contains("menu-open"), false);
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false, false);
  });
  document.addEventListener("click", (event) => {
    if (body.classList.contains("menu-open") && !header.contains(event.target)) setOpen(false, false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && body.classList.contains("menu-open")) setOpen(false, true);
  });
  window.addEventListener("popstate", () => {
    setOpen(false, false);
    sync();
  });
  window.addEventListener("hashchange", sync);
  window.addEventListener("resize", () => {
    if (window.innerWidth >= 1100) setOpen(false, false);
  });

  sync();
})();
