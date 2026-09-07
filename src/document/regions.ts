import type { OCRBox } from "@/ocr/ocrTypes";
import type { DocumentTextRegion } from "./types";

/**
 * Adapters that turn engine-specific output into the unified region model.
 * These are the ONLY places that know about OCRBox or PDF.js text items.
 */

export function regionsFromOcrBoxes(
  boxes: OCRBox[],
  page: number,
  idPrefix = "r",
): DocumentTextRegion[] {
  return boxes
    .filter((box) => box.text.trim().length > 0)
    .map((box, index) => ({
      id: `${idPrefix}${index + 1}`,
      text: box.text.trim(),
      confidence: box.confidence,
      x: box.bbox.x1,
      y: box.bbox.y1,
      width: Math.max(1, box.bbox.x2 - box.bbox.x1),
      height: Math.max(1, box.bbox.y2 - box.bbox.y1),
      page,
      source: "ocr" as const,
      polygon: box.poly.map((point) => [point.x, point.y]),
    }));
}

export interface RawPdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function regionsFromPdfItems(
  items: RawPdfTextItem[],
  page: number,
  idPrefix = "p",
): DocumentTextRegion[] {
  return items
    .filter((item) => item.text.trim().length > 0)
    .map((item, index) => ({
      id: `${idPrefix}${page}-${index + 1}`,
      text: item.text.trim(),
      // A PDF text layer contains exact characters, not a recognition guess.
      confidence: 1,
      x: item.x,
      y: item.y,
      width: Math.max(1, item.width),
      height: Math.max(1, item.height),
      page,
      source: "pdf-text" as const,
    }));
}

/** Joins horizontally adjacent fragments of the same visual line. */
export function mergeLineFragments(regions: DocumentTextRegion[]): DocumentTextRegion[] {
  const sorted = [...regions].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const dy = a.y + a.height / 2 - (b.y + b.height / 2);
    if (Math.abs(dy) > Math.max(a.height, b.height) * 0.6) return dy;
    return a.x - b.x;
  });

  const merged: DocumentTextRegion[] = [];
  for (const region of sorted) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.page === region.page &&
      Math.abs(previous.y + previous.height / 2 - (region.y + region.height / 2)) <=
        Math.max(previous.height, region.height) * 0.5 &&
      region.x - (previous.x + previous.width) <= Math.max(previous.height, region.height) * 0.8
    ) {
      const x2 = Math.max(previous.x + previous.width, region.x + region.width);
      const y1 = Math.min(previous.y, region.y);
      const y2 = Math.max(previous.y + previous.height, region.y + region.height);
      const gap = region.x - (previous.x + previous.width);
      merged[merged.length - 1] = {
        ...previous,
        text: `${previous.text}${gap > Math.max(previous.height, region.height) * 0.15 ? " " : ""}${region.text}`,
        x: Math.min(previous.x, region.x),
        y: y1,
        width: x2 - Math.min(previous.x, region.x),
        height: y2 - y1,
        confidence: Math.min(previous.confidence, region.confidence),
      };
      continue;
    }
    merged.push({ ...region });
  }
  return merged.map((region, index) => ({ ...region, id: `${region.source === "ocr" ? "r" : "p"}${index + 1}` }));
}
