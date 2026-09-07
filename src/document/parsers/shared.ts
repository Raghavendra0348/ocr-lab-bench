import {
  getNearestRegion,
  getRegionsBelow,
  getRegionsNear,
  getRelativePosition,
  medianHeight,
} from "../spatial/spatialUtils";
import { findDates, hasDateLabel, isPlausibleBirthDate } from "../patterns/datePatterns";
import { findCertLabel, findGenericIds } from "../patterns/idPatterns";
import {
  cleanPersonName,
  findNameLabel,
  findRelationshipMarker,
  looksLikePersonName,
} from "../patterns/relationshipPatterns";
import type {
  ConfidenceComponents,
  DocumentTextRegion,
  FieldCandidate,
} from "../types";
import { combineConfidence } from "../types";

export function makeCandidate(params: {
  field: string;
  value: string;
  normalizedValue?: string;
  regions: DocumentTextRegion[];
  evidence: string[];
  extractionMethod: FieldCandidate["extractionMethod"];
  components: Omit<ConfidenceComponents, "ocr"> & { ocr?: number };
}): FieldCandidate {
  const ocr =
    params.components.ocr ??
    (params.regions.length
      ? params.regions.reduce((sum, r) => sum + r.confidence, 0) / params.regions.length
      : 0);
  const components: ConfidenceComponents = {
    ocr,
    pattern: params.components.pattern,
    spatial: params.components.spatial,
    documentType: params.components.documentType,
    relationship: params.components.relationship,
  };
  return {
    field: params.field,
    value: params.value,
    ...(params.normalizedValue ? { normalizedValue: params.normalizedValue } : {}),
    confidence: combineConfidence(components),
    components,
    sourceRegionIds: params.regions.map((r) => r.id),
    evidence: params.evidence,
    extractionMethod: params.extractionMethod,
  };
}

/** Strategy A — explicit label ("Name: X", or label with the value beside/below). */
export function labelledNameCandidates(
  regions: DocumentTextRegion[],
  documentType: number,
): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const region of regions) {
    const label = findNameLabel(region.text);
    if (!label) continue;
    const lower = region.text.toLowerCase();
    const after = region.text.slice(lower.indexOf(label) + label.length).replace(/^[\s:.\-–—=|]+/, "");
    const inline = cleanPersonName(after);
    if (looksLikePersonName(inline)) {
      out.push(
        makeCandidate({
          field: "name",
          value: inline,
          regions: [region],
          evidence: [`Explicit label "${label}" on the same text region`, `Source text: "${region.text}"`],
          extractionMethod: "label",
          components: { pattern: 0.95, spatial: 0.9, documentType, relationship: 0 },
        }),
      );
      continue;
    }
    const nearest = getNearestRegion(region, regions);
    if (nearest && looksLikePersonName(nearest.region.text)) {
      out.push(
        makeCandidate({
          field: "name",
          value: cleanPersonName(nearest.region.text),
          regions: [region, nearest.region],
          evidence: [
            `Explicit label "${label}" detected`,
            `Value taken from the nearest region ${nearest.relation} of the label`,
          ],
          extractionMethod: "label",
          components: { pattern: 0.9, spatial: nearest.relation === "right" ? 0.85 : 0.7, documentType, relationship: 0 },
        }),
      );
    }
  }
  return out;
}

