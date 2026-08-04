"use client";

/**
 * The lesson's slide deck, inline.
 *
 * The deck used to be a banner at the very top of the lesson that opened a
 * fullscreen viewer. That put a recap before the lesson had started, and
 * reading it meant leaving the page — so most students either skipped it or
 * lost their place. Here it sits where a recap belongs, after the notes, and
 * turns in place: arrows, dots, swipe, keyboard. Fullscreen is still one click
 * away for anyone who wants to concentrate on it.
 *
 * Images stream through /api/slides, which enforces enrolment when a lessonId
 * is supplied — the same route the fullscreen viewer uses, so a slide is never
 * a grabbable file URL.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowsPointingOutIcon,
  PresentationChartLineIcon,
} from "@/lib/icons";

export default function LessonSlideStrip({
  slides,
  title,
  lessonId,
  onOpenFullscreen,
}: {
  slides: string[];
  title?: string;
  lessonId?: string;
  onOpenFullscreen?: () => void;
}) {
  const [index, setIndex] = useState(0);
  // Only slides the reader has actually reached are requested, so a deck does
  // not pull every image the moment the lesson loads.
  const [reached, setReached] = useState<Set<number>>(new Set([0]));
  const [loaded, setLoaded] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const frameRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const total = slides.length;
  const slideUrl = (key: string) =>
    `/api/slides/${key}${lessonId ? `?lesson=${encodeURIComponent(lessonId)}` : ""}`;

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      setIndex(clamped);
      setReached((prev) => {
        const seen = new Set(prev);
        seen.add(clamped);
        // Warm the next one so a forward tap feels instant.
        if (clamped + 1 < total) seen.add(clamped + 1);
        return seen;
      });
    },
    [total]
  );

  // Arrow keys, but only while the deck is the thing being looked at. Binding
  // them globally would hijack arrows from the rest of a long lesson page.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onKey = (event: KeyboardEvent) => {
      if (!frame.contains(document.activeElement)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(index + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  if (total === 0) return null;

  const atStart = index === 0;
  const atEnd = index === total - 1;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-px w-8 bg-cyan-500/40" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-600/70 dark:text-cyan-400/70">
          Slide Recap
        </p>
        <div className="h-px flex-1 bg-cyan-500/10" />
        <span className="shrink-0 text-[10px] font-black tabular-nums text-muted-foreground">
          {index + 1} / {total}
        </span>
      </div>

      <div
        ref={frameRef}
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={title ? `${title} slides` : "Lesson slides"}
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const delta = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
          if (Math.abs(delta) > 48) goTo(index + (delta < 0 ? 1 : -1));
          touchX.current = null;
        }}
        className="group relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-transparent outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
      >
        {/* 16:9 keeps the frame stable so the page does not jump between slides. */}
        <div className="relative aspect-[16/9] w-full bg-[#0B1120]">
          {slides.map((key, i) => {
            if (!reached.has(i)) return null;
            const isCurrent = i === index;
            return (
              <img
                key={key}
                src={slideUrl(key)}
                alt={`Slide ${i + 1} of ${total}`}
                draggable={false}
                onLoad={() =>
                  setLoaded((prev) => new Set(prev).add(i))
                }
                onError={() => setFailed((prev) => new Set(prev).add(i))}
                className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
                  isCurrent ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
              />
            );
          })}

          {!loaded.has(index) && !failed.has(index) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
            </div>
          )}

          {failed.has(index) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <PresentationChartLineIcon className="h-8 w-8 text-white/30" />
              <p className="text-xs font-bold text-white/70">
                This slide could not be loaded.
              </p>
              <p className="text-[10px] text-white/40">
                It may still be generating, or your access to this lesson has changed.
              </p>
            </div>
          )}

          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => goTo(index - 1)}
            disabled={atStart}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => goTo(index + 1)}
            disabled={atEnd}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>

          {onOpenFullscreen && (
            <button
              type="button"
              onClick={onOpenFullscreen}
              className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-white opacity-0 transition-opacity hover:bg-black/70 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
              Full screen
            </button>
          )}
        </div>
      </div>

      {/* Dots double as the progress read: how much of the recap is left. */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {slides.map((key, i) => (
          <button
            key={key}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index
                ? "w-6 bg-cyan-500"
                : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
