import { Metric, Notice, Panel, TextArea } from "./ui";
import { scoreAccuracy } from "@/lib/textCompare";

export function GroundTruthPanel({
  groundTruth,
  onChange,
  ocrText,
}: {
  groundTruth: string;
  onChange: (value: string) => void;
  ocrText: string | null;
}) {
  const score = groundTruth.trim() && ocrText ? scoreAccuracy(groundTruth, ocrText) : null;

  return (
    <Panel
      title="OCR accuracy scoring"
      subtitle="Simple user-provided OCR evaluation — not a rigorous benchmark."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <TextArea
          label="Ground truth (type the correct text)"
          value={groundTruth}
          onChange={onChange}
          rows={10}
          placeholder={"RAMESH KUMAR\nDOB: 12/04/2004\nCertificate No: ABC123456"}
        />
        <TextArea
          label="OCR output (read-only)"
          value={ocrText ?? ""}
          rows={10}
          readOnly
          placeholder="Run OCR first"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric
          label="Character accuracy"
          value={score ? `${(score.characterAccuracy * 100).toFixed(1)}%` : "—"}
          tone={score && score.characterAccuracy >= 0.9 ? "success" : "warning"}
        />
        <Metric
          label="Word accuracy"
          value={score ? `${(score.wordAccuracy * 100).toFixed(1)}%` : "—"}
          tone={score && score.wordAccuracy >= 0.9 ? "success" : "warning"}
        />
        <Metric label="Edit distance" value={score ? String(score.editDistance) : "—"} />
        <Metric
          label="Ground truth size"
          value={score ? `${score.groundTruthChars} ch · ${score.groundTruthWords} w` : "—"}
        />
      </div>

      <div className="mt-4">
        <Notice tone="warning">
          Comparison is done on normalized text (lowercased, punctuation reduced, whitespace
          collapsed) and ignores reading order differences only at the word level. Use it to compare
          engines on the same documents, not as an absolute accuracy figure.
        </Notice>
      </div>
    </Panel>
  );
}
