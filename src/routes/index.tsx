import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PaddleOCRProvider } from "@/ocr/PaddleOCRProvider";
import type { OCRProvider } from "@/ocr/OCRProvider";
import type { OCRInitInfo } from "@/ocr/ocrTypes";
import { DEFAULT_PREPROCESS, describePreprocess, imageDimensions, preprocessEnabled, preprocessImage } from "@/lib/preprocess";
import type { PreprocessOptions } from "@/lib/preprocess";
import { analyzePdf, renderPdfPage } from "@/lib/pdf";
import type { PdfAnalysis } from "@/lib/pdf";
import { extractFields } from "@/lib/fieldExtraction";
import type { LogEntry, RunRecord, Grade } from "@/lib/labTypes";
import { mergeLineFragments, regionsFromOcrBoxes, understandDocument } from "@/document";
import type { DocumentTextRegion, UnderstandResult } from "@/document";
import { DOCUMENT_FIXTURES } from "@/document/testFixtures";
import { DocumentPreview } from "@/components/lab/DocumentPreview";
import { OcrResults } from "@/components/lab/OcrResults";
import { MetricsPanel } from "@/components/lab/MetricsPanel";
import { Diagnostics } from "@/components/lab/Diagnostics";
import { FieldExtractionPanel, ManualVerification } from "@/components/lab/FieldsPanel";
import type { ExpectedValues } from "@/components/lab/FieldsPanel";
import { DocumentUnderstandingPanel } from "@/components/lab/DocumentUnderstanding";
import { RegionInspector } from "@/components/lab/RegionInspector";
import { PipelinePanel } from "@/components/lab/PipelinePanel";
import type { PipelineStep, PipelineTimings } from "@/components/lab/PipelinePanel";
import { DocumentVerification, EMPTY_FORM } from "@/components/lab/DocumentVerification";
import type { FormValues } from "@/components/lab/DocumentVerification";
import { GroundTruthPanel } from "@/components/lab/GroundTruth";
import { QualityTests } from "@/components/lab/QualityTests";
import { RunComparison } from "@/components/lab/RunComparison";
import { Badge, Button, Checkbox, Notice, Panel, Row } from "@/components/lab/ui";
import { EvaluationDashboard } from "@/components/lab/Evaluation";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PP-OCRv6 Local OCR Lab — Browser OCR Test Bench" },
      {
        name: "description",
        content:
          "Test PP-OCRv6_small OCR accuracy, confidence and speed entirely in your browser: bounding boxes, field extraction, ground-truth scoring and preprocessing experiments.",
      },
      { property: "og:title", content: "PP-OCRv6 Local OCR Lab" },
      {
        property: "og:description",
        content:
          "Local, browser-only OCR test bench for PP-OCRv6_small: accuracy, confidence, timings, field extraction and preprocessing comparisons.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OcrLab,
});

type Status = "idle" | "initializing" | "ready" | "running" | "error";

interface FileInfo {
  file: File;
  kind: "image" | "pdf";
  width?: number;
  height?: number;
  pageCount?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function OcrLab() {
  const providerRef = useRef<OCRProvider | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [initInfo, setInitInfo] = useState<OCRInitInfo | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const [preprocess, setPreprocess] = useState<PreprocessOptions>(DEFAULT_PREPROCESS);
  const [showBoxes, setShowBoxes] = useState(true);
  const [showBoxText, setShowBoxText] = useState(false);
  const [qualityTest, setQualityTest] = useState<string>("unspecified");
  const [expected, setExpected] = useState<ExpectedValues>({
    name: "",
    dob: "",
    certificateNumber: "",
  });
  const [groundTruth, setGroundTruth] = useState("");
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [recommendation, setRecommendation] = useState("");
  const [dragging, setDragging] = useState(false);

  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [textPdfPage, setTextPdfPage] = useState(1);
  const [fixtureId, setFixtureId] = useState<string | null>(null);
  const [timings, setTimings] = useState<PipelineTimings>({
    pdfLoadMs: null,
    pdfTextMs: null,
    pdfRenderMs: null,
    ocrInitMs: null,
    ocrInferenceMs: null,
    classificationMs: null,
    fieldExtractionMs: null,
    totalMs: null,
  });


  const log = useCallback((level: LogEntry["level"], message: string) => {
    setLogs((entries) => [...entries.slice(-199), { at: Date.now(), level, message }]);
  }, []);

  const getProvider = useCallback(() => {
    if (!providerRef.current) providerRef.current = new PaddleOCRProvider({ lang: "en" });
    return providerRef.current;
  }, []);

  useEffect(() => {
    return () => {
      providerRef.current?.dispose().catch(() => undefined);
    };
  }, []);

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? runs[0] ?? null,
    [runs, activeRunId],
  );
  const activeResult = activeRun?.result ?? null;
  const fields = useMemo(
    () => (activeResult ? extractFields(activeResult.boxes) : null),
    [activeResult],
  );

