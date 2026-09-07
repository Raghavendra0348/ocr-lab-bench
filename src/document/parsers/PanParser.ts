import { findPanNumbers } from "../patterns/idPatterns";
import { getRegionsBelow, getRelativePosition } from "../spatial/spatialUtils";
import { looksLikePersonName, cleanPersonName } from "../patterns/relationshipPatterns";
import type {
  DocumentClassification,
  DocumentParser,
  DocumentTextRegion,
  ParsedDocument,
} from "../types";
import {
  dobCandidates,
  labelledNameCandidates,
  makeCandidate,
  reduceCandidates,
  relationshipCandidates,
  spatialNameCandidates,
} from "./shared";

/**
 * PAN card layout template: "Name" block, then "Father's Name", then
 * "Date of Birth", with the 10-character PAN printed prominently.
 */
export const PanParser: DocumentParser = {
  name: "PanParser",
  parse(regions: DocumentTextRegion[], classification: DocumentClassification): ParsedDocument {
    const dt = classification.confidence;
    const candidates = [
      ...labelledNameCandidates(regions, dt),
      ...relationshipCandidates(regions, dt),
      ...spatialNameCandidates(regions, dt, ["upper-middle", "lower-middle"]),
      ...dobCandidates(regions, dt),
    ];

    // Template rule: the label lines and value lines are stacked in order.
    const nameLabel = regions.find((r) => /^\s*name\s*$/i.test(r.text));
    if (nameLabel) {
      const below = getRegionsBelow(nameLabel, regions, 3)[0];
      if (below && looksLikePersonName(below.text)) {
        candidates.push(
          makeCandidate({
            field: "name",
            value: cleanPersonName(below.text),
            regions: [nameLabel, below],
            evidence: [
              "PAN layout template: the holder name is printed on the line below the standalone \"Name\" label",
            ],
            extractionMethod: "document-template",
            components: { pattern: 0.9, spatial: 0.9, documentType: dt, relationship: 0 },
          }),
        );
      }
    }

    for (const region of regions) {
      for (const id of findPanNumbers(region.text)) {
        const position = getRelativePosition(region, regions);
        candidates.push(
          makeCandidate({
            field: "panNumber",
            value: id.normalized,
            normalizedValue: id.normalized,
            regions: [region],
            evidence: [
              `10-character PAN pattern (AAAAA9999A) detected: "${id.raw}"`,
              `Located in the ${position.band} band of the page`,
            ],
            extractionMethod: /permanent account|\bpan\b/i.test(region.text) ? "label" : "pattern",
            components: { pattern: 0.95, spatial: 0.7, documentType: dt, relationship: 0 },
          }),
        );
      }
    }

    const reduced = reduceCandidates(candidates);
    const warnings = [...reduced.warnings];
    if (!reduced.fields["panNumber"]) warnings.push("No 10-character PAN pattern was confidently detected.");
    if (!reduced.fields["name"]) warnings.push("No holder name could be confidently identified.");

    return {
      documentType: "pan",
      classification,
      fields: reduced.fields,
      candidates: reduced.candidates,
      warnings,
    };
  },
};
