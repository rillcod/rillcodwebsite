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

/**
 * Where a captured page sits on its A4 sheet, and at what size.
 *
 * Every page used to be captured at exactly one sheet and placed at exactly one
 * sheet, which is not "fit it to A4" — it is a crop. A page a few millimetres
 * long lost its last lines, in the file that goes out by email, with nothing to
 * say so. Printing stopped doing that; this is the same guarantee for the copy a
 * school actually receives.
 *
 * A long page is scaled down to fit instead of being cut. That costs a little
 * type size on that one page, which is the lesser of the two harms: type a
 * fraction smaller can still be read, and a clause that was never drawn cannot.
 * It should also be rare — every sheet of an ordinary proposal and agreement
 * lays out inside A4 — so this is a net that is not meant to be landed in.
 *
 * Pure, and exported, because it is the whole rule and it can be checked without
 * a browser.
 */
export function fitPageToSheet(naturalHeight: number): {
  width: number;
  height: number;
  x: number;
  y: number;
  scaled: boolean;
} {
  const height = Math.max(1, Math.round(naturalHeight) || A4.h);
  if (height <= A4.h) return { width: A4.w, height: A4.h, x: 0, y: 0, scaled: false };

  /*
    A page barely over the sheet fills it; only a genuinely long one is inset.

    Scaling to fit keeps the page's proportions, which means a narrower image on
    a full-width sheet — white bars down both sides. That is the right trade for
    a page carrying an extra section, and quite wrong for one a few pixels over
    from a border or a rounded height: the reader sees a document that does not
    fit its own paper, over an overshoot nobody could point to.

    Within a small tolerance the page is simply drawn to the full sheet. The
    distortion is a fraction of a percent — far below anything the eye reads as
    stretched — and it is the difference between a document that looks printed
    and one that looks pasted.
  */
  const overshoot = height / A4.h - 1;
  if (overshoot <= 0.02) return { width: A4.w, height: A4.h, x: 0, y: 0, scaled: false };

  const scale = A4.h / height;
  const width = A4.w * scale;
  return { width, height: A4.h, x: (A4.w - width) / 2, y: 0, scaled: true };
}

/** The height a page actually occupies, which may be more than one sheet. */
function naturalHeight(page: HTMLElement): number {
  return Math.max(page.scrollHeight, Math.round(page.getBoundingClientRect().height), A4.h);
}

async function pageToJpeg(
  page: HTMLElement,
  pixelRatio: number,
  quality = 0.96,
  skipFonts = false,
): Promise<string> {
  const { toPng } = await import('html-to-image');

  const pngUrl = await toPng(page, {
    pixelRatio,
    /*
      Web fonts are fetched and inlined by default, and the document loads its
      faces from Google. That fetch is cross-origin, and when it is refused the
      whole capture throws — which is how a proposal went out as an HTML
      attachment with nobody told why. Skipping the embed renders with the
      faces the browser has already loaded.
    */
    skipFonts,
    cacheBust: true,
    backgroundColor: '#ffffff',
    width: A4.w,
    // The page as it really is. Asking for exactly A4 here is what made a long
    // page come back already cut, before anything could decide what to do.
    height: naturalHeight(page),
    style: {
      transform: 'none',
      margin: '0',
    },
  });

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      resolve(c.toDataURL('image/jpeg', quality));
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
/**
 * How finely each sheet is rasterised.
 *
 * A download is read on a screen and printed, so it is worth three times A4.
 * An email attachment has to survive being posted as base64 inside a JSON
 * request first, and ten sheets at that resolution do not: the request never
 * arrives, and the server can only say it could not read it. Two is still
 * beyond what a printer resolves and roughly halves the weight.
 */
export type PdfQuality = 'download' | 'email';
const GRADES: Record<PdfQuality, { pixelRatio: number; quality: number }> = {
  download: { pixelRatio: 3, quality: 0.96 },
  email: { pixelRatio: 2, quality: 0.82 },
};

export async function buildDocumentPdf(
  doc: Document,
  grade: PdfQuality = 'download',
  skipFonts = false,
): Promise<import('jspdf').jsPDF> {
  const { default: jsPDF } = await import('jspdf');

  // Wait for document fonts and all external assets to be fully ready
  try {
    if (doc.fonts && typeof doc.fonts.ready === 'object') {
      await doc.fonts.ready;
    }
  } catch {
    // Fallback if fonts.ready API is unsupported
  }

  const pages = Array.from(doc.querySelectorAll<HTMLElement>('.page'));
  if (!pages.length) throw new Error('That document has no pages to render.');

  // Let any referenced image finish loading, or it captures as a blank box.
  await Promise.allSettled(
    Array.from(doc.images).map((img) =>
      img.complete ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; }),
    ),
  );

  // Allow a micro-tick for layout stabilization after font load
  await new Promise((r) => setTimeout(r, 100));

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [A4.w, A4.h] });

  for (let i = 0; i < pages.length; i++) {
    const jpeg = await pageToJpeg(pages[i], GRADES[grade].pixelRatio, GRADES[grade].quality, skipFonts);
    const fit = fitPageToSheet(naturalHeight(pages[i]));
    if (i > 0) pdf.addPage([A4.w, A4.h], 'portrait');
    pdf.addImage(jpeg, 'JPEG', fit.x, fit.y, fit.width, fit.height, undefined, 'FAST');
  }

  return pdf;
}

/** Save the document to the visitor's machine. */
export async function downloadDocumentPdf(doc: Document, filename: string): Promise<void> {
  const pdf = await buildDocumentPdf(doc);
  pdf.save(filename);
}

/**
 * The PDF as base64, ready to be posted for emailing.
 *
 * Tried once with the fonts embedded, and once without if that fails. A
 * capture that throws used to leave the caller with nothing, and the document
 * was emailed as an HTML file — which is what a school then receives, and it
 * does not look like a proposal. A PDF set in the faces the browser already
 * has is a far better outcome than no PDF at all.
 */
export async function documentPdfBase64(doc: Document): Promise<string> {
  let pdf;
  try {
    pdf = await buildDocumentPdf(doc, 'email');
  } catch {
    pdf = await buildDocumentPdf(doc, 'email', true);
  }
  const data = pdf.output('datauristring');
  return data.includes('base64,') ? data.split('base64,')[1] : data;
}

/** "Rillcod-Partnership-Proposal-RC-PROP-2026-00001.pdf" */
export function documentFilename(kind: 'proposal' | 'mou', reference: string): string {
  const label = kind === 'mou' ? 'Memorandum-of-Understanding' : 'Partnership-Proposal';
  return `Rillcod-${label}-${String(reference).replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`;
}
