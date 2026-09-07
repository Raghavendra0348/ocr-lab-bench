import type { OCRBox } from "@/ocr/ocrTypes";

export type FieldKey = "name" | "dob" | "certificateNumber";

export interface ExtractedField {
  key: FieldKey;
  label: string;
  value: string | null;
  sourceLine: string | null;
  ocrConfidence: number | null;
  /** Rule-based heuristic confidence, NOT a model output. */
  extractionConfidence: number;
  matchedLabel: string | null;
  strategy: string | null;
}

const NAME_LABELS = [
  "applicant name",
  "student name",
  "candidate name",
  "full name",
  "name of applicant",
  "name of student",
  "name of candidate",
  "name",
];

const DOB_LABELS = ["date of birth", "birth date", "d.o.b", "d o b", "dob"];

const CERT_LABELS = [
  "certificate number",
  "certificate no",
  "cert number",
  "cert no",
  "application number",
  "application no",
  "registration number",
  "registration no",
  "document number",
  "document no",
  "reg no",
  "app no",
];

const DATE_PATTERN =
  /\b(\d{1,2}[-/.\s]\d{1,2}[-/.\s]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4})\b/;

const ID_PATTERN = /\b([A-Z]{0,6}[-/]?\d[A-Z0-9\-/]{3,})\b/;

function lower(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function stripLabel(line: string, label: string): string {
  const idx = lower(line).indexOf(label);
  if (idx < 0) return "";
  let rest = line.slice(idx + label.length);
  rest = rest.replace(/^[\s:.\-–—=)|]+/, "");
  return rest.trim();
}

function cleanName(value: string): string {
  return value
    .replace(/[^A-Za-z .'\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findLabelledLine(lines: OCRBox[], labels: string[]) {
  for (const label of labels) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (lower(line.text).includes(label)) {
        return { index: i, box: line, label };
      }
    }
  }
  return null;
}

/** Nearest line to the right of / below the label line, using geometry. */
function neighbourValue(lines: OCRBox[], labelIndex: number): OCRBox | null {
  const label = lines[labelIndex]!;
  const labelHeight = Math.max(1, label.bbox.y2 - label.bbox.y1);
  const sameRow = lines
    .filter(
      (b, i) =>
        i !== labelIndex &&
        b.text.trim().length > 0 &&
        b.bbox.x1 >= label.bbox.x2 - labelHeight * 0.5 &&
        Math.abs((b.bbox.y1 + b.bbox.y2) / 2 - (label.bbox.y1 + label.bbox.y2) / 2) < labelHeight,
    )
    .sort((a, b) => a.bbox.x1 - b.bbox.x1);
  if (sameRow[0]) return sameRow[0];

  const below = lines
    .filter(
      (b, i) =>
        i !== labelIndex &&
        b.text.trim().length > 0 &&
        b.bbox.y1 >= label.bbox.y2 - labelHeight * 0.3 &&
        b.bbox.y1 - label.bbox.y2 < labelHeight * 2.5 &&
        b.bbox.x2 > label.bbox.x1 - labelHeight &&
        b.bbox.x1 < label.bbox.x2 + labelHeight * 6,
    )
    .sort((a, b) => a.bbox.y1 - b.bbox.y1);
  return below[0] ?? null;
}

