export interface IdMatch {
  raw: string;
  normalized: string;
}

/** 12 digits, optionally in 4-4-4 groups. */
const AADHAAR = /\b(\d{4}\s?\d{4}\s?\d{4})\b/g;
/** 5 letters, 4 digits, 1 letter. */
const PAN = /\b([A-Z]{5}\s?\d{4}\s?[A-Z])\b/g;
/** Mixed alphanumeric identifiers with at least one digit and a separator or length. */
const GENERIC_ID = /\b([A-Z]{1,6}[-/]?\d[A-Z0-9\-/]{3,})\b/g;
const LONG_NUMBER = /\b(\d{6,})\b/g;

export const CERT_LABELS = [
  "certificate number",
  "certificate no",
  "certificate id",
  "cert number",
  "cert no",
  "application number",
  "application no",
  "registration number",
  "registration no",
  "enrollment no",
  "enrolment no",
  "document number",
  "document no",
  "serial no",
  "reg no",
  "app no",
];

function dedupe(matches: IdMatch[]): IdMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    if (seen.has(m.normalized)) return false;
    seen.add(m.normalized);
    return true;
  });
}

export function findAadhaarNumbers(text: string): IdMatch[] {
  const out: IdMatch[] = [];
  for (const m of text.matchAll(AADHAAR)) {
    const normalized = m[1]!.replace(/\s/g, "");
    if (normalized.length !== 12) continue;
    // Aadhaar never starts with 0 or 1.
    if (/^[01]/.test(normalized)) continue;
    out.push({ raw: m[1]!.trim(), normalized });
  }
  return dedupe(out);
}

export function findPanNumbers(text: string): IdMatch[] {
  const out: IdMatch[] = [];
  for (const m of text.toUpperCase().matchAll(PAN)) {
    const normalized = m[1]!.replace(/\s/g, "");
    if (normalized.length !== 10) continue;
    out.push({ raw: m[1]!.trim(), normalized });
  }
  return dedupe(out);
}

export function findGenericIds(text: string): IdMatch[] {
  const out: IdMatch[] = [];
  for (const m of text.toUpperCase().matchAll(GENERIC_ID)) {
    out.push({ raw: m[1]!.trim(), normalized: m[1]!.replace(/[^A-Z0-9]/g, "") });
  }
  for (const m of text.matchAll(LONG_NUMBER)) {
    out.push({ raw: m[1]!, normalized: m[1]! });
  }
  return dedupe(out).filter((m) => m.normalized.length >= 5);
}

export function findCertLabel(text: string): string | null {
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  for (const label of CERT_LABELS) {
    if (lower.includes(label)) return label;
  }
  return null;
}
