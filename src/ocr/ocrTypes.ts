/**
 * Engine-agnostic OCR types.
 *
 * The UI depends ONLY on these types, never on PaddleOCR internals, so the
 * engine can be swapped later (e.g. inside a Chrome extension) without
 * rewriting the application.
 */

export interface OCRPoint {
  x: number;
  y: number;
}

export interface OCRBox {
  /** Detection polygon in source-image pixel coordinates. */
  poly: OCRPoint[];
  /** Axis aligned bounds derived from the polygon. */
  bbox: { x1: number; y1: number; x2: number; y2: number };
  text: string;
  /** Raw recognition score returned by the model (0..1). */
  confidence: number;
}

export interface OCRMetrics {
  detectionMs: number;
  recognitionMs: number;
  totalMs: number;
  detectedBoxes: number;
  recognizedLines: number;
}

export interface OCRRuntimeInfo {
  requestedBackend: string;
  detProvider: string;
  recProvider: string;
  webgpuAvailable: boolean;
}

export interface OCRResult {
  /** All recognized lines joined with newlines. */
  text: string;
  /** Mean recognition score across recognized lines (0..1), 0 when empty. */
  confidence: number;
  boxes: OCRBox[];
  /** Wall-clock time measured around the recognize() call. */
  processingTimeMs: number;
  metrics: OCRMetrics;
  image: { width: number; height: number };
  runtime: OCRRuntimeInfo;
}

export interface OCRAssetInfo {
  url: string;
  bytes: number;
}

export interface OCRInitInfo {
  modelDetection: string;
  modelRecognition: string;
  lang: string;
  ocrVersion: string;
  worker: boolean;
  requestedBackend: string;
  backend: string;
  detProvider: string;
  recProvider: string;
  webgpuAvailable: boolean;
  numThreads: number;
  simd: boolean;
  crossOriginIsolated: boolean;
  wasmSource: string;
  modelAssetSource: string;
  assets: OCRAssetInfo[];
  warnings: string[];
  initMs: number;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.9) return "high";
  if (score >= 0.75) return "medium";
  return "low";
}
