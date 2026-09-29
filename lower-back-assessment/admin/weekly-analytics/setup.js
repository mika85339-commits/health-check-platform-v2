(() => {
  const form = document.querySelector("[data-admin-setup-form]");
  if (!form || !window.location.hash.startsWith("#ticket=")) return;
  const value = decodeURIComponent(window.location.hash.slice("#ticket=".length));
  const input = form.elements.namedItem("setup_token");
  if (input && value) input.value = value;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
})();
