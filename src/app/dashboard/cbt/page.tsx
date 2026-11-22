// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  AcademicCapIcon, PlusIcon, ClockIcon, CheckCircleIcon,
  ExclamationTriangleIcon, EyeIcon, TrashIcon, PlayIcon,
  MagnifyingGlassIcon, DocumentCheckIcon, ChartBarIcon, PencilIcon,
  BookOpenIcon, CommandLineIcon, ClipboardDocumentListIcon, RocketLaunchIcon, PrinterIcon,
} from '@/lib/icons';
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';
import MobileScrollStrip from '@/components/mobile/MobileScrollStrip';

export default function CBTPage() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'examination' | 'evaluation'>('all');

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
  const canManageExams = profile?.role === 'admin' || profile?.role === 'teacher';

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
    <div className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero skeleton */}
        <div className="relative overflow-hidden bg-card border border-border p-6 sm:p-8 animate-pulse">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 bg-primary/30" />
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
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/30" />
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
    <div className={`min-h-screen bg-background text-foreground ${MOBILE_PAGE_BOTTOM}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── ASSESSMENT & EXAM HUB TAB BAR ── */}
        <div className="flex flex-wrap items-center gap-1 bg-card border border-border rounded-xl p-1 w-full sm:w-fit">
          <Link href="/dashboard/assignments"
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs sm:text-sm font-bold transition-all">
            <ClipboardDocumentListIcon className="w-4 h-4" /> Assignments
          </Link>
          <Link href="/dashboard/projects"
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs sm:text-sm font-bold transition-all">
            <RocketLaunchIcon className="w-4 h-4" /> Projects
          </Link>
          <span className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-primary text-white text-xs sm:text-sm font-black">
            <CommandLineIcon className="w-4 h-4" /> CBT Exams
          </span>
          <Link href="/dashboard/exams"
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-xs sm:text-sm font-bold transition-all">
            <DocumentCheckIcon className="w-4 h-4" /> Written Exams
          </Link>
          {isStaff && (
            <>
              <Link href="/dashboard/grades"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-primary hover:bg-primary/10 text-xs sm:text-sm font-black transition-all">
                <AcademicCapIcon className="w-4 h-4" /> Mark Work &amp; Gradebook
              </Link>
              <Link href="/dashboard/reports/builder"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 text-xs sm:text-sm font-black transition-all">
                <ChartBarIcon className="w-4 h-4" /> Result Builder
              </Link>
            </>
          )}
        </div>

        {/* ── HERO HEADER ── */}
        <div className="relative overflow-hidden border border-border/80 bg-card/90 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-xl">
          {/* Ambient glow */}
          <div className="absolute -right-32 -top-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row items-start justify-between gap-6">
            {/* Left: icon + title */}
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-xl shadow-primary/30 border border-primary/30 flex-shrink-0">
                <AcademicCapIcon className="w-7 h-7 text-white" />
              </div>
              <div>
                <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm mb-2">
                  Examinations &amp; Evaluations
                </span>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black uppercase tracking-tight text-foreground leading-none">
                  CBT Section
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5 font-medium">
                  {isStaff ? 'Create and manage exams and quizzes' : 'View and take your scheduled exams'}
                </p>
              </div>
            </div>

            {/* Right: stats + create button (staff only) */}
            {isStaff && (
              <div className="flex flex-col items-end gap-3 flex-shrink-0 w-full sm:w-auto">
                <div className="grid grid-cols-2 sm:flex border border-border rounded-2xl overflow-hidden bg-background/80 w-full sm:w-auto">
                  {[
                    { label: 'Total Exams', value: exams.length, color: 'text-primary' },
                    { label: 'Active', value: exams.filter(e => e.is_active).length, color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Sessions', value: exams.reduce((s, e) => s + (e.cbt_sessions?.length ?? 0), 0), color: 'text-primary' },
                    { label: 'Programmes', value: new Set(exams.map(e => e.program_id)).size, color: 'text-amber-600 dark:text-amber-400' },
                  ].map((stat, idx) => (
                    <div key={stat.label} className={`px-4 sm:px-5 py-3 text-center min-w-[78px] ${idx > 0 ? 'sm:border-l border-border' : ''} ${idx >= 2 ? 'border-t sm:border-t-0 border-border' : ''} ${idx % 2 === 1 ? 'border-l sm:border-l border-border' : ''}`}>
                      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-0.5">{stat.label}</p>
                      <p className={`text-xl sm:text-2xl font-black ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                {canManageExams && (
                  <Link
                    href="/dashboard/cbt/new"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider px-5 py-3 min-h-[44px] sm:min-h-0 sm:py-2.5 shadow-md transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" /> Create Exam
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── TYPE FILTER TABS ── */}
        <MobileScrollStrip
          label="Exam type"
          ariaLabel="Filter exams by type"
          items={([
            { key: 'all', label: 'All', count: exams.length },
            { key: 'examination', label: 'Examination', count: exams.filter(e => getExamType(e) === 'examination').length },
            { key: 'evaluation', label: 'Evaluation', count: exams.filter(e => getExamType(e) === 'evaluation').length },
          ] as const).map((tab) => ({
            id: tab.key,
            label: tab.label,
            hint: String(tab.count),
            selected: typeFilter === tab.key,
            onClick: () => setTypeFilter(tab.key),
          }))}
        />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="hidden md:inline-flex items-center gap-1 rounded-2xl border border-border bg-card p-1 shadow-sm">
            {([
              { key: 'all', label: 'All', count: exams.length },
              { key: 'examination', label: 'Examination', count: exams.filter(e => getExamType(e) === 'examination').length },
              { key: 'evaluation', label: 'Evaluation', count: exams.filter(e => getExamType(e) === 'evaluation').length },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTypeFilter(tab.key)}
                className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
                  typeFilter === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                }`}
              >
                {tab.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${typeFilter === tab.key ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-foreground'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* ── SEARCH BAR ── */}
          <div className="relative w-full sm:max-w-md">
            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input aria-label="Search exams or programmes"
              type="text"
              placeholder="Search exams or programmes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl pl-10 pr-4 py-2.5 bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-colors shadow-sm"
            />
          </div>
        </div>

        {/* ── EXAM LIST ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 px-4 rounded-3xl bg-card border border-dashed border-border shadow-sm">
            <AcademicCapIcon className="w-14 h-14 mx-auto text-muted-foreground/70 mb-4" />
            <p className="text-lg font-black uppercase tracking-tight text-foreground">No Exams Found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isStaff ? 'Get started by creating your first exam.' : 'No exams have been scheduled yet.'}
            </p>
            {canManageExams && (
              <Link
                href="/dashboard/cbt/new"
                className="inline-flex items-center gap-2 mt-6 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider px-5 py-2.5 shadow-sm transition-colors"
              >
                <PlusIcon className="w-4 h-4" /> Create First Exam
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((exam: any) => {
              const examSessions = exam.cbt_sessions ?? [];
              const passed = examSessions.filter((s: any) => s.status === 'passed').length;
              const pendingGrading = examSessions.filter((s: any) => s.status === 'pending_grading').length;
              const studentSession = !isStaff ? getStudentSession(exam.id) : null;
              const now = new Date();
              const started = exam.start_date ? new Date(exam.start_date) <= now : true;
              const ended = exam.end_date ? new Date(exam.end_date) < now : false;
              const available = started && !ended && exam.is_active;

              return (
                <div
                  key={exam.id}
                  className="group relative rounded-2xl bg-card border border-border hover:border-primary/35 transition-all overflow-hidden shadow-sm hover:shadow-md"
                >
                  {/* Left accent bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${exam.is_active ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-muted-foreground/30'}`} />

                  <div className="p-4 pl-5 sm:pl-6 sm:pr-6 sm:py-5">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 sm:gap-4">
                      {/* Left content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1.5">
                          <h3 className="font-black text-foreground text-base leading-snug">{exam.title}</h3>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${exam.is_active ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                            {exam.is_active ? 'Active' : 'Draft'}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${getExamType(exam) === 'evaluation' ? 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30' : 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 border-indigo-500/30'}`}>
                            {getExamType(exam) === 'evaluation' ? 'Evaluation' : 'Examination'}
                          </span>
                          {isStaff && exam.metadata?.result_eligible === false && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300">
                              Practice only
                            </span>
                          )}
                          {isStaff && exam.metadata?.result_eligible !== false && !exam.class_id && (
                            <Link
                              href={`/dashboard/cbt/${exam.id}/edit`}
                              className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border border-amber-500/40 bg-amber-500/15 text-amber-900 hover:bg-amber-500/25 dark:text-amber-200 transition-colors"
                              title="Choose whether this belongs to class results or practice"
                            >
                              Resolve result use
                            </Link>
                          )}
                          {isStaff && exam.metadata?.result_eligible !== false && exam.class_id && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                              Class result
                            </span>
                          )}
                          {!isStaff && studentSession && (
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                              studentSession.status === 'in_progress' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35' :
                              studentSession.status === 'passed' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
                              studentSession.status === 'failed' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30' :
                              studentSession.status === 'pending_grading' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30' :
                              'bg-primary/20 text-primary border-primary/30'
                            }`}>
                              {studentSession.status === 'in_progress' ? 'In Progress' :
                               studentSession.status === 'passed' ? `Passed · ${studentSession.score}%` :
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
                            <span className="flex items-center gap-1 text-[11px] text-primary font-bold">
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
                            <span className="text-[11px] text-primary">
                              {examSessions.length} attempts · {passed} passed
                              {pendingGrading > 0 ? ` · ${pendingGrading} awaiting review` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: actions */}
                      <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                        {isStaff ? (
                          <>
                            <Link
                              href={`/dashboard/cbt/${exam.id}`}
                              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-primary bg-primary/10 hover:bg-primary/20 border border-primary/25 transition-colors"
                              title="Open exam questions and student sessions"
                            >
                              <EyeIcon className="w-4 h-4" />
                              <span>{pendingGrading > 0 ? `Grade (${pendingGrading})` : 'Manage & Results'}</span>
                            </Link>
                            {exam.class_id && (
                              <>
                                <Link
                                  href={`/dashboard/classes/${exam.class_id}?operation=assessment`}
                                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-foreground bg-muted/50 hover:bg-muted border border-border transition-colors"
                                  title="Open linked class workspace"
                                >
                                  <span>Class</span>
                                </Link>
                                <Link
                                  href={`/dashboard/reports/builder?class_id=${exam.class_id}${exam.course_id ? `&course_id=${exam.course_id}` : ''}${exam.school_id ? `&school_id=${exam.school_id}` : ''}`}
                                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-colors"
                                  title="Open Result Builder for this class"
                                >
                                  <span>Result Builder</span>
                                </Link>
                              </>
                            )}
                            <Link
                              href={`/dashboard/cbt/${exam.id}?print=1`}
                              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-foreground bg-muted/50 hover:bg-muted border border-border transition-colors"
                              title="Print Student Paper or Teacher Answer Key"
                            >
                              <PrinterIcon className="w-4 h-4 text-primary" />
                              <span>Print</span>
                            </Link>
                            {canManageExams && (
                              <>
                                <Link
                                  href={`/dashboard/cbt/${exam.id}/edit`}
                                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-colors"
                                  title="Edit exam settings and questions"
                                >
                                  <PencilIcon className="w-4 h-4" />
                                  <span className="hidden sm:inline">Edit</span>
                                </Link>
                                <button
                                  onClick={() => handleDelete(exam.id, exam.title)}
                                  disabled={deleting === exam.id}
                                  aria-label={`Delete exam ${exam.title}`}
                                  className="rounded-xl p-2 text-rose-700 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 transition-colors disabled:opacity-40"
                                  title="Delete"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          studentSession && studentSession.status === 'in_progress' ? (
                            <Link
                              href={`/dashboard/cbt/${exam.id}/take`}
                              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider px-5 py-3 min-h-[44px] sm:py-2.5 sm:min-h-0 shadow-sm transition-colors"
                            >
                              <PlayIcon className="w-4 h-4" /> Resume Exam
                            </Link>
                          ) : studentSession ? (
                            <Link
                              href={`/dashboard/cbt/${exam.id}`}
                              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-card hover:bg-muted text-foreground font-black text-xs uppercase tracking-wider px-5 py-3 min-h-[44px] sm:py-2.5 sm:min-h-0 border border-border transition-colors"
                            >
                              <EyeIcon className="w-4 h-4" /> View Results
                            </Link>
                          ) : available ? (
                            <Link
                              href={`/dashboard/cbt/${exam.id}/take`}
                              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider px-5 py-3 min-h-[44px] sm:py-2.5 sm:min-h-0 shadow-sm transition-colors"
                            >
                              <PlayIcon className="w-4 h-4" /> Start Exam
                            </Link>
                          ) : (
                            <span className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl text-muted-foreground font-black text-xs uppercase tracking-wider px-5 py-3 min-h-[44px] sm:py-2.5 sm:min-h-0 border border-border bg-muted/40">
                              <ExclamationTriangleIcon className="w-4 h-4" />
                              {ended ? 'Expired' : 'Scheduled'}
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
                        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${studentSession.score >= (exam.passing_score ?? 70) ? 'bg-emerald-600' : 'bg-rose-600'}`}
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
