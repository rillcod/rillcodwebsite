'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import {
  ChartBarIcon, BookOpenIcon, BuildingOfficeIcon, CheckCircleIcon,
  ClockIcon, ExclamationTriangleIcon, ArrowPathIcon, DocumentTextIcon,
  AcademicCapIcon, SparklesIcon, ChevronDownIcon, ChevronRightIcon,
  CalendarDaysIcon, UserGroupIcon,
} from '@/lib/icons';

// ── Nigerian Term Calendar ────────────────────────────────────────────────────
const TERM_LABELS: Record<number, { label: string; months: string; color: string }> = {
  1: { label: 'First Term',  months: 'Sept – Dec', color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  2: { label: 'Second Term', months: 'Jan – Mar',  color: 'text-blue-400   bg-blue-500/10   border-blue-500/30'   },
  3: { label: 'Third Term',  months: 'Apr – Jun',  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
};

const WEEK_TYPE_COLOR: Record<string, string> = {
  lesson:      'bg-violet-500',
  assessment:  'bg-amber-500',
  examination: 'bg-rose-500',
};

interface TermProgress {
  term: number; title: string; totalWeeks: number; completed: number; pct: number;
}
interface UpcomingEvent {
  week: number; term: number; type: string; topic: string;
}
interface SchoolProgress {
  school_id: string | null; school_name: string;
  total_weeks: number; completed: number; in_progress: number; skipped: number; pct: number;
  current_week: any; upcoming_assessments: UpcomingEvent[];
  term_progress: TermProgress[];
  last_activity: string | null;
}
interface CurriculumProgress {
  curriculum_id: string; course_id: string; course_title: string; program_name: string;
  version: number; total_weeks: number; term_count: number;
  per_school: SchoolProgress[];
}

function pctColor(pct: number) {
  if (pct >= 75) return 'bg-emerald-500';
  if (pct >= 40) return 'bg-amber-500';
  if (pct > 0)  return 'bg-blue-500';
  return 'bg-muted-foreground/30';
}

function relativeTime(iso: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7)  return `${d} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function CurriculumProgressPage() {
  const { profile } = useAuth();
  const [data, setData]         = useState<CurriculumProgress[]>([]);
  const [schools, setSchools]   = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filterSchool, setFilterSchool] = useState('');
  const [filterTerm, setFilterTerm]     = useState('');

  const isSchool = profile?.role === 'school';

  useEffect(() => {
    setLoading(true);
    const qs = filterSchool ? `?school_id=${filterSchool}` : '';
    fetch(`/api/curricula/progress${qs}`)
      .then(r => r.json())
      .then(j => {
        setData(j.data ?? []);
        setSchools(j.schools ?? []);
      })
      .finally(() => setLoading(false));
  }, [filterSchool]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Summary stats
  const totalCurricula  = data.length;
  const totalCompleted  = data.reduce((a, d) => a + d.per_school.reduce((b, s) => b + (s.pct === 100 ? 1 : 0), 0), 0);
  const totalWeeksDelivered = data.reduce((a, d) => a + d.per_school.reduce((b, s) => b + s.completed, 0), 0);
  const upcomingCount   = data.reduce((a, d) => a + d.per_school.reduce((b, s) => b + s.upcoming_assessments.length, 0), 0);

  const filteredData = data.filter(c =>
    !filterTerm || c.per_school.some(s =>
      s.term_progress.find(t => t.term === Number(filterTerm) && t.completed > 0)
    )
  );

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/dashboard/curriculum" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Curriculum
              </Link>
            </div>
            <h1 className="text-2xl font-black">Curriculum Delivery Progress</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isSchool ? 'Your school\'s curriculum delivery status' : 'Live delivery tracking across all partner schools'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/curriculum"
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold transition-colors"
            >
              <BookOpenIcon className="w-4 h-4" /> Open Curriculum
            </Link>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active Curricula', value: totalCurricula, icon: BookOpenIcon, color: 'text-violet-400' },
            { label: 'Fully Completed', value: totalCompleted, icon: CheckCircleIcon, color: 'text-emerald-400' },
            { label: 'Weeks Delivered', value: totalWeeksDelivered, icon: AcademicCapIcon, color: 'text-orange-400' },
            { label: 'Upcoming Assessments', value: upcomingCount, icon: ExclamationTriangleIcon, color: 'text-amber-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border p-4 space-y-2">
              <Icon className={`w-5 h-5 ${color}`} />
              <p className="text-2xl font-black">{value}</p>
              <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {/* Nigerian Term Calendar Legend */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">Nigerian Academic Calendar:</span>
          {Object.entries(TERM_LABELS).map(([term, { label, months, color }]) => (
            <span key={term} className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 border ${color}`}>
              {label} · {months}
            </span>
          ))}
        </div>

        {/* Filters */}
        {!isSchool && (
          <div className="flex flex-wrap gap-3">
            <select
              value={filterSchool}
              onChange={e => setFilterSchool(e.target.value)}
              className="bg-card border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">All Schools</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select
              value={filterTerm}
              onChange={e => setFilterTerm(e.target.value)}
              className="bg-card border border-border text-foreground px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">All Terms</option>
              <option value="1">First Term</option>
              <option value="2">Second Term</option>
              <option value="3">Third Term</option>
            </select>
            {(filterSchool || filterTerm) && (
              <button
                onClick={() => { setFilterSchool(''); setFilterTerm(''); }}
                className="text-xs text-orange-400 hover:text-orange-300 font-bold transition-colors px-2"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Curricula list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border">
            <SparklesIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No curricula found. Generate one from the Curriculum page.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredData.map(curr => {
              const isExpanded = expanded.has(curr.curriculum_id);
              const avgPct = curr.per_school.length > 0
                ? Math.round(curr.per_school.reduce((a, s) => a + s.pct, 0) / curr.per_school.length)
                : 0;

              return (
                <div key={curr.curriculum_id} className="bg-card border border-border overflow-hidden">
                  {/* Course header */}
                  <button
                    onClick={() => toggleExpand(curr.curriculum_id)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{curr.program_name}</span>
                        <span className="text-muted-foreground/30">›</span>
                        <span className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">v{curr.version}</span>
                      </div>
                      <h3 className="font-black text-base truncate">{curr.course_title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {curr.term_count} terms · {curr.total_weeks} weeks · {curr.per_school.filter(s => s.school_id).length} school(s) tracking
                      </p>
                    </div>

                    {/* Overall progress bar */}
                    <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0 w-32">
                      <span className="text-xs font-black text-foreground">{avgPct}% avg</span>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pctColor(avgPct)}`} style={{ width: `${avgPct}%` }} />
                      </div>
                    </div>

                    {isExpanded
                      ? <ChevronDownIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      : <ChevronRightIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    }
                  </button>

                  {/* Expanded: per-school rows */}
                  {isExpanded && (
                    <div className="border-t border-border divide-y divide-border/50">
                      {curr.per_school.map((school, si) => (
                        <SchoolProgressRow
                          key={school.school_id ?? `none-${si}`}
                          school={school}
                          totalWeeks={curr.total_weeks}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── School Progress Row ───────────────────────────────────────────────────────
function SchoolProgressRow({ school, totalWeeks }: { school: SchoolProgress; totalWeeks: number }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="px-4 py-3">
      {/* School name + summary */}
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setShowDetail(v => !v)}
      >
        <BuildingOfficeIcon className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{school.school_name}</p>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-40">
              <div className={`h-full rounded-full transition-all ${pctColor(school.pct)}`} style={{ width: `${school.pct}%` }} />
            </div>
            <span className="text-[11px] font-bold text-foreground shrink-0">{school.pct}%</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{school.completed}/{totalWeeks} wks</span>
          </div>
        </div>

        {/* Status badges */}
        <div className="hidden sm:flex items-center gap-2">
          {school.upcoming_assessments.length > 0 && (
            <span className="text-[9px] font-black px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
              {school.upcoming_assessments.length} upcoming
            </span>
          )}
          {school.last_activity && (
            <span className="text-[9px] text-muted-foreground">{relativeTime(school.last_activity)}</span>
          )}
        </div>

        {showDetail
          ? <ChevronDownIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        }
      </div>

      {/* Detail: per-term breakdown + upcoming */}
      {showDetail && (
        <div className="mt-3 ml-7 space-y-4">
          {/* Term breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {school.term_progress.map(term => {
              const { label, months, color } = TERM_LABELS[term.term] ?? { label: `Term ${term.term}`, months: '', color: 'text-muted-foreground' };
              return (
                <div key={term.term} className="bg-background border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase tracking-wider ${color.split(' ')[0]}`}>{label}</span>
                    <span className="text-[10px] text-muted-foreground">{months}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pctColor(term.pct)}`} style={{ width: `${term.pct}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">{term.completed}/{term.totalWeeks} weeks</span>
                    <span className="font-black text-foreground">{term.pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Current week */}
          {school.current_week && (
            <div className="flex items-center gap-2 text-xs">
              <ArrowPathIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-muted-foreground">Now on:</span>
              <span className="font-bold text-foreground">
                {TERM_LABELS[school.current_week.term]?.label} · Week {school.current_week.week} — {school.current_week.topic}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${WEEK_TYPE_COLOR[school.current_week.type] ?? 'bg-muted'} text-white font-bold uppercase`}>
                {school.current_week.type}
              </span>
            </div>
          )}

          {/* Upcoming assessments */}
          {school.upcoming_assessments.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">Upcoming</p>
              {school.upcoming_assessments.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-foreground font-bold">{ev.topic}</span>
                  <span className="text-muted-foreground">— {TERM_LABELS[ev.term]?.label}, Week {ev.week}</span>
                  <span className={`ml-auto text-[9px] px-1.5 py-0.5 ${ev.type === 'examination' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'} font-black uppercase tracking-wider`}>
                    {ev.type}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Completion badges */}
          {school.skipped > 0 && (
            <p className="text-[10px] text-zinc-500 font-bold">{school.skipped} week(s) skipped</p>
          )}
        </div>
      )}
    </div>
  );
}
