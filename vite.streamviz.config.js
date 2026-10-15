import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";

export default defineConfig({
  // GitHub source archives do not contain dist/. Compile the pinned package's
  // source directly, without a link to a developer's checkout or install hooks.
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: /^streamviz-react$/, replacement: resolve("node_modules/streamviz-react/src/index.ts") },
      { find: "../theme/artifact-theme.css?raw", replacement: resolve("app/skills/streamviz/assets/artifact-theme.css") + "?raw" },
      { find: "streamviz-react/styles.css", replacement: resolve("node_modules/streamviz-react/src/theme/styles.css") },
    ],
  },
  plugins: [react(), {
    name: "streamviz-artifact-theme",
    closeBundle() {
      const themeSource = resolve("app/skills/streamviz/assets/artifact-theme.css");
      copyFileSync(themeSource, resolve("app/static/vendor/streamviz/artifact-theme.css"));
    },
  }],
  // streamviz-react currently ships dependencies that still reference the
  // Node-style NODE_ENV guard. Replace it at build time so the browser bundle
  // never depends on a global `process` object.
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: resolve("app/static/vendor/streamviz"),
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve("frontend/streamviz-entry.jsx"),
      formats: ["es"],
      fileName: () => "streamviz.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => assetInfo.name?.endsWith(".css") ? "streamviz.css" : "[name][extname]",
      },
    },
  },
});
