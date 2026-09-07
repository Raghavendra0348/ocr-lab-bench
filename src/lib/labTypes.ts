import type { OCRResult } from "@/ocr/ocrTypes";
import type { PreprocessOptions } from "./preprocess";

export interface RunRecord {
  id: string;
  label: string;
  createdAt: number;
  /** null for images, 1-based page number for PDFs. */
  pageNumber: number | null;
  preprocess: PreprocessOptions;
  preprocessLabel: string;
  result: OCRResult;
  /** Object URL of the exact bitmap handed to the OCR engine. */
  imageUrl: string;
  qualityTest: string;
}

export interface LogEntry {
  at: number;
  level: "info" | "warn" | "error";
  message: string;
}

export const QUALITY_TESTS = [
  { id: "unspecified", name: "Not categorised", expectation: "—" },
  { id: "clean-scan", name: "Test 1 — Clean scan", expectation: "Expected: very high recognition accuracy." },
  { id: "low-res", name: "Test 2 — Low resolution", expectation: "Expected: some degradation." },
  { id: "blurry", name: "Test 3 — Blurry document", expectation: "Expected: OCR degradation." },
  { id: "rotated", name: "Test 4 — Rotated document", expectation: "Expected: tests orientation robustness." },
  { id: "phone-photo", name: "Test 5 — Phone photograph", expectation: "Expected: perspective and lighting challenges." },
  { id: "shadow", name: "Test 6 — Shadow", expectation: "Expected: recognition under uneven illumination." },
  { id: "complex", name: "Test 7 — Complex certificate", expectation: "Expected: multiple labels, values, seals, tables." },
] as const;

export const EVALUATION_ITEMS = [
  { id: "printed", label: "Printed clean documents" },
  { id: "lowquality", label: "Low-quality scans" },
  { id: "photos", label: "Phone photographs" },
  { id: "rotated", label: "Rotated documents" },
  { id: "names", label: "Names" },
  { id: "dob", label: "DOB" },
  { id: "certnumbers", label: "Certificate numbers" },
  { id: "tables", label: "Tables" },
  { id: "overall", label: "Overall OCR quality" },
] as const;

export type Grade = "unrated" | "excellent" | "good" | "poor";
