import { findAadhaarNumbers } from "../patterns/idPatterns";
import {
  cleanPersonName,
  findRelationshipMarker,
  looksLikePersonName,
} from "../patterns/relationshipPatterns";
import { getRegionsAbove, getRelativePosition } from "../spatial/spatialUtils";

import type {
  DocumentClassification,
  DocumentParser,
  DocumentTextRegion,
  ParsedDocument,
} from "../types";
import {
  dobCandidates,
  genderCandidates,
  labelledNameCandidates,
  makeCandidate,
  reduceCandidates,
  relationshipCandidates,
  spatialNameCandidates,
} from "./shared";

/**
 * Aadhaar layout template: the holder name sits above the DOB/gender block,
 * and the 12-digit number sits near the bottom of the card.
 */
export const AadhaarParser: DocumentParser = {
  name: "AadhaarParser",
  parse(regions: DocumentTextRegion[], classification: DocumentClassification): ParsedDocument {
    const dt = classification.confidence;
    const candidates = [
      ...labelledNameCandidates(regions, dt),
      ...relationshipCandidates(regions, dt),
      ...spatialNameCandidates(regions, dt, ["top", "upper-middle", "lower-middle"]),
      ...dobCandidates(regions, dt),
      ...genderCandidates(regions, dt),
    ];

    // Document-template rule: name immediately above a DOB / gender line.
    const anchor = regions.find((r) => /date of birth|year of birth|\bdob\b|\bmale\b|\bfemale\b/i.test(r.text));
    if (anchor) {
      // Walk upwards past relationship lines (S/O, D/O, Father's Name …):
      // those carry a related person's name, never the holder's own.
      const above = getRegionsAbove(anchor, regions, 4).find(
        (region) => !findRelationshipMarker(region.text) && looksLikePersonName(region.text),
      );
      if (above) {
        const cleaned = cleanPersonName(above.text);
        if (cleaned.length >= 3) {

          candidates.push(
            makeCandidate({
              field: "name",
              value: cleaned,
              regions: [above, anchor],
              evidence: [
                "Aadhaar layout template: holder name is printed directly above the date-of-birth / gender line",
                `Anchor region text: "${anchor.text}"`,
              ],
              extractionMethod: "document-template",
              components: { pattern: 0.8, spatial: 0.9, documentType: dt, relationship: 0 },
            }),
          );
        }
      }
    }

    for (const region of regions) {
      for (const id of findAadhaarNumbers(region.text)) {
        const position = getRelativePosition(region, regions);
        const evidence = [
          `12-digit Aadhaar pattern detected ("${id.raw}")`,
          `Normalized to ${id.normalized}`,
          `Located in the ${position.band} band of the page`,
        ];
        candidates.push(
          makeCandidate({
            field: "aadhaarNumber",
            value: id.raw,
            normalizedValue: id.normalized,
            regions: [region],
            evidence,
            extractionMethod: /aadhaar|\bvid\b/i.test(region.text) ? "label" : "pattern",
            components: {
              pattern: 0.95,
              spatial: position.band === "bottom" || position.band === "lower-middle" ? 0.85 : 0.6,
              documentType: dt,
              relationship: 0,
            },
          }),
        );
      }
    }

    const reduced = reduceCandidates(candidates);
    const warnings = [...reduced.warnings];
    if (!reduced.fields["aadhaarNumber"]) warnings.push("No 12-digit Aadhaar number was confidently detected.");
    if (!reduced.fields["name"]) warnings.push("No holder name could be confidently identified.");

    return {
      documentType: "aadhaar",
      classification,
      fields: reduced.fields,
      candidates: reduced.candidates,
      warnings,
    };
  },
};
