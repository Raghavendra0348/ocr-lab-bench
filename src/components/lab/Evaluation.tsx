import { Notice, Panel, TextArea } from "./ui";
import { EVALUATION_ITEMS, type Grade } from "@/lib/labTypes";
import { cn } from "@/lib/utils";

const GRADES: Array<{ id: Grade; label: string }> = [
  { id: "excellent", label: "Excellent" },
  { id: "good", label: "Good" },
  { id: "poor", label: "Poor" },
];

export function EvaluationDashboard({
  grades,
  onGradeChange,
  recommendation,
  onRecommendationChange,
}: {
  grades: Record<string, Grade>;
  onGradeChange: (id: string, grade: Grade) => void;
  recommendation: string;
  onRecommendationChange: (value: string) => void;
}) {
  return (
    <Panel
      title="Is PP-OCRv6 good enough?"
      subtitle="Your own judgement, recorded manually. Nothing on this panel is computed or claimed by the app."
    >
      <div className="space-y-2">
        {EVALUATION_ITEMS.map((item) => {
          const current = grades[item.id] ?? "unrated";
          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-2.5"
            >
              <span className="text-sm text-foreground">{item.label}</span>
              <div className="flex gap-1.5">
                {GRADES.map((grade) => {
                  const active = current === grade.id;
                  return (
                    <button
                      key={grade.id}
                      type="button"
                      onClick={() => onGradeChange(item.id, active ? "unrated" : grade.id)}
                      className={cn(
                        "rounded-md border px-3 py-1 font-mono text-xs transition-colors",
                        active
                          ? grade.id === "excellent"
                            ? "border-success/50 bg-success/20 text-success"
                            : grade.id === "good"
                              ? "border-info/50 bg-info/20 text-info"
                              : "border-destructive/50 bg-destructive/20 text-destructive"
                          : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                      )}
                    >
                      {grade.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5">
        <TextArea
          label="Recommendation (your words)"
          value={recommendation}
          onChange={onRecommendationChange}
          rows={4}
          placeholder={
            "PP-OCRv6 is good enough for integration.\n— or —\nPP-OCRv6 requires additional preprocessing."
          }
        />
      </div>

      <div className="mt-4">
        <Notice tone="warning">
          This checklist is a working note, not a scientific evaluation. Sample size, document mix and
          your own reading of the results all matter.
        </Notice>
      </div>
    </Panel>
  );
}
