'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import {
  ArrowRightIcon, ArrowPathIcon, CheckCircleIcon,
  UserGroupIcon, ExclamationTriangleIcon,
  SparklesIcon, PresentationChartLineIcon, DocumentChartBarIcon, RocketLaunchIcon,
  EyeIcon, BookOpenIcon, TrophyIcon, PlusIcon,
} from '@/lib/icons';
import type {
  StudentLevelEnrollment, PromotionDecision,
} from '@/types/progression.types';

// ── Term helpers ──────────────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear();
const TERM_OPTIONS = [
  `Term 1 ${CURRENT_YEAR}`, `Term 2 ${CURRENT_YEAR}`, `Term 3 ${CURRENT_YEAR}`,
  `Term 1 ${CURRENT_YEAR + 1}`, `Term 2 ${CURRENT_YEAR + 1}`, `Term 3 ${CURRENT_YEAR + 1}`,
];

function nextTerm(label: string): string {
  const [, num, year] = label.match(/Term (\d) (\d{4})/) ?? [];
  if (!num || !year) return label;
  const n = parseInt(num); const y = parseInt(year);
  return n < 3 ? `Term ${n + 1} ${y}` : `Term 1 ${y + 1}`;
}

// ── Decision badge styles ─────────────────────────────────────────────────────
const DECISION_META: Record<PromotionDecision, { label: string; cls: string; icon: any }> = {
  promote:  { label: 'Promote',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', icon: ArrowRightIcon },
  repeat:   { label: 'Repeat',   cls: 'bg-amber-500/10  text-amber-400  border-amber-500/30',    icon: ArrowPathIcon },
  complete: { label: 'Complete', cls: 'bg-violet-500/10 text-violet-400 border-violet-500/30',   icon: CheckCircleIcon },
  withdraw: { label: 'Withdraw', cls: 'bg-rose-500/10   text-rose-400   border-rose-500/30',     icon: ExclamationTriangleIcon },
};

export default function ProgressionPage() {
  const { profile, loading: authLoading } = useAuth();
  const isStaff   = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
  const canPromote = profile?.role === 'admin' || profile?.role === 'teacher';

  const [programs, setPrograms]         = useState<any[]>([]);
  const [filterProgram, setFilterProg]  = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [filterTerm, setFilterTerm]     = useState(`Term 1 ${CURRENT_YEAR}`);
  const [enrollments, setEnrollments]   = useState<StudentLevelEnrollment[]>([]);
  const [loading, setLoading]           = useState(false);
  const [decisions, setDecisions]       = useState<Record<string, PromotionDecision>>({});
  const [submitting, setSubmitting]     = useState(false);
  const [submitted, setSubmitted]       = useState<string[]>([]);
  const [error, setError]               = useState('');

  // Load programs for filter
  useEffect(() => {
    if (!profile || !isStaff) return;
    fetch('/api/programs?is_active=true').then(r => r.json()).then(j => setPrograms(j.data ?? []));
  }, [profile?.id]); // eslint-disable-line

  // Load enrollments when filters change
  useEffect(() => {
    if (!profile || !isStaff || !filterTerm) return;
    const params = new URLSearchParams({ status: 'active' });
    if (filterCourse)  params.set('course_id',  filterCourse);
    if (filterProgram) params.set('program_id', filterProgram);
    if (profile.role === 'school' && profile.school_id) params.set('school_id', profile.school_id);
    setLoading(true);
    fetch(`/api/student-level-enrollments?${params}`)
      .then(r => r.json())
      .then(j => {
        const rows: StudentLevelEnrollment[] = (j.data ?? []).filter(
          (e: StudentLevelEnrollment) => e.term_label === filterTerm
        );
        setEnrollments(rows);
        setDecisions({});
        setSubmitted([]);
      })
      .finally(() => setLoading(false));
  }, [filterProgram, filterCourse, filterTerm, profile?.id]); // eslint-disable-line

  const selectedProgram  = programs.find(p => p.id === filterProgram);
  const availableCourses: any[] = selectedProgram?.courses?.filter((c: any) => c.is_active !== false) ?? [];
  const pending          = enrollments.filter(e => !submitted.includes(e.id));

  // Aggregated counts for summary bar
  const decidedCount   = pending.filter(e => decisions[e.id]).length;
  const processedCount = submitted.length;
  const decisionCounts = (['promote', 'repeat', 'complete', 'withdraw'] as PromotionDecision[])
    .map(d => ({ d, count: Object.values(decisions).filter(v => v === d).length }))
    .filter(x => x.count > 0);

  async function submitAll() {
    const toProcess = pending.filter(e => decisions[e.id]);
    if (toProcess.length === 0) { setError('Set a decision for at least one student'); return; }
    setSubmitting(true);
    setError('');
    const next   = nextTerm(filterTerm);
    const failed: string[] = [];

    for (const enroll of toProcess) {
      const res = await fetch(`/api/student-level-enrollments/${enroll.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: decisions[enroll.id], next_term_label: next }),
      });
      if (res.ok) {
        setSubmitted(prev => [...prev, enroll.id]);
      } else {
        failed.push((enroll as any).portal_users?.full_name ?? enroll.student_id);
      }
    }
    if (failed.length) setError(`Failed for: ${failed.join(', ')}`);
    setSubmitting(false);
  }

  if (authLoading || !profile) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isStaff) return (
    <div className="flex items-center justify-center min-h-screen text-muted-foreground text-sm">
      Staff access required.
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center shrink-0">
            <ArrowRightIcon className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground">Term-End Progression</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review each student and decide: Promote to next level, Repeat this level, or Complete the track.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Link
            href="/dashboard/curriculum/progress"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 transition-colors rounded-lg"
          >
            <PresentationChartLineIcon className="w-3.5 h-3.5" /> Delivery Progress
          </Link>
          {canPromote && (
            <Link
              href="/dashboard/reports/builder"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors rounded-lg"
            >
              <DocumentChartBarIcon className="w-3.5 h-3.5" /> Build Report Cards
            </Link>
          )}
        </div>
      </div>

      {/* School read-only notice */}
      {profile.role === 'school' && (
        <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm">
          <UserGroupIcon className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-blue-300">
            You are viewing progression records for your school's students.
            Promotion decisions can only be made by the assigned teacher or admin.
          </p>
        </div>
      )}

      {/* LMS settings tools control center */}
      {(profile.role === 'admin' || profile.role === 'teacher' || profile.role === 'school') && (
        <div className="p-5 sm:p-6 rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.03] to-fuchsia-500/[0.03]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
              <RocketLaunchIcon className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-300/90">
                Academic Operations
              </p>
              <h2 className="text-lg font-black text-foreground">LMS Controls & Delivery</h2>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { 
                label: 'Global Settings', 
                desc: 'Base system defaults', 
                href: '/dashboard/progression/settings', 
                icon: RocketLaunchIcon, 
                color: 'violet' 
              },
              { 
                label: 'Policies', 
                desc: 'Rules for promotion', 
                href: '/dashboard/progression/policies', 
                icon: CheckCircleIcon, 
                color: 'emerald' 
              },
              { 
                label: 'Ops Center', 
                desc: 'Session & week control', 
                href: '/dashboard/progression/operations', 
                icon: UserGroupIcon, 
                color: 'blue' 
              },
              { 
                label: 'Analytics', 
                desc: 'Delivery tracking', 
                href: '/dashboard/progression/analytics', 
                icon: EyeIcon, 
                color: 'fuchsia' 
              },
              { 
                label: 'Project Seeds', 
                desc: 'Curriculum source work', 
                href: '/dashboard/progression/project-registry', 
                icon: BookOpenIcon, 
                color: 'orange' 
              },
              { 
                label: 'QA Spines', 
                desc: 'Compliance catalog', 
                href: '/dashboard/progression/qa-spine-catalog', 
                icon: SparklesIcon, 
                color: 'amber' 
              },
              { 
                label: 'Audit Log', 
                desc: 'Activity trail', 
                href: '/dashboard/progression/audit', 
                icon: ExclamationTriangleIcon, 
                color: 'rose',
                roles: ['admin', 'school'] 
              },
              { 
                label: 'Integrity', 
                desc: 'Marker validation', 
                href: '/dashboard/progression/marker-integrity', 
                icon: TrophyIcon, 
                color: 'cyan',
                roles: ['admin', 'school'] 
              },
            ].filter(item => !item.roles || item.roles.includes(profile.role)).map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="group p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300"
              >
                <div className={`w-8 h-8 rounded-lg bg-${item.color}-500/10 flex items-center justify-center border border-${item.color}-500/20 mb-3 group-hover:scale-110 transition-transform`}>
                  <item.icon className={`w-4 h-4 text-${item.color}-400`} />
                </div>
                <h4 className="text-sm font-black text-foreground group-hover:text-violet-300 transition-colors">{item.label}</h4>
                <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{item.desc}</p>
              </Link>
            ))}
            
            <Link
              href="/dashboard/lesson-plans"
              className="lg:col-span-4 p-3 rounded-xl border border-dashed border-border hover:border-violet-500/50 hover:bg-violet-500/[0.02] transition-all flex items-center justify-center gap-3 group"
            >
              <div className="w-6 h-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <PlusIcon className="w-3 h-3 text-violet-400" />
              </div>
              <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground">Open Lesson Plan Generation Pipeline</span>
            </Link>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Program</label>
          <select
            value={filterProgram}
            onChange={e => { setFilterProg(e.target.value); setFilterCourse(''); }}
            className="w-full bg-background border border-border text-foreground px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:border-orange-500"
          >
            <option value="">— All Programs —</option>
            {programs.map(p => <option key={p.id} value={p.id}>{p.name || p.title}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Course / Level</label>
          <select
            value={filterCourse}
            onChange={e => setFilterCourse(e.target.value)}
            disabled={!filterProgram}
            className="w-full bg-background border border-border text-foreground px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:border-orange-500 disabled:opacity-40"
          >
            <option value="">— All Courses —</option>
            {availableCourses.map((c: any) => (
              <option key={c.id} value={c.id}>Level {c.level_order} — {c.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Term</label>
          <select
            value={filterTerm}
            onChange={e => setFilterTerm(e.target.value)}
            className="w-full bg-background border border-border text-foreground px-3 py-2.5 text-sm rounded-lg focus:outline-none focus:border-orange-500"
          >
            {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Summary bar */}
      {enrollments.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="font-bold text-foreground">{enrollments.length} students</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{decidedCount} decisions selected</span>
          {processedCount > 0 && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="text-emerald-400 font-bold">{processedCount} applied</span>
            </>
          )}
          {/* Per-decision breakdown */}
          {decisionCounts.length > 0 && (
            <>
              <span className="text-muted-foreground/50">·</span>
              {decisionCounts.map(({ d, count }) => (
                <span key={d} className={`px-2 py-0.5 border rounded text-[10px] font-black uppercase tracking-wider ${DECISION_META[d].cls}`}>
                  {count} {DECISION_META[d].label}
                </span>
              ))}
            </>
          )}
          {/* Quick-select all — admin/teacher only */}
          {canPromote && (
            <div className="ml-auto flex gap-2 flex-wrap">
              {(['promote', 'repeat', 'complete'] as PromotionDecision[]).map(d => (
                <button
                  key={d}
                  onClick={() => {
                    const all: Record<string, PromotionDecision> = {};
                    pending.forEach(e => { all[e.id] = d; });
                    setDecisions(all);
                  }}
                  className="px-2 py-1 text-[10px] font-black uppercase tracking-wider border border-border bg-muted/20 hover:bg-muted/50 text-muted-foreground transition-colors rounded"
                >
                  All → {d}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Student list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm animate-pulse">Loading enrollments…</div>
      ) : enrollments.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <UserGroupIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No active enrollments for this filter.</p>
          <p className="text-xs text-muted-foreground mt-1">Adjust the program, course, or term above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {enrollments.map(enrollment => {
            const student    = (enrollment as any).portal_users;
            const course     = (enrollment as any).courses;
            const isProcessed = submitted.includes(enrollment.id);
            const decision   = decisions[enrollment.id];

            return (
              <div
                key={enrollment.id}
                className={`bg-card border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-all ${
                  isProcessed ? 'border-emerald-500/20 opacity-60' : 'border-border'
                }`}
              >
                {/* Student info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-foreground text-sm truncate">
                      {student?.full_name ?? 'Unknown Student'}
                    </p>
                    {enrollment.start_week > 1 && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded">
                        Joined Week {enrollment.start_week}
                      </span>
                    )}
                    {isProcessed && (
                      <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border rounded ${DECISION_META[decisions[enrollment.id]]?.cls ?? ''}`}>
                        ✓ {DECISION_META[decisions[enrollment.id]]?.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Level {course?.level_order ?? '?'} — {course?.title ?? 'Unknown Course'}
                    {course?.programs?.delivery_type === 'optional' && (
                      <span className="ml-2 text-violet-400 font-bold">Elective</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Cohort {enrollment.cohort_year} · {enrollment.term_label}
                    {course?.next_course_id
                      ? ` → promotes to Level ${(course?.level_order ?? 0) + 1}`
                      : ' → end of track'}
                  </p>
                </div>

                {/* View report link + decision buttons */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {/* Report Card link */}
                  {canPromote && student?.id && (
                    <Link
                      href={`/dashboard/reports/builder?student_id=${student.id}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 border border-orange-500/30 bg-orange-500/10 text-orange-400 text-[10px] font-black uppercase tracking-wider hover:bg-orange-500/20 transition-colors rounded"
                    >
                      <DocumentChartBarIcon className="w-3 h-3" />
                      Report
                    </Link>
                  )}

                  {/* Decision buttons — admin/teacher only, not yet processed */}
                  {!isProcessed && canPromote && (
                    <div className="flex gap-1.5 flex-wrap">
                      {(['promote', 'repeat', 'complete', 'withdraw'] as PromotionDecision[]).map(d => {
                        const m    = DECISION_META[d];
                        const Icon = m.icon;
                        const active = decision === d;
                        if (d === 'complete' && course?.next_course_id) return null;
                        if (d === 'promote'  && !course?.next_course_id) return null;
                        return (
                          <button
                            key={d}
                            onClick={() => setDecisions(prev => ({ ...prev, [enrollment.id]: d }))}
                            className={`flex items-center gap-1 px-2.5 py-1.5 border text-[10px] font-black uppercase tracking-wider transition-all rounded ${
                              active ? m.cls + ' ring-1 ring-current' : 'border-border text-muted-foreground hover:bg-muted/30'
                            }`}
                          >
                            <Icon className="w-3 h-3" />
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-rose-500/5 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Submit sticky bar — admin/teacher only */}
      {canPromote && decidedCount > 0 && (
        <div className="sticky bottom-4">
          <button
            onClick={submitAll}
            disabled={submitting}
            className="w-full py-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-900/30 rounded-xl"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <SparklesIcon className="w-4 h-4" />
                Apply {decidedCount} Decision{decidedCount !== 1 ? 's' : ''} → {nextTerm(filterTerm)}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
