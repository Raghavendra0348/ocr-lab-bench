export interface DateMatch {
  raw: string;
  /** ISO YYYY-MM-DD when the parts form a valid calendar date. */
  iso: string | null;
  valid: boolean;
  /** Year-only values (Aadhaar "Year of Birth: 1992"). */
  yearOnly: boolean;
}

export const DATE_LABEL_WORDS = [
  "date of birth",
  "dateofbirth",
  "birth date",
  "d.o.b",
  "d o b",
  "dob",
  "year of birth",
  "yob",
  "birth",
  "जन्म",
];

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const NUMERIC_DMY = /\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/g;
const ISO_YMD = /\b(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/g;
const TEXTUAL = /\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]?\s*(\d{2,4})\b/g;
const YEAR_ONLY = /\b(19\d{2}|20\d{2})\b/g;

function isValid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1900 || y > 2100) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function expandYear(value: string): number {
  const n = Number(value);
  if (value.length === 4) return n;
  return n <= 30 ? 2000 + n : 1900 + n;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Deterministic date detection. Returns every distinct candidate found. */
export function findDates(text: string): DateMatch[] {
  const found: DateMatch[] = [];
  const push = (match: DateMatch) => {
    if (!found.some((f) => f.raw === match.raw)) found.push(match);
  };

  for (const m of text.matchAll(ISO_YMD)) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    push({ raw: m[0].trim(), iso: isValid(y, mo, d) ? iso(y, mo, d) : null, valid: isValid(y, mo, d), yearOnly: false });
  }

  for (const m of text.matchAll(NUMERIC_DMY)) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = expandYear(m[3]!);
    // Indian documents are day-first; fall back to month-first only when the
    // day-first reading is impossible.
    if (isValid(y, mo, d)) push({ raw: m[0].trim(), iso: iso(y, mo, d), valid: true, yearOnly: false });
    else if (isValid(y, d, mo)) push({ raw: m[0].trim(), iso: iso(y, d, mo), valid: true, yearOnly: false });
    else push({ raw: m[0].trim(), iso: null, valid: false, yearOnly: false });
  }

  for (const m of text.matchAll(TEXTUAL)) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2]!.slice(0, 4).toLowerCase()] ?? MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    const y = expandYear(m[3]!);
    if (mo && isValid(y, mo, d)) push({ raw: m[0].trim(), iso: iso(y, mo, d), valid: true, yearOnly: false });
  }

  if (found.length === 0) {
    for (const m of text.matchAll(YEAR_ONLY)) {
      push({ raw: m[0], iso: null, valid: true, yearOnly: true });
    }
  }

  return found;
}

/** True when the date could plausibly be a person's date of birth. */
export function isPlausibleBirthDate(match: DateMatch, now = new Date()): boolean {
  const year = match.iso ? Number(match.iso.slice(0, 4)) : Number(match.raw.match(/\d{4}/)?.[0] ?? 0);
  if (!year) return false;
  const age = now.getUTCFullYear() - year;
  return age >= 0 && age <= 120;
}

export function hasDateLabel(text: string): string | null {
  const lower = text.toLowerCase();
  for (const word of DATE_LABEL_WORDS) {
    if (lower.includes(word)) return word;
  }
  return null;
}