/** Strategy B — relationship markers (S/O, D/O, W/O, C/O, Father:, ...). */
export function relationshipCandidates(
  regions: DocumentTextRegion[],
  documentType: number,
): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const region of regions) {
    const hit = findRelationshipMarker(region.text);
    if (!hit) continue;

    // Related person's name: after the marker, else the nearest region.
    const trailing = cleanPersonName(hit.trailing);
    if (looksLikePersonName(trailing)) {
      out.push(
        makeCandidate({
          field: hit.field,
          value: trailing,
          regions: [region],
          evidence: [
            `Detected "${hit.marker}" relationship marker (${hit.relation})`,
            `Name taken from the text following the marker: "${hit.trailing}"`,
          ],
          extractionMethod: "relationship-marker",
          components: { pattern: 0.9, spatial: 0.85, documentType, relationship: 0.95 },
        }),
      );
    } else {
      const nearest = getNearestRegion(region, regions);
      if (nearest && looksLikePersonName(nearest.region.text)) {
        out.push(
          makeCandidate({
            field: hit.field,
            value: cleanPersonName(nearest.region.text),
            regions: [region, nearest.region],
            evidence: [
              `Detected "${hit.marker}" relationship marker (${hit.relation})`,
              `Name taken from the region ${nearest.relation} of the marker`,
            ],
            extractionMethod: "relationship-marker",
            components: { pattern: 0.8, spatial: nearest.relation === "right" ? 0.8 : 0.65, documentType, relationship: 0.9 },
          }),
        );
      }
    }

    // The holder name is very often printed immediately BEFORE the marker,
    // either on the same region or on the line above.
    const leading = cleanPersonName(hit.leading);
    if (looksLikePersonName(leading)) {
      out.push(
        makeCandidate({
          field: "name",
          value: leading,
          regions: [region],
          evidence: [
            `Name printed immediately before the "${hit.marker}" marker on the same line`,
            `Marker implies the following name is the ${hit.relation}, so the leading name is the holder`,
          ],
          extractionMethod: "relationship-marker",
          components: { pattern: 0.85, spatial: 0.85, documentType, relationship: 0.85 },
        }),
      );
    } else {
      const above = regions
        .filter((r) => r.page === region.page && r.y + r.height <= region.y + region.height * 0.4)
        .sort((a, b) => b.y - a.y)[0];
      if (above && looksLikePersonName(above.text)) {
        out.push(
          makeCandidate({
            field: "name",
            value: cleanPersonName(above.text),
            regions: [above, region],
            evidence: [
              `Line directly above a "${hit.marker}" (${hit.relation}) marker`,
              "Holder name conventionally precedes the relationship line",
            ],
            extractionMethod: "relationship-marker",
            components: { pattern: 0.8, spatial: 0.75, documentType, relationship: 0.8 },
          }),
        );
      }
    }
  }
  return out;
}

