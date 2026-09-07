/**
 * On-device form-field matching — the local replacement for the Gemini
 * /api/map-form-fields call.
 *
 * The page's own field list (scraped by the content script) is matched against
 * the reading engine's field candidates using the same normalising rules the
 * OCR Lab uses. Every row carries a confidence and a state, so uncertain values
 * are offered for review instead of silently filled.
 */
import { normalizeAlnum, normalizeDate, normalizeText, nameSimilarity } from "@/lib/textCompare";
import type { ReadResult } from "./engine";

export type SemanticType =
  | "FULL_NAME"
  | "FATHER_NAME"
  | "MOTHER_NAME"
  | "SPOUSE_NAME"
  | "DOB"
  | "GENDER"
  | "AADHAAR_NUMBER"
  | "PAN_NUMBER"
  | "CERTIFICATE_NUMBER"
  | "UNKNOWN";

export interface FormFieldDescriptor {
  /** id or name used to find the element again. */
  fieldKey: string;
  /** input type attribute ("text", "date", "select-one", ...). */
  type?: string;
  label?: string | null;
  placeholder?: string | null;
  name?: string | null;
  currentValue?: string | null;
  /** Optional semantic type already decided by the extension's field-mapper. */
  semanticType?: SemanticType | string | null;
}

export interface FormMatchRow {
  fieldKey: string;
  label: string;
  semanticType: SemanticType;
  /** Engine field this row was taken from ("name", "dob", ...). */
  sourceField: string | null;
  value: string | null;
  confidence: number;
  state: "high" | "review" | "unidentified";
  /** true when the field already holds a different value. */
  conflict: boolean;
  existingValue: string | null;
  evidence: string[];
  /** Only true rows are auto-applied by "Fill all". */
  autoFill: boolean;
}

export interface FormMatchResult {
  rows: FormMatchRow[];
  /** { fieldKey: value } for the high-confidence, non-conflicting rows only. */
  fieldMap: Record<string, string>;
  reviewCount: number;
  conflictCount: number;
}

const HIGH_CONFIDENCE = 0.85;

const PATTERNS: Array<{ semantic: SemanticType; test: RegExp; negate?: RegExp }> = [
  { semantic: "AADHAAR_NUMBER", test: /aadhaar|aadhar|uid(ai)?\b/ },
  { semantic: "PAN_NUMBER", test: /\bpan\b|permanent account/ },
  { semantic: "CERTIFICATE_NUMBER", test: /certificate\s*(no|number|id)|cert\s*no|registration\s*(no|number)|hall\s*ticket|application\s*(no|number)/ },
  { semantic: "DOB", test: /d\.?o\.?b|date of birth|birth\s*date|birthday|janm/ },
  { semantic: "GENDER", test: /gender|\bsex\b/ },
  { semantic: "FATHER_NAME", test: /father|guardian|\bs\/o\b|parent name/ },
  { semantic: "MOTHER_NAME", test: /mother|\bm\/o\b/ },
  { semantic: "SPOUSE_NAME", test: /spouse|husband|wife|\bw\/o\b/ },
  {
    semantic: "FULL_NAME",
    test: /full name|applicant name|candidate name|student name|holder name|your name|^name$|\bname\b/,
    negate: /father|mother|spouse|husband|wife|guardian|user|file|company|bank|school|college|city|village/,
  },
];

/** Classifies one form control from its label / name / placeholder text. */
export function inferSemanticType(field: FormFieldDescriptor): SemanticType {
  const provided = (field.semanticType || "").toString().toUpperCase();
  if (provided && provided !== "UNKNOWN") return provided as SemanticType;

  const haystack = normalizeText(
    [field.label, field.name, field.fieldKey, field.placeholder].filter(Boolean).join(" "),
  );
  if (!haystack) return "UNKNOWN";
  if ((field.type || "").toLowerCase() === "date") return "DOB";

  for (const pattern of PATTERNS) {
    if (!pattern.test.test(haystack)) continue;
    if (pattern.negate && pattern.negate.test(haystack)) continue;
    return pattern.semantic;
  }
  return "UNKNOWN";
}