  const fixture = useMemo(
    () => DOCUMENT_FIXTURES.find((item) => item.id === fixtureId) ?? null,
    [fixtureId],
  );

  /**
   * Unified region model: OCR boxes, PDF text-layer items or a synthetic test
   * fixture all collapse into DocumentTextRegion[] before any interpretation.
   */
  const regions = useMemo<DocumentTextRegion[]>(() => {
    if (fixture) return fixture.regions;
    if (activeResult) {
      return mergeLineFragments(
        regionsFromOcrBoxes(activeResult.boxes, activeRun?.pageNumber ?? 1),
      );
    }
    if (pdfAnalysis?.textBased) return pdfAnalysis.regionsByPage[textPdfPage] ?? [];
    return [];
  }, [fixture, activeResult, activeRun, pdfAnalysis, textPdfPage]);

  const understanding = useMemo<UnderstandResult | null>(
    () => (regions.length > 0 ? understandDocument(regions) : null),
    [regions],
  );

  useEffect(() => {
    if (!understanding) return;
    setTimings((current) => ({
      ...current,
      classificationMs: understanding.timings.classificationMs,
      fieldExtractionMs: understanding.timings.extractionMs,
    }));
  }, [understanding]);

  const parsed = understanding?.parsed ?? null;

  const highlightRegions = useMemo<DocumentTextRegion[]>(() => {
    const ids = new Set<string>();
    const candidate = selectedField ? parsed?.fields[selectedField] : null;
    candidate?.sourceRegionIds.forEach((id) => ids.add(id));
    if (hoveredRegionId) ids.add(hoveredRegionId);
    return regions.filter((region) => ids.has(region.id));
  }, [selectedField, parsed, hoveredRegionId, regions]);

  const pipelineSteps = useMemo<PipelineStep[]>(() => {
    const isPdf = fileInfo?.kind === "pdf";
    const textPdf = Boolean(pdfAnalysis?.textBased);
    return [
      {
        id: "file",
        label: "File type detection",
        state: fixture ? "skipped" : fileInfo ? "done" : "pending",
        detail: fixture ? "synthetic test fixture" : (fileInfo?.kind ?? undefined),
      },
      {
        id: "pdftext",
        label: "PDF text-layer extraction (PDF.js)",
        state: !isPdf ? "skipped" : pdfAnalysis ? "done" : "pending",
        detail: pdfAnalysis ? `${pdfAnalysis.totalChars} chars` : undefined,
      },
      {
        id: "ocr",
        label: "PP-OCRv6_small OCR",
        state: fixture
          ? "skipped"
          : activeResult
            ? "done"
            : isPdf && textPdf
              ? "skipped"
              : status === "error"
                ? "failed"
                : "pending",
        detail: activeResult ? `${activeResult.boxes.length} boxes` : textPdf ? "not needed" : undefined,
      },
      {
        id: "regions",
        label: "Unified text regions",
        state: regions.length > 0 ? "done" : "pending",
        detail: regions.length > 0 ? `${regions.length} regions` : undefined,
      },
      {
        id: "classify",
        label: "Document classification",
        state: parsed ? "done" : "pending",
        detail: parsed?.documentType,
      },
      {
        id: "candidates",
        label: "Field candidate generation",
        state: parsed ? "done" : "pending",
        detail: parsed ? `${parsed.candidates.length} candidates` : undefined,
      },
    ];
  }, [fileInfo, pdfAnalysis, activeResult, regions, parsed, status, fixture]);


  const initialize = useCallback(async () => {
    const provider = getProvider();
    if (provider.getInitInfo()) return provider;
    setStatus("initializing");
    setError(null);
    log("info", "Initializing PP-OCRv6_small (worker + wasm)…");
    try {
      const info = await provider.initialize();
      setInitInfo(info);
      setTimings((current) => ({ ...current, ocrInitMs: info.initMs }));

      info.warnings.forEach((warning) => log("warn", warning));
      log(
        "info",
        `Ready in ${info.initMs} ms · det=${info.detProvider} rec=${info.recProvider} threads=${info.numThreads}`,
      );
      setStatus("ready");
      return provider;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setStatus("error");
      setError(`Could not process this document. ${message}`);
      log("error", message);
      throw caught;
    }
  }, [getProvider, log]);