/** Strategy C — spatial prominence. Never trusts size alone. */
export function spatialNameCandidates(
  regions: DocumentTextRegion[],
  documentType: number,
  expectedBands: Array<"top" | "upper-middle" | "lower-middle" | "bottom"> = ["top", "upper-middle"],
): FieldCandidate[] {
  const median = medianHeight(regions);
  const out: FieldCandidate[] = [];
  for (const region of regions) {
    if (!looksLikePersonName(region.text)) continue;
    if (findNameLabel(region.text)) continue;
    if (findRelationshipMarker(region.text)) continue;
    const position = getRelativePosition(region, regions);
    const prominence = region.height / Math.max(1, median);
    const inBand = expectedBands.includes(position.band);

    const evidence: string[] = [];
    let spatial = 0.35;
    if (prominence >= 1.25) {
      spatial += 0.2;
      evidence.push(`Text is ${prominence.toFixed(2)}× the median line height on the page`);
    } else {
      evidence.push(`Text height is ordinary (${prominence.toFixed(2)}× median) — size alone is not used as proof`);
    }
    if (inBand) {
      spatial += 0.25;
      evidence.push(`Located in the ${position.band} band, an expected holder-name area`);
    } else {
      evidence.push(`Located in the ${position.band} band, outside the usual holder-name area`);
    }
    const neighbours = getRegionsNear(region, regions, 3);
    const supportive = neighbours.filter((n) => /birth|dob|male|female|gender|father|s\s*\/\s*o|d\s*\/\s*o/i.test(n.text));
    if (supportive.length > 0) {
      spatial += 0.15;
      evidence.push(`Surrounded by identity fields (${supportive.map((n) => n.text).slice(0, 2).join(", ")})`);
    }
    if (/^[A-Z][A-Z\s.'-]+$/.test(region.text.trim()) && region.text.trim().length > 4) {
      evidence.push("Printed in all capitals, typical for a printed holder name");
    }

    out.push(
      makeCandidate({
        field: "name",
        value: cleanPersonName(region.text),
        regions: [region],
        evidence,
        extractionMethod: "spatial",
        components: {
          pattern: 0.6,
          spatial: Math.min(0.95, spatial),
          documentType,
          relationship: 0,
        },
      }),
    );
  }
  return out;
}

export function dobCandidates(
  regions: DocumentTextRegion[],
  documentType: number,
): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const region of regions) {
    const dates = findDates(region.text);
    const labelInSameRegion = hasDateLabel(region.text);
    for (const date of dates) {
      // A bare year inside an identifier ("BC/2024/887123") is not a birth date.
      if (date.yearOnly && !labelInSameRegion && /[A-Za-z]{2}[-/]|[-/]\d{4}[-/]/.test(region.text)) {
        continue;
      }
      const plausible = isPlausibleBirthDate(date);
      const evidence: string[] = [`Date pattern "${date.raw}" detected`];

      let spatial = 0.4;
      let pattern = date.valid ? 0.8 : 0.4;
      const sources = [region];

      if (date.yearOnly) {
        pattern -= 0.2;
        evidence.push("Only a year was printed (no day/month)");
      }
      if (labelInSameRegion) {
        spatial = 0.95;
        pattern += 0.1;
        evidence.push(`Date-of-birth label "${labelInSameRegion}" on the same text region`);
      } else {
        const near = [
          ...regions.filter(
            (r) => r.page === region.page && Math.abs(r.y + r.height / 2 - (region.y + region.height / 2)) <= region.height,
          ),
          ...regions.filter((r) => r.page === region.page && region.y - (r.y + r.height) > 0 && region.y - (r.y + r.height) < region.height * 2),
        ];
        const labelled = near.find((r) => hasDateLabel(r.text));
        if (labelled) {
          spatial = 0.8;
          sources.unshift(labelled);
          evidence.push(`Date-of-birth label found in an adjacent region ("${labelled.text}")`);
        } else {
          evidence.push("No date-of-birth label nearby — unlabelled date candidate");
        }
      }
      if (!date.valid) evidence.push("Date does not form a valid calendar date");
      if (!plausible) {
        evidence.push("Year is not plausible as a date of birth (age outside 0–120)");
        pattern = Math.min(pattern, 0.35);
      } else {
        evidence.push("Year is plausible as a date of birth");
      }

      out.push(
        makeCandidate({
          field: "dob",
          value: date.raw,
          ...(date.iso ? { normalizedValue: date.iso } : {}),
          regions: sources,
          evidence,
          extractionMethod: labelInSameRegion ? "label" : "pattern",
          components: {
            pattern: Math.max(0, Math.min(0.95, pattern)),
            spatial,
            documentType,
            relationship: 0,
          },
        }),
      );
    }
  }
  return out;
}

