'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowsRightLeftIcon, MagnifyingGlassIcon, UserGroupIcon, AcademicCapIcon,
  ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, ArrowRightIcon,
  ArrowLeftIcon,
} from '@/lib/icons';

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
  school_id?: string | null;
};

export default function ClassTransferPage() {
  const { profile, loading: authLoading } = useAuth();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');

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
      const res = await fetch(`/api/classes/${cid}/students`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load students');
      const { students: rows } = await res.json();
      setStudents(rows ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load students');
      setStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  }, []);

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
    try {
      const ids = [...selected];
      const res = await fetch(`/api/classes/${destId}/enroll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: ids }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Transfer failed');
      const skipped = j.skipped ?? 0;
      const rej = [...(j.rejectedOtherTeacher ?? []), ...(j.rejectedSchoolBoundary ?? [])];
      let msg = `Moved ${j.enrolled ?? ids.length} student${(j.enrolled ?? ids.length) !== 1 ? 's' : ''} → ${destClass?.name ?? 'class'}.`;
      if (skipped > 0) msg += ` ${skipped} skipped${rej.length ? `: ${rej.join(', ')}` : ''}.`;
      setResult({ ok: true, msg });
      // Refresh both rosters + counts
      await loadRoster(sourceId);
      const cr = await fetch('/api/classes', { cache: 'no-store' });
      if (cr.ok) setClasses((await cr.json()).data ?? []);
    } catch (e: any) {
      setResult({ ok: false, msg: e.message ?? 'Transfer failed' });
    } finally {
      setMoving(false);
    }
  };

  const classLabel = (c?: ClassRow | null) =>
    c ? `${c.name}${typeof c.current_students === 'number' ? ` · ${c.current_students}` : ''}` : '';

  if (authLoading || loadingClasses) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 pb-28 sm:pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ArrowsRightLeftIcon className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Class Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">Transfer Students</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Move students from one class to their correct class. Pick a class, select students, choose the destination.
          </p>
        </div>
        <Link href="/dashboard/classes"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-card border border-border hover:border-primary/50 text-foreground font-bold text-sm rounded-xl transition-colors self-start">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Classes
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm rounded-xl">
          <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}
      {result && (
        <div className={`flex items-center gap-3 p-4 border text-sm rounded-xl ${result.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
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
        <div className="hidden sm:flex items-center justify-center pb-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ArrowRightIcon className="w-4 h-4 text-primary" />
          </div>
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
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-border">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <UserGroupIcon className="w-4 h-4 text-primary" />
              {sourceClass?.name}
              <span className="text-muted-foreground font-medium">· {students.length} student{students.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="relative flex-1 sm:max-w-xs sm:ml-auto">
              <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search students…"
                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary/50"
              />
            </div>
            <button
              onClick={toggleAll}
              disabled={filteredStudents.length === 0}
              className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:border-primary/50 text-foreground transition-colors disabled:opacity-40"
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
                        {s.email && <span className="block text-xs text-muted-foreground truncate">{s.email}</span>}
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

      {/* Sticky action bar */}
      {sourceId && (
        <div className="fixed bottom-0 left-0 right-0 sm:static z-20 bg-card/95 backdrop-blur border-t sm:border border-border sm:rounded-2xl p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">
              {selected.size} selected
              {destClass ? <span className="text-muted-foreground font-medium"> → {destClass.name}</span> : ''}
            </p>
            {!destClass && selected.size > 0 && (
              <p className="text-xs text-amber-400">Choose a destination class to move them.</p>
            )}
          </div>
          <button
            onClick={move}
            disabled={moving || selected.size === 0 || !destId}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-primary/30 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            {moving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowsRightLeftIcon className="w-4 h-4" />}
            {moving ? 'Moving…' : `Move${selected.size ? ` ${selected.size}` : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}
