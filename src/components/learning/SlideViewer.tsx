'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@/lib/icons';

/**
 * In-platform, view-only slide viewer.
 *
 * Deterrents (NOT unbreakable DRM — OS screenshots/phone cameras can't be blocked):
 *  - slides streamed via /api/slides (no grabbable file URL, no download button)
 *  - right-click / drag / text-selection / copy disabled; Ctrl/Cmd+S/P/C blocked
 *  - a faint, tiled per-student watermark (name · email) so any leak is traceable
 *
 * `slides` is an ordered list of R2 keys (served by /api/slides/<key>).
 */
export default function SlideViewer({
  slides,
  title,
  lessonId,
  onClose,
}: {
  slides: string[];
  title?: string;
  /** When set, the stream route enforces enrolment in this lesson's programme. */
  lessonId?: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [i, setI] = useState(0);
  const total = slides.length;
  const watermark = `${profile?.full_name ?? 'Rillcod Student'} · ${profile?.email ?? ''}`.trim();

  const next = useCallback(() => setI((p) => Math.min(p + 1, total - 1)), [total]);
  const prev = useCallback(() => setI((p) => Math.max(p - 1, 0)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Block save / print / copy shortcuts (deterrent).
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'c'].includes(k)) { e.preventDefault(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  if (total === 0) return null;

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
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Slide stage */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden px-2">
        {/* The slide — pointer-events-none + draggable false to deter save/drag */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/slides/${slides[i]}${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ''}`}
          alt={`Slide ${i + 1}`}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="max-w-full max-h-full object-contain pointer-events-none"
        />

        {/* Tiled watermark overlay */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex flex-wrap content-around justify-around gap-8 p-8">
          {Array.from({ length: 18 }).map((_, k) => (
            <span key={k} className="text-white/[0.07] text-xs font-bold rotate-[-28deg] whitespace-nowrap">
              {watermark}
            </span>
          ))}
        </div>

        {/* Edge nav */}
        {i > 0 && (
          <button onClick={prev} aria-label="Previous slide"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
        )}
        {i < total - 1 && (
          <button onClick={next} aria-label="Next slide"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
            <ChevronRightIcon className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Footer — progress + counter */}
      <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={prev} disabled={i === 0}
            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/70 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 disabled:opacity-30 transition-all">
            Prev
          </button>
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${((i + 1) / total) * 100}%` }} />
          </div>
          <span className="text-[11px] font-black text-white/60 tabular-nums">{i + 1} / {total}</span>
          <button onClick={next} disabled={i === total - 1}
            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white bg-violet-600 hover:bg-violet-500 rounded-lg disabled:opacity-30 transition-all">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
