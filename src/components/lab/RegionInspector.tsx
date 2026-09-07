import { useMemo, useState } from "react";
import { Badge, Button, Panel } from "./ui";
import type { DocumentTextRegion } from "@/document/types";
import { groupRows, readingOrder } from "@/document/spatial/spatialUtils";

type SortKey = "reading" | "y" | "x" | "confidence" | "height";

export function RegionInspector({
  regions,
  highlightIds,
  onHoverRegion,
}: {
  regions: DocumentTextRegion[];
  highlightIds: string[];
  onHoverRegion?: (id: string | null) => void;
}) {
  const [sort, setSort] = useState<SortKey>("reading");
  const [showReadingOrder, setShowReadingOrder] = useState(false);
  const [showLayout, setShowLayout] = useState(false);

  const sorted = useMemo(() => {
    if (sort === "reading") return readingOrder(regions);
    const copy = [...regions];
    if (sort === "y") return copy.sort((a, b) => a.y - b.y);
    if (sort === "x") return copy.sort((a, b) => a.x - b.x);
    if (sort === "confidence") return copy.sort((a, b) => a.confidence - b.confidence);
    return copy.sort((a, b) => b.height - a.height);
  }, [regions, sort]);

  const rows = useMemo(() => groupRows(regions), [regions]);

  return (
    <Panel
      title="Document Structure Inspector"
      subtitle="Exactly what PP-OCRv6 / PDF.js returned, before any interpretation."
      actions={
        <>
          <Badge tone="neutral">total text regions: {regions.length}</Badge>
          <Button
            variant={showReadingOrder ? "primary" : "default"}
            onClick={() => setShowReadingOrder((v) => !v)}
          >
            Show reading order
          </Button>
          <Button variant={showLayout ? "primary" : "default"} onClick={() => setShowLayout((v) => !v)}>
            Show spatial layout
          </Button>
        </>
      }
    >
      {regions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No regions yet. Run the pipeline on a document to inspect its text regions.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="label-caps">Sort by</span>
            {(
              [
                ["reading", "Reading order"],
                ["y", "Y position"],
                ["x", "X position"],
                ["confidence", "Confidence"],
                ["height", "Text size"],
              ] as Array<[SortKey, string]>
            ).map(([key, label]) => (
              <Button key={key} variant={sort === key ? "primary" : "default"} onClick={() => setSort(key)}>
                {label}
              </Button>
            ))}
          </div>

          {showReadingOrder && (
            <pre className="mb-3 max-h-64 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground">
              {readingOrder(regions)
                .map((region, index) => `${String(index + 1).padStart(3, " ")}. [${region.id}] ${region.text}`)
                .join("\n")}
            </pre>
          )}

          {showLayout && (
            <div className="mb-3 max-h-72 space-y-1 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs">
              {rows.map((row, index) => (
                <div key={index} className="flex flex-wrap gap-2">
                  <span className="text-muted-foreground">row {String(index + 1).padStart(2, "0")}</span>
                  {row.map((region) => (
                    <span
                      key={region.id}
                      className="rounded border border-border px-1.5 text-foreground"
                      style={{ marginLeft: `${Math.min(24, region.x / 40)}ch` }}
                    >
                      {region.text}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="label-caps sticky top-0 bg-surface">
                <tr>
                  <th className="py-1.5 pr-3">ID</th>
                  <th className="py-1.5 pr-3">Text</th>
                  <th className="py-1.5 pr-3">X</th>
                  <th className="py-1.5 pr-3">Y</th>
                  <th className="py-1.5 pr-3">W</th>
                  <th className="py-1.5 pr-3">H</th>
                  <th className="py-1.5 pr-3">Conf.</th>
                  <th className="py-1.5 pr-3">Source</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {sorted.map((region) => (
                  <tr
                    key={region.id}
                    onMouseEnter={() => onHoverRegion?.(region.id)}
                    onMouseLeave={() => onHoverRegion?.(null)}
                    className={`border-t border-border ${
                      highlightIds.includes(region.id) ? "bg-accent/10 text-accent" : "text-foreground"
                    }`}
                  >
                    <td className="py-1.5 pr-3">{region.id}</td>
                    <td className="py-1.5 pr-3 max-w-[340px] break-words">{region.text}</td>
                    <td className="py-1.5 pr-3">{Math.round(region.x)}</td>
                    <td className="py-1.5 pr-3">{Math.round(region.y)}</td>
                    <td className="py-1.5 pr-3">{Math.round(region.width)}</td>
                    <td className="py-1.5 pr-3">{Math.round(region.height)}</td>
                    <td className="py-1.5 pr-3">{(region.confidence * 100).toFixed(1)}%</td>
                    <td className="py-1.5 pr-3">{region.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
