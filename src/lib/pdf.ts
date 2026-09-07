import { mergeLineFragments, regionsFromPdfItems } from "@/document/regions";
import type { DocumentTextRegion } from "@/document/types";
import type { RawPdfTextItem } from "@/document/regions";

export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfAnalysis {
  pageCount: number;
  pages: PdfPageText[];
  totalChars: number;
  /** true when the PDF already carries a usable text layer. */
  textBased: boolean;
  /** Unified regions per page, only populated for pages with a text layer. */
  regionsByPage: Record<number, DocumentTextRegion[]>;
  timings: { loadMs: number; textExtractionMs: number };
}

let pdfWorkerSrcOverride: string | null = null;

/**
 * Points PDF.js at a packaged worker file. Used by the Chrome extension build,
 * where the worker is served from chrome-extension:// instead of the web root.
 */
export function setPdfWorkerSrc(url: string): void {
  pdfWorkerSrcOverride = url;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (pdfWorkerSrcOverride) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrcOverride;
    return pdfjs;
  }
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  return pdfjs;
}

async function openDocument(file: Blob) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjs.getDocument({ data }).promise;
  } catch (error) {
    throw new Error(
      `PDF could not be opened (corrupted, encrypted or unsupported): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * PDF.js text-layer extraction. Coordinates are converted to the same
 * top-left origin, page-pixel space used for rendered/OCR-ed pages so the
 * document parser cannot tell the two sources apart.
 */
export async function analyzePdf(file: Blob, renderScale = 2): Promise<PdfAnalysis> {
  const loadStart = performance.now();
  const doc = await openDocument(file);
  const loadMs = performance.now() - loadStart;

  const textStart = performance.now();
  const pages: PdfPageText[] = [];
  const regionsByPage: Record<number, DocumentTextRegion[]> = {};
  let totalChars = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: renderScale });
    const content = await page.getTextContent();

    const items: RawPdfTextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const str = item.str;
      if (!str.trim()) continue;
      // transform = [a, b, c, d, e, f]; e/f is the text baseline origin.
      const transform = item.transform as number[];
      const fontHeight = Math.abs(transform[3] ?? item.height ?? 10) * renderScale;
      const width = (item.width ?? 0) * renderScale;
      const x = (transform[4] ?? 0) * renderScale;
      const baselineY = (transform[5] ?? 0) * renderScale;
      items.push({
        text: str,
        x,
        // PDF user space grows upwards; flip to a top-left origin.
        y: viewport.height - baselineY - fontHeight,
        width: width || Math.max(1, str.length * fontHeight * 0.5),
        height: Math.max(1, fontHeight),
      });
    }

    const regions = mergeLineFragments(regionsFromPdfItems(items, i));
    regionsByPage[i] = regions;

    const text = regions
      .map((region) => region.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    totalChars += text.replace(/\s/g, "").length;
    pages.push({ pageNumber: i, text });
    page.cleanup();
  }
  const textExtractionMs = performance.now() - textStart;

  const pageCount = doc.numPages;
  doc.cleanup();

  // Heuristic: a real text layer usually yields well over 100 characters/page.
  const textBased = totalChars / Math.max(1, pageCount) >= 100;
  return {
    pageCount,
    pages,
    totalChars,
    textBased,
    regionsByPage,
    timings: { loadMs, textExtractionMs },
  };
}

export async function renderPdfPage(
  file: Blob,
  pageNumber: number,
  scale = 2,
): Promise<{ blob: Blob; width: number; height: number; renderMs: number }> {
  const start = performance.now();
  const doc = await openDocument(file);
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable while rendering the PDF page.");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Rendered PDF page could not be encoded as an image.");
    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      renderMs: performance.now() - start,
    };
  } finally {
    doc.cleanup();
  }
}