export function certificateNumberCandidates(
  regions: DocumentTextRegion[],
  documentType: number,
): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const region of regions) {
    const label = findCertLabel(region.text);
    if (label) {
      const after = region.text
        .toUpperCase()
        .slice(region.text.toLowerCase().replace(/\s+/g, " ").indexOf(label) + label.length);
      const inline = findGenericIds(after)[0];
      if (inline) {
        out.push(
          makeCandidate({
            field: "certificateNumber",
            value: inline.raw,
            normalizedValue: inline.normalized,
            regions: [region],
            evidence: [`Label "${label}" with an identifier on the same region`, `Source text: "${region.text}"`],
            extractionMethod: "label",
            components: { pattern: 0.9, spatial: 0.9, documentType, relationship: 0 },
          }),
        );
        continue;
      }
      const nearest = getNearestRegion(region, regions);
      const near = nearest ? findGenericIds(nearest.region.text)[0] : undefined;
      if (nearest && near) {
        out.push(
          makeCandidate({
            field: "certificateNumber",
            value: near.raw,
            normalizedValue: near.normalized,
            regions: [region, nearest.region],
            evidence: [`Label "${label}" detected`, `Identifier taken from the region ${nearest.relation} of the label`],
            extractionMethod: "label",
            components: { pattern: 0.85, spatial: nearest.relation === "right" ? 0.85 : 0.7, documentType, relationship: 0 },
          }),
        );
        continue;
      }
    }

    // Unlabelled identifier: allowed as a candidate, but deliberately weak.
    if (!label) {
      for (const id of findGenericIds(region.text)) {
        if (findDates(region.text).some((d) => d.raw.includes(id.raw))) continue;
        const below = getRegionsBelow(region, regions);
        const evidence = [
          `Identifier-shaped text "${id.raw}" with no nearby label`,
          "Unlabelled numbers are not declared to be certificate numbers on pattern evidence alone",
        ];
        if (below.some((r) => findCertLabel(r.text))) {
          evidence.push("A certificate-number label appears below this region");
        }
        out.push(
          makeCandidate({
            field: "certificateNumber",
            value: id.raw,
            normalizedValue: id.normalized,
            regions: [region],
            evidence,
            extractionMethod: "pattern",
            components: { pattern: 0.45, spatial: 0.3, documentType, relationship: 0 },
          }),
        );
      }
    }
  }
  return out;
}

export function genderCandidates(
  regions: DocumentTextRegion[],
  documentType: number,
): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const region of regions) {
    const match = /\b(male|female|transgender|पुरुष|महिला)\b/i.exec(region.text);
    if (!match) continue;
    out.push(
      makeCandidate({
        field: "gender",
        value: match[1]!.toUpperCase(),
        regions: [region],
        evidence: [`Gender keyword "${match[1]}" detected`, `Source text: "${region.text}"`],
        extractionMethod: "pattern",
        components: { pattern: 0.9, spatial: 0.6, documentType, relationship: 0 },
      }),
    );
  }
  return out;
}

/** Best candidate per field, plus every candidate sorted best-first. */
export function reduceCandidates(candidates: FieldCandidate[]): {
  fields: Record<string, FieldCandidate>;
  candidates: FieldCandidate[];
  warnings: string[];
} {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const fields: Record<string, FieldCandidate> = {};
  const warnings: string[] = [];

  for (const candidate of sorted) {
    const current = fields[candidate.field];
    if (!current) {
      fields[candidate.field] = candidate;
      continue;
    }
    if (current.value.toLowerCase() === candidate.value.toLowerCase()) continue;
    // Ambiguity guard: near-equal competing values must not be silently picked.
    if (current.confidence - candidate.confidence < 0.06) {
      warnings.push(
        `Ambiguous ${candidate.field}: "${current.value}" (${(current.confidence * 100).toFixed(0)}%) vs "${candidate.value}" (${(candidate.confidence * 100).toFixed(0)}%) — manual review recommended.`,
      );
    }
  }

  // The same string must not win two different person fields.
  const nameValue = fields["name"]?.value.toLowerCase();
  for (const key of ["fatherName", "spouseName", "careOfName", "motherName"]) {
    const entry = fields[key];
    if (entry && nameValue && entry.value.toLowerCase() === nameValue) {
      warnings.push(
        `"${entry.value}" was selected for both the holder name and ${key} — the weaker assignment was dropped.`,
      );
      if ((fields["name"]?.confidence ?? 0) >= entry.confidence) delete fields[key];
      else delete fields["name"];
    }
  }

  return { fields, candidates: sorted, warnings };
}
