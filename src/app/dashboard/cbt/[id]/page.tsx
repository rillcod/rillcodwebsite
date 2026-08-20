// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowLeftIcon, AcademicCapIcon, ClockIcon, CheckCircleIcon,
  XCircleIcon, UserGroupIcon, ChartBarIcon, PencilIcon, PrinterIcon,
  CheckIcon, XMarkIcon,
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

export default function ExamDetailPage() {
  const params = useParams() as { id?: string };
  const searchParams = useSearchParams();
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
  const [printFilter, setPrintFilter] = useState<'all' | 'mcq' | 'theory'>('all');
  const [printMcqCount, setPrintMcqCount] = useState<string>('');      // '' = all
  const [printTheoryCount, setPrintTheoryCount] = useState<string>(''); // '' = all
  const [printDuration, setPrintDuration] = useState<string>('');       // '' = use exam default
  const [printPassMark, setPrintPassMark] = useState<string>('');       // '' = use exam default
  const printMenuRef = useRef<HTMLDivElement>(null);

  const role = profile?.role ?? '';
  const isStaff = role === 'admin' || role === 'teacher' || role === 'school';
  const canManageExam = role === 'admin' || role === 'teacher';

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
        <Link href={classId ? `/dashboard/classes/${classId}` : `/dashboard/cbt`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> {classId ? 'Back to Class' : 'Back to CBT'}
        </Link>

        {/* Exam header */}
        <div className="relative overflow-hidden border border-border/80 bg-card/90 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="absolute -right-32 -top-32 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm">
                  CBT Examination Workspace
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                  <AcademicCapIcon className="w-4 h-4" />
                  {exam.programs?.name}
                </span>
              </div>
              <h1 className="text-2xl font-extrabold mb-2">{exam.title}</h1>
              {exam.description && (
                <div className="mt-1">
                  <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest mb-1">Description</p>
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{exam.description}</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${exam.is_active ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                {exam.is_active ? 'Active' : 'Inactive'}
              </span>
              {isStaff && (
                <>
                  {/* Print dropdown */}
                  <div className="relative" ref={printMenuRef}>
                    <button
                      onClick={() => setPrintMenuOpen(o => !o)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold rounded-xl transition-colors">
                      <PrinterIcon className="w-3.5 h-3.5" /> Print
                      <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    {printMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border shadow-2xl shadow-black/40 rounded-xl w-72" onMouseLeave={() => setPrintMenuOpen(false)}>

                        {/* ── Section: Question Type ── */}
                        <div className="px-4 py-2.5 border-b border-border">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">Question Type</p>
                          <div className="flex gap-1">
                            {(['all', 'mcq', 'theory'] as const).map(f => (
                              <button key={f} onClick={() => setPrintFilter(f)}
                                className={`flex-1 px-2 py-1 text-[9px] font-black uppercase rounded-xl border transition-colors ${printFilter === f ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-muted border-border text-muted-foreground hover:text-foreground'}`}>
                                {f === 'all' ? 'Both' : f === 'mcq' ? 'Objective' : 'Theory'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* ── Section: Question Counts ── */}
                        <div className="px-4 py-3 border-b border-border space-y-2.5">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Question Count</p>
                          <div className="grid grid-cols-2 gap-2">
                            {printFilter !== 'theory' && (
                              <div>
                                <label className="block text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                  Obj / MCQ
                                  <span className="text-primary/60 ml-1 normal-case font-normal">({questions.filter((q: any) => isObjectiveQuestion(q)).length} avail)</span>
                                </label>
                                <input
                                  type="number" min="1"
                                  max={questions.filter((q: any) => isObjectiveQuestion(q)).length}
                                  value={printMcqCount}
                                  onChange={e => setPrintMcqCount(e.target.value)}
                                  placeholder="All"
                                  className="w-full px-2 py-1.5 bg-muted border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 rounded-xl"
                                />
                              </div>
                            )}
                            {printFilter !== 'mcq' && (
                              <div>
                                <label className="block text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                  Theory
                                  <span className="text-primary/60 ml-1 normal-case font-normal">({questions.filter((q: any) => isTheoryQuestion(q)).length} avail)</span>
                                </label>
                                <input
                                  type="number" min="1"
                                  max={questions.filter((q: any) => isTheoryQuestion(q)).length}
                                  value={printTheoryCount}
                                  onChange={e => setPrintTheoryCount(e.target.value)}
                                  placeholder="All"
                                  className="w-full px-2 py-1.5 bg-muted border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 rounded-xl"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Section: Exam Settings ── */}
                        <div className="px-4 py-3 border-b border-border space-y-2.5">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Exam Settings</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                Duration (min)
                              </label>
                              <input
                                type="number" min="1"
                                value={printDuration}
                                onChange={e => setPrintDuration(e.target.value)}
                                placeholder={exam?.duration_minutes ? String(exam.duration_minutes) : 'Auto'}
                                className="w-full px-2 py-1.5 bg-muted border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 rounded-xl"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                Pass Mark (%)
                              </label>
                              <input
                                type="number" min="1" max="100"
                                value={printPassMark}
                                onChange={e => setPrintPassMark(e.target.value)}
                                placeholder={String(exam?.passing_score ?? 70)}
                                className="w-full px-2 py-1.5 bg-muted border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 rounded-xl"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => { setPrintMcqCount(''); setPrintTheoryCount(''); setPrintDuration(''); setPrintPassMark(''); }}
                            className="text-[8px] font-bold text-muted-foreground hover:text-primary uppercase tracking-widest transition-colors">
                            Reset to defaults
                          </button>
                        </div>

                        {/* ── Print Actions ── */}
                        <div className="px-4 pt-3 pb-2">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Choose print copy</p>
                        </div>
                        <button
                          onClick={() => { setPrintMenuOpen(false); handlePrintExam('student', printFilter); }}
                          className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-muted transition-colors border-b border-border flex flex-col gap-0.5">
                          <span className="text-foreground">Student Copy</span>
                          <span className="text-muted-foreground font-normal">Questions only, no answers</span>
                        </button>
                        <button
                          onClick={() => { setPrintMenuOpen(false); handlePrintExam('staff', printFilter); }}
                          className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-muted transition-colors flex flex-col gap-0.5">
                          <span className="text-primary">Teacher Copy + Answer Key</span>
                          <span className="text-muted-foreground font-normal">Teacher-only version with marked answers</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {canManageExam && (
                    <Link href={`/dashboard/cbt/${exam.id}/edit`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-xl transition-colors">
                      <PencilIcon className="w-3.5 h-3.5" /> Edit Exam
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
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
                          <div className="px-3 py-2.5 border border-border bg-white/5 rounded-xl text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                            {studentAnswer || <span className="italic text-muted-foreground">No answer submitted</span>}
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Awaiting manual review</p>
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

        {/* Staff: sessions */}
        {isStaff && sessions.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <ChartBarIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Student Results ({sessions.length})
              </h2>
              <span className="text-xs text-muted-foreground">
                {sessions.filter(s => s.status === 'passed').length} passed
              </span>
            </div>
            <div className="divide-y divide-white/5">
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
          </div>
        )}

        {/* Staff: questions preview */}
        {isStaff && questions.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
            <div className="p-5 border-b border-border">
              <h2 className="font-bold">Questions Preview</h2>
            </div>
            <div className="divide-y divide-white/5">
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
                        <span className="text-emerald-600 dark:text-emerald-400">Answer: {q.correct_answer}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
