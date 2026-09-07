/**
 * ErrorGuard on-device reading engine.
 *
 * This is the single bundled entry point loaded by the Chrome extension's
 * offscreen document. It wraps the exact same pipeline the OCR Lab uses:
 *
 *   PDF text layer  ─┐
 *                    ├─> DocumentTextRegion[] -> classifier -> parsers -> candidates
 *   PP-OCRv6 (WASM) ─┘
 *
 * Nothing here performs a network request: models, the ONNX Runtime WASM and
 * the PDF.js worker are all resolved through the injected `resolveAsset`,
 * which the extension points at chrome-extension:// URLs.
 */
import { PaddleOCRProvider } from "@/ocr/PaddleOCRProvider";
import type { OCRResult } from "@/ocr/ocrTypes";
import { DEFAULT_PREPROCESS, preprocessImage } from "@/lib/preprocess";
import { analyzePdf, renderPdfPage, setPdfWorkerSrc } from "@/lib/pdf";
import { mergeLineFragments, regionsFromOcrBoxes } from "@/document/regions";
import { understandDocument } from "@/document";
import type { DocumentTextRegion, FieldCandidate } from "@/document/types";
import { candidateState } from "@/document/types";
import { matchFormFields, type FormFieldDescriptor, type FormMatchResult } from "./formMatch";

export interface EngineConfig {
  resolveAsset: (path: string) => string;
  /**
   * Run recognition in a Web Worker. Extension sandbox pages have an opaque
   * origin and cannot load a worker script, so they pass false.
   */
  worker?: boolean;
}


export interface ReadInput {
  bytes: ArrayBuffer;
  mimeType?: string;
  fileName?: string;
}

export interface ReadFieldResult {
  value: string;
  normalizedValue: string | null;
  confidence: number;
  state: "high" | "review" | "unidentified";
  evidence: string[];
  method: string;
}

export interface ReadResult {
  ok: true;
  /** Aadhaar / pan / certificate / unknown. */
  documentType: string;
  classification: { type: string; confidence: number; evidence: string[] };
  fields: Record<string, ReadFieldResult>;
  /** Convenience shape the extension's existing modules already consume. */
  flat: {
    name: string | null;
    fatherName: string | null;
    spouseName: string | null;
    dob: string | null;
    gender: string | null;
    aadhaarNo: string | null;
    panNo: string | null;
    certificateNo: string | null;
  };
  text: string;
  ocrConfidence: number;
  regionCount: number;
  source: "pdf-text" | "ocr";
  pageCount: number;
  warnings: string[];
  timings: Record<string, number>;
}

type ProgressFn = (percent: number, message: string) => void;

let resolveAssetFn: ((path: string) => string) | null = null;
let useWorker = true;
let provider: PaddleOCRProvider | null = null;

function assertConfigured(): (path: string) => string {
  if (!resolveAssetFn) {
    throw new Error("ErrorGuardEngine.configure({ resolveAsset }) must be called first.");
  }
  return resolveAssetFn;
}

function getProvider(): PaddleOCRProvider {
  const resolveAsset = assertConfigured();
  if (!provider) provider = new PaddleOCRProvider({ resolveAsset, worker: useWorker });
  return provider;
}

function isPdf(input: ReadInput): boolean {
  if (input.mimeType === "application/pdf") return true;
  return Boolean(input.fileName && /\.pdf$/i.test(input.fileName));
}

function toFieldResult(candidate: FieldCandidate): ReadFieldResult {
  return {
    value: candidate.value,
    normalizedValue: candidate.normalizedValue ?? null,
    confidence: candidate.confidence,
    state: candidateState(candidate),
    evidence: candidate.evidence,
    method: candidate.extractionMethod,
  };
}

async function ocrBlob(
  blob: Blob,
  onProgress: ProgressFn,
): Promise<{ result: OCRResult; retried: boolean }> {
  const ocr = getProvider();
  onProgress(15, "Loading on-device recognition models...");
  await ocr.initialize();
  onProgress(35, "Reading the document on this device...");
  let result = await ocr.recognize(blob);
  let retried = false;

  // Low yield: retry once with local canvas enhancement (grayscale + contrast +
  // 2x upscale). Still entirely on-device.
  const weak = result.boxes.length === 0 || result.text.trim().length < 10 || result.confidence < 0.5;
  if (weak) {
    onProgress(65, "Low quality scan — enhancing and re-reading...");
    const enhanced = await preprocessImage(blob, {
      ...DEFAULT_PREPROCESS,
      grayscale: true,
      contrast: true,
      upscale2x: true,
    });
    const second = await ocr.recognize(enhanced.blob);
    retried = true;
    if (second.text.trim().length > result.text.trim().length) result = second;
  }
  return { result, retried };
}

