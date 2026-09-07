import { findAadhaarNumbers, findPanNumbers } from "../patterns/idPatterns";
import type {
  DocumentClassification,
  DocumentParser,
  DocumentTextRegion,
  ParsedDocument,
} from "../types";
import {
  certificateNumberCandidates,
  dobCandidates,
  genderCandidates,
  labelledNameCandidates,
  makeCandidate,
  reduceCandidates,
  relationshipCandidates,
  spatialNameCandidates,
} from "./shared";

/**
 * Used for certificates and for unknown documents. It never fails: it emits
 * lower-confidence candidates and flags manual review.
 */
export function makeGenericParser(kind: "certificate" | "unknown"): DocumentParser {
  return {
    name: kind === "certificate" ? "GenericCertificateParser" : "GenericDocumentParser",
    parse(regions: DocumentTextRegion[], classification: DocumentClassification): ParsedDocument {
      // An unknown document type must not lend confidence to its candidates.
      const dt = kind === "unknown" ? Math.min(0.4, classification.confidence) : classification.confidence;

      const candidates = [
        ...labelledNameCandidates(regions, dt),
        ...relationshipCandidates(regions, dt),
        ...spatialNameCandidates(regions, dt, ["top", "upper-middle", "lower-middle"]),
        ...dobCandidates(regions, dt),
        ...certificateNumberCandidates(regions, dt),
        ...genderCandidates(regions, dt),
      ];

      // Certificates sometimes also carry an Aadhaar or PAN reference.
      for (const region of regions) {
        for (const id of findAadhaarNumbers(region.text)) {
          candidates.push(
            makeCandidate({
              field: "aadhaarNumber",
              value: id.raw,
              normalizedValue: id.normalized,
              regions: [region],
              evidence: [`12-digit Aadhaar-shaped number detected on a ${kind} document ("${id.raw}")`],
              extractionMethod: "pattern",
              components: { pattern: 0.75, spatial: 0.4, documentType: dt, relationship: 0 },
            }),
          );
        }
        for (const id of findPanNumbers(region.text)) {
          candidates.push(
            makeCandidate({
              field: "panNumber",
              value: id.normalized,
              normalizedValue: id.normalized,
              regions: [region],
              evidence: [`PAN-shaped identifier detected on a ${kind} document ("${id.raw}")`],
              extractionMethod: "pattern",
              components: { pattern: 0.7, spatial: 0.4, documentType: dt, relationship: 0 },
            }),
          );
        }
      }

      const reduced = reduceCandidates(candidates);
      const warnings = [...reduced.warnings];
      if (kind === "unknown") {
        warnings.unshift(
          "Document type could not be determined — generic extraction was used. Manual review recommended.",
        );
      }
      const nameCandidates = reduced.candidates.filter((c) => c.field === "name");
      if (nameCandidates.length > 2) {
        warnings.push(
          `${nameCandidates.length} name candidates were found on this document — the highest-scoring one is shown, but the first name on the page was not assumed.`,
        );
      }
      if (Object.keys(reduced.fields).length === 0) {
        warnings.push("No field candidates could be generated from the extracted text.");
      }

      return {
        documentType: kind,
        classification,
        fields: reduced.fields,
        candidates: reduced.candidates,
        warnings,
      };
    },
  };
}

export const GenericCertificateParser = makeGenericParser("certificate");
export const GenericDocumentParser = makeGenericParser("unknown");