  const runOcr = useCallback(
    async (input: Blob, label: string, pageNumber: number | null) => {
      setError(null);
      setBusyLabel(label);
      try {
        const provider = await initialize();
        setStatus("running");

        let blobForOcr = input;
        const usePre = preprocessEnabled(preprocess);
        if (usePre) {
          log("info", `Preprocessing locally: ${describePreprocess(preprocess)}`);
          blobForOcr = (await preprocessImage(input, preprocess)).blob;
        }

        log("info", `Running OCR: ${label} (${formatBytes(blobForOcr.size)})`);
        const result = await provider.recognize(blobForOcr);
        setTimings((current) => ({
          ...current,
          ocrInferenceMs: result.processingTimeMs,
          totalMs:
            (current.pdfLoadMs ?? 0) +
            (current.pdfTextMs ?? 0) +
            (current.pdfRenderMs ?? 0) +
            result.processingTimeMs,
        }));
        log(
          "info",
          `Done: ${result.metrics.recognizedLines} line(s), ${result.metrics.detectedBoxes} box(es), ${Math.round(result.metrics.totalMs)} ms engine / ${result.processingTimeMs} ms wall`,
        );
        if (result.boxes.length === 0) log("warn", "Empty OCR result — no text recognized.");


        const record: RunRecord = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          label,
          createdAt: Date.now(),
          pageNumber,
          preprocess: { ...preprocess },
          preprocessLabel: describePreprocess(preprocess),
          result,
          imageUrl: URL.createObjectURL(blobForOcr),
          qualityTest,
        };
        setRuns((current) => [record, ...current]);
        setActiveRunId(record.id);
        setStatus("ready");
        return record;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setStatus("error");
        setError(`Could not process this document. ${message}`);
        log("error", message);
        return null;
      } finally {
        setBusyLabel(null);
      }
    },
    [initialize, log, preprocess, qualityTest],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setPdfAnalysis(null);
      setRuns([]);
      setActiveRunId(null);
      setFixtureId(null);
      setSelectedField(null);
      setTextPdfPage(1);
      setTimings({
        pdfLoadMs: null,
        pdfTextMs: null,
        pdfRenderMs: null,
        ocrInitMs: null,
        ocrInferenceMs: null,
        classificationMs: null,
        fieldExtractionMs: null,
        totalMs: null,
      });
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);


      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isImage = file.type.startsWith("image/");

      if (!isPdf && !isImage) {
        setFileInfo(null);
        setSourceUrl(null);
        const message = `Unsupported file type "${file.type || "unknown"}". Upload a raster image or a PDF.`;
        setError(`Could not process this document. ${message}`);
        log("error", message);
        return;
      }

      log("info", `Loaded ${file.name} (${file.type || "unknown"}, ${formatBytes(file.size)})`);

      if (isPdf) {
        setBusyLabel("Analyzing PDF");
        try {
          const analysis = await analyzePdf(file);
          setPdfAnalysis(analysis);
          setFileInfo({ file, kind: "pdf", pageCount: analysis.pageCount });
          log(
            "info",
            `PDF: ${analysis.pageCount} page(s), ${analysis.totalChars} extractable characters → ${analysis.textBased ? "text-based" : "scanned/image"}`,
          );
          const rendered = await renderPdfPage(file, 1, 2);
          setSourceUrl(URL.createObjectURL(rendered.blob));
          setFileInfo({
            file,
            kind: "pdf",
            pageCount: analysis.pageCount,
            width: rendered.width,
            height: rendered.height,
          });
          if (!analysis.textBased) {
            log("info", "Scanned PDF: OCR-ing page 1 automatically.");
            await runOcr(rendered.blob, `${file.name} · page 1`, 1);
          }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught);
          setError(`Could not process this document. ${message}`);
          log("error", message);
        } finally {
          setBusyLabel(null);
        }
        return;
      }

      try {
        const size = await imageDimensions(file);
        setFileInfo({ file, kind: "image", width: size.width, height: size.height });
        setSourceUrl(URL.createObjectURL(file));
        log("info", `Image dimensions ${size.width}×${size.height}`);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        setFileInfo(null);
        setSourceUrl(null);
        setError(`Could not process this document. ${message}`);
        log("error", message);
      }
    },
    [log, runOcr, sourceUrl],
  );

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);


  const runImageOcr = () => {
    if (!fileInfo || fileInfo.kind !== "image") return;
    void runOcr(fileInfo.file, fileInfo.file.name, null);
  };

  const runPdfPage = async (pageNumber: number) => {
    if (!fileInfo || fileInfo.kind !== "pdf") return;
    setBusyLabel(`Rendering page ${pageNumber}`);
    try {
      const rendered = await renderPdfPage(fileInfo.file, pageNumber, 2);
      setBusyLabel(null);
      await runOcr(rendered.blob, `${fileInfo.file.name} · page ${pageNumber}`, pageNumber);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setError(`Could not process this document. ${message}`);
      log("error", message);
      setBusyLabel(null);
    }
  };

  const runAllPdfPages = async () => {
    if (!fileInfo || fileInfo.kind !== "pdf" || !pdfAnalysis) return;
    for (let page = 1; page <= pdfAnalysis.pageCount; page++) {
      await runPdfPage(page);
    }
  };

  const busy = busyLabel !== null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="panel mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
              PP-OCRv6 Local OCR Lab
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Test browser-based OCR accuracy before integrating it into Pre-Submission Error Guard.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge tone="success">🔒 Local Processing</Badge>
            <Badge tone={status === "error" ? "danger" : status === "ready" ? "accent" : "neutral"}>
              engine: {status}
            </Badge>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Your document is processed locally in your browser. No document is uploaded to an external
          OCR or AI API. There is no backend, no analytics and no sign-in.
        </p>
      </header>

      <Panel
        className="mb-6"
        title="Upload a document"
        subtitle="Images run through PP-OCRv6_small directly. PDFs are checked for a text layer first."
        actions={
          <>
            <Button
              variant="primary"
              onClick={() => imageInputRef.current?.click()}
              disabled={busy}
            >
              Upload Image
            </Button>
            <Button onClick={() => pdfInputRef.current?.click()} disabled={busy}>
              Upload PDF
            </Button>
            {status === "idle" && (
              <Button variant="ghost" onClick={() => void initialize()} disabled={busy}>
                Preload model
              </Button>
            )}
          </>
        }
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <div

          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={`rounded-lg border border-dashed p-6 text-center text-sm transition-colors ${
            dragging ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground"
          }`}
        >
          Drag and drop an image or PDF here
        </div>

        {fileInfo && (
          <div className="mt-4 grid gap-x-8 md:grid-cols-2">
            <div>
              <Row label="Filename" value={fileInfo.file.name} />
              <Row label="File type" value={fileInfo.file.type || "unknown"} />
              <Row label="File size" value={formatBytes(fileInfo.file.size)} />
            </div>
            <div>
              <Row
                label="Dimensions"
                value={
                  fileInfo.width && fileInfo.height
                    ? `${fileInfo.width}×${fileInfo.height}${fileInfo.kind === "pdf" ? " (page 1 @2x)" : ""}`
                    : "—"
                }
              />
              <Row label="PDF pages" value={fileInfo.pageCount ? String(fileInfo.pageCount) : "—"} />
              <Row
                label="Preprocessing"
                value={describePreprocess(preprocess)}
              />
            </div>
          </div>
        )}

        {fileInfo?.kind === "image" && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={runImageOcr} disabled={busy}>
              Run OCR
            </Button>
          </div>
        )}

        {fileInfo?.kind === "pdf" && pdfAnalysis && (
          <div className="mt-4 space-y-3">
            <Notice tone={pdfAnalysis.textBased ? "success" : "warning"}>
              {pdfAnalysis.textBased ? "Text-based PDF detected" : "Scanned/image PDF detected"} —{" "}
              {pdfAnalysis.totalChars} extractable characters across {pdfAnalysis.pageCount} page(s).
            </Notice>
            {pdfAnalysis.textBased && (
              <textarea
                readOnly
                rows={8}
                value={pdfAnalysis.pages
                  .map((page) => `— page ${page.pageNumber} —\n${page.text}`)
                  .join("\n\n")}
                className="w-full resize-y rounded-md border border-border bg-input px-3 py-2 font-mono text-xs text-foreground"
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void runPdfPage(1)} disabled={busy}>
                {pdfAnalysis.textBased ? "Run OCR anyway (page 1)" : "Re-run OCR on page 1"}
              </Button>
              <Button onClick={() => void runAllPdfPages()} disabled={busy}>
                Run OCR on all pages ({pdfAnalysis.pageCount})
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only page 1 runs automatically — long documents are never OCR-ed in bulk without asking.
            </p>
          </div>
        )}

        {busyLabel && (
          <p className="mt-4 font-mono text-xs text-accent">▶ {busyLabel}…</p>
        )}
        {error && (
          <div className="mt-4">
            <Notice tone="danger" title="Could not process this document.">
              {error} — full details are in Developer Diagnostics below.
            </Notice>
          </div>
        )}
      </Panel>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel
          title="Document preview"
          subtitle="The exact bitmap sent to the engine, with detection polygons drawn on top."
          actions={
            <>
              <Button variant={showBoxes ? "primary" : "default"} onClick={() => setShowBoxes((v) => !v)}>
                Boxes {showBoxes ? "ON" : "OFF"}
              </Button>
              <Button
                variant={showBoxText ? "primary" : "default"}
                onClick={() => setShowBoxText((v) => !v)}
              >
                Labels {showBoxText ? "ON" : "OFF"}
              </Button>
            </>
          }
        >
          <DocumentPreview
            imageUrl={activeRun?.imageUrl ?? sourceUrl}
            boxes={activeResult?.boxes ?? []}
            showBoxes={showBoxes}
            showText={showBoxText}
          />
          {activeRun && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              showing run “{activeRun.label}” · preprocessing: {activeRun.preprocessLabel}
            </p>
          )}
        </Panel>

        <OcrResults result={activeResult} />
      </div>

      <div className="mb-6">
        <MetricsPanel initInfo={initInfo} result={activeResult} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <QualityTests selected={qualityTest} onSelect={setQualityTest} />
        <Panel
          title="Preprocessing experiments"
          subtitle="All disabled by default. Enabled filters run in a local canvas before the image reaches the engine."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Checkbox
              label="Grayscale"
              checked={preprocess.grayscale}
              onChange={(v) => setPreprocess((p) => ({ ...p, grayscale: v }))}
            />
            <Checkbox
              label="Contrast enhancement"
              checked={preprocess.contrast}
              onChange={(v) => setPreprocess((p) => ({ ...p, contrast: v }))}
            />
            <Checkbox
              label="Sharpen"
              checked={preprocess.sharpen}
              onChange={(v) => setPreprocess((p) => ({ ...p, sharpen: v }))}
            />
            <Checkbox
              label="Threshold / binarization"
              hint="Otsu global threshold"
              checked={preprocess.threshold}
              onChange={(v) => setPreprocess((p) => ({ ...p, threshold: v }))}
            />
            <Checkbox
              label="Upscale 2x"
              checked={preprocess.upscale2x}
              onChange={(v) =>
                setPreprocess((p) => ({ ...p, upscale2x: v, upscale3x: v ? false : p.upscale3x }))
              }
            />
            <Checkbox
              label="Upscale 3x"
              checked={preprocess.upscale3x}
              onChange={(v) =>
                setPreprocess((p) => ({ ...p, upscale3x: v, upscale2x: v ? false : p.upscale2x }))
              }
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={busy || !fileInfo}
              onClick={() => {
                if (!fileInfo) return;
                if (fileInfo.kind === "image") runImageOcr();
                else void runPdfPage(1);
              }}
            >
              Re-run with current settings
            </Button>
            <Button variant="ghost" onClick={() => setPreprocess(DEFAULT_PREPROCESS)} disabled={busy}>
              Reset filters
            </Button>
          </div>
        </Panel>
      </div>

      <div className="mb-6">
        <RunComparison
          runs={runs}
          activeRunId={activeRun?.id ?? null}
          onSelect={setActiveRunId}
          onClear={() => {
            runs.forEach((run) => URL.revokeObjectURL(run.imageUrl));
            setRuns([]);
            setActiveRunId(null);
          }}
        />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <FieldExtractionPanel fields={fields} />
        <ManualVerification expected={expected} onChange={setExpected} fields={fields} />
      </div>

      <div className="mb-6">
        <GroundTruthPanel
          groundTruth={groundTruth}
          onChange={setGroundTruth}
          ocrText={activeResult?.text ?? null}
        />
      </div>

      <div className="mb-6">
        <Diagnostics
          status={status}
          initInfo={initInfo}
          result={activeResult}
          logs={logs}
          providerName={getProvider().name}
        />
      </div>

      <div className="mb-10">
        <EvaluationDashboard
          grades={grades}
          onGradeChange={(id, grade) => setGrades((current) => ({ ...current, [id]: grade }))}
          recommendation={recommendation}
          onRecommendationChange={setRecommendation}
        />
      </div>

      <footer className="pb-8 text-center text-xs text-muted-foreground">
        Standalone experiment · PP-OCRv6_small via @paddleocr/paddleocr-js + ONNX Runtime Web (WASM,
        Web Worker) · no cloud OCR, no external AI API, no Tesseract.
      </footer>
    </main>
  );
}
