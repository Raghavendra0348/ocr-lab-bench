/**
 * Engine-agnostic document text model.
 *
 * Everything downstream of OCR / PDF text extraction consumes ONLY
 * DocumentTextRegion[]. Parsers must never import PaddleOCR types.
 */
export interface DocumentTextRegion {
  id: string;
  text: string;
  /** 0..1. PDF text layer regions are 1 (exact characters, not recognized). */
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  source: "pdf-text" | "ocr";
  polygon?: number[][];
}

export type DocumentType = "aadhaar" | "pan" | "certificate" | "unknown";

export interface DocumentClassification {
  type: DocumentType;
  confidence: number;
  evidence: string[];
}

export type ExtractionMethod =
  | "label"
  | "spatial"
  | "relationship-marker"
  | "pattern"
  | "document-template";

/** Transparent, non-black-box breakdown of a candidate's score. */
export interface ConfidenceComponents {
  /** Mean OCR/text-layer confidence of the source regions (0..1). */
  ocr: number;
  /** How strongly the value matches the expected shape for the field (0..1). */
  pattern: number;
  /** Strength of the geometric evidence (0..1). */
  spatial: number;
  /** Classifier confidence for the document type this rule belongs to (0..1). */
  documentType: number;
  /** Strength of relationship-marker evidence (0..1, 0 when none). */
  relationship: number;
}

export interface FieldCandidate {
  field: string;
  value: string;
  /** Normalized machine value where it differs from the printed value. */
  normalizedValue?: string;
  confidence: number;
  components: ConfidenceComponents;
  sourceRegionIds: string[];
  evidence: string[];
  extractionMethod: ExtractionMethod;
}

export interface ParsedDocument {
  documentType: DocumentType;
  classification: DocumentClassification;
  /** Best candidate per field. */
  fields: Record<string, FieldCandidate>;
  /** Every candidate generated, including rejected ones, best first. */
  candidates: FieldCandidate[];
  warnings: string[];
}

export interface DocumentParser {
  readonly name: string;
  parse(regions: DocumentTextRegion[], classification: DocumentClassification): ParsedDocument;
}

export const FIELD_LABELS: Record<string, string> = {
  name: "Applicant / holder name",
  fatherName: "Father name",
  spouseName: "Spouse name",
  careOfName: "Care-of name",
  dob: "Date of birth",
  gender: "Gender",
  aadhaarNumber: "Aadhaar number",
  panNumber: "PAN number",
  certificateNumber: "Certificate / document number",
  issueDate: "Issue date",
};

/** Weighted, fully visible combination of the score components. */
export function combineConfidence(components: ConfidenceComponents): number {
  const weights = {
    ocr: 0.3,
    pattern: 0.25,
    spatial: 0.2,
    documentType: 0.1,
    relationship: 0.15,
  };
  // Relationship evidence is optional: when absent its weight is redistributed
  // proportionally over the remaining components instead of penalizing.
  const active: Array<[keyof ConfidenceComponents, number]> = [
    ["ocr", weights.ocr],
    ["pattern", weights.pattern],
    ["spatial", weights.spatial],
    ["documentType", weights.documentType],
  ];
  if (components.relationship > 0) active.push(["relationship", weights.relationship]);
  const total = active.reduce((sum, [, w]) => sum + w, 0);
  const score = active.reduce((sum, [key, w]) => sum + components[key] * w, 0) / total;
  return Math.max(0, Math.min(1, score));
}

export type CandidateState = "high" | "review" | "unidentified";

export function candidateState(candidate: FieldCandidate | null | undefined): CandidateState {
  if (!candidate) return "unidentified";
  if (candidate.confidence >= 0.85) return "high";
  return "review";
}

export const CANDIDATE_STATE_LABEL: Record<CandidateState, string> = {
  high: "✓ High-confidence candidate",
  review: "⚠ Review required",
  unidentified: "? Could not confidently identify",
};
