'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  PlayCircleIcon, VideoCameraIcon, XMarkIcon,
  PencilSquareIcon, TrashIcon, BookOpenIcon,
} from '@/lib/icons';

type Replay = {
  id: string;
  session_id: string;
  lesson_id: string | null;
  program_id: string | null;
  title: string;
  status?: string;
  program_name: string | null;
  session_date: string | null;
  duration_seconds: number | null;
  can_manage?: boolean;
  playback_url: string | null;
};

type LessonOpt = { id: string; title: string };

function fmtDuration(s: number | null) {
  if (!s || s < 1) return null;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function fmtDate(d: string | null) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return ''; }
}

// Student replays + teacher management (rename / attach-to-lesson / delete), all host-scoped
// server-side. Mobile-first grid + inline player. Renders nothing when there are no replays.
export default function ClassReplays({ heading = 'Class Replays' }: { heading?: string }) {
  const [replays, setReplays] = useState<Replay[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Replay | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Record<string, LessonOpt[]>>({}); // by program_id
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live-sessions/recordings', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setReplays(Array.isArray(j.recordings) ? j.recordings : []);
    } catch { /* supplementary */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Lazy-load the lessons of a recording's programme for the attach picker.
  const loadLessons = useCallback(async (programId: string | null) => {
    if (!programId || lessons[programId]) return;
    try {
      const db = createClient();
      const { data } = await db
        .from('lessons')
        .select('id, title, courses!inner(program_id)')
        .eq('courses.program_id', programId)
        .order('title')
        .limit(300);
      setLessons(prev => ({ ...prev, [programId]: (data ?? []).map((l: any) => ({ id: l.id, title: l.title })) }));
    } catch { setLessons(prev => ({ ...prev, [programId]: [] })); }
  }, [lessons]);

  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/live-sessions/recordings/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Update failed');
      setReplays(prev => prev.map(x => x.id === id ? { ...x, ...(typeof body.title === 'string' ? { title: body.title } : {}), ...('lessonId' in body ? { lesson_id: (body.lessonId as string) || null } : {}) } : x));
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }, []);

  const remove = useCallback(async (id: string) => {
    if (!confirm('Delete this recording permanently? It will be removed from the cloud (R2) and can\'t be recovered.')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/live-sessions/recordings/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Delete failed');
      setReplays(prev => prev.filter(x => x.id !== id));
      setManageId(null);
    } catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }, []);

  const rename = useCallback((r: Replay) => {
    const t = prompt('Rename recording', r.title);
    if (t != null && t.trim() && t.trim() !== r.title) void patch(r.id, { title: t.trim() });
  }, [patch]);

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
          const lessonList = r.program_id ? lessons[r.program_id] : undefined;
          const pending = r.status && r.status !== 'ready' && r.status !== 'failed';
          const failed = r.status === 'failed';
          return (
            <div key={r.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
              <button
                onClick={() => r.playback_url && setActive(r)}
                disabled={!r.playback_url}
                className="group relative flex aspect-video items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 disabled:cursor-default"
              >
                {pending ? (
                  <span className="flex flex-col items-center gap-2 text-primary/80">
                    <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{r.status === 'recording' ? '● Recording' : 'Processing…'}</span>
                  </span>
                ) : failed ? (
                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400">Recording failed</span>
                ) : (
                  <PlayCircleIcon className="h-12 w-12 text-primary/80 transition-transform group-hover:scale-110" />
                )}
                {dur && !pending && <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-foreground">{dur}</span>}
                {r.lesson_id && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-foreground">
                    <BookOpenIcon className="h-3 w-3" /> Lesson
                  </span>
                )}
              </button>

              <div className="min-w-0 p-3">
                <p className="truncate text-sm font-black text-foreground">{r.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {[r.program_name, fmtDate(r.session_date)].filter(Boolean).join(' · ') || 'Recorded class'}
                </p>

                {/* Teacher / admin management */}
                {r.can_manage && (
                  <div className="mt-2 border-t border-border pt-2">
                    {manageId === r.id ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={() => rename(r)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[10px] font-black uppercase tracking-wide text-foreground hover:border-primary/50 disabled:opacity-50">
                            <PencilSquareIcon className="h-3 w-3" /> Rename
                          </button>
                          <button onClick={() => remove(r.id)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-600/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700 dark:text-rose-300 hover:bg-rose-600/20 disabled:opacity-50">
                            <TrashIcon className="h-3 w-3" /> Delete
                          </button>
                          <button onClick={() => setManageId(null)} className="ml-auto px-2 py-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground hover:text-foreground">Done</button>
                        </div>
                        {/* Attach to lesson */}
                        <label className="block">
                          <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-muted-foreground">Attach to lesson</span>
                          <select
                            value={r.lesson_id ?? ''}
                            onFocus={() => loadLessons(r.program_id)}
                            onChange={(e) => void patch(r.id, { lessonId: e.target.value || null })}
                            disabled={busy || !r.program_id}
                            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                          >
                            <option value="">— No lesson (general) —</option>
                            {(lessonList ?? []).map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                            {r.lesson_id && !(lessonList ?? []).some(l => l.id === r.lesson_id) && <option value={r.lesson_id}>Currently attached lesson</option>}
                          </select>
                        </label>
                      </div>
                    ) : (
                      <button onClick={() => { setManageId(r.id); loadLessons(r.program_id); }} className="text-[10px] font-black uppercase tracking-widest text-primary hover:opacity-80">
                        Manage ▾
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline player — mobile-first full-screen */}
      {active?.playback_url && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-0 sm:p-6" onClick={() => setActive(null)}>
          <div role="dialog" aria-modal="true" className="flex w-full max-w-4xl items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <p className="min-w-0 truncate text-sm font-black text-foreground">{active.title}</p>
            <button onClick={() => setActive(null)} className="rounded-full bg-white/10 p-2 text-foreground hover:bg-white/20" aria-label="Close">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="w-full max-w-4xl px-0 sm:px-4" onClick={(e) => e.stopPropagation()}>
            <video src={active.playback_url} controls autoPlay playsInline controlsList="nodownload" className="h-auto max-h-[75vh] w-full bg-black sm:rounded-xl" />
          </div>
        </div>
      )}
    </section>
  );
}
