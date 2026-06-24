// Copies the pdf.js (legacy) worker into /public so the SlideViewer can load it
// from our own domain — no runtime dependency on a CDN, and always version-matched
// to the installed pdfjs-dist. Runs on `prebuild`. Tolerant: never fails the build.
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
const destDir = resolve(root, 'public/pdfjs');
const dest = resolve(destDir, 'pdf.worker.min.mjs');

try {
  if (!existsSync(src)) {
    console.warn('[copy-pdf-worker] source not found, skipping:', src);
    process.exit(0);
  }
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  console.log('[copy-pdf-worker] copied pdf.js worker → public/pdfjs/');
} catch (err) {
  console.warn('[copy-pdf-worker] non-fatal:', err?.message ?? err);
  process.exit(0);
}
