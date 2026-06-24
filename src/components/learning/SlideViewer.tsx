'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, MinusIcon } from '@/lib/icons';

/**
 * In-platform, view-only slide viewer. Supports two deck kinds:
 *   • image deck → `slides` is an ordered list of R2 keys (served by /api/slides)
 *   • PDF deck   → `pdfKey` is one R2 key; pages are rendered with pdf.js to canvas
 *
 * Deterrents (NOT unbreakable DRM — OS screenshots/phone cameras can't be blocked):
 *  - content streamed via /api/slides (no grabbable file URL, no download button)
 *  - right-click / drag / text-selection / copy disabled; Ctrl/Cmd+S/P/C blocked
 *  - a faint, tiled per-student watermark (name · email) so any leak is traceable
 */
export default function SlideViewer({
  slides,
  pdfKey,
  title,
  lessonId,
  onClose,
}: {
  slides?: string[];
  pdfKey?: string;
  title?: string;
  /** When set, the stream route enforces enrolment in this lesson's programme. */
  lessonId?: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const isPdf = !!pdfKey;
  const imageSlides = slides ?? [];

  const [i, setI] = useState(0);
  const [scale, setScale] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isPdf);
  const [imgError, setImgError] = useState(false);

  const pdfDocRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const total = isPdf ? numPages : imageSlides.length;
  const watermark = `${profile?.full_name ?? 'Rillcod Student'} · ${profile?.email ?? ''}`.trim();
  const slideUrl = (key: string) => `/api/slides/${key}${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ''}`;

  const next = useCallback(() => setI((p) => Math.min(p + 1, (total || 1) - 1)), [total]);
  const prev = useCallback(() => setI((p) => Math.max(p - 1, 0)), []);
  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 3)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), []);

  // Reset zoom + image-error state when changing page.
  useEffect(() => { setScale(1); setImgError(false); }, [i]);

  // Keyboard nav + blocked shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'c'].includes(k)) { e.preventDefault(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  // Load the PDF document (once).
  useEffect(() => {
    if (!pdfKey) return;
    let cancelled = false;
    setLoading(true); setLoadError(null);
    (async () => {
      try {
        const res = await fetch(slideUrl(pdfKey));
        if (!res.ok) throw new Error('Failed to load slides');
        const buf = await res.arrayBuffer();
        // Legacy build = transpiled/polyfilled for older browsers & Android WebViews
        // (the standard build uses Promise.withResolvers, which crashes on older devices).
        const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
        // Self-hosted worker (copied to /public by the prebuild step) — no CDN dependency.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setLoading(false);
      } catch {
        if (!cancelled) { setLoadError('Could not load the slides. Please try again.'); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfKey, lessonId]);

  // Render the current PDF page whenever page or zoom changes.
  useEffect(() => {
    if (!isPdf || !pdfDocRef.current || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDocRef.current.getPage(i + 1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1.5 * scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch { /* page render race on fast nav — ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isPdf, i, scale, numPages]);

  if (!isPdf && imageSlides.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-black text-white truncate">{title || 'Learning Slides'}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-widest">View only · do not share</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} aria-label="Zoom out" className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"><MinusIcon className="w-4 h-4" /></button>
          <span className="text-[10px] font-black text-white/50 w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} aria-label="Zoom in" className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"><PlusIcon className="w-4 h-4" /></button>
          <button onClick={onClose} aria-label="Close" className="ml-1 p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"><XMarkIcon className="w-5 h-5" /></button>
        </div>
      </div>

      {/* Stage */}
      <div className="flex-1 relative flex items-center justify-center overflow-auto p-2">
        {loading && <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />}
        {loadError && <p className="text-sm text-rose-400">{loadError}</p>}

        {!loading && !loadError && (
          isPdf ? (
            <canvas ref={canvasRef} className="max-w-full h-auto shadow-2xl pointer-events-none" />
          ) : imgError ? (
            <p className="text-sm text-white/50">This slide couldn&apos;t load. Try the next/previous slide.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slideUrl(imageSlides[i])}
              alt={`Slide ${i + 1}`}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onError={() => setImgError(true)}
              style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
              className="max-w-full max-h-full object-contain pointer-events-none transition-transform"
            />
          )
        )}

        {/* Tiled watermark overlay */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex flex-wrap content-around justify-around gap-8 p-8">
          {Array.from({ length: 18 }).map((_, k) => (
            <span key={k} className="text-white/[0.07] text-xs font-bold rotate-[-28deg] whitespace-nowrap">{watermark}</span>
          ))}
        </div>

        {/* Edge nav */}
        {i > 0 && (
          <button onClick={prev} aria-label="Previous slide"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
        )}
        {total > 0 && i < total - 1 && (
          <button onClick={next} aria-label="Next slide"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10">
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={prev} disabled={i === 0}
            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/70 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-all">Prev</button>
          <button type="button" aria-label="Jump to slide"
            onClick={(e) => {
              if (!total) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = (e.clientX - rect.left) / rect.width;
              setI(Math.max(0, Math.min(total - 1, Math.round(frac * (total - 1)))));
            }}
            className="flex-1 h-4 flex items-center cursor-pointer group/seek">
            <div className="w-full h-1.5 group-hover/seek:h-2.5 bg-white/10 rounded-full overflow-hidden transition-all">
              <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: total ? `${((i + 1) / total) * 100}%` : '0%' }} />
            </div>
          </button>
          <span className="text-[11px] font-black text-white/60 tabular-nums">{total ? i + 1 : 0} / {total}</span>
          <button onClick={next} disabled={total === 0 || i === total - 1}
            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white bg-violet-600 hover:bg-violet-500 rounded-lg disabled:opacity-30 transition-all">Next</button>
        </div>
      </div>
    </div>
  );
}
