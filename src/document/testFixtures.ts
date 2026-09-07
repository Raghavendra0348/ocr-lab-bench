import type { DocumentTextRegion } from "./types";

/**
 * Deterministic synthetic region sets for test mode.
 *
 * These are hand-written text regions with realistic geometry — they exercise
 * the classifier and parsers WITHOUT any OCR run, so the extraction logic can
 * be checked in isolation. They are clearly labelled as synthetic in the UI and
 * never presented as OCR output.
 */
function build(rows: Array<[string, number, number, number, number]>, prefix: string): DocumentTextRegion[] {
  return rows.map(([text, x, y, width, height], index) => ({
    id: `${prefix}${index + 1}`,
    text,
    confidence: 0.97,
    x,
    y,
    width,
    height,
    page: 1,
    source: "ocr" as const,
  }));
}

export interface DocumentFixture {
  id: string;
  name: string;
  note: string;
  regions: DocumentTextRegion[];
}

export const DOCUMENT_FIXTURES: DocumentFixture[] = [
  {
    id: "aadhaar-unlabelled",
    name: "Aadhaar-style card (no “Name:” label)",
    note: "Holder name sits above the DOB line with no label; father name appears after an S/O marker.",
    regions: build(
      [
        ["Government of India", 120, 40, 300, 26],
        ["भारत सरकार", 120, 70, 200, 22],
        ["Ramesh Kumar", 120, 150, 260, 34],
        ["S/O Suresh Kumar", 120, 196, 280, 26],
        ["DOB: 12/04/2004", 120, 232, 240, 26],
        ["Male", 120, 266, 80, 24],
        ["4321 5678 9012", 120, 330, 320, 38],
        ["Unique Identification Authority of India", 120, 380, 420, 20],
      ],
      "a",
    ),
  },
  {
    id: "pan-stacked",
    name: "PAN-style card (stacked, label above value)",
    note: "Field labels sit on their own line above each value; the PAN pattern anchors the document type.",
    regions: build(
      [
        ["INCOME TAX DEPARTMENT", 100, 30, 380, 26],
        ["GOVT. OF INDIA", 100, 60, 240, 22],
        ["Permanent Account Number", 100, 120, 340, 22],
        ["ABCDE1234F", 100, 148, 220, 32],
        ["Name", 100, 200, 80, 20],
        ["RAMESH KUMAR", 100, 224, 260, 28],
        ["Father's Name", 100, 268, 150, 20],
        ["SURESH KUMAR", 100, 292, 260, 28],
        ["Date of Birth", 100, 336, 130, 20],
        ["12/04/2004", 100, 360, 180, 28],
      ],
      "p",
    ),
  },
  {
    id: "certificate-table",
    name: "Certificate (labels to the left of values)",
    note: "Classic labelled certificate: values sit to the right of each label in the same row.",
    regions: build(
      [
        ["STATE BOARD OF SECONDARY EDUCATION", 90, 40, 620, 30],
        ["BIRTH CERTIFICATE", 260, 84, 300, 28],
        ["Certificate No.", 90, 160, 200, 24],
        ["BC/2024/887123", 340, 160, 260, 24],
        ["Name of Candidate", 90, 200, 240, 24],
        ["Ramesh Kumar", 340, 200, 240, 24],
        ["Father / Guardian", 90, 240, 220, 24],
        ["Suresh Kumar", 340, 240, 240, 24],
        ["Date of Birth", 90, 280, 180, 24],
        ["12-04-2004", 340, 280, 200, 24],
        ["Registrar of Births and Deaths", 90, 400, 380, 22],
      ],
      "c",
    ),
  },
];
