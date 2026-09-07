export interface PdfPageText {
  pageNumber: number;
  text: string;
}

export interface PdfAnalysis {
  pageCount: number;
  pages: PdfPageText[];
  totalChars: number;
  /** true when the PDF already carries a usable text layer. */
  textBased: boolean;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
  return pdfjs;
}

async function openDocument(file: Blob) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjs.getDocument({ data }).promise;
  } catch (error) {
    throw new Error(
      `PDF could not be opened (corrupted, encrypted or unsupported): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function analyzePdf(file: Blob): Promise<PdfAnalysis> {
  const doc = await openDocument(file);
  const pages: PdfPageText[] = [];
  let totalChars = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    totalChars += text.replace(/\s/g, "").length;
    pages.push({ pageNumber: i, text });
    page.cleanup();
  }

  const pageCount = doc.numPages;
  doc.cleanup();

  // Heuristic: a real text layer usually yields well over 100 characters/page.
  const textBased = totalChars / Math.max(1, pageCount) >= 100;
  return { pageCount, pages, totalChars, textBased };
}

export async function renderPdfPage(
  file: Blob,
  pageNumber: number,
  scale = 2,
): Promise<{ blob: Blob; width: number; height: number }> {
  const doc = await openDocument(file);
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable while rendering the PDF page.");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Rendered PDF page could not be encoded as an image.");
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    doc.cleanup();
  }
}
