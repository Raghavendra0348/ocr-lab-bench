import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Notice, Panel } from "@/components/lab/ui";
import extensionZip from "@/assets/errorguard-extension.zip.asset.json";

export const Route = createFileRoute("/extension")({
  head: () => ({
    meta: [
      { title: "Error Guard Extension — Download & Test" },
      {
        name: "description",
        content:
          "Download the Pre-Submission Error Guard Chrome extension (local on-device OCR) and load it in Chrome to test.",
      },
      { property: "og:title", content: "Error Guard Extension" },
      {
        property: "og:description",
        content: "Download the local on-device OCR Chrome extension for testing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExtensionDownload,
});

function ExtensionDownload() {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(extensionZip.url);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "errorguard-extension.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Pre-Submission Error Guard — Chrome Extension</h1>
        <p className="mt-1 text-sm opacity-70">
          Local on-device OCR with PP-OCRv6_small. No cloud APIs, no data leaves the browser.
        </p>
      </div>

      <Panel>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Extension package</p>
            <p className="text-sm opacity-70">Version 1.1.0 · ~44 MB ZIP (includes models & runtime)</p>
          </div>
          <Button onClick={handleDownload} disabled={downloading}>
            {downloading ? "Downloading…" : "Download extension ZIP"}
          </Button>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
      </Panel>

      <Panel title="How to load & test">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            <strong>Unzip</strong> the downloaded <code>errorguard-extension.zip</code> file
            to a folder on your computer.
          </li>
          <li>
            Open <code>chrome://extensions</code> in Chrome (or Edge / Brave / Arc).
          </li>
          <li>
            Turn on <strong>Developer mode</strong> (toggle in the top-right corner).
          </li>
          <li>
            Click <strong>Load unpacked</strong> and select the unzipped
            <code> extension</code> folder (the one containing <code>manifest.json</code>).
          </li>
          <li>
            The extension icon appears in your toolbar. Open the
            <strong> demo portal</strong> (or any page with a form and a file input),
            upload a document image/PDF, and watch the banner appear.
          </li>
          <li>
            Click the banner to auto-fill the form. Fields that disagree with what you
            already typed are flagged instead of overwritten.
          </li>
        </ol>
      </Panel>

      <Panel title="What's inside">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>PP-OCRv6_small detection + recognition models (ONNX)</li>
          <li>ONNX Runtime Web (WASM, SIMD, threaded)</li>
          <li>PDF.js worker for PDF text extraction & rendering</li>
          <li>Document understanding layer (Aadhaar / PAN / certificate classification & field extraction)</li>
          <li>Local semantic form-field matching</li>
          <li>Gemini / backend cloud OCR is <strong>off by default</strong> — only runs if you explicitly enable it in extension storage</li>
        </ul>
        <div className="mt-3">
          <Badge tone="success">No cloud calls</Badge>{" "}
          <Badge tone="info">All inference on-device</Badge>
        </div>
      </Panel>

      <Notice tone="info">
        The extension runs entirely on your machine. The web lab on the home page of this
        preview is the development test bench; the extension is the packaged, loadable
        version for real Chrome use.
      </Notice>
    </div>
  );
}
