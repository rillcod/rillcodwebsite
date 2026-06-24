/**
 * Extract readable text from a PDF in the browser, using the same self-hosted
 * pdf.js (legacy build) as the slide viewer. Used to "ground" AI course/lesson
 * generation in a teacher's actual material so the output aligns with their slides.
 *
 * Two passes:
 *  1. Embedded text (fast) — works for normal, text-based PDFs.
 *  2. OCR fallback (Tesseract.js, client-side) — for SCANNED PDFs that have no
 *     embedded text. Each page is rendered to a canvas and recognised. This is
 *     slower and bandwidth-heavy (the OCR engine + language data load on first
 *     use), so it only runs when pass 1 finds essentially nothing.
 *
 * Returns plain text capped at `maxChars`. `onProgress` reports stage/page so the
 * UI can show a live label during the (slow) OCR pass.
 */
export async function extractPdfText(
  file: File,
  maxChars = 8000,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  // ── Pass 1: embedded text ──
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    if (text.length >= maxChars) break;
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = (content.items as any[])
      .map((it) => (typeof it?.str === 'string' ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) text += `\n[Slide ${p}] ${pageText}`;
  }

  // Enough embedded text? Done — no OCR needed.
  if (text.trim().length >= 80) {
    try { doc.destroy?.(); } catch { /* ignore */ }
    return text.slice(0, maxChars).trim();
  }

  // ── Pass 2: OCR fallback (scanned PDF) ──
  onProgress?.('Scanned PDF — running OCR (this can take a moment)…');
  let ocr = '';
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
      const pages = Math.min(doc.numPages, 15); // cap for performance
      for (let p = 1; p <= pages; p++) {
        if (ocr.length >= maxChars) break;
        onProgress?.(`OCR page ${p} of ${pages}…`);
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const { data } = await worker.recognize(canvas);
        const pageText = (data?.text ?? '').replace(/\s+/g, ' ').trim();
        if (pageText) ocr += `\n[Slide ${p}] ${pageText}`;
      }
    } finally {
      await worker.terminate();
    }
  } catch {
    /* OCR unavailable — fall through with whatever embedded text we had */
  } finally {
    try { doc.destroy?.(); } catch { /* ignore */ }
  }

  return `${text}${ocr}`.slice(0, maxChars).trim();
}
