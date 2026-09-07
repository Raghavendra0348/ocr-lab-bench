import { Notice, Panel } from "./ui";
import { QUALITY_TESTS } from "@/lib/labTypes";
import { cn } from "@/lib/utils";

export function QualityTests({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel
      title="Document quality tests"
      subtitle="Tag the document you are about to run so the run log tells you which condition each result came from."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {QUALITY_TESTS.map((test) => {
          const active = selected === test.id;
          return (
            <button
              key={test.id}
              type="button"
              onClick={() => onSelect(test.id)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-accent bg-accent/10"
                  : "border-border bg-surface hover:border-border-strong",
              )}
            >
              <span className="block text-sm font-medium text-foreground">{test.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{test.expectation}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <Notice tone="info">
          These are labels only. The app never fabricates results for a category — you upload a
          document of that kind and read the real output.
        </Notice>
      </div>
    </Panel>
  );
}
