// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowLeftIcon, AcademicCapIcon, ClockIcon, CheckCircleIcon,
  XCircleIcon, UserGroupIcon, ChartBarIcon, PencilIcon, PrinterIcon,
  CheckIcon, XMarkIcon, TrashIcon, ChevronDownIcon, LockOpenIcon, LockClosedIcon,
} from '@/lib/icons';
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';
import {
  isObjectiveQuestion,
  isTheoryQuestion,
  buildCbtPrintHtml,
  openCbtPrintWindow,
} from '@/lib/cbt/print-utils';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import { cbtAnswerMatchesOption, isCbtAnswerCorrect, isManualCbtQuestion } from '@/lib/cbt/grading';
import { isPaperCaptureAnswers } from '@/lib/cbt/paper-capture';
import {
  formatHostMark,
  hostAssessmentKindFromExam,
  hostMaxFromExam,
  hostPaperLabel,
  markFromPercent,
  parsePaperMarkAnswers,
} from '@/lib/academic/host-marks';
import { hostPaperDatasheetHref } from '@/lib/curriculum/href';

export default function ExamDetailPage() {
  const params = useParams() as { id?: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const classId = searchParams?.get('class_id');
  const { profile, loading: authLoading } = useAuth();
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [roster, setRoster] = useState<Array<{ id: string; full_name: string | null; email?: string | null }>>([]);
  const [hallDraft, setHallDraft] = useState<Record<string, string>>({});
  const [paperOutOf, setPaperOutOf] = useState('');
  const [savingHall, setSavingHall] = useState(false);
  const [hallError, setHallError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deletingExam, setDeletingExam] = useState(false);
  const [printFilter, setPrintFilter] = useState<'all' | 'mcq' | 'theory'>('all');
  const [printMcqCount, setPrintMcqCount] = useState<string>('');      // '' = all
  const [printTheoryCount, setPrintTheoryCount] = useState<string>(''); // '' = all
  const [printDuration, setPrintDuration] = useState<string>('');       // '' = use exam default
  const [printPassMark, setPrintPassMark] = useState<string>('');       // '' = use exam default
  const printMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchParams?.get('print') === '1') {
      setPrintMenuOpen(true);
    }
  }, [searchParams]);

  const role = profile?.role ?? '';
  const isStaff = role === 'admin' || role === 'teacher' || role === 'school';
  const canManageExam = role === 'admin' || role === 'teacher';

  useEffect(() => {
    if (!exam) return;
    const kind = hostAssessmentKindFromExam(exam);
    const meta = exam.metadata && typeof exam.metadata === 'object' ? exam.metadata : {};
    const paperClass = exam.class_id || meta.target_class_id || classId;
    if (kind && paperClass) {
      router.replace(hostPaperDatasheetHref({
        kind,
        classId: String(paperClass),
        courseId: exam.course_id,
      }));
    }
  }, [exam, classId, router]);

  useEffect(() => {
    if (authLoading || !profile) return;
    const id = params?.id as string;
    if (!id) return;

    if (isStaff) {
      // Fetch sessions without the portal_users join (RLS blocks it from the browser client)
      // Then enrich with student names from the API
      Promise.all([
        fetch(`/api/cbt/exams/${id}`, { cache: 'no-store' }).then(async (r) => {
          const payload = await r.json();
          if (!r.ok) throw new Error(payload.error || 'Exam not available');
          return payload.data;
        }),
        fetch(`/api/cbt/sessions?exam_id=${id}`, { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ]).then(async ([examData, sesRes, usersJson]) => {
        const umap: Record<string, any> = {};
        (usersJson.data ?? []).forEach((u: any) => { umap[u.id] = u; });
        let rawSessions: any[] = Array.isArray(sesRes.data) ? sesRes.data : [];
        // Filter by school if school role
        if (role === 'school' && profile.school_id) {
          rawSessions = rawSessions.filter((s: any) => umap[s.user_id]?.school_id === profile.school_id);
        }
        const enriched = rawSessions.map((s: any) => ({
          ...s,
          portal_users: umap[s.user_id] ?? null,
        }));
        setExam(examData);
        setQuestions([...(examData?.cbt_questions ?? [])].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)));
        setSessions(enriched);
        const classIdForRoster = examData?.class_id || examData?.metadata?.target_class_id;
        const paperMax = hostMaxFromExam({
          metadata: examData?.metadata,
          cbt_questions: examData?.cbt_questions,
        });
        if (paperMax) setPaperOutOf(String(paperMax));
        if (classIdForRoster) {
          const rosterRes = await fetch(`/api/portal-users?role=student&scoped=true&class_id=${classIdForRoster}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }));
          const classRoster = (rosterRes.data ?? []) as Array<{ id: string; full_name: string | null; email?: string | null }>;
          setRoster(classRoster);
          const draft: Record<string, string> = {};
          for (const student of classRoster) {
            const existing = enriched.find((s: any) => s.user_id === student.id);
            const paper = parsePaperMarkAnswers(existing?.answers) || markFromPercent(existing?.score, paperMax ?? 100);
            if (paper) draft[student.id] = String(paper.earned);
          }
          setHallDraft(draft);
        } else {
          setRoster([]);
          setHallDraft({});
        }
        setLoading(false);
      }).catch(() => {
        setExam(null);
        setQuestions([]);
        setSessions([]);
        setLoading(false);
      });
    } else {
      Promise.all([
        fetch(`/api/cbt/exams/${id}`, { cache: 'no-store' }).then(async (r) => {
          const payload = await r.json();
          if (!r.ok) throw new Error(payload.error || 'Exam not available');
          return payload.data;
        }),
        fetch(`/api/cbt/sessions?exam_id=${id}`, { cache: 'no-store' }).then(r => r.json()),
      ]).then(([examData, sessionPayload]) => {
        setExam(examData);
        setQuestions([...(examData?.cbt_questions ?? [])].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)));
        setSessions(sessionPayload.data ? [sessionPayload.data] : []);
        setLoading(false);
      }).catch(() => {
        setExam(null);
        setQuestions([]);
        setSessions([]);
        setLoading(false);
      });
    }
  }, [profile?.id, params?.id, authLoading]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!exam) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <p className="text-muted-foreground">Exam not found.</p>
    </div>
  );

  const totalPoints = questions.reduce((s, q) => s + (q.points ?? 0), 0);
  const mySession = !isStaff ? sessions[0] : null;
  const hostMeta = exam.metadata && typeof exam.metadata === 'object' ? exam.metadata : {};
  const hostKind = hostAssessmentKindFromExam(exam);
  const paperName = hostKind ? hostPaperLabel(hostKind) : 'paper';
  const hostClassId = exam.class_id || hostMeta.target_class_id || classId;
  if (hostKind && hostClassId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  const derivedHallMax = hostMaxFromExam({ metadata: hostMeta, cbt_questions: questions }) || totalPoints || 100;
  const hallMax = Math.max(1, parseInt(paperOutOf, 10) || derivedHallMax);
  const showHallMarks = isStaff && (
    hostMeta.generated_from === 'taught_weeks'
    || !!hostMeta.host_assessment
    || hostMeta.sit === 'print'
    || exam.is_active === false
  );

  const handleSaveHallMarks = async () => {
    const scores = roster
      .map((student) => ({ user_id: student.id, earned: hallDraft[student.id] }))
      .filter((row) => String(row.earned ?? '').trim() !== '')
      .map((row) => ({ user_id: row.user_id, earned: Number(row.earned), max: hallMax }));
    if (scores.length === 0) {
      setHallError('Enter at least one hall mark.');
      return;
    }
    setSavingHall(true);
    setHallError(null);
    try {
      const res = await fetch('/api/cbt/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_paper', exam_id: exam.id, scores }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || 'Could not save hall marks');
      const skipped = Array.isArray(payload.data?.skipped) ? payload.data.skipped : [];
      if (skipped.length > 0) {
        setHallError(`${payload.data.saved?.length ?? 0} saved. ${skipped.length} already have a CBT sitting and were left unchanged.`);
      }
      const nextHostMax = Number(payload.data?.host_max);
      if (Number.isFinite(nextHostMax) && nextHostMax > 0) {
        setPaperOutOf(String(nextHostMax));
        setExam((current: any) => current ? {
          ...current,
          metadata: {
            ...(current.metadata && typeof current.metadata === 'object' ? current.metadata : {}),
            host_max: nextHostMax,
          },
        } : current);
      }
      const sesRes = await fetch(`/api/cbt/sessions?exam_id=${exam.id}`, { cache: 'no-store' }).then(r => r.json());
      const rawSessions: any[] = Array.isArray(sesRes.data) ? sesRes.data : [];
      setSessions(rawSessions.map((s: any) => ({
        ...s,
        portal_users: roster.find((student) => student.id === s.user_id) ?? s.portal_users ?? null,
      })));
    } catch (err: any) {
      setHallError(err.message || 'Could not save hall marks');
    } finally {
      setSavingHall(false);
    }
  };

  const handlePrintExam = (mode: 'student' | 'staff' = 'student', filter: 'all' | 'mcq' | 'theory' = 'all') => {
    const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const schoolName = profile?.school_name || 'RILLCOD TECHNOLOGIES';
    const logoUrl = window.location.origin + '/logo.png';

    const sorted = [...questions].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const allMcq  = sorted.filter((q) => isObjectiveQuestion(q));
    const allOpen = sorted.filter((q) => isTheoryQuestion(q));

    // Optional count limits from print settings ('' = print all).
    const mcqLimit    = printMcqCount.trim()    ? Math.max(1, parseInt(printMcqCount,    10)) : undefined;
    const theoryLimit = printTheoryCount.trim() ? Math.max(1, parseInt(printTheoryCount, 10)) : undefined;

    const rawMcq  = filter === 'theory' ? [] : allMcq;
    const rawOpen = filter === 'mcq'    ? [] : allOpen;
    const mcqQuestions  = mcqLimit    ? rawMcq.slice(0, mcqLimit)    : rawMcq;
    const openQuestions = theoryLimit ? rawOpen.slice(0, theoryLimit) : rawOpen;

    if (mcqQuestions.length === 0 && openQuestions.length === 0) {
      alert(`No ${filter === 'mcq' ? 'objective (MCQ)' : 'theory'} questions found in this exam.`);
      return;
    }

    const durationVal = printDuration ? parseInt(printDuration, 10) : exam.duration_minutes;
    const passMarkVal = printPassMark ? parseInt(printPassMark, 10) : (exam.passing_score ?? 70);
    const examTypeLabel = filter === 'mcq' ? 'OBJECTIVE EXAMINATION' : filter === 'theory' ? 'THEORY EXAMINATION' : 'EXAMINATION';

    openCbtPrintWindow(buildCbtPrintHtml({
      title: exam.title,
      schoolName,
      subtitle: [exam.programs?.name, exam.courses?.title].filter(Boolean).join(' · ') || undefined,
      description: exam.description?.trim() || undefined,
      durationMinutes: durationVal || 60,
      passingScore: passMarkVal,
      dateStr: today,
      docRef: `CBT-${exam.id?.slice(0, 8) ?? 'EXAM'}`,
      logoUrl,
      mcqQuestions,
      theoryQuestions: openQuestions,
      mode,
      examTypeLabel,
    }));
  };

  return (
    <div className={`space-y-6 ${MOBILE_PAGE_BOTTOM}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Link href={hostClassId ? `/dashboard/classes/${hostClassId}?operation=assessment` : `/dashboard/cbt`} className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeftIcon className="w-4 h-4" /> {hostClassId ? 'Back to Class Assessment' : 'Back to CBT'}
          </Link>
          {hostClassId && (
            <Link href="/dashboard/cbt" className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
              All CBT Assessments →
            </Link>
          )}
        </div>

        {/* Exam header */}
        <div className="relative border border-border/80 bg-card/90 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute -right-32 -top-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm">
                  CBT Examination Workspace
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                  <AcademicCapIcon className="w-4 h-4" />
                  {exam.programs?.name}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${exam.is_active ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-slate-200 text-slate-900 border-slate-300 dark:bg-muted dark:text-muted-foreground dark:border-border'}`}>
                  {exam.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold mb-2">{exam.title}</h1>
              {exam.description && (
                <div className="mt-1">
                  <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest mb-1">Description</p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{exam.description}</p>
                </div>
              )}
            </div>
            {isStaff && (
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0" ref={printMenuRef}>
                <button
                  type="button"
                  onClick={() => handlePrintExam('student', 'all')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black rounded-xl transition-colors shadow-sm"
                >
                  <PrinterIcon className="w-4 h-4" /> Print Student Paper
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintExam('staff', 'all')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-bold rounded-xl transition-colors"
                >
                  <PrinterIcon className="w-4 h-4" /> Teacher Key
                </button>
                <button
                  type="button"
                  onClick={() => setPrintMenuOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-card hover:bg-muted border border-border text-foreground text-xs font-bold rounded-xl transition-colors"
                >
                  <PrinterIcon className="w-4 h-4 text-primary" /> Print Options
                </button>
                {canManageExam && (
                  <>
                    <Link href={`/dashboard/cbt/${exam.id}/edit`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-colors">
                      <PencilIcon className="w-3.5 h-3.5" /> Edit Exam
                    </Link>
                    <button
                      type="button"
                      disabled={togglingActive}
                      onClick={async () => {
                        setTogglingActive(true);
                        try {
                          const res = await fetch(`/api/cbt/exams/${exam.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ is_active: !exam.is_active }),
                          });
                          if (res.ok) setExam((prev: any) => prev ? { ...prev, is_active: !prev.is_active } : prev);
                        } finally {
                          setTogglingActive(false);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-colors ${exam.is_active ? 'bg-amber-200 border-amber-400 text-amber-950 hover:bg-amber-300 dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-200' : 'bg-emerald-200 border-emerald-400 text-emerald-950 hover:bg-emerald-300 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-200'}`}
                    >
                      {exam.is_active ? <><LockClosedIcon className="w-3.5 h-3.5" /> Deactivate</> : <><LockOpenIcon className="w-3.5 h-3.5" /> Activate</>}
                    </button>
                    <button
                      type="button"
                      disabled={deletingExam}
                      onClick={async () => {
                        if (!confirm(`Delete CBT exam "${exam.title}"? All questions and student sessions will be permanently deleted.`)) return;
                        setDeletingExam(true);
                        try {
                          const res = await fetch(`/api/cbt/exams/${exam.id}`, { method: 'DELETE' });
                          if (!res.ok) {
                            const j = await res.json().catch(() => ({}));
                            throw new Error(j.error || 'Delete failed');
                          }
                          router.push(hostClassId ? `/dashboard/classes/${hostClassId}?operation=assessment` : '/dashboard/cbt');
                        } catch (err: any) {
                          alert(err?.message || 'Delete failed');
                          setDeletingExam(false);
                        }
                      }}
                      aria-label="Delete CBT exam"
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-100 hover:bg-rose-200 border border-rose-300 text-rose-900 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-300 text-xs font-bold rounded-xl transition-colors disabled:opacity-50"
                    >
                      <TrashIcon className="w-3.5 h-3.5" /> Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Responsive Print Options Modal — never clipped on mobile or desktop */}
          {isStaff && printMenuOpen && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={() => setPrintMenuOpen(false)}>
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Print CBT Exam Options"
                className="w-full sm:max-w-md bg-card border border-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <PrinterIcon className="w-5 h-5 text-primary" />
                    <div>
                      <h3 className="text-sm font-black text-foreground">Print &amp; Save Exam PDF</h3>
                      <p className="text-[11px] text-muted-foreground">Customize sections, question count, or pass mark</p>
                    </div>
                  </div>
                  <button type="button" aria-label="Close print options" onClick={() => setPrintMenuOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                  {/* Question Type */}
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Question Type</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['all', 'mcq', 'theory'] as const).map(f => (
                        <button key={f} type="button" onClick={() => setPrintFilter(f)}
                          className={`px-3 py-2 text-xs font-black uppercase rounded-xl border transition-colors ${printFilter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted border-border text-muted-foreground hover:text-foreground'}`}>
                          {f === 'all' ? 'Both' : f === 'mcq' ? 'Objective' : 'Theory'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Question Counts */}
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Question Count</p>
                    <div className="grid grid-cols-2 gap-3">
                      {printFilter !== 'theory' && (
                        <div>
                          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                            Obj / MCQ ({questions.filter((q: any) => isObjectiveQuestion(q)).length} avail)
                          </label>
                          <input
                            type="number" min="1"
                            max={questions.filter((q: any) => isObjectiveQuestion(q)).length}
                            value={printMcqCount}
                            onChange={e => setPrintMcqCount(e.target.value)}
                            placeholder="All"
                            className="w-full px-3 py-2 bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary rounded-xl"
                          />
                        </div>
                      )}
                      {printFilter !== 'mcq' && (
                        <div>
                          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                            Theory ({questions.filter((q: any) => isTheoryQuestion(q)).length} avail)
                          </label>
                          <input
                            type="number" min="1"
                            max={questions.filter((q: any) => isTheoryQuestion(q)).length}
                            value={printTheoryCount}
                            onChange={e => setPrintTheoryCount(e.target.value)}
                            placeholder="All"
                            className="w-full px-3 py-2 bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary rounded-xl"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Exam Settings */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Paper Header Overrides</p>
                      <button
                        type="button"
                        onClick={() => { setPrintMcqCount(''); setPrintTheoryCount(''); setPrintDuration(''); setPrintPassMark(''); setPrintFilter('all'); }}
                        className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider">
                        Reset defaults
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                          Duration (min)
                        </label>
                        <input
                          type="number" min="1"
                          value={printDuration}
                          onChange={e => setPrintDuration(e.target.value)}
                          placeholder={exam?.duration_minutes ? String(exam.duration_minutes) : 'Auto'}
                          className="w-full px-3 py-2 bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                          Pass Mark (%)
                        </label>
                        <input
                          type="number" min="1" max="100"
                          value={printPassMark}
                          onChange={e => setPrintPassMark(e.target.value)}
                          placeholder={String(exam?.passing_score ?? 70)}
                          className="w-full px-3 py-2 bg-muted border border-border text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary rounded-xl"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-border bg-muted/20 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setPrintMenuOpen(false); handlePrintExam('student', printFilter); }}
                    className="flex flex-col items-center justify-center px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-black text-xs transition-colors"
                  >
                    <span>Print Student Copy</span>
                    <span className="text-[10px] font-normal opacity-80">Questions only, no answers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPrintMenuOpen(false); handlePrintExam('staff', printFilter); }}
                    className="flex flex-col items-center justify-center px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-100 font-black text-xs transition-colors"
                  >
                    <span>Teacher Copy + Answer Key</span>
                    <span className="text-[10px] font-normal opacity-80">Marked answers &amp; guides</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
            {exam.duration_minutes && <span className="flex items-center gap-1.5"><ClockIcon className="w-4 h-4" />{exam.duration_minutes} minutes</span>}
            <span className="flex items-center gap-1.5"><CheckCircleIcon className="w-4 h-4" />{exam.passing_score ?? 70}% to pass</span>
            <span className="flex items-center gap-1.5"><UserGroupIcon className="w-4 h-4" />{questions.length} questions · {totalPoints} pts total</span>
          </div>
          {!isStaff && !mySession && (
            <div className="mt-4">
              <Link href={`/dashboard/cbt/${exam.id}/take`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-foreground font-bold text-sm rounded-xl transition-all">
                Start Exam
              </Link>
            </div>
          )}
          {mySession && (
            <div className={`mt-4 p-4 rounded-xl border ${
              mySession.status === 'passed'
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : mySession.status === 'pending_grading'
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : 'bg-rose-500/10 border-rose-500/20'
            }`}>
              <div className="flex items-center gap-2">
                {mySession.status === 'passed'
                  ? <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  : mySession.status === 'pending_grading'
                    ? <ClockIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    : <XCircleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
                <span className={`font-bold ${
                  mySession.status === 'passed'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : mySession.status === 'pending_grading'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {mySession.status === 'passed' ? 'Passed' : mySession.status === 'pending_grading' ? 'Pending grading' : 'Failed'} — Score: {mySession.score}%
                </span>
              </div>
              {mySession.end_time && (
                <p className="text-xs text-muted-foreground mt-1">Completed {new Date(mySession.end_time).toLocaleString()}</p>
              )}
            </div>
          )}
          {!isStaff && mySession && mySession.answers && questions.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowReview(v => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-border text-xs font-bold text-foreground rounded-xl transition-colors"
              >
                {showReview ? 'Hide Review' : 'Review Answers'}
              </button>
            </div>
          )}
        </div>

        {/* Student: answer review */}
        {!isStaff && mySession && mySession.answers && questions.length > 0 && showReview && (() => {
          const answers: Record<string, string> = mySession.answers ?? {};
          type ReviewQ = {
            q: any;
            studentAnswer: string;
            isManual: boolean;
            isCorrect: boolean | null; // null = manual / pending
            pts: number;
            earnedPts: number | null;
          };
          const reviewed: ReviewQ[] = questions.map((q: any) => {
            const studentAnswer = answers[q.id] ?? '';
            const isManual = isManualCbtQuestion(q);
            const pts = q.points ?? 0;
            if (isManual) {
              return { q, studentAnswer, isManual: true, isCorrect: null, pts, earnedPts: null };
            }
            const isCorrect = isCbtAnswerCorrect(q, studentAnswer);
            return { q, studentAnswer, isManual: false, isCorrect, pts, earnedPts: isCorrect ? pts : 0 };
          });

          const correctCount   = reviewed.filter(r => r.isCorrect === true).length;
          const incorrectCount = reviewed.filter(r => r.isCorrect === false).length;
          const pendingCount   = reviewed.filter(r => r.isCorrect === null).length;
          const autoTotal      = reviewed.filter(r => !r.isManual).length;
          const scorePct       = mySession.score ?? 0;
          const passing        = exam.passing_score ?? 70;

          return (
            <div className="space-y-4">
              {/* Summary stats bar */}
              <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl flex flex-wrap gap-4 items-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-auto">Answer Review</p>
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckIcon className="w-3.5 h-3.5" />
                  Correct: {correctCount}/{autoTotal}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                  <XMarkIcon className="w-3.5 h-3.5" />
                  Incorrect: {incorrectCount}
                </span>
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                    Pending Review: {pendingCount}
                  </span>
                )}
                <span className={`text-xs font-bold px-2.5 py-1 rounded-xl border ${scorePct >= passing ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'}`}>
                  Score: {scorePct}%
                </span>
              </div>

              {/* Per-question cards */}
              <div className="space-y-3">
                {reviewed.map((r, i) => {
                  const { q, studentAnswer, isManual, isCorrect, pts, earnedPts } = r;
                  const isMCQ = q.options && Array.isArray(q.options) && q.options.length > 0;
                  const isFillOrCode = !isMCQ && !isManual;

                  const badgeCls = isManual
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                    : isCorrect
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400';
                  const badgeLabel = isManual ? 'Pending' : isCorrect ? 'Correct' : 'Incorrect';

                  const ptsCls = isManual
                    ? 'text-amber-600 dark:text-amber-400'
                    : isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
                  const ptsLabel = isManual ? `?/${pts} pts` : `${earnedPts}/${pts} pts`;

                  return (
                    <div key={q.id} className="bg-card border border-border p-5 space-y-4 rounded-xl">
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pt-0.5 flex-shrink-0">
                            Q{i + 1}
                          </span>
                          <CbtMarkdown text={q.question_text} className="text-sm text-foreground leading-relaxed" />
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-xl ${badgeCls}`}>
                            {badgeLabel}
                          </span>
                          <span className={`text-[10px] font-bold ${ptsCls}`}>{ptsLabel}</span>
                        </div>
                      </div>

                      {/* MCQ options */}
                      {isMCQ && (
                        <div className="space-y-1.5 pl-8">
                          {(q.options as string[]).map((opt: string, oi: number) => {
                            const isAnswer = cbtAnswerMatchesOption(opt, oi, q.correct_answer);
                            const isSelected = cbtAnswerMatchesOption(opt, oi, studentAnswer);
                            const isWrong = isSelected && !isAnswer;

                            let optCls = 'border-border text-muted-foreground';
                            if (isAnswer) optCls = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400';
                            if (isWrong)  optCls = 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400';

                            return (
                              <div key={oi} className={`flex items-center gap-2.5 px-3 py-2 border rounded-xl text-xs font-medium ${optCls}`}>
                                <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center border border-current rounded-full text-[10px] font-black">
                                  {String.fromCharCode(65 + oi)}
                                </span>
                                <span className="flex-1">{opt}</span>
                                {isAnswer && <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                                {isWrong  && <XMarkIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Fill blank / coding — side-by-side comparison */}
                      {isFillOrCode && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-8">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Your Answer</p>
                            <div className={`px-3 py-2.5 border rounded-xl text-xs font-mono ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'}`}>
                              {studentAnswer || <span className="italic opacity-60">No answer</span>}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Correct Answer</p>
                            <div className="px-3 py-2.5 border rounded-xl text-xs font-mono bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                              {q.correct_answer || <span className="italic opacity-60">N/A</span>}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Manual/open question */}
                      {isManual && (
                        <div className="pl-8 space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Your Answer</p>
                          <div className="px-3 py-2.5 border border-border bg-muted/40 rounded-xl text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                            {studentAnswer || <span className="italic text-muted-foreground">No answer submitted</span>}
                          </div>
                          {q.correct_answer && (
                            <div className="px-3 py-2.5 border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl text-xs text-emerald-900 dark:text-emerald-200">
                              <span className="font-black uppercase tracking-wider text-[10px] block mb-0.5">Model Answer / Key Points</span>
                              {q.correct_answer}
                            </div>
                          )}
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-300">Awaiting manual review</p>
                        </div>
                      )}
                      {(q.metadata?.marking_guide || q.explanation) && (
                        <div className="ml-8 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs text-foreground">
                          <span className="font-black uppercase tracking-wider text-[10px] text-primary block mb-0.5">
                            Detailed Feedback &amp; Explanation
                          </span>
                          {String(q.metadata?.marking_guide || q.explanation)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Staff: hall marks stay on this same exam — print or CBT */}
        {showHallMarks && roster.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
            <div className="p-5 border-b border-border space-y-3">
              <h2 className="font-bold flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-primary" /> Record {paperName} hall marks
              </h2>
              <p className="text-xs text-muted-foreground">
                Enter {paperName} marks out of this paper’s total. Write and the parent report read the same marks — one record.
              </p>
              <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                This {paperName} is out of
                <input
                  type="number"
                  min={1}
                  value={paperOutOf || String(hallMax)}
                  onChange={(e) => setPaperOutOf(e.target.value)}
                  disabled={!canManageExam || savingHall}
                  className="w-20 px-2 py-1.5 bg-muted border border-border text-sm text-right rounded-xl disabled:opacity-60 text-foreground"
                />
              </label>
            </div>
            <div className="divide-y divide-white/5">
              {roster.map((student) => {
                const existing = sessions.find((s: any) => s.user_id === student.id);
                const locked = existing && !isPaperCaptureAnswers(existing.answers);
                return (
                  <div key={student.id} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{student.full_name ?? 'Student'}</p>
                      {locked && <p className="text-[10px] text-muted-foreground">CBT sitting already recorded</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={hallMax}
                        disabled={locked || !canManageExam || savingHall}
                        value={hallDraft[student.id] ?? ''}
                        onChange={(e) => setHallDraft((current) => ({ ...current, [student.id]: e.target.value }))}
                        placeholder="0"
                        className="w-16 px-2 py-1.5 bg-muted border border-border text-sm text-right rounded-xl disabled:opacity-60"
                      />
                      <span className="text-xs text-muted-foreground">/{hallMax}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {canManageExam && (
              <div className="p-5 border-t border-border flex items-center justify-between gap-3">
                {hallError ? <p className="text-xs text-rose-500">{hallError}</p> : <span />}
                <button
                  type="button"
                  onClick={() => void handleSaveHallMarks()}
                  disabled={savingHall}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-primary-foreground disabled:opacity-60"
                >
                  {savingHall ? 'Saving…' : 'Save hall marks'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Staff: sessions (collapsible with counts) */}
        {isStaff && sessions.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setResultsOpen(v => !v)}
              aria-expanded={resultsOpen}
              className="w-full p-4 sm:p-5 border-b border-border flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
            >
              <h2 className="font-bold flex items-center gap-2 text-foreground">
                <ChartBarIcon className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                Student Results
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-800 dark:text-emerald-300">
                  {sessions.length}
                </span>
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  {sessions.filter(s => s.status === 'passed').length} passed
                </span>
                <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${resultsOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {resultsOpen && (
            <div className="divide-y divide-border">
              {sessions.map((s: any) => (
                <div key={s.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{s.portal_users?.full_name ?? 'Student'}</p>
                    <p className="text-xs text-muted-foreground">{s.portal_users?.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-2 mb-1">
                        {s.status === 'pending_grading' ? (
                          <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                            Pending Grading
                          </span>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-xl border text-[10px] font-black uppercase tracking-widest ${
                            s.status === 'passed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                            : s.status === 'failed' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                            : 'bg-card shadow-sm border-border text-muted-foreground'
                          }`}>
                            {s.status === 'passed' ? `Passed` : s.status === 'failed' ? 'Failed' : s.status} {s.score != null ? `— ${parsePaperMarkAnswers(s.answers) ? formatHostMark(parsePaperMarkAnswers(s.answers)) : `${s.score}%`}` : ''}
                          </span>
                        )}
                      </div>
                      {isPaperCaptureAnswers(s.answers) && (
                        <p className="text-[10px] text-muted-foreground truncate">Hall mark</p>
                      )}
                      {s.end_time && (
                        <p className="text-[10px] text-muted-foreground truncate">Submitted {new Date(s.end_time).toLocaleDateString()}</p>
                      )}
                    </div>
                    {/* Always show Grade/Review button for staff */}
                    <Link href={`/dashboard/cbt/${exam.id}/sessions/${s.id}/grade`}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                        s.status === 'pending_grading'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-foreground shadow-lg shadow-emerald-900/30'
                          : 'bg-muted hover:bg-muted text-muted-foreground'
                      }`}>
                      <ChartBarIcon className="w-3.5 h-3.5" />
                      {s.status === 'pending_grading' ? 'Grade' : 'Review'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* Staff: questions preview (collapsible with count + quick CRUD) */}
        {isStaff && questions.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setQuestionsOpen(v => !v)}
                aria-expanded={questionsOpen}
                className="flex items-center gap-2 text-left flex-1 min-w-0"
              >
                <h2 className="font-bold text-foreground">Questions Preview</h2>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-black text-primary">
                  {questions.length} · {totalPoints} pts
                </span>
                <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${questionsOpen ? 'rotate-180' : ''}`} />
              </button>
              {canManageExam && (
                <Link
                  href={`/dashboard/cbt/${exam.id}/edit`}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
                >
                  <PencilIcon className="w-3.5 h-3.5 text-primary" /> Manage Questions
                </Link>
              )}
            </div>
            {questionsOpen && (
            <div className="divide-y divide-border">
              {questions.map((q: any, i: number) => (
                <div key={q.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-6 flex-shrink-0 pt-0.5">{i + 1}.</span>
                    <div className="flex-1">
                      <CbtMarkdown text={q.question_text} className="text-sm text-foreground" />
                      {q.options && Array.isArray(q.options) && (
                        <div className="mt-2 space-y-1">
                          {q.options.map((opt: string, oi: number) => (
                            <p key={oi} className={`text-xs px-2 py-1 rounded ${opt === q.correct_answer ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                              {String.fromCharCode(65 + oi)}. <CbtMarkdown text={opt} className="inline" />
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{q.points} pts</span>
                        <span className="capitalize">{q.question_type?.replace('_', ' ')}</span>
                        <span className="text-emerald-800 dark:text-emerald-400 font-semibold">Answer: {q.correct_answer}</span>
                      </div>
                    </div>
                    {canManageExam && sessions.length === 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete Question ${i + 1}?`)) return;
                          const remaining = questions.filter((item: any) => item.id !== q.id);
                          const res = await fetch(`/api/cbt/exams/${exam.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              deletedQuestionIds: [q.id],
                              total_questions: remaining.length,
                            }),
                          });
                          if (res.ok) setQuestions(remaining);
                          else alert('Could not delete this question.');
                        }}
                        aria-label={`Delete question ${i + 1}`}
                        title="Delete question"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-500/30 bg-rose-100 dark:bg-rose-500/15 text-rose-900 dark:text-rose-300 hover:bg-rose-200 text-[11px] font-bold flex-shrink-0 transition-colors"
                      >
                        <TrashIcon className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
