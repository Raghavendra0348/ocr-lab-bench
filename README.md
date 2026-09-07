# PP-OCRv6 Local OCR Lab

A standalone, browser-only OCR test bench used to answer one question:

> **Is PP-OCRv6_small good enough for document verification?**

This project is intentionally independent. It does not connect to, read from, or modify any other
project. It is not a Chrome extension and it contains no government-form validation logic.

## Hard constraints honoured

- OCR runs **entirely locally in the browser** (ONNX Runtime Web, WASM backend, inside a Web Worker).
- **No** Tesseract.js.
- **No** cloud OCR or external AI API: no OpenAI, Gemini, Claude, Google Vision, AWS Textract,
  Azure OCR.
- No backend, no analytics, no sign-in, no document upload of any kind.
- Nothing on screen is simulated: every character, confidence score, box and timing comes from the
  real model output. When the model returns nothing, the app says so.

## Run it

```bash
bun install
bun run dev
```

Open the app, upload an image or PDF, and press **Run OCR**. The first run downloads the model
files once (from this app's own origin) and initializes the worker; later runs reuse it.

## Engine and models

| Piece | What is used |
| --- | --- |
| Library | `@paddleocr/paddleocr-js` |
| Model | `PP-OCRv6_small` detection + `PP-OCRv6_small` recognition (English) |
| Runtime | `onnxruntime-web` 1.29, WASM + SIMD, inside a Web Worker |
| PDF | `pdfjs-dist` (text-layer analysis + page rasterization) |

Model archives and the ONNX Runtime WASM files are served from this app's own origin (they are
stored as externalized assets because the recognition archive is ~20 MB, above the repository file
limit). No CDN or third-party host is contacted for inference.

Threading: real multi-threaded WASM needs `SharedArrayBuffer`, which needs cross-origin isolation
(COOP/COEP headers). The app checks `crossOriginIsolated` at startup; if it is false it drops to a
single thread and records a warning in Developer Diagnostics. This is a speed limit only, never an
accuracy claim.

## What the lab does

1. **Upload** — drag/drop or pick an image or PDF. File name, type, size and pixel dimensions are shown.
2. **PDF handling** — the text layer is inspected first. Text-based PDFs show their extracted text
   (OCR is unnecessary but can still be forced). Scanned PDFs are rasterized at 2x and OCR-ed;
   only page 1 runs automatically, with an explicit button for all pages.
3. **OCR** — full text, per-line text, per-line model confidence with high (≥90%), medium (75–90%)
   and low (<75%) states, polygons and axis-aligned boxes.
4. **Overlay** — detection polygons drawn on the exact bitmap sent to the engine, with toggles for
   boxes and recognized-text labels.
5. **Metrics** — model init time, detection ms, recognition ms, engine total, wall-clock time,
   detected boxes, recognized lines, image dimensions.
6. **Field extraction** — deterministic label/geometry/regex rules for Name, Date of Birth and
   Certificate/Application/Registration number. Each field reports the source OCR line, the model
   confidence, the rule confidence and the strategy used. If no rule matches safely the field reads
   *Not confidently detected* — it is never guessed.
7. **Manual verification** — type the expected Name, DOB and certificate number and compare against
   real OCR output with normalization, fuzzy similarity and date-format tolerance. A match is never
   reported as strong when OCR confidence is below 75%.
8. **Ground-truth scoring** — paste the true text; get character accuracy, word accuracy and edit
   distance. This is a simple user-provided score, not a rigorous benchmark.
9. **Preprocessing experiments** — grayscale, contrast, sharpen, threshold/binarization, 2x/3x
   upscale. All off by default, all done in a local canvas, and every run is logged so original vs
   preprocessed output can be compared side by side.
10. **Run log** — every run of the session with its preprocessing, quality-test label, line count,
    mean confidence and timings. Click a row to reload that run.
11. **Diagnostics** — model/runtime/backend/worker/WASM status, timings, warnings, errors and a
    copyable report that deliberately excludes image data and recognized text.
12. **Evaluation checklist** — grade printed documents, low-quality scans, phone photos, rotated
    documents, names, DOB, certificate numbers, tables and overall quality as Excellent / Good /
    Poor, plus a free-text recommendation. These grades are yours; the app never fills them in.

## Suggested test set

Clean scan → low-resolution scan → blurry document → rotated document → phone photograph →
document with shadows → complex certificate with labels, values, seals and tables. Tag each upload
with the matching quality test so the run log stays readable.

## Limitations

- English recognition model only; other scripts are out of scope for this test.
- No deskewing or perspective correction, so heavily rotated or angled photos will show the
  model's raw weakness — that is the point of the test.
- Field extraction rules are deliberately conservative and simple; they exist to test OCR quality,
  not to be a production parser.
- Accuracy scores depend entirely on the ground truth you type in.
- Single-threaded WASM without cross-origin isolation makes timings slower than a native runtime.

## If the results are good enough

The OCR layer is engine-agnostic (`src/ocr/OCRProvider.ts` interface, `PaddleOCRProvider`
implementation) and the extraction/comparison helpers in `src/lib/` are pure functions. Those two
pieces can be lifted as-is into the future Chrome extension and form-validation system without
carrying any of this dashboard's UI.
