import { findAadhaarNumbers, findCertLabel, findPanNumbers } from "./patterns/idPatterns";
import { findDates } from "./patterns/datePatterns";
import type { DocumentClassification, DocumentTextRegion } from "./types";

/**
 * Deterministic, rule-based document classifier. No AI model is involved: it
 * scores keyword signals, identifier patterns and simple layout signals.
 */
export function classifyDocument(regions: DocumentTextRegion[]): DocumentClassification {
  const joined = regions
    .map((r) => r.text)
    .join("\n")
    .replace(/\s+/g, " ");
  const lower = joined.toLowerCase();

  const aadhaar = { score: 0, evidence: [] as string[] };
  const pan = { score: 0, evidence: [] as string[] };
  const certificate = { score: 0, evidence: [] as string[] };

  // ---- Aadhaar signals
  if (/\baadhaar\b|\baadhar\b|\bआधार\b/i.test(joined)) {
    aadhaar.score += 0.4;
    aadhaar.evidence.push("Aadhaar keyword detected");
  }
  if (/unique identification authority/i.test(joined)) {
    aadhaar.score += 0.3;
    aadhaar.evidence.push("Unique Identification Authority of India text detected");
  }
  const aadhaarIds = findAadhaarNumbers(joined);
  if (aadhaarIds.length > 0) {
    aadhaar.score += 0.3;
    aadhaar.evidence.push(`12-digit numeric identifier detected (${aadhaarIds[0]!.raw})`);
  }
  if (/government of india|भारत सरकार/i.test(joined)) {
    aadhaar.score += 0.15;
    aadhaar.evidence.push("Government of India text detected");
    certificate.score += 0.02;
  }
  if (/\bvid\b|\benrol(?:l)?ment no\b/i.test(joined)) {
    aadhaar.score += 0.1;
    aadhaar.evidence.push("VID / enrolment number label detected");
  }
  if (/year of birth|\bdob\b|date of birth/i.test(joined) && aadhaarIds.length > 0) {
    aadhaar.score += 0.05;
    aadhaar.evidence.push("Date/year-of-birth field alongside a 12-digit identifier");
  }

  // ---- PAN signals
  if (/income\s*tax\s*department/i.test(joined)) {
    pan.score += 0.4;
    pan.evidence.push("Income Tax Department text detected");
  }
  if (/permanent account number/i.test(joined)) {
    pan.score += 0.3;
    pan.evidence.push("Permanent Account Number text detected");
  }
  const panIds = findPanNumbers(joined);
  if (panIds.length > 0) {
    pan.score += 0.35;
    pan.evidence.push(`10-character PAN pattern detected (${panIds[0]!.normalized})`);
  }
  if (/\bpan\b/i.test(joined)) {
    pan.score += 0.1;
    pan.evidence.push("PAN keyword detected");
  }
  if (/father'?s name/i.test(joined) && panIds.length > 0) {
    pan.score += 0.05;
    pan.evidence.push("Father's Name label alongside a PAN pattern");
  }

  // ---- Generic certificate signals
  const certWords = joined.match(
    /\bcertificate\b|\bmarksheet\b|\bmark sheet\b|\bdiploma\b|\bdegree\b|\bregistrar\b|\bboard of\b|\buniversity\b|\bissued\b|\baffidavit\b/gi,
  );
  if (certWords && certWords.length > 0) {
    certificate.score += Math.min(0.45, 0.18 * certWords.length);
    certificate.evidence.push(`Certificate-related keyword(s) detected: ${[...new Set(certWords.map((w) => w.toLowerCase()))].join(", ")}`);
  }
  const certLabel = findCertLabel(joined);
  if (certLabel) {
    certificate.score += 0.25;
    certificate.evidence.push(`Certificate/application number label detected ("${certLabel}")`);
  }
  const dates = findDates(joined);
  if (dates.length > 0) {
    certificate.score += 0.12;
    certificate.evidence.push(`${dates.length} date pattern(s) detected`);
  }
  if (regions.length >= 12) {
    certificate.score += 0.08;
    certificate.evidence.push(`Multi-field layout (${regions.length} text regions)`);
  }

  // Aadhaar/PAN cards are compact; a page with many regions leans certificate.
  if (regions.length > 40) {
    aadhaar.score -= 0.05;
    pan.score -= 0.05;
  }

  const ranked = [
    { type: "aadhaar" as const, ...aadhaar },
    { type: "pan" as const, ...pan },
    { type: "certificate" as const, ...certificate },
  ].sort((a, b) => b.score - a.score);

  const best = ranked[0]!;
  const runnerUp = ranked[1]!;
  const confidence = Math.max(0, Math.min(0.97, best.score));

  if (regions.length === 0) {
    return { type: "unknown", confidence: 0, evidence: ["No text regions available to classify"] };
  }

  // Insufficient or ambiguous evidence → unknown, handled by the generic parser.
  if (confidence < 0.45 || best.score - runnerUp.score < 0.1) {
    return {
      type: "unknown",
      confidence,
      evidence: [
        ...best.evidence,
        `Best guess "${best.type}" (${(best.score * 100).toFixed(0)}%) was not decisive against "${runnerUp.type}" (${(runnerUp.score * 100).toFixed(0)}%)`,
      ],
    };
  }

  if (lower.includes("aadhaar") && best.type === "certificate") {
    // Keep the evidence honest about the mixed signals.
    best.evidence.push("Note: Aadhaar keyword also present");
  }

  return { type: best.type, confidence, evidence: best.evidence };
}
