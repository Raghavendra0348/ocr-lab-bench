# Fix repeated uploads and wrong-document detection

## Confirmed causes

- The extension stores only one `currentFile` and one `extractedDocData` for the entire page, even though the form contains separate Aadhaar, PAN, and certificate upload controls.
- Document parsing runs only when `extractedDocData` is empty. After the first upload, the second upload therefore keeps using the first document's data.
- Evaluation scans all file controls but collapses them back into that same single file/result, allowing one upload slot to affect another.
- The wrong-document warning UI already exists, but nothing determines the required type for an upload slot or invokes that warning.

## Implementation plan

### 1. Give every upload slot independent state

Replace the page-wide file/result variables with a registry keyed by the actual file input. Each slot will retain its own:

- selected file and a stable slot key
- required document type
- reading status and request generation
- classified type and confidence
- extracted fields and local form matches
- file, quality, and type-mismatch issues

Removing or replacing a file clears only that slot. Uploading a second document will always parse that document rather than reusing the first result.

### 2. Make the loading lifecycle deterministic

Use a per-upload state sequence:

```text
selected -> reading -> validating -> ready | failed
```

At the start of every upload, clear stale banners, progress, review notices, and prior results for that slot. End every path through one `finally`-style completion handler so the drawer cannot remain on the reading screen.

Add a request-generation token per slot. If a file is replaced while an older read is still running, late progress/results from the old read will be ignored. The finished audit will be rendered only after the new result has been stored and evaluation has completed.

### 3. Define what each upload slot requires

Add explicit document requirements to the portal rules, keyed by input selector/name, for example:

- Aadhaar upload -> `AADHAAR`
- PAN upload -> `PAN`
- income/caste certificate upload -> the corresponding certificate type or accepted certificate family
- generic attachment -> no strict type requirement

For other websites, resolve the expected type from a `data-*` declaration when available, then use the input's label, name, id, and nearby heading as a conservative fallback. If the slot cannot be identified reliably, do not invent a blocking mismatch.

### 4. Enforce document-type compatibility before autofill

After local classification, compare the detected type with the slot's accepted types:

- clear, high-confidence mismatch: blocking `WRONG_DOCUMENT_TYPE` issue with exact expected/actual details
- unknown or low-confidence classification: review warning, not a false blocking claim
- matching type: continue normally

An income certificate placed in the PAN slot will therefore produce a blocking warning, mark the PAN upload control, open the existing wrong-document banner, and offer replacement. Autofill and document-to-form comparisons from that wrong document will be suppressed.

### 5. Keep verification data isolated by document purpose

Aggregate all slot reports without mixing their extracted values. Name/DOB may be compared only from compatible identity documents; PAN numbers only from the PAN slot/document; Aadhaar numbers only from Aadhaar; certificate numbers only from certificate slots. Remove the current fallback that treats any available Aadhaar/PAN/certificate identifier as interchangeable.

The final readiness report and submission guard will include wrong-document issues, so dismissing the banner will not silently make the application valid.

### 6. Regression verification

Test in Chromium with the unpacked extension and the demo form:

1. Correct first upload completes and leaves the loading screen.
2. Correct second upload also completes and shows its own new result.
3. Replacing a file in the same slot clears the old result.
4. Rapid replacement cannot let an older result overwrite the newer one.
5. Income certificate in PAN slot produces a blocking expected-vs-actual warning and no autofill.
6. PAN in PAN, Aadhaar in Aadhaar, and certificate in certificate slots pass type validation.
7. Unknown/poor-quality documents request review rather than being falsely accepted or falsely identified.
8. Multiple uploaded documents retain independent inline warnings and no suggestion flicker.
9. Submission remains blocked while any confirmed wrong-document issue exists.

Finally rebuild the extension package, run syntax/build checks, and provide a new ZIP only after these browser scenarios pass.

## Technical detail

- Main changes: upload orchestration and report aggregation in `content/content.js`, slot-aware loading/warning state in `content/overlay.js`, and explicit slot requirements in the portal rules.
- Preserve the local PP-OCRv6 pipeline and existing UI palette; no cloud OCR or Gemini call is introduced.
- Keep classifier uncertainty visible. Type validation will use both the detected type and classification confidence rather than trusting every classification equally.
