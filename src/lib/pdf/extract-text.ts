/**
 * Extract readable text from a PDF in the browser, using the same self-hosted
 * pdf.js (legacy build) as the slide viewer. Used to "ground" AI course/lesson
 * generation in a teacher's actual material so the output aligns with their slides.
 *
 * Returns plain text capped at `maxChars` (prompts have token limits). Page breaks
 * are marked so the model can see slide structure.
 */
export async function extractPdfText(file: File, maxChars = 8000): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: buf }).promise;

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
  return text.slice(0, maxChars).trim();
}
