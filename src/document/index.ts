import { classifyDocument } from "./classifier";
import { AadhaarParser } from "./parsers/AadhaarParser";
import { PanParser } from "./parsers/PanParser";
import { GenericCertificateParser, GenericDocumentParser } from "./parsers/GenericCertificateParser";
import type { DocumentClassification, DocumentParser, DocumentTextRegion, ParsedDocument } from "./types";

export * from "./types";
export * from "./regions";
export { classifyDocument } from "./classifier";
export * as spatial from "./spatial/spatialUtils";

export function parserFor(classification: DocumentClassification): DocumentParser {
  switch (classification.type) {
    case "aadhaar":
      return AadhaarParser;
    case "pan":
      return PanParser;
    case "certificate":
      return GenericCertificateParser;
    default:
      return GenericDocumentParser;
  }
}

export interface UnderstandResult {
  parsed: ParsedDocument;
  parserName: string;
  timings: { classificationMs: number; extractionMs: number };
}

/** Classification + parsing over the unified region model. */
export function understandDocument(regions: DocumentTextRegion[]): UnderstandResult {
  const t0 = performance.now();
  const classification = classifyDocument(regions);
  const t1 = performance.now();
  const parser = parserFor(classification);
  const parsed = parser.parse(regions, classification);
  const t2 = performance.now();
  return {
    parsed,
    parserName: parser.name,
    timings: { classificationMs: t1 - t0, extractionMs: t2 - t1 },
  };
}
