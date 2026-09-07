export type RelationshipField = "fatherName" | "spouseName" | "careOfName" | "motherName";

export interface RelationshipHit {
  /** The marker exactly as printed. */
  marker: string;
  field: RelationshipField;
  relation: string;
  /** Text that follows the marker on the same region, may be empty. */
  trailing: string;
  /** Text that precedes the marker on the same region, may be empty. */
  leading: string;
}

interface MarkerRule {
  pattern: RegExp;
  field: RelationshipField;
  relation: string;
}

/**
 * Deterministic relationship markers. Order matters: longer/explicit label
 * forms are tested before the short slash forms.
 */
const RULES: MarkerRule[] = [
  { pattern: /\bfather(?:'s)?\s*(?:name)?\s*[:\-–]?/i, field: "fatherName", relation: "father" },
  { pattern: /\bmother(?:'s)?\s*(?:name)?\s*[:\-–]?/i, field: "motherName", relation: "mother" },
  { pattern: /\b(?:husband|wife|spouse)(?:'s)?\s*(?:name)?\s*[:\-–]?/i, field: "spouseName", relation: "spouse" },
  { pattern: /\bcare\s*of\s*[:\-–]?/i, field: "careOfName", relation: "care-of" },
  { pattern: /\bson\s+of\b\s*[:\-–]?/i, field: "fatherName", relation: "father" },
  { pattern: /\bdaughter\s+of\b\s*[:\-–]?/i, field: "fatherName", relation: "father" },
  { pattern: /\bwife\s+of\b\s*[:\-–]?/i, field: "spouseName", relation: "spouse" },
  { pattern: /(?:^|[\s(])S\s*[/\\|]\s*O\b\.?/i, field: "fatherName", relation: "father (S/O)" },
  { pattern: /(?:^|[\s(])D\s*[/\\|]\s*O\b\.?/i, field: "fatherName", relation: "father (D/O)" },
  { pattern: /(?:^|[\s(])W\s*[/\\|]\s*O\b\.?/i, field: "spouseName", relation: "spouse (W/O)" },
  { pattern: /(?:^|[\s(])C\s*[/\\|]\s*O\b\.?/i, field: "careOfName", relation: "care-of (C/O)" },
];

export function findRelationshipMarker(text: string): RelationshipHit | null {
  for (const rule of RULES) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    const start = match.index + (/^[\s(]/.test(match[0]) ? 1 : 0);
    const end = match.index + match[0].length;
    return {
      marker: text.slice(start, end).trim(),
      field: rule.field,
      relation: rule.relation,
      leading: text.slice(0, start).trim(),
      trailing: text.slice(end).replace(/^[\s:.\-–—=|]+/, "").trim(),
    };
  }
  return null;
}

/** Removes titles/honorifics and OCR noise from a person-name string. */
export function cleanPersonName(value: string): string {
  return value
    .replace(/\b(mr|mrs|ms|miss|shri|sri|smt|dr|late)\b\.?/gi, " ")
    .replace(/[^A-Za-z .'\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_STOPWORDS = [
  "government",
  "india",
  "income",
  "tax",
  "department",
  "permanent",
  "account",
  "number",
  "card",
  "authority",
  "unique",
  "identification",
  "aadhaar",
  "address",
  "male",
  "female",
  "gender",
  "date",
  "birth",
  "year",
  "signature",
  "certificate",
  "registrar",
  "issued",
  "valid",
  "district",
  "state",
  "office",
  "board",
  "university",
  "school",
  "college",
  "download",
  "enrolment",
  "enrollment",
  "vid",
  // Label words: a leftover label fragment such as "/ Guardian" must never be
  // accepted as the person's name.
  "guardian",
  "father",
  "mother",
  "spouse",
  "husband",
  "wife",
  "name",
  "applicant",
  "candidate",
  "student",
  "holder",
];


/** Heuristic test: could this string be a person's name? */
export function looksLikePersonName(value: string): boolean {
  // A region carrying a relationship marker ("S/O Suresh Kumar") is never the
  // holder's own name, so it must not pass as a bare person name.
  if (findRelationshipMarker(value)) return false;

  const cleaned = cleanPersonName(value);
  if (cleaned.length < 3 || cleaned.length > 60) return false;
  const words = cleaned.split(" ").filter((w) => w.length > 1);
  if (words.length < 1 || words.length > 5) return false;
  const lower = cleaned.toLowerCase();
  if (NAME_STOPWORDS.some((word) => lower.includes(word))) return false;
  // Names carry no digits and are mostly letters.
  if (/\d/.test(value)) return false;
  return words.every((w) => /^[A-Za-z][A-Za-z.'\-]*$/.test(w));
}

export const NAME_LABELS = [
  "applicant name",
  "student name",
  "candidate name",
  "holder name",
  "full name",
  "name of applicant",
  "name of student",
  "name of candidate",
  "name of holder",
  "name",
];

export function findNameLabel(text: string): string | null {
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  for (const label of NAME_LABELS) {
    const index = lower.indexOf(label);
    if (index < 0) continue;
    // "name of father" must not be treated as the holder-name label.
    const after = lower.slice(index + label.length, index + label.length + 12);
    if (/^(\s*(of)?\s*(father|mother|husband|wife|spouse))/.test(after)) continue;
    return label;
  }
  return null;
}