/** Which engine field feeds each semantic form field. */
const SEMANTIC_TO_ENGINE_FIELD: Record<SemanticType, string[]> = {
  FULL_NAME: ["name"],
  FATHER_NAME: ["fatherName", "careOfName"],
  MOTHER_NAME: [],
  SPOUSE_NAME: ["spouseName"],
  DOB: ["dob"],
  GENDER: ["gender"],
  AADHAAR_NUMBER: ["aadhaarNumber"],
  PAN_NUMBER: ["panNumber"],
  CERTIFICATE_NUMBER: ["certificateNumber"],
  UNKNOWN: [],
};

function formatForControl(
  semantic: SemanticType,
  value: string,
  normalized: string | null,
  field: FormFieldDescriptor,
): string {
  const type = (field.type || "").toLowerCase();
  if (semantic === "DOB") {
    // <input type="date"> needs YYYY-MM-DD; anything else keeps the printed form.
    if (type === "date") {
      const iso = normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : normalizeDate(value);
      return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : value;
    }
    return value;
  }
  return value;
}

function sameValue(semantic: SemanticType, a: string, b: string): boolean {
  if (semantic === "DOB") return normalizeDate(a) === normalizeDate(b);
  if (
    semantic === "AADHAAR_NUMBER" ||
    semantic === "PAN_NUMBER" ||
    semantic === "CERTIFICATE_NUMBER"
  ) {
    return normalizeAlnum(a) === normalizeAlnum(b);
  }
  if (semantic.endsWith("NAME")) return nameSimilarity(a, b) >= 0.92;
  return normalizeText(a) === normalizeText(b);
}

export function matchFormFields(
  fields: FormFieldDescriptor[],
  read: ReadResult,
): FormMatchResult {
  const rows: FormMatchRow[] = [];
  const fieldMap: Record<string, string> = {};
  const docType = (read.documentType || "unknown").toLowerCase();

  for (const field of fields) {
    const semantic = inferSemanticType(field);
    const sources = SEMANTIC_TO_ENGINE_FIELD[semantic] ?? [];
    const label = field.label || field.placeholder || field.fieldKey;

    let sourceField: string | null = null;
    let candidate: ReadResult["fields"][string] | null = null;
    for (const key of sources) {
      const found = read.fields[key];
      if (found && found.value) {
        sourceField = key;
        candidate = found;
        break;
      }
    }

    // An Aadhaar or PAN number must never end up in a certificate-number field.
    if (
      semantic === "CERTIFICATE_NUMBER" &&
      (docType === "aadhaar" || docType === "pan")
    ) {
      candidate = null;
      sourceField = null;
    }

    if (!candidate || !sourceField) {
      if (semantic !== "UNKNOWN") {
        rows.push({
          fieldKey: field.fieldKey,
          label,
          semanticType: semantic,
          sourceField: null,
          value: null,
          confidence: 0,
          state: "unidentified",
          conflict: false,
          existingValue: field.currentValue || null,
          evidence: [],
          autoFill: false,
        });
      }
      continue;
    }

    const value = formatForControl(semantic, candidate.value, candidate.normalizedValue, field);
    const existing = (field.currentValue || "").trim();
    const conflict = existing.length > 0 && !sameValue(semantic, existing, value);
    const state = candidate.state;
    const autoFill = state === "high" && existing.length === 0;

    rows.push({
      fieldKey: field.fieldKey,
      label,
      semanticType: semantic,
      sourceField,
      value,
      confidence: candidate.confidence,
      state,
      conflict,
      existingValue: existing || null,
      evidence: candidate.evidence,
      autoFill,
    });

    if (autoFill && candidate.confidence >= HIGH_CONFIDENCE) fieldMap[field.fieldKey] = value;
  }

  return {
    rows,
    fieldMap,
    reviewCount: rows.filter((row) => row.state === "review").length,
    conflictCount: rows.filter((row) => row.conflict).length,
  };
}
