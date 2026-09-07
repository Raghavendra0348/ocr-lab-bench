import { useState } from "react";
import { Badge, Button, Collapsible, Row } from "./ui";
import type { OCRInitInfo, OCRResult } from "@/ocr/ocrTypes";
import type { LogEntry } from "@/lib/labTypes";

export function Diagnostics({
  status,
  initInfo,
  result,
  logs,
  providerName,
}: {
  status: string;
  initInfo: OCRInitInfo | null;
  result: OCRResult | null;
  logs: LogEntry[];
  providerName: string;
}) {
  const [copied, setCopied] = useState(false);

  const report = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      provider: providerName,
      status,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      crossOriginIsolated: typeof crossOriginIsolated === "boolean" ? crossOriginIsolated : null,
      initialization: initInfo,
      lastRun: result
        ? {
            metrics: result.metrics,
            processingTimeMs: result.processingTimeMs,
            meanConfidence: result.confidence,
            image: result.image,
            runtime: result.runtime,
            lineCount: result.boxes.length,
          }
        : null,
      logs,
      note: "Contains no document image data and no recognized document text.",
    };
    return JSON.stringify(payload, null, 2);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Collapsible
      title="Developer diagnostics"
      subtitle="Engine status, runtime backend, timings, errors and warnings."
      actions={
        <Button onClick={copy} variant="default">
          {copied ? "Copied ✓" : "Copy Diagnostic Report"}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="label-caps mb-2">Initialization</p>
          <Row label="Status" value={status} />
          <Row label="Provider" value={providerName} />
          <Row
            label="Detection model"
            value={initInfo?.modelDetection ?? "PP-OCRv6_small_det (pending)"}
          />
          <Row
            label="Recognition model"
            value={initInfo?.modelRecognition ?? "PP-OCRv6_small_rec (pending)"}
          />
          <Row label="Language" value={initInfo?.lang ?? "en"} />
          <Row label="OCR version" value={initInfo?.ocrVersion ?? "PP-OCRv6"} />
          <Row
            label="Web Worker"
            value={
              initInfo ? (
                <Badge tone="success">worker: true</Badge>
              ) : (
                <Badge tone="neutral">requested: true</Badge>
              )
            }
          />
          <Row label="Requested backend" value={initInfo?.requestedBackend ?? "wasm"} />
          <Row label="Resolved backend" value={initInfo?.backend ?? "—"} />
          <Row label="Det provider" value={initInfo?.detProvider ?? "—"} />
          <Row label="Rec provider" value={initInfo?.recProvider ?? "—"} />
          <Row
            label="WASM threads / SIMD"
            value={initInfo ? `${initInfo.numThreads} thread(s) · simd=${initInfo.simd}` : "—"}
          />
          <Row
            label="Cross-origin isolated"
            value={String(initInfo?.crossOriginIsolated ?? (typeof crossOriginIsolated === "boolean" ? crossOriginIsolated : "unknown"))}
          />
          <Row label="WASM source" value={initInfo?.wasmSource ?? "same-origin"} />
          <Row label="Model asset source" value={initInfo?.modelAssetSource ?? "same-origin"} />
          <Row label="Model load time" value={initInfo ? `${initInfo.initMs} ms` : "—"} />
          {initInfo?.assets.map((asset) => (
            <Row
              key={asset.url}
              label="Asset"
              value={`${asset.url.split("/").pop()} · ${(asset.bytes / 1024 / 1024).toFixed(2)} MB`}
            />
          ))}
        </div>

        <div>
          <p className="label-caps mb-2">Last run</p>
          <Row label="Detection time" value={result ? `${Math.round(result.metrics.detectionMs)} ms` : "—"} />
          <Row
            label="Recognition time"
            value={result ? `${Math.round(result.metrics.recognitionMs)} ms` : "—"}
          />
          <Row label="Engine total" value={result ? `${Math.round(result.metrics.totalMs)} ms` : "—"} />
          <Row label="Wall clock" value={result ? `${result.processingTimeMs} ms` : "—"} />
          <Row label="Detected boxes" value={result ? String(result.metrics.detectedBoxes) : "—"} />
          <Row label="Recognized lines" value={result ? String(result.metrics.recognizedLines) : "—"} />

          <p className="label-caps mt-5 mb-2">Log ({logs.length})</p>
          <div className="max-h-72 space-y-1 overflow-auto rounded-md border border-border bg-input p-3 font-mono text-[11px]">
            {logs.length === 0 && <p className="text-muted-foreground">No events yet.</p>}
            {logs
              .slice()
              .reverse()
              .map((entry, index) => (
                <p
                  key={index}
                  className={
                    entry.level === "error"
                      ? "text-destructive"
                      : entry.level === "warn"
                        ? "text-warning"
                        : "text-muted-foreground"
                  }
                >
                  {new Date(entry.at).toLocaleTimeString()} [{entry.level}] {entry.message}
                </p>
              ))}
          </div>
        </div>
      </div>
    </Collapsible>
  );
}
