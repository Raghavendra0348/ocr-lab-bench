# Turn the OCR Lab into a Chrome extension

Yes — the whole reading engine already runs inside the browser with no server and no outside service, so it can be packaged as a Chrome extension. The web lab stays exactly as it is; the extension is added alongside and shares the same reading code.

## What you get

A side panel extension with two modes:

**1. Lab mode** — everything you see today, inside the panel: pick an image or PDF, read it, see the boxes and confidence, the document type with its reasons, the extracted fields with evidence, the region inspector, timings, the synthetic test layouts and the scoring/metrics screens.

**2. Fill mode** — for a form open in the current tab:
- Read a document in the panel (file picker).
- The panel lists the form's own fields, read from the page, next to the matching values found in the document.
- Each row shows the confidence and a Fill button; a Fill all button applies every high-confidence row.
- Rows that disagree with something already typed in the form are flagged instead of overwritten, and low-confidence rows are never filled automatically.
- Nothing is filled without a click.

Documents are read from the file picker only, as you chose. No page capture.

## Privacy

The document never leaves the machine: reading happens inside the panel, the models are bundled in the extension package, and the extension asks for no network permission at all. Nothing is uploaded, logged, or sent anywhere.

## What ships

A downloadable ZIP plus a short install guide (unzip, open the extensions page, turn on developer mode, Load unpacked). A one-click install would need a Chrome Web Store listing, which is a separate step you can do later.

## Technical notes

- New `extension/` folder in the project, built by a second Vite config (`vite.extension.config.ts`) with `build.rollupOptions.input` for the side panel HTML and the content script; output to `extension/dist/`, packaged to `public/ocr-lab-extension.zip`.
- Manifest V3. `side_panel.default_path`, `background.service_worker` (opens the panel on action click only), `permissions: ["activeTab", "scripting", "storage"]`, no `host_permissions`, no network. CSP needs `wasm-unsafe-eval` for the ONNX runtime; inference stays in the panel document, never the service worker.
- Reused unchanged: `src/ocr/*`, `src/document/*` (classifier, parsers, patterns, spatial), `src/lib/preprocess.ts`, `pdf.ts`, `textCompare.ts`, `fieldExtraction.ts`, and the `src/components/lab/*` panels. Only the shell around them is new, so the lab and extension cannot drift apart.
- Asset resolution is the one required change to shared code: `PaddleOCRProvider` currently resolves `/models/...` and `/ort/...` against the site root. Introduce an injectable `resolveAsset(path)` (default = today's behaviour; extension passes `chrome.runtime.getURL`). Model tars, the ORT `.wasm` and `.mjs`, and the pdf.js worker are copied into the extension package and listed in `web_accessible_resources`.
- Fill mode: content script injected on demand via `chrome.scripting`, enumerates labelled inputs/selects (label text, `name`, `placeholder`, `aria-label`), sends them to the panel; the panel matches them to candidate fields using the existing name/date/ID normalisers in `textCompare.ts`; filling dispatches real `input`/`change` events so React-based forms register the value.
- Extension pages are plain React + the existing Tailwind stylesheet — no TanStack Start, no router, no server functions in that bundle.

## Order of work

1. Extension build config, manifest, side panel shell, packaging script and download link in the lab.
2. Lab mode in the panel using the shared components; verify real OCR runs inside the extension.
3. Content script + fill mode with per-field confirm and conflict flags.
4. Install guide page in the lab, and README section.
