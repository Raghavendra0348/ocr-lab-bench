/**
 * Standalone build for the Chrome extension's on-device reading engine.
 *
 * Produces an ES-module bundle (extension pages support modules) that the
 * offscreen document loads. Only the reading pipeline is included — no React,
 * no router, no server code.
 *
 *   bun run vite build --config vite.extension.config.ts
 */
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  configFile: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  worker: { format: "es" },
  build: {
    target: "es2022",
    outDir: "/mnt/documents/errorguard-local-pipeline/extension/engine",
    emptyOutDir: true,
    sourcemap: false,
    minify: "oxc",
    rollupOptions: {
      input: fileURLToPath(new URL("./extension-src/engine.ts", import.meta.url)),
      output: {
        format: "es",
        entryFileNames: "errorguard-engine.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
