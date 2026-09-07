import { Metric, Panel } from "./ui";
import type { OCRInitInfo, OCRResult } from "@/ocr/ocrTypes";

export function MetricsPanel({
  initInfo,
  result,
}: {
  initInfo: OCRInitInfo | null;
  result: OCRResult | null;
}) {
  return (
    <Panel
      title="Performance / diagnostics"
      subtitle="All values are measured on this machine: engine metrics plus wall-clock timing around the call."
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          label="Model init"
          value={initInfo ? `${initInfo.initMs} ms` : "—"}
          hint={initInfo ? "download + session setup" : "not initialized"}
        />
        <Metric
          label="Detection"
          value={result ? `${Math.round(result.metrics.detectionMs)} ms` : "—"}
        />
        <Metric
          label="Recognition"
          value={result ? `${Math.round(result.metrics.recognitionMs)} ms` : "—"}
        />
        <Metric
          label="Engine total"
          value={result ? `${Math.round(result.metrics.totalMs)} ms` : "—"}
        />
        <Metric
          label="Wall clock"
          value={result ? `${result.processingTimeMs} ms` : "—"}
          hint="includes transfer into the worker"
        />
        <Metric label="Detected boxes" value={result ? String(result.metrics.detectedBoxes) : "—"} />
        <Metric
          label="Recognized lines"
          value={result ? String(result.metrics.recognizedLines) : "—"}
        />
        <Metric
          label="Image size"
          value={result ? `${result.image.width}×${result.image.height}` : "—"}
          hint="as seen by the engine"
        />
      </div>
    </Panel>
  );
}
