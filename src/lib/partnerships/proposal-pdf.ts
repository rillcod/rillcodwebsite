/**
 * Turning an issued document into a real A4 PDF, in the browser.
 *
 * The document is already print-ready A4 with explicit `.page` divs, so this
 * captures each page separately and lays them out as true A4 pages. The shared
 * `generateReportPDF` cannot be reused here: it sizes a single page to the whole
 * scroll height, which is right for a one-page report card and would turn a
 * six-page proposal into one enormous sheet no printer will take.
 *
 * Rendering happens client-side on purpose. The proposal's appearance is defined
 * by its own CSS, so the browser that already renders it is the only thing that
 * agrees with the preview by construction — a second server-side renderer would
 * be a second opinion about what the document looks like.
 *
 * The trade-off is that pages are rasterised, so text is not selectable. The
 * Print button remains the route to a vector PDF; this exists so a document can
 * be attached to an email, which printing cannot do.
 */

/** A4 at 96dpi, the size the templates lay out against. */
const A4 = { w: 794, h: 1123 };

async function pageToJpeg(page: HTMLElement, pixelRatio: number): Promise<string> {
  const { toPng } = await import('html-to-image');

  const pngUrl = await toPng(page, {
    pixelRatio,
    cacheBust: true,
    backgroundColor: '#fff',
    width: A4.w,
    height: A4.h,
  });

  // jsPDF's PNG path joins raw pixel bytes into one string and overflows the JS
  // max string length on a document this size. The JPEG path avoids it, which is
  // the same reason the report-card builder converts.
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/jpeg', 0.92));
    };
    img.src = pngUrl;
  });
}

/**
 * Build the PDF from a rendered document.
 *
 * `doc` is the iframe's own document, which is same-origin because the preview
 * is set through srcDoc.
 */
export async function buildDocumentPdf(doc: Document): Promise<import('jspdf').jsPDF> {
  const { default: jsPDF } = await import('jspdf');

  const pages = Array.from(doc.querySelectorAll<HTMLElement>('.page'));
  if (!pages.length) throw new Error('That document has no pages to render.');

  // Let any referenced image finish loading, or it captures as a blank box.
  await Promise.allSettled(
    Array.from(doc.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; }),
    ),
  );

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [A4.w, A4.h] });

  for (let i = 0; i < pages.length; i++) {
    const jpeg = await pageToJpeg(pages[i], 2);
    if (i > 0) pdf.addPage([A4.w, A4.h], 'portrait');
    pdf.addImage(jpeg, 'JPEG', 0, 0, A4.w, A4.h);
  }

  return pdf;
}

/** Save the document to the visitor's machine. */
export async function downloadDocumentPdf(doc: Document, filename: string): Promise<void> {
  const pdf = await buildDocumentPdf(doc);
  pdf.save(filename);
}

/** The PDF as base64, ready to be posted for emailing. */
export async function documentPdfBase64(doc: Document): Promise<string> {
  const pdf = await buildDocumentPdf(doc);
  const data = pdf.output('datauristring');
  return data.includes('base64,') ? data.split('base64,')[1] : data;
}

/** "Rillcod-Partnership-Proposal-RC-PROP-2026-00001.pdf" */
export function documentFilename(kind: 'proposal' | 'mou', reference: string): string {
  const label = kind === 'mou' ? 'Memorandum-of-Understanding' : 'Partnership-Proposal';
  return `Rillcod-${label}-${String(reference).replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
}
