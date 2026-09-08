# Blurry uploads: always flagged, never read

Currently the extension only reports extremely blurry images (sharpness below 1.8) and still runs the full on-device OCR afterward. This change makes any blurriness a hard stop.

## What changes

1. **Sensitive blur detection** (`extension/modules/image-quality.js`)
   - The blur threshold moves from "severely degraded" (1.8) to "below the sharp range of a normal document" (typical documents score 3.0–20.0, so anything under ~2.8 counts as blurry).
   - The message stays exact and actionable, showing the measured sharpness score and asking for a clear, sharp, well-lit scan.

2. **OCR is skipped for blurry uploads** (`extension/content/content.js`)
   - The quality check already runs before reading starts. When a `DOCUMENT_BLURRED` (or other blocking-quality) result comes back, that upload slot is marked failed and the local OCR step is never started — no wasted seconds reading an unreadable file.
   - The per-slot state records the quality issue, the loading state ends immediately, and the existing wrong/blurry warning banner stays visible (it no longer gets wiped by later UI refreshes).
   - Autofill is blocked for that upload since there is no trusted reading.

3. **Clear user feedback**
   - The warning below/above the upload says the image is blurry, shows the sharpness score, and says exactly what to do: upload a clear, sharp, well-lit scan.
   - Progress/loading text uses the on-device wording (no "AI" wording).

## Verification

- `node --check` on edited scripts and the extension engine rebuild.
- Direct logic test: a mildly blurred image scores under the new threshold and short-circuits before OCR; a sharp image proceeds normally.
- Report back what was verified before packaging a new ZIP.
