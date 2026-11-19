'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CreditCardIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparklesIcon,
  UserGroupIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@/lib/icons';
import { useAuth } from '@/contexts/auth-context';
import { bandCoversGrade, canonicalGrade, parseBandLabel, SINGLE_GRADES } from '@/lib/classes/naming';

type TabKey = 'pick' | 'quick' | 'confirm';
type PlacementFilter = 'all' | 'feeder' | 'unassigned' | 'other';
type GradeAction = 'promote' | 'demote' | 'retain';

type AvailableStudent = {
  id: string;
  full_name: string;
  email?: string | null;
  grade?: string | null;
  suggested_grade?: string | null;
  section_class?: string | null;
  class_id?: string | null;
  current_class_name?: string | null;
  current_teacher_name?: string | null;
  is_feeder_promotion?: boolean;
  requires_transfer_request?: boolean;
  pending_transfer_request_id?: string | null;
};

type SchoolClassSummary = {
  id: string;
  name: string;
  qa_grade_key: string | null;
  teacher_name: string | null;
  student_count: number;
};

type RosterStudent = {
  id: string;
  full_name: string;
  email?: string | null;
  grade?: string | null;
  is_current_term_active?: boolean;
};

export default function ClassEnrollWorkspacePage() {
  const params = useParams();
  const id = params?.id as string;
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  const initialTab = (searchParams.get('tab') as TabKey) || 'pick';
  const [tab, setTab] = useState<TabKey>(['pick', 'quick', 'confirm'].includes(initialTab) ? initialTab : 'pick');

  const [cls, setCls] = useState<any>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [available, setAvailable] = useState<AvailableStudent[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Pick & Adopt state
  const [search, setSearch] = useState('');
  const [placement, setPlacement] = useState<PlacementFilter>('all');
  const [sourceClassId, setSourceClassId] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [gradeAction, setGradeAction] = useState<GradeAction>('promote');
  const [targetGradePitch, setTargetGradePitch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [perStudentAction, setPerStudentAction] = useState<Record<string, GradeAction>>({});
  const [showAllRows, setShowAllRows] = useState(false);

  // Quick-Add / Paste state
  const [quickInput, setQuickInput] = useState('');
  const [quickGrade, setQuickGrade] = useState('');
  const [quickNotice, setQuickNotice] = useState<{
    summary: string;
    added: Array<{ fullName: string; grade: string | null; mode: string; email?: string; password?: string | null }>;
    ambiguous: Array<{ input: string; candidates: Array<{ id: string; full_name: string; grade: string | null; current_class_name: string | null }> }>;
    errors: Array<{ input: string; error: string }>;
  } | null>(null);

  // Confirm & Promote state
  const [confirmKeepIds, setConfirmKeepIds] = useState<Set<string>>(new Set());
  const [confirmGrades, setConfirmGrades] = useState<Record<string, string>>({});
  const [lastSnapshot, setLastSnapshot] = useState<Array<{ studentId: string; grade: string }> | null>(null);

  const classBand = useMemo(
    () => parseBandLabel(cls?.qa_grade_band || cls?.qa_grade_key || cls?.name?.split('·').pop()?.trim()),
    [cls],
  );

  const defaultEntryGrade = useMemo(() => {
    if (cls?.qa_grade_key && (SINGLE_GRADES as readonly string[]).includes(cls.qa_grade_key)) {
      return cls.qa_grade_key as string;
    }
    if (classBand) return `${classBand.lvl} ${classBand.low}`;
    return '';
  }, [cls, classBand]);

  const buildInitialGrades = useCallback((students: RosterStudent[], fallback: string) => {
    const map: Record<string, string> = {};
    for (const s of students) {
      map[s.id] = canonicalGrade(s.grade) || (s.grade || '').trim() || fallback;
    }
    return map;
  }, []);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [clsRes, stuRes, availRes] = await Promise.all([
        fetch(`/api/classes/${id}`, { cache: 'no-store' }),
        fetch(`/api/classes/${id}/students`, { cache: 'no-store' }),
        fetch(`/api/classes/${id}/enroll`, { cache: 'no-store' }),
      ]);
      const [clsJson, stuJson, availJson] = await Promise.all([
        clsRes.json().catch(() => ({})),
        stuRes.json().catch(() => ({})),
        availRes.json().catch(() => ({})),
      ]);
      if (!clsRes.ok) throw new Error(clsJson?.error || 'Class not found');
      const klass = clsJson.data;
      setCls(klass);
      const activeRoster: RosterStudent[] = (stuJson.students ?? [])
        .filter((s: any) => s.is_current_term_active !== false)
        .sort((a: RosterStudent, b: RosterStudent) => (a.full_name || '').localeCompare(b.full_name || ''));
      setRoster(activeRoster);
      setAvailable(Array.isArray(availJson.students) ? availJson.students : []);
      setSchoolClasses(Array.isArray(availJson.school_classes) ? availJson.school_classes : []);

      const fallback = (klass?.qa_grade_key && (SINGLE_GRADES as readonly string[]).includes(klass.qa_grade_key))
        ? klass.qa_grade_key
        : (() => {
            const b = parseBandLabel(klass?.qa_grade_band || klass?.name?.split('·').pop()?.trim());
            return b ? `${b.lvl} ${b.low}` : '';
          })();
      setConfirmKeepIds(new Set(activeRoster.map((s) => s.id)));
      setConfirmGrades(buildInitialGrades(activeRoster, fallback));
      setQuickGrade((prev) => prev || fallback);
    } catch (e: any) {
      toast.error(e?.message || 'Could not load class enrollment data');
    } finally {
      setLoading(false);
    }
  }, [id, buildInitialGrades]);

  useEffect(() => {
    if (isStaff) void loadAll();
  }, [isStaff, loadAll]);

  // Derived stats
  const seatsLeft = cls?.max_students ? Math.max(0, cls.max_students - roster.length) : Infinity;
  const feederStudents = useMemo(() => available.filter((s) => s.is_feeder_promotion), [available]);
  const unassignedCount = useMemo(() => available.filter((s) => !s.class_id).length, [available]);
  const otherCount = useMemo(() => available.filter((s) => Boolean(s.class_id)).length, [available]);
  const distinctGrades = useMemo(
    () => Array.from(new Set(available.map((s) => s.grade || s.section_class).filter(Boolean) as string[])).sort(),
    [available],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available.filter((s) => {
      if (placement === 'feeder' && !s.is_feeder_promotion) return false;
      if (placement === 'unassigned' && s.class_id) return false;
      if (placement === 'other' && !s.class_id) return false;
      if (sourceClassId && s.class_id !== sourceClassId) return false;
      if (gradeFilter && (s.grade || s.section_class || '') !== gradeFilter) return false;
      if (!q) return true;
      return [s.full_name, s.email, s.grade, s.section_class, s.current_class_name]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [available, search, placement, sourceClassId, gradeFilter]);

  const enrollableFiltered = useMemo(() => filtered.filter((s) => !s.requires_transfer_request), [filtered]);
  const allFilteredSelected = enrollableFiltered.length > 0 && enrollableFiltered.every((s) => selectedIds.has(s.id));
  const visibleRows = showAllRows ? filtered : filtered.slice(0, 60);

  const toggleSelect = (sid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else if (next.size < seatsLeft) next.add(sid);
      else toast.error(`Class capacity reached (${cls?.max_students} max).`);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        enrollableFiltered.forEach((s) => next.delete(s.id));
      } else {
        for (const s of enrollableFiltered) {
          if (next.size >= seatsLeft) break;
          next.add(s.id);
        }
      }
      return next;
    });
  };

  // Actions
  const adoptOne = async (studentId: string, overrideAction?: GradeAction, overrideGrade?: string) => {
    setBusy(studentId);
    try {
      const act = overrideAction ?? perStudentAction[studentId] ?? gradeAction;
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          promoteToClassGrade: act !== 'retain',
          gradeAction: act,
          targetGrade: (overrideGrade ?? targetGradePitch) || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not adopt student');
      toast.success('Student adopted into class');
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(studentId); return n; });
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not adopt student');
    } finally {
      setBusy(null);
    }
  };

  const adoptSelected = async (idsOverride?: string[], actionOverride?: GradeAction) => {
    const ids = idsOverride ?? Array.from(selectedIds);
    if (!ids.length) return;
    setBusy('bulk');
    try {
      const act = actionOverride ?? gradeAction;
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: ids,
          promoteToClassGrade: act !== 'retain',
          gradeAction: act,
          targetGrade: targetGradePitch || undefined,
          studentActions: perStudentAction,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not enrol selected students');
      toast.success(`Adopted ${json.enrolled ?? ids.length} student${(json.enrolled ?? ids.length) === 1 ? '' : 's'} into ${cls?.name || 'class'}`);
      setSelectedIds(new Set());
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Batch enrollment failed');
    } finally {
      setBusy(null);
    }
  };

  const submitQuickAdd = async () => {
    if (!quickInput.trim()) return;
    setBusy('quick');
    setQuickNotice(null);
    try {
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quickAddNames: quickInput.trim(),
          defaultGrade: quickGrade || defaultEntryGrade || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not add students');
      const added = Array.isArray(json.quickAdded) ? json.quickAdded : [];
      const ambiguous = Array.isArray(json.quickAmbiguous) ? json.quickAmbiguous : [];
      const errors = Array.isArray(json.quickErrors) ? json.quickErrors : [];
      setQuickNotice({
        summary: added.length
          ? `Synced ${added.length} student${added.length === 1 ? '' : 's'} into ${cls?.name || 'this class'}.`
          : ambiguous.length
            ? `${ambiguous.length} name${ambiguous.length === 1 ? '' : 's'} matched multiple existing students — choose below.`
            : 'No new students added.',
        added,
        ambiguous,
        errors,
      });
      if (added.length > 0 && ambiguous.length === 0 && errors.length === 0) {
        setQuickInput('');
      }
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Quick-add failed');
    } finally {
      setBusy(null);
    }
  };

  const stepGrade = (current: string | null | undefined, dir: 1 | -1): string => {
    const canon = canonicalGrade(current) ?? (current || '').trim();
    if (!canon) return defaultEntryGrade;
    const idx = (SINGLE_GRADES as readonly string[]).indexOf(canon);
    if (idx < 0) return canon;
    const nextIdx = idx + dir;
    return nextIdx >= 0 && nextIdx < SINGLE_GRADES.length ? SINGLE_GRADES[nextIdx] : canon;
  };

  const applyBulkStep = (dir: 1 | -1) => {
    setConfirmGrades((prev) => {
      const next = { ...prev };
      for (const s of roster) {
        if (!confirmKeepIds.has(s.id)) continue;
        next[s.id] = stepGrade(next[s.id] || s.grade, dir);
      }
      return next;
    });
  };

  const saveConfirmRoster = async () => {
    setBusy('confirm');
    try {
      const updates: Array<{ studentId: string; grade: string }> = [];
      const prevSnap: Array<{ studentId: string; grade: string }> = [];
      const withdrawStudentIds: string[] = [];

      for (const s of roster) {
        if (confirmKeepIds.has(s.id)) {
          const targetG = (confirmGrades[s.id] || s.grade || '').trim();
          const prevG = (canonicalGrade(s.grade) || s.grade || '').trim();
          if (targetG) {
            updates.push({ studentId: s.id, grade: targetG });
            if (prevG && prevG !== targetG) prevSnap.push({ studentId: s.id, grade: prevG });
          }
        } else {
          withdrawStudentIds.push(s.id);
        }
      }

      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, withdrawStudentIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not save roster grades');
      if (prevSnap.length > 0) setLastSnapshot(prevSnap);
      toast.success(`Saved: ${json.updatedCount ?? 0} confirmed${json.withdrawnCount ? ` · ${json.withdrawnCount} withdrawn` : ''}`);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save grades');
    } finally {
      setBusy(null);
    }
  };

  const undoLastSave = async () => {
    if (!lastSnapshot?.length) return;
    setBusy('confirm');
    try {
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: lastSnapshot }),
      });
      if (!res.ok) throw new Error('Could not undo last save');
      toast.success(`Reverted ${lastSnapshot.length} student grade${lastSnapshot.length === 1 ? '' : 's'}`);
      setLastSnapshot(null);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Undo failed');
    } finally {
      setBusy(null);
    }
  };

  if (!isStaff) {
    return <div className="p-6 text-sm text-muted-foreground">Only staff can manage class enrollment.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-4 pb-32 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/dashboard/classes/${id}?operation=roster`}
            className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to {cls?.name || 'Class'}
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">
            <UserPlusIcon className="h-6 w-6 text-primary shrink-0" />
            Add, Adopt &amp; Promote Students
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {cls?.name || 'Class'}
            {cls?.schools?.name ? ` · ${cls.schools.name}` : ''}
            {` · ${roster.length} active`}
            {cls?.max_students ? ` / ${cls.max_students} seats` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link
            href={`/dashboard/classes/${id}/cards`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/35 bg-primary/10 px-3.5 text-xs font-black text-primary hover:bg-primary/20"
          >
            <CreditCardIcon className="h-4 w-4" /> Login PDF &amp; ID Cards
          </Link>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm">
        {([
          { id: 'pick' as TabKey, label: `Pick & Adopt (${available.length})`, short: 'Pick & Adopt' },
          { id: 'quick' as TabKey, label: 'Quick-Add / Paste', short: 'Quick-Add' },
          { id: 'confirm' as TabKey, label: `Promote Roster (${roster.length})`, short: 'Promote' },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-11 rounded-xl px-2.5 py-2 text-xs font-black transition-all ${
              tab === t.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.short}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : tab === 'pick' ? (
        <div className="space-y-4">
          {/* Simplified Search & Clean Filter Bar */}
          <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  aria-label="Search school students"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setShowAllRows(false); }}
                  placeholder="Type a student name to find & adopt…"
                  className="min-h-11 w-full rounded-xl border border-border bg-background pl-10 pr-9 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              {feederStudents.length > 0 && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => void adoptSelected(feederStudents.slice(0, seatsLeft).map((s) => s.id), 'promote')}
                  className="min-h-11 shrink-0 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50 shadow-sm"
                >
                  ⬆ Promote All {feederStudents[0]?.grade || 'Prior'} ({feederStudents.length})
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: 'all' as PlacementFilter, label: `All (${available.length})` },
                ...(feederStudents.length > 0 ? [{ id: 'feeder' as PlacementFilter, label: `Prior Grade (${feederStudents.length})` }] : []),
                { id: 'unassigned' as PlacementFilter, label: `Unassigned (${unassignedCount})` },
                { id: 'other' as PlacementFilter, label: `Other Classes (${otherCount})` },
              ]).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => { setPlacement(chip.id); setShowAllRows(false); }}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                    placement === chip.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto w-full sm:w-auto pt-1 sm:pt-0">
                {schoolClasses.length > 0 && (
                  <select
                    aria-label="Filter by source class"
                    value={sourceClassId}
                    onChange={(e) => { setSourceClassId(e.target.value); setShowAllRows(false); }}
                    className="min-h-9 flex-1 sm:flex-none rounded-xl border border-border bg-background px-2.5 text-xs font-semibold text-foreground"
                  >
                    <option value="">All Classes</option>
                    {schoolClasses.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.name} ({sc.student_count})
                      </option>
                    ))}
                  </select>
                )}
                <select
                  aria-label="Target grade pitch"
                  value={targetGradePitch}
                  onChange={(e) => setTargetGradePitch(e.target.value)}
                  className="min-h-9 flex-1 sm:flex-none rounded-xl border border-primary/35 bg-primary/5 px-2.5 text-xs font-bold text-primary"
                >
                  <option value="">Grade: Auto (+1)</option>
                  {SINGLE_GRADES.map((g) => (
                    <option key={`pitch-sel-${g}`} value={g}>Set Grade: {g}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAllFiltered}
                  className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
                >
                  {allFilteredSelected ? `Deselect All (${enrollableFiltered.length})` : `Select All Shown (${enrollableFiltered.length})`}
                </button>
                {selectedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs font-bold text-muted-foreground underline hover:text-foreground"
                  >
                    Clear ({selectedIds.size})
                  </button>
                )}
              </div>
              <span className="text-xs font-semibold text-muted-foreground">
                Showing {visibleRows.length} of {filtered.length} student{filtered.length === 1 ? '' : 's'}
              </span>
            </div>
          )}

          {/* Spacious Student Cards Grid */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center space-y-2">
              <UserGroupIcon className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-bold text-foreground">No matching students found</p>
              <p className="text-xs text-muted-foreground">
                Try clearing filters, or switch to the <strong>Quick-Add / Paste</strong> tab to add new students cleanly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {visibleRows.map((s) => {
                const checked = selectedIds.has(s.id);
                const locked = Boolean(s.requires_transfer_request);
                const gradeLabel = s.grade || s.section_class;
                const initials = (s.full_name || '?')
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() || '')
                  .join('') || '?';
                return (
                  <div
                    key={s.id}
                    onClick={() => !locked && toggleSelect(s.id)}
                    className={`flex flex-col gap-3 rounded-2xl border p-4 transition-all ${
                      locked
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : checked
                          ? 'border-primary bg-primary/5 shadow-sm cursor-pointer'
                          : 'border-border bg-card hover:border-primary/40 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={() => !locked && toggleSelect(s.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${s.full_name}`}
                        className="mt-1 h-5 w-5 shrink-0 rounded accent-primary"
                      />
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-xs font-black text-primary">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm sm:text-base font-black text-foreground break-words leading-snug">
                          {s.full_name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {gradeLabel && (
                            <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-black text-foreground">
                              {gradeLabel}
                              {targetGradePitch
                                ? ` → ${targetGradePitch}`
                                : s.suggested_grade && s.suggested_grade !== gradeLabel
                                  ? ` → ${s.suggested_grade}`
                                  : ''}
                            </span>
                          )}
                          {!s.class_id ? (
                            <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                              Unassigned
                            </span>
                          ) : (
                            <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                              From: {s.current_class_name || 'Another class'}
                            </span>
                          )}
                        </div>
                        {s.email && (
                          <p className="mt-1 text-xs font-mono text-muted-foreground break-all">{s.email}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5" onClick={(e) => e.stopPropagation()}>
                      {checked && !locked ? (
                        <div className="flex items-center gap-1">
                          {(['promote', 'demote', 'retain'] as GradeAction[]).map((act) => {
                            const active = (perStudentAction[s.id] || gradeAction) === act;
                            return (
                              <button
                                key={act}
                                type="button"
                                onClick={() => setPerStudentAction((prev) => ({ ...prev, [s.id]: act }))}
                                className={`rounded-lg border px-2 py-1 text-[10px] font-black ${
                                  active
                                    ? 'border-emerald-700 bg-emerald-700 text-white'
                                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {act === 'promote' ? '⬆ +1' : act === 'demote' ? '⬇ -1' : '↔ Keep'}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {s.current_teacher_name ? `Teacher: ${s.current_teacher_name}` : 'Ready to adopt'}
                        </span>
                      )}
                      {!locked ? (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void adoptOne(s.id)}
                          className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-40"
                        >
                          {busy === s.id ? 'Adopting…' : 'Adopt Now'}
                        </button>
                      ) : (
                        <span className="ml-auto text-[11px] font-bold text-amber-800 dark:text-amber-300">
                          Owned by another teacher
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filtered.length > visibleRows.length && (
            <button
              type="button"
              onClick={() => setShowAllRows(true)}
              className="w-full min-h-11 rounded-2xl border border-border bg-card text-xs font-black text-foreground hover:bg-muted"
            >
              Show all {filtered.length} matching students
            </button>
          )}
        </div>
      ) : tab === 'quick' ? (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-black text-foreground">Quick-Add or Paste Student Names</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically matches &amp; transfers existing school students (zero duplicates) or creates clean <code className="font-mono">firstname123@rillcod.com</code> + <code className="font-mono">rillcod@XXXX</code> accounts.
              </p>
            </div>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              Pushing to: {quickGrade || `Auto (${defaultEntryGrade || 'Class'})`}
            </span>
          </div>

          {/* Clean 1-tap Target Grade Pitch (only class band grades as pills + dropdown for others) */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">1. Target Grade</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuickGrade('')}
                className={`min-h-9 rounded-xl border px-3 text-xs font-bold ${
                  !quickGrade ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                Auto
              </button>
              {SINGLE_GRADES.filter((g) => (classBand ? bandCoversGrade(classBand, g) : ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'].includes(g))).map((g) => {
                const active = quickGrade === g;
                return (
                  <button
                    key={`q-pitch-${g}`}
                    type="button"
                    onClick={() => setQuickGrade(g)}
                    className={`min-h-9 rounded-xl border px-3 text-xs font-bold transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-primary/35 bg-primary/5 text-primary hover:bg-primary/15'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
              <select
                aria-label="Other target grade"
                value={quickGrade}
                onChange={(e) => setQuickGrade(e.target.value)}
                className="min-h-9 rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-foreground"
              >
                <option value="">Other grade…</option>
                {SINGLE_GRADES.map((g) => (
                  <option key={`q-other-${g}`} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-wider text-muted-foreground">
              2. Type or Paste Student Names (one per line)
            </label>
            <textarea
              rows={6}
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder={`Samuel Agha\nAdaeze Okonkwo\nChinedu Eze JSS 2`}
              className="w-full rounded-2xl border border-border bg-background p-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={busy === 'quick' || !quickInput.trim()}
                onClick={() => void submitQuickAdd()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-40 shadow-sm"
              >
                {busy === 'quick' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
                Push to {quickGrade || defaultEntryGrade || cls?.name || 'Class'}
              </button>
            </div>
          </div>

          {quickNotice && (
            <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-black text-emerald-900 dark:text-emerald-200">{quickNotice.summary}</p>
                <Link
                  href={`/dashboard/classes/${id}/cards`}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-black text-white hover:bg-emerald-800"
                >
                  Print Login + RC PDF →
                </Link>
              </div>
              {quickNotice.added.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border bg-card">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted/60 text-[10px] font-black uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2">Grade</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Username / Password</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {quickNotice.added.map((a, idx) => (
                        <tr key={`${a.fullName}-${idx}`}>
                          <td className="px-3 py-2 font-bold text-foreground">{a.fullName}</td>
                          <td className="px-3 py-2 text-muted-foreground">{a.grade || '—'}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase text-primary">
                              {a.mode === 'adopted' ? 'Adopted' : a.mode === 'created' ? 'New Account' : 'Confirmed'}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px]">
                            {a.email || '—'}{a.password ? ` / ${a.password}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {quickNotice.ambiguous.length > 0 && (
                <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 space-y-2">
                  <p className="font-black text-amber-900 dark:text-amber-200">
                    Multiple students in this school matched — click the exact student to adopt &amp; transfer:
                  </p>
                  {quickNotice.ambiguous.map((row) => (
                    <div key={row.input} className="space-y-1">
                      <p className="font-bold text-foreground">{row.input}:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {row.candidates.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            disabled={!!busy}
                            onClick={() => void adoptOne(c.id, 'promote', quickGrade || undefined)}
                            className="rounded-lg border border-primary/40 bg-card px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"
                          >
                            + Adopt {c.full_name}{c.grade ? ` (${c.grade})` : ''}{c.current_class_name ? ` · ${c.current_class_name}` : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-foreground">Confirm &amp; Promote Current Roster</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Promote steps each checked student up by +1 from their own grade (e.g. JSS 1 → JSS 2, SS 1 → SS 2). Untick anyone who left.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyBulkStep(1)}
                className="min-h-10 rounded-xl bg-emerald-700 px-3.5 text-xs font-black text-white hover:bg-emerald-800"
              >
                ⬆ Promote All (+1)
              </button>
              <button
                type="button"
                onClick={() => applyBulkStep(-1)}
                className="min-h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted"
              >
                ⬇ Demote (-1)
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmKeepIds(new Set(roster.map((s) => s.id)));
                  setConfirmGrades(buildInitialGrades(roster, defaultEntryGrade));
                }}
                className="min-h-10 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
              >
                ↺ Revert
              </button>
              {lastSnapshot && lastSnapshot.length > 0 && (
                <button
                  type="button"
                  disabled={busy === 'confirm'}
                  onClick={() => void undoLastSave()}
                  className="min-h-10 rounded-xl border border-primary/40 bg-primary/10 px-3 text-xs font-black text-primary hover:bg-primary/20"
                >
                  ↺ Undo Last Save ({lastSnapshot.length})
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
            {roster.map((s) => {
              const kept = confirmKeepIds.has(s.id);
              const chosen = confirmGrades[s.id] ?? s.grade ?? '';
              const changed = kept && chosen && s.grade && chosen !== canonicalGrade(s.grade) && chosen !== s.grade;
              return (
                <div key={s.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${kept ? 'bg-card' : 'bg-rose-500/5 opacity-75'}`}>
                  <input
                    type="checkbox"
                    checked={kept}
                    onChange={(e) => setConfirmKeepIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(s.id); else next.delete(s.id);
                      return next;
                    })}
                    aria-label={`Keep ${s.full_name}`}
                    className="h-5 w-5 shrink-0 accent-emerald-700"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground break-words">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Current: {s.grade || 'No grade'}
                      {changed && <span className="ml-1.5 font-black text-emerald-700 dark:text-emerald-300">→ {chosen}</span>}
                      {!kept && <span className="ml-1.5 font-black text-rose-600 dark:text-rose-400">· Will withdraw</span>}
                    </p>
                  </div>
                  {kept ? (
                    <select
                      aria-label={`New grade for ${s.full_name}`}
                      value={chosen}
                      onChange={(e) => setConfirmGrades((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      className="min-h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground"
                    >
                      <option value="">Select grade</option>
                      {SINGLE_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  ) : (
                    <span className="rounded-lg bg-rose-500/15 px-2.5 py-1 text-xs font-black text-rose-700 dark:text-rose-300">Withdraw</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={busy === 'confirm' || roster.length === 0}
              onClick={() => void saveConfirmRoster()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-40 shadow-sm"
            >
              {busy === 'confirm' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
              Save &amp; Confirm Roster
            </button>
          </div>
        </div>
      )}

      {/* Sticky bottom action bar when students are ticked in Pick & Adopt */}
      {tab === 'pick' && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="text-xs font-semibold text-muted-foreground">
              <span className="font-black text-foreground">{selectedIds.size}</span> student{selectedIds.size === 1 ? '' : 's'} selected
              {targetGradePitch ? ` · Pitch: ${targetGradePitch}` : ''}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="min-h-11 rounded-xl border border-border bg-background px-3.5 text-xs font-bold text-foreground hover:bg-muted"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void adoptSelected()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-40 shadow-md"
              >
                {busy === 'bulk' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
                Adopt &amp; Enrol ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
