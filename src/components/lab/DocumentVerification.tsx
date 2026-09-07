import { Badge, Notice, Panel, Row, TextInput } from "./ui";
import type { ParsedDocument } from "@/document/types";
import { FIELD_LABELS, candidateState } from "@/document/types";
import { compareField } from "@/lib/textCompare";
import type { MatchState } from "@/lib/textCompare";

export interface FormValues {
  name: string;
  fatherName: string;
  dob: string;
  idNumber: string;
}

export const EMPTY_FORM: FormValues = { name: "", fatherName: "", dob: "", idNumber: "" };

const stateMeta: Record<MatchState, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  "strong-match": { label: "✓ Strong Match", tone: "success" },
  "possible-match": { label: "⚠ Possible Match — Review Required", tone: "warning" },
  "strong-mismatch": { label: "✗ Strong Mismatch", tone: "danger" },
  unreadable: { label: "? Could Not Read", tone: "neutral" },
};

export function DocumentVerification({
  parsed,
  values,
  onChange,
}: {
  parsed: ParsedDocument | null;
  values: FormValues;
  onChange: (values: FormValues) => void;
}) {
  const candidate = (field: string) => parsed?.fields[field] ?? null;
  const idCandidate =
    candidate("aadhaarNumber") ?? candidate("panNumber") ?? candidate("certificateNumber");
  const idLabel = candidate("aadhaarNumber")
    ? FIELD_LABELS["aadhaarNumber"]!
    : candidate("panNumber")
      ? FIELD_LABELS["panNumber"]!
      : FIELD_LABELS["certificateNumber"] ?? "ID number";

  const rows = [
    { label: "Name", expected: values.name, cand: candidate("name"), kind: "name" as const },
    {
      label: "Father / guardian name",
      expected: values.fatherName,
      cand: candidate("fatherName") ?? candidate("spouseName") ?? candidate("careOfName"),
      kind: "name" as const,
    },
    { label: "Date of birth", expected: values.dob, cand: candidate("dob"), kind: "date" as const },
    { label: idLabel, expected: values.idNumber, cand: idCandidate, kind: "id" as const },
  ];

  const comparisons = rows.map((row) => ({
    ...row,
    comparison: compareField({
      expected: row.expected,
      ocrValue: row.cand?.normalizedValue ?? row.cand?.value ?? null,
      ocrConfidence: row.cand?.components.ocr ?? null,
      kind: row.kind,
    }),
  }));

  const any = comparisons.some((row) => row.comparison);

  return (
    <Panel
      title="Verification against form data"
      subtitle="Type what the form claims, then compare it against the document field candidates. Values are normalized; names use fuzzy matching."
    >
      <div className="grid gap-3 md:grid-cols-4">
        <TextInput
          label="Form name"
          value={values.name}
          onChange={(value) => onChange({ ...values, name: value })}
          placeholder="Ramesh Kumar"
        />
        <TextInput
          label="Form father / guardian name"
          value={values.fatherName}
          onChange={(value) => onChange({ ...values, fatherName: value })}
          placeholder="Suresh Kumar"
        />
        <TextInput
          label="Form date of birth"
          value={values.dob}
          onChange={(value) => onChange({ ...values, dob: value })}
          placeholder="12/04/2004"
          mono
        />
        <TextInput
          label="Form ID number"
          value={values.idNumber}
          onChange={(value) => onChange({ ...values, idNumber: value })}
          placeholder="4321 5678 9012"
          mono
        />
      </div>

      <div className="mt-4 space-y-3">
        {!any && (
          <p className="text-sm text-muted-foreground">
            Enter at least one form value to see a comparison.
          </p>
        )}
        {comparisons.map(({ label, cand, comparison }) =>
          comparison ? (
            <div key={label} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="label-caps">{label}</span>
                <Badge tone={stateMeta[comparison.state].tone}>{stateMeta[comparison.state].label}</Badge>
              </div>
              <Row label="Document field candidate" value={cand?.value ?? "not identified"} />
              <Row label="Form value" value={comparison.expected} />
              <Row label="Similarity" value={`${(comparison.similarity * 100).toFixed(1)}%`} />
              <Row
                label="Extraction confidence"
                value={cand ? `${(cand.confidence * 100).toFixed(0)}% (${candidateState(cand)})` : "—"}
              />
              <Row
                label="OCR / text-layer confidence"
                value={
                  comparison.ocrConfidence === null
                    ? "—"
                    : `${(comparison.ocrConfidence * 100).toFixed(1)}%`
                }
              />
              <Row label="Extraction method" value={cand?.extractionMethod ?? "—"} />
              <Row label="Note" value={comparison.note} />
            </div>
          ) : null,
        )}
        <Notice tone="info">
          A match means the strings agree after normalization. It does not prove the document is
          genuine, and a field is never a strong match while its source confidence is below 75%.
        </Notice>
      </div>
    </Panel>
  );
}
