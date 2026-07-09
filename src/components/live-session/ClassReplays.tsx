'use client';

import { useEffect, useState } from 'react';
import { PlayCircleIcon, VideoCameraIcon, XMarkIcon } from '@/lib/icons';

type Replay = {
  id: string;
  session_id: string;
  title: string;
  program_name: string | null;
  session_date: string | null;
  duration_seconds: number | null;
  playback_url: string | null;
};

function fmtDuration(s: number | null) {
  if (!s || s < 1) return null;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtDate(d: string | null) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

// Student "Class Replays" — recordings of the live classes they attended, part of the
// learning path so they can rewatch anytime. Mobile-first grid + inline player modal.
// Renders nothing when there are no replays, so it never clutters an empty state.
export default function ClassReplays({ heading = 'Class Replays' }: { heading?: string }) {
  const [replays, setReplays] = useState<Replay[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Replay | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/live-sessions/recordings', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!cancelled && r.ok) setReplays(Array.isArray(j.recordings) ? j.recordings : []);
      } catch { /* silent — replays are supplementary */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || replays.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <VideoCameraIcon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">{heading}</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">{replays.length}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {replays.map((r) => {
          const dur = fmtDuration(r.duration_seconds);
          return (
            <button
              key={r.id}
              onClick={() => r.playback_url && setActive(r)}
              disabled={!r.playback_url}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:border-primary/40 disabled:opacity-60"
            >
              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5">
                <PlayCircleIcon className="h-12 w-12 text-primary/80 transition-transform group-hover:scale-110" />
                {dur && (
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{dur}</span>
                )}
              </div>
              <div className="min-w-0 p-3">
                <p className="truncate text-sm font-black text-foreground">{r.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {[r.program_name, fmtDate(r.session_date)].filter(Boolean).join(' · ') || 'Recorded class'}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Inline player modal — mobile-first full-screen sheet */}
      {active && active.playback_url && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-0 sm:p-6" onClick={() => setActive(null)}>
          <div className="flex w-full max-w-4xl items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <p className="min-w-0 truncate text-sm font-black text-white">{active.title}</p>
            <button onClick={() => setActive(null)} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="w-full max-w-4xl px-0 sm:px-4" onClick={(e) => e.stopPropagation()}>
            <video
              src={active.playback_url}
              controls
              autoPlay
              playsInline
              controlsList="nodownload"
              className="h-auto max-h-[75vh] w-full bg-black sm:rounded-xl"
            />
          </div>
        </div>
      )}
    </section>
  );
}
