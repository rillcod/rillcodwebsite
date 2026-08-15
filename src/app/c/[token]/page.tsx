"use client";

/**
 * What a QR code on a printed school report opens.
 *
 * Somebody is holding paper in a governors' meeting. They point a phone at a
 * square next to "Smart Solar Irrigation Monitor" and this is what has to
 * appear: the clip, playing, in one tap and with no account. Everything else on
 * the page is subordinate to that.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { brandContact } from "@/config/brand";

type Media = {
  title: string;
  category: string;
  mediaType: "image" | "video";
  isCapstone: boolean;
  createdAt: string;
  url: string;
  schoolName: string | null;
};

export default function PublicCapstonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [media, setMedia] = useState<Media | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/c/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || "Not found.");
        return json as Media;
      })
      .then((m) => { if (!cancelled) setMedia(m); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Not found."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error || !media) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-black text-foreground mb-2">This link is not valid</h1>
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          The code may have been mistyped, or this recording is no longer shared.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-widest"
        >
          {brandContact.displayName}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-4 sm:px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            {media.isCapstone ? "Capstone demonstration" : "From the classroom"}
          </p>
          <h1 className="mt-1 text-lg sm:text-2xl font-black text-foreground leading-tight">
            {media.title}
          </h1>
          {media.schoolName && (
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Built by students at {media.schoolName}
            </p>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-5">
        <div className="mx-auto max-w-3xl">
          {/* The clip carries the page. `playsInline` because iOS otherwise takes
              over the whole screen, and controls because somebody scanning from
              paper expects to be able to scrub and replay. */}
          {media.mediaType === "video" ? (
            <video
              src={media.url}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-2xl border border-border bg-black shadow-xl"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.url}
              alt={media.title}
              className="w-full rounded-2xl border border-border bg-muted shadow-xl"
            />
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Recorded{" "}
            {new Date(media.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {" · "}
            {brandContact.displayName}
          </p>

          <div className="mt-8 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm font-bold text-foreground">
              This is what the programme produces
            </p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Coding, robotics and artificial intelligence, taught in the school by our
              facilitators, on the school&rsquo;s own timetable.
            </p>
            <Link
              href="/school-registration"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-widest text-primary-foreground"
            >
              Bring it to your school
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
