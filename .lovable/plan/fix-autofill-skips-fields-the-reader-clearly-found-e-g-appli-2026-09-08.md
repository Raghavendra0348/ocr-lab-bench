# Fix: Autofill skips fields the reader clearly found (e.g. applicant name on PAN)

## What is happening

After reading a PAN card, the popup lists the details found (name, date of birth, PAN number) because that list is built from the full reading result. But the "Autofill" button uses a *separate*, much stricter list: only values whose confidence is at least 85% get into it. Anything the reader flagged as "review" — very common for a name on a photo of a PAN card — is silently left out, so the field stays empty with no explanation.

Confirmed in the code: the matcher only adds a row to the fill list when its state is `high` and confidence >= 0.85, while the banner's summary is built from the parsed document data instead of that same list.

## The fix

1. Produce two lists from the on-device matcher instead of one:
   - auto list: high-confidence, empty target field (unchanged behaviour).
   - review list: values that were found but are less certain, where the target field is empty and there is no conflict with typed text.
2. Autofill applies both lists when the user clicks the button. That click is the explicit consent, so a "review" value should be filled — not dropped.
3. Anything filled from the review list is visually marked and gets an inline note under the field: what was read, how confident, and "please confirm against your document". This reuses the existing inline warning/tooltip styling.
4. Values that disagree with text the user already typed are still never overwritten; they are surfaced as a mismatch note as today.
5. The banner's summary is built from the same match rows it will actually fill, so the list shown and the fields filled can no longer disagree. Fields that genuinely could not be read are listed as "not found" instead of appearing to be found.
6. Keep the safety rules already in place: an Aadhaar or PAN number never lands in a certificate-number field, and parent-name fields are only filled from an actual parent-name reading.

## Technical detail

- `extension-src/formMatch.ts`: keep `fieldMap` (high-confidence only) and add `reviewMap` plus per-row `fillable` flag; rows with `state === "review"`, empty `existingValue`, and no conflict become fillable-with-warning. Rebuild the engine bundle and repackage.
- `extension/content/content.js`: `applyFieldMap` takes the combined map plus the row metadata, tracks which keys came from the review list, and passes them to the overlay; banner summary derives from `ocrResult.match.rows`.
- `extension/content/overlay.js`: render the review notes through the existing `.eg-inline-tooltip` / `.eg-field-warn` path.
- Verify in Chromium with a PAN sample: the applicant name field fills, is marked for review, and the note shows the read value and confidence.