export async function readDocument(
  input: ReadInput,
  onProgress: ProgressFn = () => {},
): Promise<ReadResult> {
  const resolveAsset = assertConfigured();
  setPdfWorkerSrc(resolveAsset("lib/pdf.worker.min.mjs"));

  const started = performance.now();
  const timings: Record<string, number> = {};
  const warnings: string[] = [];
  const blob = new Blob([input.bytes], {
    type: input.mimeType || (isPdf(input) ? "application/pdf" : "image/png"),
  });

  let regions: DocumentTextRegion[] = [];
  let source: "pdf-text" | "ocr" = "ocr";
  let text = "";
  let ocrConfidence = 0;
  let pageCount = 1;

  if (isPdf(input)) {
    onProgress(8, "Opening the PDF on this device...");
    const analysis = await analyzePdf(blob);
    pageCount = analysis.pageCount;
    timings["pdfLoadMs"] = Math.round(analysis.timings.loadMs);
    timings["pdfTextMs"] = Math.round(analysis.timings.textExtractionMs);

    if (analysis.textBased) {
      source = "pdf-text";
      const collected: DocumentTextRegion[] = [];
      for (const page of Object.keys(analysis.regionsByPage)) {
        collected.push(...(analysis.regionsByPage[Number(page)] ?? []));
      }
      regions = collected;
      text = analysis.pages.map((page) => page.text).join("\n");
      // A PDF text layer is exact characters, not a recognition guess.
      ocrConfidence = 1;
      onProgress(70, "Reading the PDF's own text layer...");
    } else {
      onProgress(20, "Scanned PDF — rendering page 1 for recognition...");
      const rendered = await renderPdfPage(blob, 1, 2);
      timings["pdfRenderMs"] = Math.round(rendered.renderMs);
      const { result, retried } = await ocrBlob(rendered.blob, onProgress);
      if (retried) warnings.push("The scan was low quality, so it was enhanced and read again.");
      regions = mergeLineFragments(regionsFromOcrBoxes(result.boxes, 1));
      text = result.text;
      ocrConfidence = result.confidence;
      timings["ocrMs"] = result.processingTimeMs;
      if (pageCount > 1) {
        warnings.push(`Only page 1 of ${pageCount} was read from this scanned PDF.`);
      }
    }
  } else {
    const { result, retried } = await ocrBlob(blob, onProgress);
    if (retried) warnings.push("The image was low quality, so it was enhanced and read again.");
    regions = mergeLineFragments(regionsFromOcrBoxes(result.boxes, 1));
    text = result.text;
    ocrConfidence = result.confidence;
    timings["ocrMs"] = result.processingTimeMs;
  }

  onProgress(85, "Identifying the document and its fields...");
  const understanding = understandDocument(regions);
  timings["classificationMs"] = Math.round(understanding.timings.classificationMs);
  timings["extractionMs"] = Math.round(understanding.timings.extractionMs);
  timings["totalMs"] = Math.round(performance.now() - started);

  const fields: Record<string, ReadFieldResult> = {};
  for (const [key, candidate] of Object.entries(understanding.parsed.fields)) {
    fields[key] = toFieldResult(candidate);
  }

  const pick = (key: string): string | null => {
    const field = fields[key];
    if (!field) return null;
    return field.value || null;
  };

  onProgress(100, "Reading complete");

  return {
    ok: true,
    documentType: understanding.parsed.documentType,
    classification: {
      type: understanding.parsed.classification.type,
      confidence: understanding.parsed.classification.confidence,
      evidence: understanding.parsed.classification.evidence,
    },
    fields,
    flat: {
      name: pick("name"),
      fatherName: pick("fatherName"),
      spouseName: pick("spouseName"),
      dob: fields["dob"]?.normalizedValue || pick("dob"),
      gender: pick("gender"),
      aadhaarNo: pick("aadhaarNumber"),
      panNo: pick("panNumber"),
      certificateNo: pick("certificateNumber"),
    },
    text,
    ocrConfidence,
    regionCount: regions.length,
    source,
    pageCount,
    warnings: [...warnings, ...understanding.parsed.warnings],
    timings,
  };
}

export interface EngineApi {
  configure(config: EngineConfig): void;
  readDocument(input: ReadInput, onProgress?: ProgressFn): Promise<ReadResult>;
  matchFormFields(fields: FormFieldDescriptor[], read: ReadResult): FormMatchResult;
  dispose(): Promise<void>;
}

const api: EngineApi = {
  configure(config) {
    resolveAssetFn = config.resolveAsset;
    if (typeof config.worker === "boolean") useWorker = config.worker;
  },
  readDocument,
  matchFormFields,
  async dispose() {
    await provider?.dispose();
    provider = null;
  },
};

declare global {
  interface Window {
    ErrorGuardEngine?: EngineApi;
  }
}

if (typeof window !== "undefined") window.ErrorGuardEngine = api;

export default api;
export type { FormFieldDescriptor, FormMatchResult } from "./formMatch";
