'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import {
  ArrowRightIcon, ArrowPathIcon, CheckCircleIcon,
  UserGroupIcon, ExclamationTriangleIcon,
  SparklesIcon, PresentationChartLineIcon, DocumentChartBarIcon, RocketLaunchIcon,
  EyeIcon, BookOpenIcon, TrophyIcon, PlusIcon,
  Cog6ToothIcon, BoltIcon, ShieldExclamationIcon,
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
  complete: { label: 'Complete', cls: 'bg-primary/10 text-primary border-primary/30',   icon: CheckCircleIcon },
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
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isStaff) return <div className="p-20 text-center text-muted-foreground font-bold uppercase tracking-widest">Unauthorized Terminal Access</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-12 pb-32">

      {/* Hero Governance Header */}
      <div className="relative overflow-hidden bg-card border border-border rounded-[3rem] p-10 sm:p-14 shadow-2xl">
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-primary/10 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-emerald-600/10 rounded-full blur-[120px] -ml-48 -mb-48 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 relative z-10">
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black uppercase tracking-[0.2em] text-primary">Academic Authority</span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{filterTerm} Cycle</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-card-foreground leading-tight">Progression Terminal</h1>
            <p className="text-lg text-muted-foreground leading-relaxed italic max-w-xl">
              Audit institutional performance, govern promotion cycles, and reconcile 
              student outcomes from the master progression cockpit.
            </p>
          </div>

          <div className="flex flex-col gap-3 shrink-0">
            <Link
              href="/dashboard/curriculum/progress"
              className="group flex items-center justify-between gap-6 px-8 py-4 bg-card/50 backdrop-blur-xl border border-border rounded-2xl hover:border-primary/50 transition-all shadow-xl"
            >
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Monitoring</p>
                <p className="text-xs font-black text-foreground uppercase tracking-widest group-hover:text-primary transition-colors">Delivery Progress</p>
              </div>
              <PresentationChartLineIcon className="w-5 h-5 text-primary" />
            </Link>
            {canPromote && (
              <Link
                href="/dashboard/reports/builder"
                className="group flex items-center justify-between gap-6 px-8 py-4 bg-card/50 backdrop-blur-xl border border-border rounded-2xl hover:border-amber-500/50 transition-all shadow-xl"
              >
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Certification</p>
                  <p className="text-xs font-black text-foreground uppercase tracking-widest group-hover:text-amber-400 transition-colors">Build Report Cards</p>
                </div>
                <DocumentChartBarIcon className="w-5 h-5 text-amber-400" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Governance Operations Grid */}
      {canPromote && (
        <div className="space-y-8">
          <div className="flex items-center gap-3 ml-4">
             <RocketLaunchIcon className="w-5 h-5 text-primary" />
             <h2 className="text-xl font-black uppercase tracking-widest text-foreground">Operational Controllers</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Academic Rules', desc: 'Syllabus standards & Promotion logic.', href: '/dashboard/progression/policies', icon: Cog6ToothIcon, color: 'violet' },
              { label: 'System Vitals', desc: 'Calendar status & Weekly commands.', href: '/dashboard/progression/operations', icon: BoltIcon, color: 'blue' },
              { label: 'Asset Vault', desc: 'Creative resources & Syllabus engine.', href: '/dashboard/progression/project-registry', icon: BookOpenIcon, color: 'orange' },
              { label: 'Safety Lab', desc: 'Audit logs & Forensic reporting.', href: '/dashboard/progression/analytics', icon: ShieldExclamationIcon, color: 'rose' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group relative flex flex-col p-8 rounded-[2.5rem] border border-border bg-card hover:border-primary/50 transition-all duration-500 shadow-xl hover:shadow-primary/5 hover:-translate-y-2 overflow-hidden"
                >
                  <div className={`absolute top-0 right-0 w-24 h-24 bg-${item.color}-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-${item.color}-500/10 transition-all`} />
                  <div className={`w-14 h-14 rounded-2xl border border-${item.color}-500/20 bg-${item.color}-500/5 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-${item.color}-500/20 transition-all shadow-lg`}>
                    <Icon className={`w-6 h-6 text-${item.color}-400`} />
                  </div>
                  <div className="flex-1 space-y-3">
                    <p className="text-lg font-black text-foreground group-hover:text-primary transition-colors tracking-tight">{item.label}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed italic">{item.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>

          <Link
            href="/dashboard/progression/settings"
            className="flex items-center justify-center gap-4 p-8 rounded-[2.5rem] border border-dashed border-border bg-muted/5 hover:border-primary/50 hover:bg-primary/[0.02] transition-all group shadow-inner"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:scale-110 transition-all">
              <SparklesIcon className="w-6 h-6 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-black text-foreground group-hover:text-primary transition-colors uppercase tracking-widest">Global Governance Settings</p>
              <p className="text-xs text-muted-foreground font-bold">Access advanced platform-wide configuration and institutional overrides.</p>
            </div>
          </Link>
        </div>
      )}

      {/* Promotion Cycle Manager */}
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
           <div className="space-y-2">
             <div className="flex items-center gap-3">
               <UserGroupIcon className="w-5 h-5 text-emerald-400" />
               <h2 className="text-xl font-black uppercase tracking-widest text-foreground">Cycle Management</h2>
             </div>
             <p className="text-sm text-muted-foreground italic">Execute end-of-term promotion decisions for current enrollments.</p>
           </div>

           {/* Quick Action Filters */}
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-card/50 backdrop-blur-xl border border-border p-3 rounded-[2rem] shadow-xl">
              <select title="Program" value={filterProgram} onChange={e => { setFilterProg(e.target.value); setFilterCourse(''); }} className="bg-background/50 border border-border px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl focus:border-primary outline-none transition-all">
                <option value="">All Programs</option>
                {programs.map(p => <option key={p.id} value={p.id}>{p.name || p.title}</option>)}
              </select>
              <select title="Level" value={filterCourse} onChange={e => setFilterCourse(e.target.value)} disabled={!filterProgram} className="bg-background/50 border border-border px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl focus:border-primary outline-none transition-all disabled:opacity-30">
                <option value="">All Levels</option>
                {availableCourses.map((c: any) => (
                  <option key={c.id} value={c.id}>Level {c.level_order}</option>
                ))}
              </select>
              <select title="Cycle" value={filterTerm} onChange={e => setFilterTerm(e.target.value)} className="bg-background/50 border border-border px-4 py-3 text-[10px] font-black uppercase tracking-widest rounded-2xl focus:border-primary outline-none transition-all">
                {TERM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
           </div>
        </div>

        {/* Summary Indicators */}
        {enrollments.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4">
            <div className="bg-card border border-border p-6 rounded-[2rem] shadow-lg">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Scope</p>
              <p className="text-3xl font-black text-foreground tracking-tighter">{enrollments.length}</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-1">Students Loaded</p>
            </div>
            <div className="bg-card border border-border p-6 rounded-[2rem] shadow-lg">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Pending Sync</p>
              <p className="text-3xl font-black text-primary tracking-tighter">{decidedCount}</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-1">Decisions Buffered</p>
            </div>
            <div className="md:col-span-2 bg-card border border-border p-6 rounded-[2rem] shadow-lg flex items-center justify-between gap-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Bulk Commands</p>
                <div className="flex gap-2">
                  {(['promote', 'repeat', 'complete'] as PromotionDecision[]).map(d => (
                    <button
                      key={d}
                      onClick={() => {
                        const all: Record<string, PromotionDecision> = {};
                        pending.forEach(e => { all[e.id] = d; });
                        setDecisions(all);
                      }}
                      className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest border border-border hover:border-primary hover:text-primary transition-all rounded-xl"
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {decisionCounts.map(({ d, count }) => (
                  <span key={d} className={`w-8 h-8 rounded-full border flex items-center justify-center text-[10px] font-black ${DECISION_META[d].cls}`} title={`${count} ${d}`}>
                    {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Enrollment Grid */}
        {loading ? (
          <div className="py-40 text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Scanning Institutional Records...</p>
          </div>
        ) : enrollments.length === 0 ? (
          <div className="py-32 text-center bg-card border border-dashed border-border rounded-[3rem] mx-4 space-y-6">
             <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto border border-border">
               <UserGroupIcon className="w-10 h-10 text-muted-foreground/30" />
             </div>
             <div className="space-y-1">
               <p className="text-lg font-black text-foreground uppercase tracking-widest">No Records Found</p>
               <p className="text-sm text-muted-foreground italic">Institutional audit complete. No active enrollments in this scope.</p>
             </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-4">
            {enrollments.map(enrollment => {
              const student    = (enrollment as any).portal_users;
              const course     = (enrollment as any).courses;
              const isProcessed = submitted.includes(enrollment.id);
              const decision   = decisions[enrollment.id];

              return (
                <div
                  key={enrollment.id}
                  className={`group relative bg-card border rounded-[2.5rem] p-8 transition-all duration-500 shadow-xl overflow-hidden ${
                    isProcessed ? 'border-emerald-500/20 opacity-60 grayscale' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex flex-col gap-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                         <div className="flex items-center gap-3">
                           <h3 className="text-xl font-black text-foreground tracking-tight group-hover:text-primary transition-colors">{student?.full_name ?? 'Anonymous Student'}</h3>
                           {enrollment.start_week > 1 && (
                             <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-[9px] font-black uppercase tracking-widest text-amber-400 border border-amber-500/20">Mid-Term Join</span>
                           )}
                         </div>
                         <div className="flex items-center gap-3">
                           <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Level {course?.level_order ?? '?'}</span>
                           <span className="text-muted-foreground/30 text-[10px]">•</span>
                           <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest truncate max-w-[150px]">{course?.title ?? 'Unknown Unit'}</span>
                         </div>
                      </div>
                      
                      {decision && (
                        <div className={`px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest shadow-lg ${DECISION_META[decision].cls}`}>
                          {DECISION_META[decision].label}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-border mt-auto">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Outcome Prediction</p>
                        <p className="text-[10px] font-bold text-foreground">
                          {course?.next_course_id ? `Promotes to L${(course?.level_order ?? 0) + 1}` : 'Curriculum Capstone reached'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {canPromote && student?.id && (
                          <Link
                            href={`/dashboard/reports/builder?student_id=${student.id}`}
                            className="p-3 rounded-xl border border-border bg-background hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all shadow-sm"
                            title="Audit Performance"
                          >
                            <DocumentChartBarIcon className="w-4 h-4" />
                          </Link>
                        )}
                        {!isProcessed && canPromote && (
                          <div className="flex gap-1.5 ml-2">
                            {(['promote', 'repeat', 'withdraw'] as PromotionDecision[]).map(d => {
                              const m = DECISION_META[d];
                              const Icon = m.icon;
                              const active = decision === d;
                              if (d === 'promote' && !course?.next_course_id) return null;
                              return (
                                <button
                                  key={d}
                                  onClick={() => setDecisions(prev => ({ ...prev, [enrollment.id]: d }))}
                                  className={`p-3 rounded-xl border transition-all shadow-sm ${
                                    active ? m.cls + ' ring-2 ring-current' : 'border-border text-muted-foreground hover:bg-muted/30'
                                  }`}
                                  title={m.label}
                                >
                                  <Icon className="w-4 h-4" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Error Audit Report */}
      {error && (
        <div className="mx-4 flex items-start gap-4 px-6 py-4 bg-rose-500/5 border border-rose-500/20 rounded-[2rem] text-rose-400 text-sm shadow-xl">
          <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-black uppercase tracking-widest text-xs">Sync Integrity Warning</p>
            <p className="text-xs italic">{error}</p>
          </div>
        </div>
      )}

      {/* Executive Command Bar */}
      {canPromote && decidedCount > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 z-50 animate-in fade-in slide-in-from-bottom-10 duration-700">
          <button
            onClick={submitAll}
            disabled={submitting}
            className="w-full py-6 bg-primary hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(124,58,237,0.4)] transition-all flex items-center justify-center gap-4 group overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            
            {submitting ? (
              <>
                <div className="w-5 h-5 border-3 border-white/60 border-t-white rounded-full animate-spin" />
                <span className="font-black uppercase tracking-[0.2em] text-xs">Executing Decisions...</span>
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                <span className="font-black uppercase tracking-[0.2em] text-xs">Commit {decidedCount} Outcome{decidedCount !== 1 ? 's' : ''} to {nextTerm(filterTerm)}</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
