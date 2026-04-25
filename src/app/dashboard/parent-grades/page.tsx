'use client';

import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ClipboardDocumentListIcon,
  AcademicCapIcon,
  ArrowsUpDownIcon,
  ChartBarIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface Child { id: string; full_name: string; school_name: string | null }
interface GradeItem {
  id: string;
  type: 'assignment' | 'exam';
  title: string;
  grade: number | string | null;
  max_score: number | null;
  status: string;
  submitted_at: string | null;
  feedback: string | null;
}

type TypeFilter = 'all' | 'assignment' | 'exam';
type SortMode = 'date' | 'score';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPct(grade: number | string | null, max: number | null): number | null {
  if (grade == null) return null;
  const g = Number(grade);
  if (isNaN(g)) return null;
  if (max && max > 0) return Math.min(100, Math.round((g / max) * 100));
  // If no max_score, treat the grade itself as a percentage (0–100)
  return Math.min(100, Math.round(g));
}

function gradeColor(pct: number | null): string {
  if (pct == null) return 'text-muted-foreground';
  if (pct >= 70) return 'text-emerald-400';
  if (pct >= 55) return 'text-amber-400';
  return 'text-rose-400';
}

function gradeBg(pct: number | null): string {
  if (pct == null) return 'bg-muted-foreground/30';
  if (pct >= 70) return 'bg-emerald-500';
  if (pct >= 55) return 'bg-amber-500';
  return 'bg-rose-500';
}

function gradeBarTrack(pct: number | null): string {
  if (pct == null) return 'bg-muted/30';
  if (pct >= 70) return 'bg-emerald-500/15';
  if (pct >= 55) return 'bg-amber-500/15';
  return 'bg-rose-500/15';
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  accent: string; // Tailwind text color class
  bg: string;     // Tailwind bg color class
  border: string; // Tailwind border color class
  icon?: React.ReactNode;
}

