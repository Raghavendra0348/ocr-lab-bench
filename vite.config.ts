import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // The OCR package spawns its own module worker and loads WASM at runtime; keep it
  // out of dependency pre-bundling so the worker URL stays bundler-resolvable.
  optimizeDeps: {
    exclude: ["@paddleocr/paddleocr-js", "onnxruntime-web"],
  },
});
