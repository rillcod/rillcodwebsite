'use client';

/**
 * The programme curriculum, read the way a programme is actually run: one spine
 * from week 1 to the last week, with the modules that own each week hanging off
 * it.
 *
 * The Academic Office reads a school course across its terms, and SyllabusPreview
 * serves that well. A holiday programme is read the other way round — "what
 * happens in week 6?" — and its curriculum is spread across one release per
 * course. Answering that question meant opening four screens and merging them by
 * hand, which is how Week 7 sat uncovered without anyone noticing.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

type Module = {
  track_id: string | null;
  track_title: string;
  module_label: string | null;
  icon: string | null;
  course_title: string | null;
  course_id: string | null;
  topic: string | null;
  objectives: string[];
  activities: string[];
  lesson_status: string | null;
  has_assignment: boolean;
  has_flashcards: boolean;
  locked: boolean;
};

type SpineWeek = {
  week: number;
  label: string;
  title: string;
  tag: string | null;
  desc: string | null;
  modules: Module[];
};

type Payload = {
  page: { id: string; title: string; slug: string; starts_on: string | null; ends_on: string | null };
  total_weeks: number;
  weeks: SpineWeek[];
  uncovered_weeks: number[];
};

/** Which calendar week the programme is in today (1-based); null before it starts. */
function currentWeek(startsOn: string | null): number | null {
  if (!startsOn) return null;
  const start = new Date(`${startsOn}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const days = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  if (days < 0) return null;
  return Math.floor(days / 7) + 1;
}

export default function ProgrammeCurriculumPage() {
  const params = useParams<{ id: string }>();
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  const canView =
    profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/special-programs/${params.id}/curriculum`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to load curriculum');
      setData(j.data);
      setOpenWeek((prev) => prev ?? j.data?.weeks?.[0]?.week ?? null);
    } catch (e: any) {
      toast.error(e.message || 'Could not load the curriculum');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (authLoading || !canView) return;
    load();
  }, [authLoading, canView, load]);

  if (authLoading || loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!canView) {
    return <div className="p-8 text-sm text-rose-600 dark:text-rose-400">Staff access required.</div>;
  }
  if (!data) {
    return <div className="p-8 text-sm text-muted-foreground">No curriculum found for this programme.</div>;
  }

  const live = currentWeek(data.page.starts_on);

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 mobile-page-root">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Programme Curriculum
        </p>
        <h1 className="text-2xl font-black text-foreground">{data.page.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data.total_weeks} weeks · every module on one spine.{' '}
          <Link href="/dashboard/special-programs" className="underline text-primary">
            Back to programmes
          </Link>
        </p>
      </div>

      {/* A week nobody teaches is the failure this screen exists to surface. */}
      {data.uncovered_weeks.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="font-black text-amber-800 dark:text-amber-200">
            {data.uncovered_weeks.length === 1 ? 'One week has no module' : `${data.uncovered_weeks.length} weeks have no module`}
            {': '}
            {data.uncovered_weeks.map((w) => `Week ${w}`).join(', ')}
          </p>
          <p className="text-muted-foreground mt-1">
            Nothing will ever be generated for these. Widen a module&apos;s week range on the page, or
            add a module that claims them, then run Prepare teaching.
          </p>
        </div>
      )}

      <ol className="space-y-3">
        {data.weeks.map((w) => {
          const open = openWeek === w.week;
          const uncovered = w.modules.length === 0;
          const isNow = live === w.week;

          return (
            <li
              key={w.week}
              className={`rounded-2xl border overflow-hidden ${
                uncovered
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : isNow
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-card'
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenWeek(open ? null : w.week)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/20 transition"
              >
                <span
                  className={`shrink-0 w-11 h-11 rounded-xl grid place-items-center font-black text-sm ${
                    uncovered
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-primary/15 text-primary'
                  }`}
                >
                  {w.week}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-foreground text-sm truncate">{w.title || w.label}</span>
                    {isNow && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary text-white">
                        This week
                      </span>
                    )}
                    {w.tag && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                        {w.tag}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                    {uncovered
                      ? 'No module claims this week'
                      : w.modules.map((m) => m.track_title).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{open ? '−' : '+'}</span>
              </button>

              {open && (
                <div className="px-4 pb-4 space-y-3">
                  {w.desc && <p className="text-sm text-muted-foreground">{w.desc}</p>}

                  {uncovered ? (
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      This week is on the programme spine but no module covers it, so no curriculum,
                      lessons or homework exist for it.
                    </p>
                  ) : (
                    w.modules.map((m, i) => (
                      <div
                        key={`${m.track_id ?? m.track_title}-${i}`}
                        className="rounded-xl border border-border bg-background/40 p-3.5 space-y-2"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          {m.icon && <span aria-hidden>{m.icon}</span>}
                          <span className="font-black text-sm text-foreground">{m.track_title}</span>
                          {m.module_label && (
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {m.module_label}
                            </span>
                          )}
                          {m.locked && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              🔒 Locked
                            </span>
                          )}
                        </div>

                        {m.course_title && (
                          <p className="text-xs text-muted-foreground">Course: {m.course_title}</p>
                        )}
                        {m.topic && <p className="text-sm text-foreground/90">{m.topic}</p>}

                        {m.objectives.length > 0 && (
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {m.objectives.slice(0, 5).map((o, k) => (
                              <li key={k} className="flex gap-2">
                                <span className="text-primary">•</span>
                                <span>{o}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <Pill ok={!!m.lesson_status} label={m.lesson_status ? `Lesson (${m.lesson_status})` : 'No lesson'} />
                          <Pill ok={m.has_assignment} label={m.has_assignment ? 'Homework' : 'No homework'} />
                          <Pill ok={m.has_flashcards} label={m.has_flashcards ? 'Practice cards' : 'No cards'} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
        ok
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
          : 'bg-muted/30 text-muted-foreground border-border'
      }`}
    >
      {label}
    </span>
  );
}