function StatCard({ label, value, accent, bg, border, icon }: StatCardProps) {
  return (
    <div className={`flex-1 min-w-0 rounded-none border p-4 flex flex-col gap-1 ${bg} ${border}`}>
      <div className="flex items-center gap-1.5">
        {icon && <span className={`opacity-70 ${accent}`}>{icon}</span>}
        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-black tabular-nums ${accent}`}>{value}</p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

function ParentGradesContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const studentParam = searchParams.get('student');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(studentParam);
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingGrades, setLoadingGrades] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('date');

  // ── Fetch children ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    setLoadingChildren(true);
    fetch('/api/parents/portal?section=children')
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load children');
        const list = (data.children ?? []) as Child[];
        setChildren(list);
        if (!selectedId && list.length > 0) setSelectedId(list[0].id);
        setLoadingChildren(false);
      })
      .catch(err => {
        toast.error('Could not load student list. Please try again.');
        console.error('Failed to load children:', err);
        setLoadingChildren(false);
      });
  }, [profile]);

  // ── Fetch grades ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    setLoadingGrades(true);
    fetch(`/api/parents/portal?section=grades&child_id=${selectedId}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) throw new Error(data.error || 'Failed to load grades');
        setGrades((data.grades ?? []) as GradeItem[]);
        setLoadingGrades(false);
      })
      .catch(err => {
        toast.error('Could not load grades for this student.');
        console.error('Failed to load grades:', err);
        setLoadingGrades(false);
      });
  }, [selectedId]);

  // ── Derived data ─────────────────────────────────────────────────────────

  // Grades that have an actual numeric grade (graded items only)
  const gradedItems = useMemo(
    () => grades.filter(g => g.grade != null && !isNaN(Number(g.grade))),
    [grades],
  );

  const pctValues = useMemo(
    () =>
      gradedItems
        .map(g => getPct(g.grade, g.max_score))
        .filter((p): p is number => p !== null),
    [gradedItems],
  );

  const avgPct = pctValues.length
    ? Math.round(pctValues.reduce((a, b) => a + b, 0) / pctValues.length)
    : null;
  const bestPct = pctValues.length ? Math.max(...pctValues) : null;
  const lowestPct = pctValues.length ? Math.min(...pctValues) : null;

  // Apply type filter
  const filteredGrades = useMemo(() => {
    const base = typeFilter === 'all' ? grades : grades.filter(g => g.type === typeFilter);
    // Sort
    return [...base].sort((a, b) => {
      if (sortMode === 'score') {
        const pa = getPct(a.grade, a.max_score) ?? -1;
        const pb = getPct(b.grade, b.max_score) ?? -1;
        return pb - pa; // best first
      }
      // date descending (default)
      const da = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const db = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return db - da;
    });
  }, [grades, typeFilter, sortMode]);

  // ── Role guard ───────────────────────────────────────────────────────────
  if (profile?.role !== 'parent') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to parent accounts.</p>
      </div>
    );
  }

  const selectedChild = children.find(c => c.id === selectedId);

  // ── Type filter tabs config ───────────────────────────────────────────────
  const filterTabs: { key: TypeFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: grades.length },
    { key: 'assignment', label: 'Assignments', count: grades.filter(g => g.type === 'assignment').length },
    { key: 'exam', label: 'Exams', count: grades.filter(g => g.type === 'exam').length },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Grades</h1>
        <p className="text-sm text-muted-foreground mt-1">Assignment and exam grades for your children.</p>
      </div>

      {/* Child Selector */}
      {!loadingChildren && children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => {
                setSelectedId(child.id);
                setTypeFilter('all');
                setSortMode('date');
              }}
              className={`px-4 py-2 text-xs font-black uppercase tracking-widest border rounded-none transition-all ${
                selectedId === child.id
                  ? 'bg-primary border-primary text-white'
                  : 'bg-card border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {child.full_name}
            </button>
          ))}
        </div>
      )}

      {/* Empty state — no children */}
      {!loadingChildren && children.length === 0 && (
        <div className="bg-card border border-border rounded-none p-10 text-center">
          <AcademicCapIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No children linked</p>
        </div>
      )}

      {selectedChild && (
        <div className="space-y-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Grades for {selectedChild.full_name}
          </p>

          {/* ── Stat Summary Bar ──────────────────────────────────────────── */}
          {!loadingGrades && gradedItems.length > 0 && (
            <div className="flex flex-wrap gap-3">
              <StatCard
                label="Graded"
                value={String(gradedItems.length)}
                accent="text-blue-400"
                bg="bg-blue-500/5"
                border="border border-blue-500/20"
                icon={<ClipboardDocumentListIcon className="w-3.5 h-3.5" />}
              />
              <StatCard
                label="Average"
                value={avgPct != null ? `${avgPct}%` : '—'}
                accent={gradeColor(avgPct)}
                bg={avgPct != null && avgPct >= 70 ? 'bg-emerald-500/5' : avgPct != null && avgPct >= 55 ? 'bg-amber-500/5' : 'bg-rose-500/5'}
                border={avgPct != null && avgPct >= 70 ? 'border border-emerald-500/20' : avgPct != null && avgPct >= 55 ? 'border border-amber-500/20' : 'border border-rose-500/20'}
                icon={<ChartBarIcon className="w-3.5 h-3.5" />}
              />
              <StatCard
                label="Best"
                value={bestPct != null ? `${bestPct}%` : '—'}
                accent="text-emerald-400"
                bg="bg-emerald-500/5"
                border="border border-emerald-500/20"
              />
              <StatCard
                label="Lowest"
                value={lowestPct != null ? `${lowestPct}%` : '—'}
                accent={gradeColor(lowestPct)}
                bg="bg-rose-500/5"
                border="border border-rose-500/20"
              />
            </div>
          )}

          {/* ── Filter Tabs + Sort Toggle ─────────────────────────────────── */}
          {!loadingGrades && grades.length > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Type filter pill tabs */}
              <div className="flex items-center gap-1 p-1 bg-card border border-border rounded-none">
                {filterTabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setTypeFilter(tab.key)}
                    className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 rounded-none ${
                      typeFilter === tab.key
                        ? 'bg-primary text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                    <span className={`text-[9px] px-1 py-0.5 rounded-full font-black tabular-nums ${
                      typeFilter === tab.key
                        ? 'bg-white/20 text-white'
                        : 'bg-white/5 text-muted-foreground'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Sort toggle */}
              <button
                onClick={() => setSortMode(m => m === 'date' ? 'score' : 'date')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition-all rounded-none ${
                  sortMode === 'score'
                    ? 'bg-violet-600/20 border-violet-500/40 text-violet-400'
                    : 'bg-card border-border text-muted-foreground hover:border-violet-500/40 hover:text-violet-400'
                }`}
              >
                <ArrowsUpDownIcon className="w-3.5 h-3.5" />
                {sortMode === 'score' ? 'Best → Worst' : 'Latest First'}
              </button>
            </div>
          )}

          {/* ── Loading Skeleton ──────────────────────────────────────────── */}
          {loadingGrades && (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-card border border-border p-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                  <div className="flex justify-between items-start">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-muted rounded w-1/4 animate-pulse" />
                      <div className="h-3 bg-muted rounded w-1/2 animate-pulse opacity-50" />
                    </div>
                    <div className="h-8 w-20 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="mt-4 h-1.5 bg-muted rounded animate-pulse opacity-40" />
                </div>
              ))}
            </div>
          )}

          {/* ── Empty state — no grades ───────────────────────────────────── */}
          {!loadingGrades && grades.length === 0 && (
            <div className="bg-card border border-border rounded-none p-8 text-center">
              <ClipboardDocumentListIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">No grades yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Grades appear here once assignments and exams are marked.
              </p>
            </div>
          )}

          {/* ── Empty state — filtered to zero ───────────────────────────── */}
          {!loadingGrades && grades.length > 0 && filteredGrades.length === 0 && (
            <div className="bg-card border border-border rounded-none p-8 text-center">
              <ClipboardDocumentListIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-black text-foreground uppercase tracking-wider">
                No {typeFilter}s yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Try switching to a different filter tab.
              </p>
            </div>
          )}

          {/* ── Grade List ────────────────────────────────────────────────── */}
          {!loadingGrades && filteredGrades.length > 0 && (
            <div className="space-y-3">
              {filteredGrades.map(item => {
                const pct = getPct(item.grade, item.max_score);
                const colorClass = gradeColor(pct);
                const bgBar = gradeBg(pct);
                const trackBar = gradeBarTrack(pct);

                return (
                  <div
                    key={item.id}
                    className="bg-card border border-border rounded-none p-5 hover:bg-white/5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: badges + title + date */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                            item.type === 'exam'
                              ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                              : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                          }`}>
                            {item.type}
                          </span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                            item.status === 'graded' || item.status === 'completed'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          }`}>
                            {item.status}
                          </span>
                        </div>
                        <p className="font-black text-foreground text-sm truncate">{item.title}</p>
                        {item.submitted_at && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(item.submitted_at).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </p>
                        )}
                      </div>

                      {/* Right: large percentage + raw score */}
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-0.5">
                        {pct != null ? (
                          <>
                            <p className={`text-3xl font-black tabular-nums leading-none ${colorClass}`}>
                              {pct}
                              <span className="text-base font-black">%</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground tabular-nums">
                              {item.grade ?? '—'}
                              {item.max_score ? `/${item.max_score}` : ''}
                            </p>
                          </>
                        ) : (
                          <p className="text-xl font-black tabular-nums text-muted-foreground">
                            {item.grade ?? '—'}
                            {item.max_score
                              ? <span className="text-sm text-muted-foreground font-bold">/{item.max_score}</span>
                              : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Percentage bar */}
                    {pct != null && (
                      <div className={`mt-3 h-1.5 w-full rounded-full overflow-hidden ${trackBar}`}>
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${bgBar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}

                    {/* Feedback */}
                    {item.feedback && (
                      <div className="mt-3 p-3 bg-muted border border-border rounded-none">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Feedback</p>
                        <p className="text-xs text-foreground leading-relaxed">{item.feedback}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ParentGradesPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-card border border-border rounded-none" />}>
      <ParentGradesContent />
    </Suspense>
  );
}
