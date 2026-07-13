/**
 * Unified server-side PDF renderer for pdfmake 0.3+.
 *
 * pdfmake 0.3 changed the API: `createPdfKitDocument` returns a Promise (not a
 * stream), so calling `.on('data')` throws "t.on is not a function".
 * All receipt / statement / certificate PDFs must go through `renderPdfToBuffer`.
 *
 * Fonts: use real Roboto TTF files shipped with pdfmake (not Helvetica standard
 * fonts). Standard fonts need AFM files beside pdfkit; when Next bundles pdfkit
 * those paths become `.next/server/chunks/data/*.afm` and break on Vercel.
 */
import { AppError } from '@/lib/errors';

let ready = false;

function ensurePdfMake() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfmake = require('pdfmake') as {
    addFonts: (fonts: Record<string, unknown>) => void;
    setUrlAccessPolicy?: (policy: ((url: string) => boolean) | null) => void;
    createPdf: (docDefinition: unknown, options?: unknown) => {
      getBuffer: () => Promise<Buffer | Uint8Array>;
    };
  };

  if (!pdfmake || typeof pdfmake.createPdf !== 'function') {
    throw new AppError('pdfmake is not available', 500);
  }

  if (!ready) {
    // Receipts/statements do not fetch remote assets; block unexpected URL loads.
    if (typeof pdfmake.setUrlAccessPolicy === 'function') {
      pdfmake.setUrlAccessPolicy(() => false);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const robotoMod = require('pdfmake/fonts/Roboto') as {
      Roboto: {
        normal: string;
        bold: string;
        italics: string;
        bolditalics: string;
      };
    };

    // Alias Helvetica → Roboto so older docs (e.g. certificates) keep working
    // without depending on pdfkit AFM files.
    pdfmake.addFonts({
      Roboto: robotoMod.Roboto,
      Helvetica: robotoMod.Roboto,
    });
    ready = true;
  }

  return pdfmake;
}

/**
 * Render a pdfmake document definition to a Node Buffer.
 * This is the single entry point for all server PDF generation.
 */
export async function renderPdfToBuffer(docDefinition: unknown): Promise<Buffer> {
  try {
    const pdfmake = ensurePdfMake();
    const def =
      docDefinition && typeof docDefinition === 'object'
        ? {
            ...(docDefinition as Record<string, unknown>),
            defaultStyle: {
              font: 'Roboto',
              ...((docDefinition as { defaultStyle?: Record<string, unknown> }).defaultStyle || {}),
            },
          }
        : docDefinition;

    const raw = await pdfmake.createPdf(def).getBuffer();
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (!buffer.length || buffer.slice(0, 4).toString() !== '%PDF') {
      throw new AppError('PDF renderer returned an invalid document', 500);
    }
    return buffer;
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    throw new AppError(`PDF generation failed: ${e?.message || String(e)}`, 500);
  }
}

/**
 * @deprecated Use `renderPdfToBuffer` — kept only so accidental old imports fail loudly.
 */
export function getPdfPrinter(): never {
  throw new AppError(
    'getPdfPrinter() is retired for pdfmake 0.3. Use renderPdfToBuffer(docDefinition) instead.',
    500,
  );
}
