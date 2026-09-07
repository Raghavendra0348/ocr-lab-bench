import { useState } from "react";
import { Badge, Button, Metric, Notice, Panel, Row } from "./ui";
import type { FieldCandidate, ParsedDocument, DocumentTextRegion } from "@/document/types";
import { CANDIDATE_STATE_LABEL, FIELD_LABELS, candidateState } from "@/document/types";

const FIELD_ORDER = [
  "name",
  "fatherName",
  "motherName",
  "spouseName",
  "careOfName",
  "dob",
  "gender",
  "aadhaarNumber",
  "panNumber",
  "certificateNumber",
];

const TYPE_LABEL: Record<string, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN",
  certificate: "Certificate / general document",
  unknown: "Unknown",
};

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function stateTone(candidate: FieldCandidate | null) {
  const state = candidateState(candidate);
  return state === "high" ? "success" : state === "review" ? "warning" : "neutral";
}

export function DocumentUnderstandingPanel({
  parsed,
  parserName,
  regions,
  selectedField,
  onSelectField,
}: {
  parsed: ParsedDocument | null;
  parserName: string | null;
  regions: DocumentTextRegion[];
  selectedField: string | null;
  onSelectField: (field: string | null) => void;
}) {
  const [openWhy, setOpenWhy] = useState<string | null>(null);

  if (!parsed) {
    return (
      <Panel
        title="Document Understanding"
        subtitle="Deterministic classification and field candidates over the unified text regions. No AI model, no external API."
      >
        <p className="text-sm text-muted-foreground">
          Run the pipeline on an image or PDF to see the document type and field candidates.
        </p>
      </Panel>
    );
  }

  const present = FIELD_ORDER.filter((field) => parsed.fields[field]);
  const extraFields = Object.keys(parsed.fields).filter((field) => !FIELD_ORDER.includes(field));
  const ordered = [...present, ...extraFields];

  return (
    <Panel
      title="Document Understanding"
      subtitle="Deterministic classification and field candidates over the unified text regions. No AI model, no external API."
      actions={
        <>
          <Badge tone={parsed.documentType === "unknown" ? "warning" : "accent"}>
            {TYPE_LABEL[parsed.documentType] ?? parsed.documentType}
          </Badge>
          <Badge tone="neutral">{parserName ?? "—"}</Badge>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Document type" value={TYPE_LABEL[parsed.documentType] ?? parsed.documentType} />
        <Metric
          label="Classification confidence"
          value={pct(parsed.classification.confidence)}
          tone={parsed.classification.confidence >= 0.7 ? "success" : "warning"}
        />
        <Metric label="Text regions" value={String(regions.length)} hint={`${regions.filter((r) => r.source === "pdf-text").length} from PDF text layer`} />
      </div>

      <div className="mt-4">
        <span className="label-caps">Classification evidence</span>
        <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
          {parsed.classification.evidence.length === 0 && <li>• No positive signals found.</li>}
          {parsed.classification.evidence.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </div>

      <div className="mt-5">
        <span className="label-caps">Identified fields</span>
        {ordered.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No field candidates were generated from this document.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {ordered.map((field) => {
              const candidate = parsed.fields[field]!;
              const isSelected = selectedField === field;
              return (
                <div
                  key={field}
                  className={`rounded-lg border bg-surface p-4 transition-colors ${
                    isSelected ? "border-accent" : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="label-caps">{FIELD_LABELS[field] ?? field}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={stateTone(candidate)}>{CANDIDATE_STATE_LABEL[candidateState(candidate)]}</Badge>
                      <Badge tone="accent">{pct(candidate.confidence)} extraction confidence</Badge>
                    </div>
                  </div>
                  <p className="mt-1.5 font-mono text-base text-foreground">{candidate.value}</p>
                  {candidate.normalizedValue && candidate.normalizedValue !== candidate.value && (
                    <p className="font-mono text-xs text-muted-foreground">
                      normalized: {candidate.normalizedValue}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant={openWhy === field ? "primary" : "default"}
                      onClick={() => setOpenWhy((current) => (current === field ? null : field))}
                    >
                      Why?
                    </Button>
                    <Button
                      variant={isSelected ? "primary" : "ghost"}
                      onClick={() => onSelectField(isSelected ? null : field)}
                    >
                      {isSelected ? "Highlighting on document" : "Highlight on document"}
                    </Button>
                  </div>

                  {openWhy === field && (
                    <div className="mt-3 rounded-md border border-border bg-background p-3">
                      <Row label="Extraction method" value={candidate.extractionMethod} />
                      <Row label="Source region IDs" value={candidate.sourceRegionIds.join(", ") || "—"} />
                      <Row
                        label="Source text"
                        value={
                          candidate.sourceRegionIds
                            .map((id) => regions.find((r) => r.id === id)?.text ?? "—")
                            .join(" ⟶ ") || "—"
                        }
                      />
                      <Row
                        label="Bounding region"
                        value={candidate.sourceRegionIds
                          .map((id) => {
                            const region = regions.find((r) => r.id === id);
                            return region
                              ? `${id}: x=${Math.round(region.x)} y=${Math.round(region.y)} w=${Math.round(region.width)} h=${Math.round(region.height)}`
                              : id;
                          })
                          .join(" · ")}
                      />
                      <Row
                        label="Source"
                        value={
                          candidate.sourceRegionIds
                            .map((id) => regions.find((r) => r.id === id)?.source ?? "—")
                            .join(", ") || "—"
                        }
                      />
                      <div className="mt-3">
                        <span className="label-caps">Confidence components</span>
                        <Row label="OCR / text-layer confidence" value={pct(candidate.components.ocr)} />
                        <Row label="Pattern match" value={pct(candidate.components.pattern)} />
                        <Row label="Spatial evidence" value={pct(candidate.components.spatial)} />
                        <Row label="Document classification" value={pct(candidate.components.documentType)} />
                        <Row
                          label="Relationship evidence"
                          value={candidate.components.relationship === 0 ? "none" : pct(candidate.components.relationship)}
                        />
                        <Row label="Overall extraction confidence" value={pct(candidate.confidence)} />
                      </div>
                      <div className="mt-3">
                        <span className="label-caps">Evidence</span>
                        <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                          {candidate.evidence.map((item) => (
                            <li key={item}>• {item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {parsed.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {parsed.warnings.map((warning) => (
            <Notice key={warning} tone="warning">
              {warning}
            </Notice>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Notice tone="info">
          These are extraction candidates, not a verification result. Nothing here proves the document
          is genuine — verification only happens after comparison with the form data below.
        </Notice>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          All candidates ({parsed.candidates.length}) — including the ones that were not selected
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="label-caps">
              <tr>
                <th className="py-1.5 pr-3">Field</th>
                <th className="py-1.5 pr-3">Value</th>
                <th className="py-1.5 pr-3">Method</th>
                <th className="py-1.5 pr-3">Conf.</th>
                <th className="py-1.5 pr-3">Regions</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {parsed.candidates.map((candidate, index) => (
                <tr key={`${candidate.field}-${index}`} className="border-t border-border">
                  <td className="py-1.5 pr-3">{candidate.field}</td>
                  <td className="py-1.5 pr-3">{candidate.value}</td>
                  <td className="py-1.5 pr-3">{candidate.extractionMethod}</td>
                  <td className="py-1.5 pr-3">{pct(candidate.confidence)}</td>
                  <td className="py-1.5 pr-3">{candidate.sourceRegionIds.join(",")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}
