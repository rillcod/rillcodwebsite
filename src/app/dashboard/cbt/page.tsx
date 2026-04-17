// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  AcademicCapIcon, PlusIcon, ClockIcon, CheckCircleIcon,
  ExclamationTriangleIcon, EyeIcon, TrashIcon, PlayIcon,
  MagnifyingGlassIcon, DocumentCheckIcon, ChartBarIcon, PencilIcon,
  BookOpenIcon
} from '@/lib/icons';

export default function CBTPage() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'examination' | 'evaluation'>('all');

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  useEffect(() => {
    if (authLoading || profileLoading || !profile) return;
    setLoading(true);
    if (isStaff) {
      fetch('/api/cbt/exams', { cache: 'no-store' })
        .then(r => r.json())
        .then(json => { setExams(json.data ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    } else {
      Promise.all([
        fetch('/api/cbt/exams', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/cbt/sessions', { cache: 'no-store' }).then(r => r.json()),
      ]).then(([exmJson, sesJson]) => {
        setExams(exmJson.data ?? []);
        setSessions(sesJson.data ?? []);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [profile?.id, authLoading, profileLoading]); // eslint-disable-line

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete exam "${title}"? All sessions and questions will also be deleted.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/cbt/exams/${id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json(); alert(j.error || 'Delete failed'); }
    else { setExams(prev => prev.filter(e => e.id !== id)); }
    setDeleting(null);
  };

  const getExamType = (e: any) => e.metadata?.exam_type ?? 'examination';

  const filtered = exams.filter(e => {
    const matchesSearch = (e.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (e.programs?.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || getExamType(e) === typeFilter;
    return matchesSearch && matchesType;
  });

  const getStudentSession = (examId: string) => sessions.find(s => s.exam_id === examId);

  // ── LOADING ──────────────────────────────────────────────────
  if (authLoading || profileLoading || loading) return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero skeleton */}
        <div className="relative overflow-hidden bg-card border border-border p-6 sm:p-8 animate-pulse">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 bg-orange-600/30" />
              <div className="space-y-2 pt-1">
                <div className="h-9 bg-muted w-64" />
                <div className="h-3 bg-muted w-40" />
                <div className="h-4 bg-muted w-52 mt-2" />
              </div>
            </div>
            <div className="hidden sm:flex gap-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="w-24 h-16 bg-muted" />)}
            </div>
          </div>
        </div>
        {/* Search skeleton */}
        <div className="h-12 bg-card border border-border animate-pulse max-w-md" />
        {/* Cards skeleton */}
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="relative bg-card border border-border overflow-hidden animate-pulse">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-600/30" />
              <div className="pl-7 pr-6 py-5 space-y-3">
                <div className="h-5 bg-muted w-1/2" />
                <div className="h-4 bg-muted w-1/3" />
                <div className="h-3 bg-muted w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── EXAM HUB TAB BAR ── */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit">
          <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-black">
            <AcademicCapIcon className="w-4 h-4" /> CBT Exams
          </span>
          <Link href="/dashboard/exams"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <DocumentCheckIcon className="w-4 h-4" /> Written Exams
          </Link>
        </div>

        {/* ── HERO HEADER ── */}
        <div className="relative overflow-hidden bg-card border border-border p-6 sm:p-8">
          {/* Ambient glow */}
          <div className="absolute -right-32 -top-32 w-96 h-96 bg-orange-500/5 rounded-full blur-[120px] pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row items-start justify-between gap-6">
            {/* Left: icon + title */}
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 bg-orange-600 flex items-center justify-center shadow-2xl shadow-orange-900/40 border border-orange-400/30 flex-shrink-0">
                <AcademicCapIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black italic uppercase tracking-tighter text-foreground leading-none">
                  CBT Section
                </h1>
                <p className="text-[9px] font-black uppercase tracking-[0.4em] text-orange-400 mt-1">
                  Examinations &amp; Evaluations
                </p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {isStaff ? 'Create and manage exams and quizzes' : 'View and take your scheduled exams'}
                </p>
              </div>
            </div>

            {/* Right: stats + create button (staff only) */}
            {isStaff && (
              <div className="flex flex-col items-end gap-3 flex-shrink-0 w-full sm:w-auto">
                <div className="flex gap-px border border-border w-full sm:w-auto overflow-x-auto">
                  {[
                    { label: 'Total Exams', value: exams.length, color: 'text-orange-400' },
                    { label: 'Active', value: exams.filter(e => e.is_active).length, color: 'text-emerald-400' },
                    { label: 'Sessions', value: exams.reduce((s, e) => s + (e.cbt_sessions?.length ?? 0), 0), color: 'text-blue-400' },
                    { label: 'Programmes', value: new Set(exams.map(e => e.program_id)).size, color: 'text-amber-400' },
                  ].map((stat, idx) => (
                    <div key={stat.label} className={`bg-background px-5 py-3 text-center min-w-[72px] ${idx > 0 ? 'border-l border-border' : ''}`}>
                      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">{stat.label}</p>
                      <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                <Link
                  href="/dashboard/cbt/new"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-black text-[10px] uppercase tracking-widest px-5 py-3 min-h-[44px] sm:min-h-0 sm:py-2.5 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" /> Create Exam
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── TYPE FILTER TABS ── */}
        <div className="flex gap-px border border-border bg-card w-full sm:w-fit overflow-x-auto">
          {([
            { key: 'all', label: 'All', count: exams.length },
            { key: 'examination', label: 'Examination', count: exams.filter(e => getExamType(e) === 'examination').length },
            { key: 'evaluation', label: 'Evaluation', count: exams.filter(e => getExamType(e) === 'evaluation').length },
          ] as const).map((tab, idx) => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              className={`flex items-center justify-center gap-2 px-5 py-3 min-h-[44px] sm:min-h-0 sm:py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors flex-1 sm:flex-none ${idx > 0 ? 'border-l border-border' : ''} ${
                typeFilter === tab.key
                  ? 'bg-orange-600 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              {tab.label}
              <span className={`text-[9px] px-1.5 py-0.5 font-black ${typeFilter === tab.key ? 'bg-white/20' : 'bg-muted'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── SEARCH BAR ── */}
        <div className="relative max-w-md">
          <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search exams or programmes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500/50 transition-colors"
          />
        </div>

        {/* ── EXAM LIST ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 bg-card border border-border">
            <AcademicCapIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-black italic uppercase tracking-tighter text-muted-foreground">No Exams Found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isStaff ? 'Get started by creating your first exam.' : 'No exams have been scheduled yet.'}
            </p>
            {isStaff && (
              <Link
                href="/dashboard/cbt/new"
                className="inline-flex items-center gap-2 mt-6 bg-orange-600 hover:bg-orange-500 text-white font-black text-[10px] uppercase tracking-widest px-5 py-2.5 transition-colors"
              >
                <PlusIcon className="w-4 h-4" /> Create First Exam
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((exam: any) => {
              const examSessions = exam.cbt_sessions ?? [];
              const passed = examSessions.filter((s: any) => s.status === 'passed').length;
              const studentSession = !isStaff ? getStudentSession(exam.id) : null;
              const now = new Date();
              const started = exam.start_date ? new Date(exam.start_date) <= now : true;
              const ended = exam.end_date ? new Date(exam.end_date) < now : false;
              const available = started && !ended && exam.is_active;

              return (
                <div
                  key={exam.id}
                  className="group relative bg-card border border-border hover:border-orange-500/20 transition-all overflow-hidden"
                >
                  {/* Left accent bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${exam.is_active ? 'bg-orange-600' : 'bg-muted'}`} />

                  <div className="pl-7 pr-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      {/* Left content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-black text-foreground text-base">{exam.title}</h3>
                          <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase border ${exam.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                            {exam.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase border ${getExamType(exam) === 'evaluation' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'bg-orange-500/20 text-orange-400 border-orange-500/30'}`}>
                            {getExamType(exam) === 'evaluation' ? 'Evaluation' : 'Examination'}
                          </span>
                          {!isStaff && studentSession && (
                            <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase border ${
                              studentSession.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                              studentSession.status === 'failed' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
                              studentSession.status === 'pending_grading' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                              'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            }`}>
                              {studentSession.status === 'passed' ? `Passed · ${studentSession.score}%` :
                               studentSession.status === 'failed' ? `Failed · ${studentSession.score}%` :
                               studentSession.status === 'pending_grading' ? 'Pending Review' :
                               'Submitted'}
                            </span>
                          )}
                        </div>

                        {exam.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 mb-2">{exam.description}</p>
                        )}

                        {/* Meta chips */}
                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
                          {(exam.courses?.title || exam.programs?.name) && (
                            <span className="flex items-center gap-1 text-[11px] text-blue-400 font-bold">
                              <BookOpenIcon className="w-3.5 h-3.5" />
                              {exam.courses?.title ?? exam.programs?.name}
                            </span>
                          )}
                          {exam.duration_minutes && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <ClockIcon className="w-3.5 h-3.5" />
                              {exam.duration_minutes} min
                            </span>
                          )}
                          {exam.total_questions && (
                            <span className="text-[11px] text-muted-foreground">{exam.total_questions} questions</span>
                          )}
                          {exam.passing_score && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <CheckCircleIcon className="w-3.5 h-3.5" />
                              Pass: {exam.passing_score}%
                            </span>
                          )}
                          {exam.start_date && (
                            <span className="text-[11px] text-muted-foreground">
                              Starts {new Date(exam.start_date).toLocaleDateString()}
                            </span>
                          )}
                          {exam.end_date && (
                            <span className="text-[11px] text-muted-foreground">
                              Ends {new Date(exam.end_date).toLocaleDateString()}
                            </span>
                          )}
                          {isStaff && (
                            <span className="text-[11px] text-blue-400">
                              {examSessions.length} attempts · {passed} passed
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isStaff ? (
                          <>
                            <Link
                              href={`/dashboard/cbt/${exam.id}`}
                              className="p-3 min-h-[44px] min-w-[44px] sm:p-2.5 sm:min-h-0 sm:min-w-0 flex items-center justify-center text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                              title="View"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </Link>
                            <Link
                              href={`/dashboard/cbt/${exam.id}/edit`}
                              className="p-3 min-h-[44px] min-w-[44px] sm:p-2.5 sm:min-h-0 sm:min-w-0 flex items-center justify-center text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                              title="Edit"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => handleDelete(exam.id, exam.title)}
                              disabled={deleting === exam.id}
                              className="p-3 min-h-[44px] min-w-[44px] sm:p-2.5 sm:min-h-0 sm:min-w-0 flex items-center justify-center text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors disabled:opacity-40"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          studentSession ? (
                            <Link
                              href={`/dashboard/cbt/${exam.id}`}
                              className="flex items-center justify-center gap-2 bg-card hover:bg-muted text-muted-foreground font-black text-[10px] uppercase tracking-widest px-5 py-3 min-h-[44px] sm:py-2.5 sm:min-h-0 border border-border transition-colors"
                            >
                              <EyeIcon className="w-4 h-4" /> View Results
                            </Link>
                          ) : available ? (
                            <Link
                              href={`/dashboard/cbt/${exam.id}/take`}
                              className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 text-white font-black text-[10px] uppercase tracking-widest px-5 py-3 min-h-[44px] sm:py-2.5 sm:min-h-0 transition-colors"
                            >
                              <PlayIcon className="w-4 h-4" /> Start Exam
                            </Link>
                          ) : (
                            <span className="flex items-center justify-center gap-2 text-muted-foreground font-black text-[10px] uppercase tracking-widest px-5 py-3 min-h-[44px] sm:py-2.5 sm:min-h-0 border border-border bg-card">
                              <ExclamationTriangleIcon className="w-4 h-4" />
                              {ended ? 'Expired' : 'Not Available'}
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Student score bar */}
                    {!isStaff && studentSession?.score != null && (
                      <div className="border-t border-border mt-4 pt-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground">Your Score</span>
                          <span className="text-[11px] text-muted-foreground">
                            {studentSession.score}% / {exam.passing_score}% to pass
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-muted">
                          <div
                            className={`h-1.5 transition-all ${studentSession.score >= (exam.passing_score ?? 70) ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            style={{ width: `${Math.min(studentSession.score, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
