# On-device reading and auto-fill for the Error Guard extension

Your extension currently reads documents in three ways, and two of them send the file out of the browser: the local Gemini backend on port 5001/5000 (`/api/analyze-document`, `/api/map-form-fields`) and the direct Gemini key path. Only the Tesseract fallback stays on the machine, and it can't handle PDFs at all. The auto-fill decisions also come from Gemini.

This work replaces all of that with the reading pipeline built in this lab — detection, recognition, document type, field candidates with confidence — running entirely inside the extension. No file, no page text, and no form values ever leave the browser.

## What you'll get

A drop-in package you merge into your own repo (kept separate, as you chose):

- A single bundled reading engine file plus its model and runtime files, added to your `extension/` folder.
- Replacements for the files that currently call Gemini: `modules/ocr-engine.js`, `modules/document-parser.js`, the document part of `content/content.js`, plus a new offscreen reading page and updated `manifest.json`.
- The AI path stays in the code but is off by default, behind a switch in the popup. On-device reading is always what runs unless you deliberately turn AI on.
- The canned demo results are removed — the demo certificates get genuinely read like any other file.
- PDFs work: text-based PDFs are read from their own text layer, scanned PDFs are rendered and recognised.
- A short merge guide (`INTEGRATION.md`) listing exactly which files to copy and which to overwrite.

## How auto-fill changes

Today Gemini is handed both the document and your form's field list and returns a field-to-value map. Instead:

1. The extension reads the document on-device and gets candidate values with a confidence and the evidence behind each one.
2. Your existing form scraper still supplies the page's fields; each field is matched to a candidate using the same name / date / ID normalising rules the lab already uses, combined with your existing semantic field types (full name, DOB, Aadhaar number, PAN number, certificate number, father name).
3. The auto-fill banner keeps working as it does now. Only high-confidence matches fill; anything uncertain is shown for review, and a field you already typed in is never overwritten. Aadhaar/PAN numbers still never land in a certificate-number field.

Where Gemini currently gives one confident answer, the on-device engine gives a confidence and its reasons — so borderline documents surface as "review this" instead of silently filling a wrong value.

## Technical notes

**Engine bundle.** A separate Vite library build compiles `src/ocr/*`, `src/document/*` (classifier, parsers, patterns, spatial), `src/lib/preprocess.ts`, `pdf.ts`, `textCompare.ts` into one IIFE at `extension/engine/errorguard-engine.js` exposing a small API: `readDocument(fileOrArrayBuffer, {onProgress}) -> { regions, classification, fields, candidates, timings }`. Shared lab code is reused unchanged except for one required change: `PaddleOCRProvider` gains an injectable `resolveAsset(path)` (default = today's `/models`, `/ort` behaviour; extension passes `chrome.runtime.getURL`).

**Where inference runs.** Not in the content script (page CSP and DOM pollution) and not in the service worker (no DOM/canvas). An MV3 **offscreen document** (`extension/offscreen/offscreen.html`) loads the engine bundle; `reasons: ["WORKERS", "BLOBS"]`. Manifest changes: add `"offscreen"` permission, keep `activeTab`/`storage`, drop `lib/tesseract*` from `content_scripts`, add the engine + `models/*`, `ort/*`, `pdf.worker` to `web_accessible_resources`, and add `"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }`.

**Message flow.** Content script → service worker (`{type:'EG_READ_DOCUMENT', bytes, mimeType, name}` via structured clone of an ArrayBuffer, no base64) → service worker ensures the offscreen document exists → offscreen reads and streams `EG_READ_PROGRESS` back so the existing `Overlay.setAiProgress` bar keeps moving → returns the result. The offscreen document is closed after an idle timeout so models aren't held in memory forever.

**Bundled assets.** `PP-OCRv6_small_det_onnx_infer.tar`, `PP-OCRv6_small_rec_onnx_infer.tar` (~10 MB combined), `ort-wasm-simd-threaded.wasm` + `.mjs`, and the pdf.js worker are copied into `extension/models/`, `extension/ort/`, `extension/lib/`. Fetched via `chrome.runtime.getURL` only — the manifest keeps no network host permission for reading, so `host_permissions` narrows to what the AI opt-in needs and the on-device path works fully offline. First read initialises models once (a few seconds); later reads reuse the warm engine.

**Shape adapter.** `modules/document-parser.js` keeps its current output shape (`{name, dob, certificateNo, aadhaarNo, panNo, docType, ...}`) so `matcher.js`, `form-validator.js`, `error-engine.js` and `overlay.js` need no changes; it just maps engine candidates into those keys and carries the per-field confidence along.

**AI opt-in.** The Gemini backend and key paths move behind a stored flag (`eg_ai_mode`, default off) and are only attempted when explicitly enabled; the popup's key box gets a clear "sends your document to Google" note. `google-vision.js` and `backend/` stay in the repo untouched.

## Order of work

1. Injectable asset resolver in `PaddleOCRProvider`; engine entry module and `vite.extension.config.ts`; verify the bundle runs in a plain HTML page.
2. Offscreen document, service-worker bridge, manifest changes; verify a real image is read inside a loaded unpacked extension.
3. Rewrite `ocr-engine.js` to call the bridge, adapt `document-parser.js`, remove the demo fast path and Tesseract, put the AI path behind the off-by-default flag.
4. On-device form-field matching to replace `/api/map-form-fields`, wired into the existing auto-fill banner with per-field confidence and review states.
5. Test against your `demo-portal` (valid certificate, name mismatch, DOB mismatch, blurry, Aadhaar PDF) with the backend stopped, and write `INTEGRATION.md`.
