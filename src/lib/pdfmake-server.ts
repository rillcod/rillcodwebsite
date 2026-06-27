import { AppError } from '@/lib/errors';

let cachedPrinter: any = null;

export function getPdfPrinter() {
  if (cachedPrinter) return cachedPrinter;

  try {
    const mod = require('pdfmake/js/Printer');
    cachedPrinter = mod?.default ?? mod?.PdfPrinter ?? mod;
  } catch {
    try {
      const mod = require('pdfmake');
      cachedPrinter = mod?.default ?? mod?.PdfPrinter ?? mod;
    } catch {
      cachedPrinter = null;
    }
  }

  if (typeof cachedPrinter !== 'function') {
    throw new AppError('pdfmake printer is not available', 500);
  }

  return cachedPrinter;
}
