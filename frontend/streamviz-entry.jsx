import React from "react";
import { createRoot } from "react-dom/client";
import { StreamVisualization, normalizeStreamVisualizationPayload } from "streamviz-react";
import "streamviz-react/styles.css";

const roots = new WeakMap();
const mountedPayloads = new Map();

function activeTheme() {
  return { mode: document.documentElement.dataset.theme === "dark" ? "dark" : "light" };
}

function mount(container, payload = {}) {
  if (!(container instanceof Element)) return null;
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  mountedPayloads.set(container, payload);
  const props = normalizeStreamVisualizationPayload(payload);
  root.render(
    <StreamVisualization
      {...props}
      theme={activeTheme()}
      notify={(message, variant) => {
        window.dispatchEvent(new CustomEvent("aime:streamviz-notify", { detail: { message, variant } }));
      }}
      onSendPrompt={(prompt) => {
        window.dispatchEvent(new CustomEvent("aime:streamviz-followup", { detail: { prompt } }));
      }}
    />,
  );
  return container;
}

function unmount(container) {
  const root = roots.get(container);
  if (!root) return;
  root.unmount();
  roots.delete(container);
  mountedPayloads.delete(container);
}

window.AimeStreamViz = Object.freeze({ mount, update: mount, unmount });
window.addEventListener("aime:theme-change", () => {
  mountedPayloads.forEach((payload, container) => mount(container, payload));
});
window.dispatchEvent(new CustomEvent("aime:streamviz-ready"));
