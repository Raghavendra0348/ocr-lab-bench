import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// The OCR stack (PaddleOCR JS, ONNX Runtime Web, OpenCV WASM) is browser-only:
// it is loaded through a dynamic import that never executes during SSR, but the
// server bundler would still try to bundle it and OpenCV's UMD build cannot be
// transformed for a server target. Replace those packages with an inert stub in
// every non-client build; the browser build keeps the real ones.
const BROWSER_ONLY = ["@paddleocr/paddleocr-js", "@techstark/opencv-js", "onnxruntime-web"];
const STUB_ID = "\0browser-only-stub";

function browserOnlyOcrStub(): Plugin {
  return {
    name: "browser-only-ocr-stub",
    enforce: "pre",
    resolveId(id) {
      if (id === STUB_ID) return STUB_ID;
      const isClient = this.environment?.name === "client";
      if (isClient) return null;
      if (BROWSER_ONLY.some((pkg) => id === pkg || id.startsWith(`${pkg}/`))) return STUB_ID;
      return null;
    },
    load(id) {
      if (id !== STUB_ID) return null;
      return `const message = "This OCR module only runs in the browser.";
const fail = () => { throw new Error(message); };
export default new Proxy({}, { get: fail, apply: fail, construct: fail });
export const PaddleOCR = { create: fail };
`;
    },
  };
}

export default defineConfig({
  plugins: [browserOnlyOcrStub()],
  tanstackStart: {
    server: { entry: "server" },
  },
});
