import type { OCRProvider } from "./OCRProvider";
import { OCRError } from "./OCRProvider";
import type { OCRAssetInfo, OCRBox, OCRInitInfo, OCRResult } from "./ocrTypes";

import detAsset from "../models-assets/PP-OCRv6_small_det_onnx_infer.tar.asset.json";
import recAsset from "../models-assets/PP-OCRv6_small_rec_onnx_infer.tar.asset.json";
import ortWasmAsset from "../ort-assets/ort-wasm-simd-threaded.wasm.asset.json";

const DET_MODEL = "PP-OCRv6_small_det";
const REC_MODEL = "PP-OCRv6_small_rec";

export interface PaddleOCRProviderOptions {
  lang?: string;
  /** OCR timeout guard in ms. */
  timeoutMs?: number;
  /**
   * Resolves a packaged asset path (e.g. "models/PP-OCRv6_small_det_onnx_infer.tar")
   * to a loadable URL. Provided by the Chrome extension build, which serves the
   * models and ONNX Runtime files from chrome-extension:// instead of the web root.
   * When omitted, the web app's own /public paths (with hosted fallback) are used.
   */
  resolveAsset?: (path: string) => string;
}

function absolute(url: string): string {
  if (/^https?:/i.test(url)) return url;
  return new URL(url, window.location.origin).toString();
}

/** Use a same-origin /public copy when it exists (local clones), else the hosted asset. */
async function preferLocal(localPath: string, fallbackUrl: string): Promise<string> {
  try {
    const response = await fetch(absolute(localPath), { method: "HEAD" });
    if (response.ok) return absolute(localPath);
  } catch {
    /* ignore — fall through to the hosted asset */
  }
  return fallbackUrl;
}


