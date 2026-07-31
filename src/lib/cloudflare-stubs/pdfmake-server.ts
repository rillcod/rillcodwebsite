/**
 * Cloudflare stub for src/lib/pdfmake-server.ts — keeps PDF routes out of the Worker bundle.
 */
import { AppError } from "@/lib/errors";

export async function renderPdfToBuffer(_docDefinition: unknown): Promise<Buffer> {
  throw new AppError("PDF generation is not available on Cloudflare Workers", 501);
}

export function getPdfPrinter(): never {
  throw new AppError("PDF generation is not available on Cloudflare Workers", 501);
}
