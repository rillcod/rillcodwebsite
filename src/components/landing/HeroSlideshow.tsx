"use client";

/**
 * The hero, as photographs of our own classrooms.
 *
 * It was one AI-generated illustration, on the page that sells real teaching by
 * real facilitators — the least believable image we could have put there while
 * thirty pictures of actual Rillcod classrooms sat in the repository.
 *
 * Stills only, and deliberately. The audience is Nigerian schools on mobile
 * data: an autoplaying hero video spends a visitor's bundle before they have
 * read a word. The clips belong on the gallery, behind a click somebody chose.
 *
 * The first frame is eager and `priority`, so the largest contentful paint is a
 * real photograph rather than a placeholder that swaps late.
 */

import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * Chosen the way the proposal's six were: real rooms, real work on the screens,
 * students in uniform. Ordered to open on the widest shot.
 */
const FRAMES = [
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.02 PM.jpeg",
    alt: "A class of Rillcod students working through a robotics kit together",
  },
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.00 PM (1).jpeg",
    alt: "A Rillcod facilitator teaching electronics at the bench with students gathered round",
  },
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.56 PM.jpeg",
    alt: "Rillcod students in uniform writing code on laptops",
  },
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.29.57 PM.jpeg",
    alt: "A young Rillcod student building a game in Scratch from a printed worksheet",
  },
  {
    src: "/images/EVENTS/WhatsApp Image 2026-08-14 at 7.30.03 PM (1).jpeg",
    alt: "Rillcod students at work in a school computer room",
  },
] as const;

const DWELL_MS = 5200;

export function HeroSlideshow({
  /**
   * Lift the dots clear of the programme card when one is showing. With no card
   * — a closed intake — they sit at the foot of the photograph where they belong.
   */
  dotsRaised = true,
}: {
  dotsRaised?: boolean;
} = {}) {
  const [frame, setFrame] = useState(0);
  // Never on the server, and never before mount: a slideshow that starts during
  // render is a hydration mismatch waiting to happen.
  const [running, setRunning] = useState(false);

  useEffect(() => setRunning(true), []);

  useEffect(() => {
    if (!running) return;
    // Somebody who has asked for less motion gets the first frame and nothing
    // else moving on the page.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const id = window.setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), DWELL_MS);
    return () => window.clearInterval(id);
  }, [running]);

  return (
    <>
      {FRAMES.map((f, i) => (
        <Image
          key={f.src}
          src={f.src}
          alt={f.alt}
          fill
          sizes="(max-width: 1024px) 100vw, 500px"
          // Only the first frame is eager. The rest load as the browser gets to
          // them, so a phone is not fetching five photographs to show one.
          priority={i === 0}
          loading={i === 0 ? undefined : "lazy"}
          className={`object-cover transition-opacity duration-1000 ease-in-out ${
            i === frame ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {/* Which frame, for anybody who wants to know there are more. */}
      <div
        className={`absolute left-4 sm:left-6 z-20 flex items-center gap-1.5 ${
          dotsRaised ? "bottom-24 sm:bottom-28" : "bottom-5 sm:bottom-6"
        }`}
      >
        {FRAMES.map((f, i) => (
          <button
            key={f.src}
            type="button"
            aria-label={`Show photograph ${i + 1} of ${FRAMES.length}`}
            aria-current={i === frame}
            onClick={() => setFrame(i)}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === frame ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>
    </>
  );
}
