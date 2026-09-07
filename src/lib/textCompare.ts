export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,;:'"`_|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAlnum(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Normalizes common date formats to YYYY-MM-DD when possible. */
export function normalizeDate(value: string): string {
  const raw = value.trim();
  const months: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    sept: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };

  const iso = raw.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${pad(iso[2]!)}-${pad(iso[3]!)}`;

  const dmy = raw.match(/\b(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})\b/);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? `19${dmy[3]}`.slice(-4) : dmy[3]!;
    return `${year}-${pad(dmy[2]!)}-${pad(dmy[1]!)}`;
  }

  const textual = raw.match(/\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})\b/);
  if (textual) {
    const month = months[textual[2]!.slice(0, 4).toLowerCase()] ?? months[textual[2]!.slice(0, 3).toLowerCase()];
    if (month) {
      const year = textual[3]!.length === 2 ? `19${textual[3]}`.slice(-4) : textual[3]!;
      return `${year}-${month}-${pad(textual[1]!)}`;
    }
  }

  return normalizeText(raw);
}

function pad(value: string): string {
  return value.padStart(2, "0");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(prev[j]! + 1, current[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = current;
  }
  return prev[b.length]!;
}

/** 0..1 similarity based on normalized edit distance. */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (!max) return 0;
  return 1 - levenshtein(a, b) / max;
}

/** Order-insensitive fuzzy match for person names. */
export function nameSimilarity(expected: string, actual: string): number {
  const e = normalizeText(expected);
  const a = normalizeText(actual);
  if (!e || !a) return 0;
  const direct = similarity(e, a);
  const sortedE = e.split(" ").sort().join(" ");
  const sortedA = a.split(" ").sort().join(" ");
  return Math.max(direct, similarity(sortedE, sortedA));
}

export interface AccuracyScore {
  characterAccuracy: number;
  wordAccuracy: number;
  editDistance: number;
  groundTruthChars: number;
  groundTruthWords: number;
}

export function scoreAccuracy(groundTruth: string, ocrText: string): AccuracyScore {
  const gt = normalizeText(groundTruth);
  const ocr = normalizeText(ocrText);
  const distance = levenshtein(gt, ocr);
  const characterAccuracy = gt.length ? Math.max(0, 1 - distance / gt.length) : 0;

  const gtWords = gt ? gt.split(" ") : [];
  const ocrWords = ocr ? ocr.split(" ") : [];
  const wordDistance = wordLevelDistance(gtWords, ocrWords);
  const wordAccuracy = gtWords.length ? Math.max(0, 1 - wordDistance / gtWords.length) : 0;

  return {
    characterAccuracy,
    wordAccuracy,
    editDistance: distance,
    groundTruthChars: gt.length,
    groundTruthWords: gtWords.length,
  };
}

function wordLevelDistance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(prev[j]! + 1, current[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = current;
  }
  return prev[b.length]!;
}

export type MatchState = "strong-match" | "possible-match" | "strong-mismatch" | "unreadable";

export interface FieldComparison {
  expected: string;
  ocrValue: string | null;
  similarity: number;
  ocrConfidence: number | null;
  state: MatchState;
  note: string;
}

export function compareField(params: {
  expected: string;
  ocrValue: string | null;
  ocrConfidence: number | null;
  kind: "name" | "date" | "id";
}): FieldComparison | null {
  const expected = params.expected.trim();
  if (!expected) return null;

  if (!params.ocrValue) {
    return {
      expected,
      ocrValue: null,
      similarity: 0,
      ocrConfidence: null,
      state: "unreadable",
      note: "OCR did not produce a value for this field.",
    };
  }

  let score: number;
  if (params.kind === "name") {
    score = nameSimilarity(expected, params.ocrValue);
  } else if (params.kind === "date") {
    score = normalizeDate(expected) === normalizeDate(params.ocrValue)
      ? 1
      : similarity(normalizeDate(expected), normalizeDate(params.ocrValue));
  } else {
    score = normalizeAlnum(expected) === normalizeAlnum(params.ocrValue)
      ? 1
      : similarity(normalizeAlnum(expected), normalizeAlnum(params.ocrValue));
  }

  const confidence = params.ocrConfidence ?? 0;
  let state: MatchState;
  let note: string;

  if (confidence < 0.75) {
    state = score >= 0.9 ? "possible-match" : "unreadable";
    note = "OCR confidence for the source line is low — do not treat this as verified.";
  } else if (score >= 0.95) {
    state = "strong-match";
    note = "Normalized values agree.";
  } else if (score >= 0.8) {
    state = "possible-match";
    note = "Values are close but not identical after normalization.";
  } else {
    state = "strong-mismatch";
    note = "Values differ substantially.";
  }

  return {
    expected,
    ocrValue: params.ocrValue,
    similarity: score,
    ocrConfidence: params.ocrConfidence,
    state,
    note,
  };
}
