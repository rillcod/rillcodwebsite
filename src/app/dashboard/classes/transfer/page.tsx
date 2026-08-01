'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowsRightLeftIcon, MagnifyingGlassIcon, UserGroupIcon, AcademicCapIcon,
  ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, ArrowLeftIcon,
} from '@/lib/icons';
import { MOBILE_PAGE_ROOT } from '@/components/mobile/mobile-styles';

type ClassRow = {
  id: string;
  name: string;
  current_students?: number;
  school_id?: string | null;
  schools?: { id: string; name: string } | null;
  programs?: { id: string; name: string } | null;
  portal_users?: { id: string; full_name: string } | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  email?: string | null;
  section_class?: string | null;
  grade?: string | null;
  grade_level?: string | null;
  school_id?: string | null;
};

export default function ClassTransferPage() {
  const { profile, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pre-select the source class when opened from inside a classroom (?from=<classId>).
  const [sourceId, setSourceId] = useState(searchParams.get('from') ?? '');
  const [destId, setDestId] = useState('');

  // When opened for one specific student (?student=<id> from the classroom's inline "Move"),
  // pre-tick that student once the source roster loads — so the teacher lands ready to pick a
  // destination and move, no hunting required.
  const preselectStudent = searchParams.get('student');
  const preselectApplied = useRef(false);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const [moving, setMoving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── Load classes the user can manage ──────────────────────────────────────
  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;
    (async () => {
      setLoadingClasses(true);
      try {
        const res = await fetch('/api/classes', { cache: 'no-store' });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to load classes');
        const { data } = await res.json();
        if (!cancelled) setClasses(data ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load classes');
      } finally {
        if (!cancelled) setLoadingClasses(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, authLoading]);

  // ── Load the source roster ────────────────────────────────────────────────
  const loadRoster = useCallback(async (cid: string) => {
    if (!cid) { setStudents([]); return; }
    setLoadingStudents(true);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/classes/${cid}/students?light=1`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load students');
      const { students: rows } = await res.json();
      setStudents(rows ?? []);
      // One-time: pre-tick the student we were opened for, if they're on this roster.
      if (preselectStudent && !preselectApplied.current && (rows ?? []).some((s: StudentRow) => s.id === preselectStudent)) {
        setSelected(new Set([preselectStudent]));
        preselectApplied.current = true;
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load students');
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, [preselectStudent]);

  useEffect(() => { loadRoster(sourceId); }, [sourceId, loadRoster]);

  const sourceClass = classes.find(c => c.id === sourceId);
  const destClass = classes.find(c => c.id === destId);

  // Destination options: same school as the source (or all when no source school),
  // never the source class itself.
  const destOptions = useMemo(() => {
    return classes.filter(c => {
      if (c.id === sourceId) return false;
      if (sourceClass?.school_id) return c.school_id === sourceClass.school_id;
      return true;
    });
  }, [classes, sourceId, sourceClass?.school_id]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      (s.full_name ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q),
    );
  }, [students, search]);

  const allVisibleSelected = filteredStudents.length > 0 && filteredStudents.every(s => selected.has(s.id));

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    setSelected(prev => {
      const n = new Set(prev);
      if (allVisibleSelected) filteredStudents.forEach(s => n.delete(s.id));
      else filteredStudents.forEach(s => n.add(s.id));
      return n;
    });
  };

  const move = async () => {
    if (!destId || selected.size === 0) return;
    setMoving(true);
    setResult(null);
    const ids = [...selected];
    try {
      const res = await fetch(`/api/classes/${destId}/enroll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: ids }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Transfer failed');
      const rej = [...(j.rejectedOtherTeacher ?? []), ...(j.rejectedSchoolBoundary ?? [])];
      const movedCount = j.enrolled ?? ids.length;

      // ── Optimistic UI: instantly drop the moved students from the roster and adjust the
      //    class counts — no full refetch, so batch moves feel immediate. Prefer the exact
      //    enrolledIds from the API (robust against duplicate names); fall back to name-diff.
      const movedIds: Set<string> = Array.isArray(j.enrolledIds) && j.enrolledIds.length > 0
        ? new Set<string>(j.enrolledIds)
        : new Set<string>(
            students
              .filter((s) => selected.has(s.id) && !new Set(rej.map((n: string) => (n || '').toLowerCase())).has((s.full_name ?? '').toLowerCase()))
              .map((s) => s.id),
          );
      setStudents((prev) => prev.filter((s) => !movedIds.has(s.id)));
      setSelected(new Set());
      setClasses((prev) => prev.map((c) => {
        if (c.id === destId) return { ...c, current_students: (c.current_students ?? 0) + movedIds.size };
        if (c.id === sourceId) return { ...c, current_students: Math.max(0, (c.current_students ?? 0) - movedIds.size) };
        return c;
      }));

      let msg = `Moved ${movedCount} student${movedCount !== 1 ? 's' : ''} → ${destClass?.name ?? 'class'}.`;
      if (rej.length > 0) msg += ` ${rej.length} skipped: ${rej.join(', ')}.`;
      setResult({ ok: true, msg });
    } catch (e: any) {
      setResult({ ok: false, msg: e.message ?? 'Transfer failed' });
      // On failure, reload the true roster so the UI is never out of sync.
      loadRoster(sourceId);
    } finally {
      setMoving(false);
    }
  };

  // Deactivate = soft unenrol from the SOURCE class: keeps the class tie for history
  // (student is marked withdrawn, never classless). No destination needed.
  const deactivate = async () => {
    if (!sourceId || selected.size === 0) return;
    if (!confirm(`Deactivate ${selected.size} student(s) from ${sourceClass?.name ?? 'this class'}? They keep their class history and can be re-activated or moved later.`)) return;
    setMoving(true);
    setResult(null);
    const ids = [...selected];
    try {
      const res = await fetch(`/api/classes/${sourceId}/enroll`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: ids }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Deactivate failed');
      const doneIds = new Set(ids);
      setStudents((prev) => prev.filter((s) => !doneIds.has(s.id)));
      setSelected(new Set());
      setClasses((prev) => prev.map((c) => (c.id === sourceId ? { ...c, current_students: Math.max(0, (c.current_students ?? 0) - ids.length) } : c)));
      setResult({ ok: true, msg: `Deactivated ${ids.length} student${ids.length !== 1 ? 's' : ''} — kept in ${sourceClass?.name ?? 'the class'}'s history.` });
    } catch (e: any) {
      setResult({ ok: false, msg: e.message ?? 'Deactivate failed' });
      loadRoster(sourceId);
    } finally {
      setMoving(false);
    }
  };

  const classLabel = (c?: ClassRow | null) =>
    c ? `${c.name}${typeof c.current_students === 'number' ? ` · ${c.current_students}` : ''}` : '';

  if (authLoading || loadingClasses) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className={`space-y-6 ${MOBILE_PAGE_ROOT}`}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <ArrowsRightLeftIcon className="h-5 w-5 flex-shrink-0 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-primary">Class Management</span>
          </div>
          <h1 className="text-2xl font-extrabold text-foreground sm:text-3xl">Transfer Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Move students from one class to their correct class. Pick a class, select students, choose the destination.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Link href="/dashboard/classes/transfer-requests" className="inline-flex items-center gap-2 self-start rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-600 dark:text-amber-400 transition-colors">
            <ArrowsRightLeftIcon className="h-4 w-4" /> Ownership Requests
          </Link>
          <Link href="/dashboard/classes"
            className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-primary/50">
            <ArrowLeftIcon className="h-4 w-4" /> Back to Classes
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-sm rounded-xl">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}
      {result && (
        <div className={`flex items-center gap-3 p-4 border text-sm rounded-xl ${result.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'}`}>
          {result.ok ? <CheckCircleIcon className="w-4 h-4 flex-shrink-0" /> : <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />}
          <span className="flex-1">{result.msg}</span>
          <button onClick={() => setResult(null)} className="text-xs underline opacity-80 hover:opacity-100">Dismiss</button>
        </div>
      )}

      {/* From / To selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <div>
          <label className="block text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">From class</label>
          <select
            value={sourceId}
            onChange={e => { setSourceId(e.target.value); setResult(null); }}
            className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm text-foreground focus:border-primary/50 outline-none"
          >
            <option value="">Select a class…</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{classLabel(c)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-center sm:pb-3">
          <button
            type="button"
            onClick={() => { if (sourceId && destId) { setSourceId(destId); setDestId(sourceId); setResult(null); } }}
            disabled={!sourceId || !destId}
            title="Swap From / To"
            className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed rotate-90 sm:rotate-0"
          >
            <ArrowsRightLeftIcon className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="block text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">To class</label>
          <select
            value={destId}
            onChange={e => { setDestId(e.target.value); setResult(null); }}
            disabled={!sourceId}
            className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm text-foreground focus:border-primary/50 outline-none disabled:opacity-50"
          >
            <option value="">Select destination…</option>
            {destOptions.map(c => (
              <option key={c.id} value={c.id}>{classLabel(c)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Roster */}
      {sourceId && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Roster toolbar */}
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-bold text-foreground">
              <UserGroupIcon className="h-4 w-4 flex-shrink-0 text-primary" />
              <span className="break-words">{sourceClass?.name}</span>
              <span className="font-medium text-muted-foreground">· {students.length} student{students.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="relative min-w-0 flex-1 sm:ml-auto sm:max-w-xs">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search students…"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <button
              onClick={toggleAll}
              disabled={filteredStudents.length === 0}
              className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary/50 disabled:opacity-40"
            >
              {allVisibleSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>

          {/* Roster list */}
          {loadingStudents ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              {students.length === 0 ? 'No students in this class.' : 'No students match your search.'}
            </div>
          ) : (
            <ul className="divide-y divide-border max-h-[52vh] overflow-y-auto">
              {filteredStudents.map(s => {
                const on = selected.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => toggle(s.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${on ? 'bg-primary/10' : 'hover:bg-muted/40'}`}
                    >
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${on ? 'bg-primary border-primary' : 'border-border'}`}>
                        {on && <CheckCircleIcon className="w-4 h-4 text-white" />}
                      </span>
                      <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center flex-shrink-0">
                        {(s.full_name ?? '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-foreground truncate">{s.full_name}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {(s.grade || s.grade_level) && <span className="font-semibold text-primary/80">{s.grade || s.grade_level}</span>}
                          {(s.grade || s.grade_level) && s.section_class ? ' · ' : ''}
                          {s.section_class || (!s.grade && !s.grade_level ? (s.email ?? '') : '')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Empty state before a class is picked */}
      {!sourceId && (
        <div className="bg-card border border-border border-dashed rounded-2xl py-16 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Pick a class above to see its students.</p>
        </div>
      )}

      {/* Sticky action bar — on mobile it sits ABOVE the 64px bottom tab bar (bottom-16) so it
          never covers the nav's menu CTAs; static in the normal flow from sm up. */}
      {sourceId && (
        <div className="fixed bottom-[var(--app-bottom-nav-height)] left-0 right-0 z-20 flex flex-col gap-3 border-t border-border bg-card/95 p-4 backdrop-blur sm:static sm:bottom-auto sm:flex-row sm:items-center sm:rounded-2xl sm:border">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold text-foreground">
              {selected.size} selected
              {destClass ? <span className="font-medium text-muted-foreground"> → {destClass.name}</span> : ''}
            </p>
            {!destClass && selected.size > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Choose a destination class to move them.</p>
            )}
          </div>
          <div className="flex w-full min-w-0 flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <button
              onClick={deactivate}
              disabled={moving || selected.size === 0}
              title="Withdraw the selected students from this class (keeps their history)"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-card px-4 py-2.5 text-sm font-bold text-amber-600 dark:text-amber-400 transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              Withdraw
            </button>
            <button
              onClick={move}
              disabled={moving || selected.size === 0 || !destId}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/30 transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {moving ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowsRightLeftIcon className="h-4 w-4" />}
              {moving ? 'Moving…' : `Move${selected.size ? ` ${selected.size}` : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
