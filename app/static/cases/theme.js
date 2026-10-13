// Saved chart documents receive the same palette as their host before rendering.
(() => {
  const requested = new URLSearchParams(location.search).get("theme");
  let theme = requested === "dark" ? "dark" : "light";
  if (!requested) {
    try { theme = parent.document.documentElement.dataset.theme === "dark" ? "dark" : "light"; } catch {}
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const syncBody = () => {
    if (!document.body) return;
    document.body.classList.toggle("theme-dark", theme === "dark");
    document.body.classList.toggle("theme-light", theme === "light");
  };
  const observer = new MutationObserver(() => {
    if (document.body) { syncBody(); observer.disconnect(); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", syncBody, { once: true });
  syncBody();
})();
