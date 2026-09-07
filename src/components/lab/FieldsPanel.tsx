import { Badge, Notice, Panel, Row, TextInput } from "./ui";
import type { ExtractedField } from "@/lib/fieldExtraction";
import { compareField } from "@/lib/textCompare";
import type { FieldComparison, MatchState } from "@/lib/textCompare";

export interface ExpectedValues {
  name: string;
  dob: string;
  certificateNumber: string;
}

const stateMeta: Record<MatchState, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  "strong-match": { label: "✓ Strong Match", tone: "success" },
  "possible-match": { label: "⚠ Possible Match — Review Required", tone: "warning" },
  "strong-mismatch": { label: "✗ Strong Mismatch", tone: "danger" },
  unreadable: { label: "? Could Not Read", tone: "neutral" },
};

export function FieldExtractionPanel({ fields }: { fields: ExtractedField[] | null }) {
  return (
    <Panel
      title="Can OCR support my document verification use case?"
      subtitle="Experimental, deterministic rule-based extraction: label matching, box geometry and regular expressions. No AI model is involved."
    >
      {!fields ? (
        <p className="text-sm text-muted-foreground">Run OCR to attempt field extraction.</p>
      ) : (
        <div className="space-y-3">
          {fields.map((field) => (
            <div key={field.key} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="label-caps">{field.label}</span>
                {field.value ? (
                  <Badge tone="accent">extraction confidence {(field.extractionConfidence * 100).toFixed(0)}%</Badge>
                ) : (
                  <Badge tone="neutral">Not confidently detected</Badge>
                )}
              </div>
              <p className="mt-1.5 font-mono text-base text-foreground">
                {field.value ?? "Not confidently detected"}
              </p>
              <div className="mt-2">
                <Row label="Matched label" value={field.matchedLabel ?? "—"} />
                <Row label="Source OCR line" value={field.sourceLine ?? "—"} />
                <Row
                  label="OCR confidence"
                  value={
                    field.ocrConfidence === null ? "—" : `${(field.ocrConfidence * 100).toFixed(1)}%`
                  }
                />
                <Row label="Rule used" value={field.strategy ?? "—"} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function ManualVerification({
  expected,
  onChange,
  fields,
}: {
  expected: ExpectedValues;
  onChange: (values: ExpectedValues) => void;
  fields: ExtractedField[] | null;
}) {
  const byKey = (key: string) => fields?.find((f) => f.key === key) ?? null;

  const comparisons: Array<{ label: string; comparison: FieldComparison | null }> = [
    {
      label: "Name",
      comparison: compareField({
        expected: expected.name,
        ocrValue: byKey("name")?.value ?? null,
        ocrConfidence: byKey("name")?.ocrConfidence ?? null,
        kind: "name",
      }),
    },
    {
      label: "DOB",
      comparison: compareField({
        expected: expected.dob,
        ocrValue: byKey("dob")?.value ?? null,
        ocrConfidence: byKey("dob")?.ocrConfidence ?? null,
        kind: "date",
      }),
    },
    {
      label: "Certificate Number",
      comparison: compareField({
        expected: expected.certificateNumber,
        ocrValue: byKey("certificateNumber")?.value ?? null,
        ocrConfidence: byKey("certificateNumber")?.ocrConfidence ?? null,
        kind: "id",
      }),
    },
  ];

  const anyExpected = comparisons.some((entry) => entry.comparison);

  return (
    <Panel
      title="Manual verification"
      subtitle="Type what the document actually says, then compare it with the extracted values. Values are normalized (case, whitespace, punctuation, date formats); names use fuzzy matching."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <TextInput
          label="Expected name"
          value={expected.name}
          onChange={(value) => onChange({ ...expected, name: value })}
          placeholder="Ramesh Kumar"
        />
        <TextInput
          label="Expected DOB"
          value={expected.dob}
          onChange={(value) => onChange({ ...expected, dob: value })}
          placeholder="12/04/2004"
          mono
        />
        <TextInput
          label="Expected certificate number"
          value={expected.certificateNumber}
          onChange={(value) => onChange({ ...expected, certificateNumber: value })}
          placeholder="ABC123456"
          mono
        />
      </div>

      <div className="mt-4 space-y-3">
        {!anyExpected && (
          <p className="text-sm text-muted-foreground">
            Enter at least one expected value to see a comparison.
          </p>
        )}
        {comparisons.map(({ label, comparison }) =>
          comparison ? (
            <div key={label} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="label-caps">{label}</span>
                <Badge tone={stateMeta[comparison.state].tone}>
                  {stateMeta[comparison.state].label}
                </Badge>
              </div>
              <Row label="Expected" value={comparison.expected} />
              <Row label="OCR" value={comparison.ocrValue ?? "not detected"} />
              <Row label="Similarity" value={`${(comparison.similarity * 100).toFixed(1)}%`} />
              <Row
                label="OCR confidence"
                value={
                  comparison.ocrConfidence === null
                    ? "—"
                    : `${(comparison.ocrConfidence * 100).toFixed(1)}%`
                }
              />
              <Row label="Note" value={comparison.note} />
            </div>
          ) : null,
        )}
        <Notice tone="info">
          A match here means the strings agree after normalization. It does not prove the document is
          genuine, and a field is never marked as a strong match while the source line's OCR
          confidence is below 75%.
        </Notice>
      </div>
    </Panel>
  );
}
