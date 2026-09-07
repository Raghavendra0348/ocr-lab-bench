import { Badge, Metric, Panel, TextArea } from "./ui";
import { confidenceLevel } from "@/ocr/ocrTypes";
import type { OCRResult } from "@/ocr/ocrTypes";

function levelBadge(score: number) {
  const level = confidenceLevel(score);
  const tone = level === "high" ? "success" : level === "medium" ? "warning" : "danger";
  const text = level === "high" ? "High" : level === "medium" ? "Medium" : "Low";
  return (
    <Badge tone={tone}>
      {(score * 100).toFixed(1)}% · {text}
    </Badge>
  );
}

export function OcrResults({ result }: { result: OCRResult | null }) {
  if (!result) {
    return (
      <Panel title="OCR results" subtitle="Run OCR to see engine output here.">
        <p className="text-sm text-muted-foreground">
          Nothing recognized yet. Every value shown in this app comes from the model running on your
          uploaded file — no sample data is used.
        </p>
      </Panel>
    );
  }

  const empty = result.boxes.length === 0;

  return (
    <Panel
      title="OCR results"
      subtitle="Confidence is the model's recognition score. It is not a guarantee of correctness."
    >
      {empty ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Empty OCR result: the model detected no readable text in this image.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Lines" value={String(result.metrics.recognizedLines)} />
            <Metric label="Detected boxes" value={String(result.metrics.detectedBoxes)} />
            <Metric
              label="Mean confidence"
              value={`${(result.confidence * 100).toFixed(1)}%`}
              tone={confidenceLevel(result.confidence) === "high" ? "success" : "warning"}
            />
            <Metric label="Total time" value={`${Math.round(result.metrics.totalMs)} ms`} />
          </div>

          <TextArea label="Extracted text (selectable)" value={result.text} rows={10} readOnly />

          <div>
            <p className="label-caps mb-2">Recognized lines</p>
            <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
              {result.boxes.map((box, index) => (
                <div key={index} className="rounded-lg border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm text-foreground">
                      <span className="text-muted-foreground">#{index + 1}</span> “{box.text}”
                    </span>
                    {levelBadge(box.confidence)}
                  </div>
                  <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    poly [
                    {box.poly
                      .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
                      .join(" ")}
                    ] · bbox [{Math.round(box.bbox.x1)}, {Math.round(box.bbox.y1)},{" "}
                    {Math.round(box.bbox.x2)}, {Math.round(box.bbox.y2)}]
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
