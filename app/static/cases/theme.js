// Saved chart documents receive the same palette as their host before rendering.
(() => {
  const requested = new URLSearchParams(location.search).get("theme");
  let theme = requested === "dark" ? "dark" : "light";
  if (!requested) {
    try { theme = parent.document.documentElement.dataset.theme === "dark" ? "dark" : "light"; } catch {}
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  // SVG presentation attributes lose to the saved light-theme class rules.
  // Scope palette overrides to dark mode so the original light styles survive.
  const palette = document.createElement("style");
  palette.dataset.casePalette = "true";
  palette.textContent = `
    :root[data-theme="dark"] #title,
    :root[data-theme="dark"] .chart-title { color: #f1f5f9; }
    :root[data-theme="dark"] .axis-label,
    :root[data-theme="dark"] .x-label { fill: #c1cad7; }
    :root[data-theme="dark"] .grid-line { stroke: #2b3544; }
    :root[data-theme="dark"] .axis-line { stroke: #526176; }
    :root[data-theme="dark"] .legendItem,
    :root[data-theme="dark"] .timeLabel,
    :root[data-theme="dark"] #speedBtn,
    :root[data-theme="dark"] #empty { color: #c1cad7; }
    :root[data-theme="dark"] .bar-label { fill: #8294ff; }
    :root[data-theme="dark"] #radar circle[fill="none"] { stroke: #334052; stroke-width: 1; }
    :root[data-theme="dark"] #radar line { stroke: #334052; stroke-width: 1; }
    :root[data-theme="dark"] .segmented button[aria-selected="true"] { background:#334052; color:#f1f5f9; box-shadow:inset 0 0 0 1px #526176; font-weight:700; }
    :root[data-theme="dark"] .segmented button[aria-selected="false"] { color:#a8b3c4; }
    :root[data-theme="dark"] #radar path { fill: rgba(255, 138, 24, .22); stroke-width: 3; }

  `;
  document.documentElement.appendChild(palette);

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