function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${what} timed out after ${ms} ms`));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * PP-OCRv6_small through @paddleocr/paddleocr-js (ONNX Runtime Web, WASM
 * backend, Web Worker mode).
 *
 * Model .tar archives and the ONNX Runtime WASM binary are served from this
 * app's own origin, so no third-party CDN executable is fetched at runtime.
 */
export class PaddleOCRProvider implements OCRProvider {
  readonly name = "PaddleOCR.js / PP-OCRv6_small";

  private ocr: { predict: Function; dispose: () => Promise<void> } | null = null;
  private initInfo: OCRInitInfo | null = null;
  private initPromise: Promise<OCRInitInfo> | null = null;
  private readonly lang: string;
  private readonly timeoutMs: number;
  private readonly resolveAsset: ((path: string) => string) | null;

  constructor(options: PaddleOCRProviderOptions = {}) {
    this.lang = options.lang ?? "en";
    this.timeoutMs = options.timeoutMs ?? 180_000;
    this.resolveAsset = options.resolveAsset ?? null;
  }

  getInitInfo(): OCRInitInfo | null {
    return this.initInfo;
  }

  initialize(): Promise<OCRInitInfo> {
    if (!this.initPromise) {
      this.initPromise = this.doInitialize().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }
    return this.initPromise;
  }

  private async doInitialize(): Promise<OCRInitInfo> {
    const warnings: string[] = [];
    const isolated = typeof crossOriginIsolated === "boolean" ? crossOriginIsolated : false;
    // Threaded WASM needs SharedArrayBuffer, which needs COOP/COEP. Without
    // cross-origin isolation ORT can only use a single thread.
    const numThreads = isolated ? 2 : 1;
    if (!isolated) {
      warnings.push(
        "Page is not cross-origin isolated (no COOP/COEP headers) — ONNX Runtime runs single-threaded. Requested numThreads=2 was reduced to 1.",
      );
    }

    const started = performance.now();
    try {
      const { PaddleOCR } = await import("@paddleocr/paddleocr-js");

      // Packaged-asset mode (Chrome extension): every file comes from the
      // extension package, so nothing is fetched from any origin at all.
      // Web mode: use a /public copy when present, else the hosted asset URL.
      const resolve = this.resolveAsset;
      const [detUrl, recUrl, wasmUrl] = resolve
        ? [
            resolve(`models/${detAsset.original_filename}`),
            resolve(`models/${recAsset.original_filename}`),
            resolve(`ort/${ortWasmAsset.original_filename}`),
          ]
        : await Promise.all([
            preferLocal(`/models/${detAsset.original_filename}`, absolute(detAsset.url)),
            preferLocal(`/models/${recAsset.original_filename}`, absolute(recAsset.url)),
            preferLocal(`/ort/${ortWasmAsset.original_filename}`, absolute(ortWasmAsset.url)),
          ]);
      const mjsUrl = resolve
        ? resolve("ort/ort-wasm-simd-threaded.mjs")
        : absolute("/ort/ort-wasm-simd-threaded.mjs");

      const ocr = await withTimeout(
        PaddleOCR.create({
          lang: this.lang,
          ocrVersion: "PP-OCRv6",
          textDetectionModelName: DET_MODEL,
          textRecognitionModelName: REC_MODEL,
          textDetectionModelAsset: { url: detUrl },
          textRecognitionModelAsset: { url: recUrl },
          worker: true,
          ortOptions: {
            backend: "wasm",
            // Same-origin ORT runtime assets instead of the package's CDN default.
            wasmPaths: {
              wasm: wasmUrl,
              // Small loader served locally so it keeps a JavaScript MIME type.
              mjs: mjsUrl,
            } as unknown as string,
            numThreads,
            simd: true,
          },
        }),

        this.timeoutMs,
        "Model initialization",
      );

      this.ocr = ocr as unknown as { predict: Function; dispose: () => Promise<void> };

      const summary = (
        ocr as unknown as { getInitializationSummary?: () => Record<string, unknown> | null }
      ).getInitializationSummary?.();

      const assets: OCRAssetInfo[] = Array.isArray(summary?.["assets"])
        ? (summary!["assets"] as Array<{ url: string; bytes: number }>).map((a) => ({
            url: a.url,
            bytes: a.bytes,
          }))
        : [
            { url: detAsset.url, bytes: detAsset.size },
            { url: recAsset.url, bytes: recAsset.size },
          ];

      const configWarnings = Array.isArray(summary?.["pipelineConfigWarnings"])
        ? (summary!["pipelineConfigWarnings"] as string[])
        : [];

      this.initInfo = {
        modelDetection: DET_MODEL,
        modelRecognition: REC_MODEL,
        lang: this.lang,
        ocrVersion: "PP-OCRv6",
        worker: true,
        requestedBackend: "wasm",
        backend: String(summary?.["backend"] ?? "wasm"),
        detProvider: String(summary?.["detProvider"] ?? "unknown"),
        recProvider: String(summary?.["recProvider"] ?? "unknown"),
        webgpuAvailable: Boolean(summary?.["webgpuAvailable"]),
        numThreads,
        simd: true,
        crossOriginIsolated: isolated,
        wasmSource: "same-origin (bundled onnxruntime-web build)",
        modelAssetSource: "same-origin copy of official PaddleX PP-OCRv6_small ONNX archives",
        assets,
        warnings: [...warnings, ...configWarnings],
        initMs: Math.round(performance.now() - started),
      };

      return this.initInfo;
    } catch (error) {
      throw new OCRError(
        "init",
        `PaddleOCR initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
  }

  async recognize(input: Blob): Promise<OCRResult> {
    await this.initialize();
    if (!this.ocr) throw new OCRError("init", "OCR pipeline is not initialized.");

    const started = performance.now();
    let raw: unknown;
    try {
      raw = await withTimeout(this.ocr.predict(input), this.timeoutMs, "OCR inference");
    } catch (error) {
      throw new OCRError(
        "recognize",
        `OCR inference failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }
    const processingTimeMs = Math.round(performance.now() - started);

    const results = Array.isArray(raw) ? raw : [raw];
    const result = results[0] as
      | {
          image?: { width: number; height: number };
          items?: Array<{
            poly?: Array<{ x: number; y: number }> | number[][];
            text?: string;
            score?: number;
          }>;
          metrics?: Record<string, number>;
          runtime?: Record<string, unknown>;
        }
      | undefined;

    if (!result) {
      throw new OCRError("recognize", "OCR returned no result object for this image.");
    }

    const boxes: OCRBox[] = (result.items ?? []).map((item) => {
      const poly = (item.poly ?? []).map((p: unknown) =>
        Array.isArray(p)
          ? { x: Number(p[0]), y: Number(p[1]) }
          : { x: Number((p as { x: number }).x), y: Number((p as { y: number }).y) },
      );
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      return {
        poly,
        bbox: {
          x1: xs.length ? Math.min(...xs) : 0,
          y1: ys.length ? Math.min(...ys) : 0,
          x2: xs.length ? Math.max(...xs) : 0,
          y2: ys.length ? Math.max(...ys) : 0,
        },
        text: String(item.text ?? ""),
        confidence: Number(item.score ?? 0),
      };
    });

    const confidence = boxes.length
      ? boxes.reduce((sum, b) => sum + b.confidence, 0) / boxes.length
      : 0;

    return {
      text: boxes.map((b) => b.text).join("\n"),
      confidence,
      boxes,
      processingTimeMs,
      metrics: {
        detectionMs: Number(result.metrics?.["detMs"] ?? 0),
        recognitionMs: Number(result.metrics?.["recMs"] ?? 0),
        totalMs: Number(result.metrics?.["totalMs"] ?? processingTimeMs),
        detectedBoxes: Number(result.metrics?.["detectedBoxes"] ?? boxes.length),
        recognizedLines: Number(result.metrics?.["recognizedCount"] ?? boxes.length),
      },
      image: {
        width: Number(result.image?.width ?? 0),
        height: Number(result.image?.height ?? 0),
      },
      runtime: {
        requestedBackend: String(result.runtime?.["requestedBackend"] ?? "wasm"),
        detProvider: String(result.runtime?.["detProvider"] ?? "unknown"),
        recProvider: String(result.runtime?.["recProvider"] ?? "unknown"),
        webgpuAvailable: Boolean(result.runtime?.["webgpuAvailable"]),
      },
    };
  }

  async dispose(): Promise<void> {
    try {
      await this.ocr?.dispose();
    } finally {
      this.ocr = null;
      this.initInfo = null;
      this.initPromise = null;
    }
  }
}
