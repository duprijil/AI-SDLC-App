import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const sourceAlias = { "@": resolve(__dirname, "src") };

export default defineConfig({
  main: {
    resolve: { alias: sourceAlias },
    build: { rolldownOptions: { input: { index: resolve(__dirname, "src/main.ts") } } },
  },
  preload: {
    resolve: { alias: sourceAlias },
    build: { rolldownOptions: { input: { index: resolve(__dirname, "src/preload.ts") } } },
  },
  renderer: {
    root: resolve(__dirname, "src"),
    resolve: { alias: sourceAlias },
    plugins: [react()],
    build: { rolldownOptions: { input: { index: resolve(__dirname, "src/index.html") } } },
  },
});
