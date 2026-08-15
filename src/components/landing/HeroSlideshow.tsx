"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play, Sparkles } from "lucide-react";

/**
 * Curated authentic photographs from real Rillcod classrooms, robotics build labs,
 * computer rooms, and exhibition summits across partner schools.
 */
export const HERO_FRAMES = [
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg",
    alt: "Rillcod students collaborating on autonomous robotics hardware builds",
    tag: "Robotics & Hardware Lab",
    caption: "Hands-on robotics kits deployed directly to partner schools",
  },
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM (1).jpeg",
    alt: "Certified STEM facilitator coaching students on circuit electronics at the lab bench",
    tag: "Certified Facilitation",
    caption: "Dedicated certified instructors guiding every session",
  },
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg",
    alt: "Students in school uniform writing software and algorithms on laptops",
    tag: "Software & AI Engineering",
    caption: "12-Year progressive coding curriculum from Scratch to Python & AI",
  },
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.27 PM.jpeg",
    alt: "Annual STEM Exhibition and Award Ceremony with school leadership",
    tag: "Annual STEM Summit",
    caption: "Trophies, exhibitions, and capstone demonstrations every term",
  },
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.46.29 PM (1).jpeg",
    alt: "Student presenting capstone technology project to school proprietors and parents",
    tag: "Capstone Portfolios",
    caption: "Tangible student inventions verified with live QR demo links",
  },
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM (1).jpeg",
    alt: "Vibrant computer laboratory filled with students actively coding",
    tag: "Turnkey Lab Delivery",
    caption: "Zero equipment CapEx required from the school",
  },
] as const;

const DWELL_MS = 5500;

export function HeroSlideshow({
  dotsRaised = true,
  onOpenVideo,
}: {
  dotsRaised?: boolean;
  onOpenVideo?: () => void;
} = {}) {
  const [frame, setFrame] = useState(0);
  const [running, setRunning] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => setRunning(true), []);

  useEffect(() => {
    if (!running) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const id = window.setInterval(() => setFrame((f) => (f + 1) % HERO_FRAMES.length), DWELL_MS);
    return () => window.clearInterval(id);
  }, [running, frame]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        setFrame((f) => (f + 1) % HERO_FRAMES.length);
      } else {
        setFrame((f) => (f - 1 + HERO_FRAMES.length) % HERO_FRAMES.length);
      }
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="relative w-full h-full select-none overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {HERO_FRAMES.map((f, i) => (
        <div
          key={f.src}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            i === frame ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <Image
            src={f.src}
            alt={f.alt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 600px"
            priority={i === 0}
            loading={i === 0 ? undefined : "lazy"}
            className="object-cover object-center"
          />
          {/* Subtle gradient vignette for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/30 via-transparent to-slate-950/30" />
        </div>
      ))}

      {/* The discipline tag, on screens with room for it. A phone shows the
          photograph, one way to play the video, and the dots — everything else
          was chrome competing with the picture it sat on. */}
      <div className="absolute top-4 left-4 z-20 hidden sm:flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-xl bg-slate-950/80 border border-white/20 px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-wider text-white backdrop-blur-md shadow-lg">
          <Sparkles className="w-3.5 h-3.5 text-brand-red-500" />
          <span>{HERO_FRAMES[frame].tag}</span>
        </div>
      </div>

      {/* Video Demo Button if provided */}
      {onOpenVideo && (
        <button
          type="button"
          onClick={onOpenVideo}
          className="absolute top-4 right-4 z-20 flex items-center gap-2 rounded-2xl bg-brand-red-600/90 hover:bg-brand-red-600 text-white px-3.5 py-1.5 text-xs font-bold shadow-xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span className="hidden sm:inline">Watch 45s Video</span>
          <span className="sm:hidden">Video</span>
        </button>
      )}

      {/* Bottom Live Caption & Slide Navigation */}
      <div
        className={`absolute inset-x-4 sm:inset-x-6 z-20 flex flex-col sm:flex-row sm:items-end justify-between gap-3 ${
          dotsRaised ? "bottom-24 sm:bottom-28" : "bottom-4 sm:bottom-6"
        }`}
      >
        {/* Hidden on a phone for the same reason as the tag: the headline beside
            this already says what the programme is, and a caption over a 4:3
            image on a small screen is a second voice saying it again. */}
        <div className="hidden sm:block max-w-xs sm:max-w-sm">
          <p className="text-[11px] sm:text-xs font-bold text-white leading-snug drop-shadow-md">
            {HERO_FRAMES[frame].caption}
          </p>
        </div>

        {/* Dots & Nav Buttons */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-950/60 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10">
          <button
            type="button"
            onClick={() => setFrame((f) => (f - 1 + HERO_FRAMES.length) % HERO_FRAMES.length)}
            aria-label="Previous photo"
            className="text-white/70 hover:text-white p-0.5"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1">
            {HERO_FRAMES.map((f, i) => (
              <button
                key={f.src}
                type="button"
                aria-label={`Show photo ${i + 1} of ${HERO_FRAMES.length}`}
                aria-current={i === frame}
                onClick={() => setFrame(i)}
                className={`h-1.5 rounded-full transition-all duration-500 ${
                  i === frame ? "w-6 bg-brand-red-500" : "w-1.5 bg-white/40 hover:bg-white/70"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFrame((f) => (f + 1) % HERO_FRAMES.length)}
            aria-label="Next photo"
            className="text-white/70 hover:text-white p-0.5"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