function extractName(lines: OCRBox[]): ExtractedField {
  const base: ExtractedField = {
    key: "name",
    label: "Name",
    value: null,
    sourceLine: null,
    ocrConfidence: null,
    extractionConfidence: 0,
    matchedLabel: null,
    strategy: null,
  };

  const hit = findLabelledLine(lines, NAME_LABELS);
  if (!hit) return base;

  const inline = cleanName(stripLabel(hit.box.text, hit.label));
  if (inline.length >= 3 && /[A-Za-z]{2,}/.test(inline)) {
    return {
      ...base,
      value: inline,
      sourceLine: hit.box.text,
      ocrConfidence: hit.box.confidence,
      extractionConfidence: 0.85,
      matchedLabel: hit.label,
      strategy: "value found on the same OCR line as the label",
    };
  }

  const neighbour = neighbourValue(lines, hit.index);
  const candidate = neighbour ? cleanName(neighbour.text) : "";
  if (candidate.length >= 3 && /[A-Za-z]{2,}/.test(candidate)) {
    return {
      ...base,
      value: candidate,
      sourceLine: `${hit.box.text} → ${neighbour!.text}`,
      ocrConfidence: Math.min(hit.box.confidence, neighbour!.confidence),
      extractionConfidence: 0.6,
      matchedLabel: hit.label,
      strategy: "value taken from the nearest line right of / below the label",
    };
  }

  return { ...base, matchedLabel: hit.label, sourceLine: hit.box.text };
}

function extractDob(lines: OCRBox[]): ExtractedField {
  const base: ExtractedField = {
    key: "dob",
    label: "Date of Birth",
    value: null,
    sourceLine: null,
    ocrConfidence: null,
    extractionConfidence: 0,
    matchedLabel: null,
    strategy: null,
  };

  const hit = findLabelledLine(lines, DOB_LABELS);
  if (hit) {
    const inline = stripLabel(hit.box.text, hit.label).match(DATE_PATTERN)?.[0];
    if (inline) {
      return {
        ...base,
        value: inline.trim(),
        sourceLine: hit.box.text,
        ocrConfidence: hit.box.confidence,
        extractionConfidence: 0.9,
        matchedLabel: hit.label,
        strategy: "date pattern on the same OCR line as the label",
      };
    }
    const neighbour = neighbourValue(lines, hit.index);
    const near = neighbour?.text.match(DATE_PATTERN)?.[0];
    if (near && neighbour) {
      return {
        ...base,
        value: near.trim(),
        sourceLine: `${hit.box.text} → ${neighbour.text}`,
        ocrConfidence: Math.min(hit.box.confidence, neighbour.confidence),
        extractionConfidence: 0.65,
        matchedLabel: hit.label,
        strategy: "date pattern in the nearest line right of / below the label",
      };
    }
    return { ...base, matchedLabel: hit.label, sourceLine: hit.box.text };
  }

  return base;
}

function extractCertificateNumber(lines: OCRBox[]): ExtractedField {
  const base: ExtractedField = {
    key: "certificateNumber",
    label: "Certificate Number",
    value: null,
    sourceLine: null,
    ocrConfidence: null,
    extractionConfidence: 0,
    matchedLabel: null,
    strategy: null,
  };

  const hit = findLabelledLine(lines, CERT_LABELS);
  if (!hit) return base;

  const inline = stripLabel(hit.box.text, hit.label).match(ID_PATTERN)?.[0];
  if (inline) {
    return {
      ...base,
      value: inline.trim(),
      sourceLine: hit.box.text,
      ocrConfidence: hit.box.confidence,
      extractionConfidence: 0.85,
      matchedLabel: hit.label,
      strategy: "identifier pattern on the same OCR line as the label",
    };
  }

  const neighbour = neighbourValue(lines, hit.index);
  const near = neighbour?.text.match(ID_PATTERN)?.[0];
  if (near && neighbour) {
    return {
      ...base,
      value: near.trim(),
      sourceLine: `${hit.box.text} → ${neighbour.text}`,
      ocrConfidence: Math.min(hit.box.confidence, neighbour.confidence),
      extractionConfidence: 0.6,
      matchedLabel: hit.label,
      strategy: "identifier pattern in the nearest line right of / below the label",
    };
  }

  return { ...base, matchedLabel: hit.label, sourceLine: hit.box.text };
}

/**
 * Deterministic, rule-based field extraction over OCR lines. No AI model is
 * involved: label matching + geometry + regex only.
 */
export function extractFields(boxes: OCRBox[]): ExtractedField[] {
  const lines = boxes.filter((b) => b.text.trim().length > 0);
  return [extractName(lines), extractDob(lines), extractCertificateNumber(lines)];
}
