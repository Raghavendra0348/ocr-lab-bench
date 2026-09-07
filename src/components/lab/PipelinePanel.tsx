import { Badge, Metric, Notice, Panel, Row } from "./ui";

export interface PipelineStep {
  id: string;
  label: string;
  state: "pending" | "done" | "skipped" | "failed";
  detail?: string;
}

export interface PipelineTimings {
  pdfLoadMs: number | null;
  pdfTextMs: number | null;
  pdfRenderMs: number | null;
  ocrInitMs: number | null;
  ocrInferenceMs: number | null;
  classificationMs: number | null;
  fieldExtractionMs: number | null;
  totalMs: number | null;
}

const SYMBOL: Record<PipelineStep["state"], string> = {
  pending: "·",
  done: "✓",
  skipped: "–",
  failed: "✗",
};

const TONE: Record<PipelineStep["state"], "neutral" | "success" | "warning" | "danger"> = {
  pending: "neutral",
  done: "success",
  skipped: "warning",
  failed: "danger",
};

function ms(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

export function PipelinePanel({
  steps,
  timings,
  pdfKind,
  extractionMethod,
  pagesProcessed,
  actions,
}: {
  steps: PipelineStep[];
  timings: PipelineTimings;
  pdfKind: "TEXT PDF" | "SCANNED PDF" | null;
  extractionMethod: string | null;
  pagesProcessed: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <Panel
      title="Full pipeline"
      subtitle="File detection → PDF text layer → OCR fallback → unified regions → classification → candidates → evidence. All measurements are real."
      actions={actions}
    >
      <div className="space-y-1.5">
        {steps.map((step) => (
          <div key={step.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1.5 last:border-0">
            <span className="flex items-center gap-2 text-sm text-foreground">
              <span className="font-mono text-accent">{SYMBOL[step.state]}</span>
              {step.label}
            </span>
            <span className="flex items-center gap-2">
              {step.detail && <span className="font-mono text-xs text-muted-foreground">{step.detail}</span>}
              <Badge tone={TONE[step.state]}>{step.state}</Badge>
            </span>
          </div>
        ))}
      </div>

      {(pdfKind || extractionMethod || pagesProcessed) && (
        <div className="mt-4">
          <Row label="PDF type" value={pdfKind ?? "— (image input)"} />
          <Row label="Extraction method" value={extractionMethod ?? "—"} />
          <Row label="Pages processed" value={pagesProcessed ?? "—"} />
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="PDF loading" value={ms(timings.pdfLoadMs)} />
        <Metric label="PDF text extraction" value={ms(timings.pdfTextMs)} />
        <Metric label="PDF page rendering" value={ms(timings.pdfRenderMs)} />
        <Metric label="OCR initialization" value={ms(timings.ocrInitMs)} hint="first load only" />
        <Metric label="OCR inference" value={ms(timings.ocrInferenceMs)} />
        <Metric label="Document classification" value={ms(timings.classificationMs)} />
        <Metric label="Field extraction" value={ms(timings.fieldExtractionMs)} />
        <Metric label="Total pipeline" value={ms(timings.totalMs)} tone="accent" />
      </div>

      <div className="mt-4">
        <Notice tone="info">
          Timings are measured with performance.now() around the real work. Steps marked “skipped”
          did not run — for example OCR is skipped when a PDF already has a usable text layer.
        </Notice>
      </div>
    </Panel>
  );
}
