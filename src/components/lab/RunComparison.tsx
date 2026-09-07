import { Badge, Button, Notice, Panel, TextArea } from "./ui";
import type { RunRecord } from "@/lib/labTypes";
import { QUALITY_TESTS } from "@/lib/labTypes";
import { cn } from "@/lib/utils";

function testName(id: string) {
  return QUALITY_TESTS.find((test) => test.id === id)?.name ?? id;
}

export function RunComparison({
  runs,
  activeRunId,
  onSelect,
  onClear,
}: {
  runs: RunRecord[];
  activeRunId: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const lastOriginal = runs.find((run) => run.preprocessLabel === "none") ?? null;
  const lastPreprocessed = runs.find((run) => run.preprocessLabel !== "none") ?? null;

  return (
    <Panel
      title="Compare OCR runs"
      subtitle="Every run of this session, newest first. Re-run the same document with different preprocessing to compare."
      actions={
        runs.length > 0 ? (
          <Button variant="ghost" onClick={onClear}>
            Clear runs
          </Button>
        ) : null
      }
    >
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Run", "Preprocessing", "Test", "Lines", "Mean conf.", "Det", "Rec", "Total"].map(
                    (head) => (
                      <th key={head} className="label-caps py-2 pr-3 text-left">
                        {head}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => onSelect(run.id)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 hover:bg-secondary/60",
                      run.id === activeRunId && "bg-accent/10",
                    )}
                  >
                    <td className="py-2 pr-3 text-foreground">
                      {run.label}
                      {run.pageNumber ? ` · p${run.pageNumber}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{run.preprocessLabel}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{testName(run.qualityTest)}</td>
                    <td className="py-2 pr-3">{run.result.metrics.recognizedLines}</td>
                    <td className="py-2 pr-3">
                      <Badge
                        tone={
                          run.result.confidence >= 0.9
                            ? "success"
                            : run.result.confidence >= 0.75
                              ? "warning"
                              : "danger"
                        }
                      >
                        {(run.result.confidence * 100).toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">{Math.round(run.result.metrics.detectionMs)} ms</td>
                    <td className="py-2 pr-3">{Math.round(run.result.metrics.recognitionMs)} ms</td>
                    <td className="py-2 pr-3">{Math.round(run.result.metrics.totalMs)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(lastOriginal || lastPreprocessed) && (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <TextArea
                label={`Original OCR ${lastOriginal ? `(${(lastOriginal.result.confidence * 100).toFixed(1)}% mean conf.)` : ""}`}
                value={lastOriginal?.result.text ?? ""}
                rows={9}
                readOnly
                placeholder="No un-preprocessed run yet"
              />
              <TextArea
                label={`Preprocessed OCR ${lastPreprocessed ? `(${lastPreprocessed.preprocessLabel}, ${(lastPreprocessed.result.confidence * 100).toFixed(1)}% mean conf.)` : ""}`}
                value={lastPreprocessed?.result.text ?? ""}
                rows={9}
                readOnly
                placeholder="No preprocessed run yet"
              />
            </div>
          )}

          <div className="mt-4">
            <Notice tone="info">
              Click any row to load that run's image, boxes and metrics into the panels above.
            </Notice>
          </div>
        </>
      )}
    </Panel>
  );
}
