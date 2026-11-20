// @refresh reset
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowLeftIcon, AcademicCapIcon, ClockIcon, CheckCircleIcon,
  XCircleIcon, UserGroupIcon, ChartBarIcon, PencilIcon, PrinterIcon,
  CheckIcon, XMarkIcon, TrashIcon, ChevronDownIcon, LockOpenIcon, LockClosedIcon, ClipboardIcon,
  ArrowPathIcon, ExclamationTriangleIcon,
} from '@/lib/icons';
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';
import { parseEssayAnswer } from '@/lib/cbt/essay-attachments';
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
  const [copiedExamLink, setCopiedExamLink] = useState(false);
  const [printFilter, setPrintFilter] = useState<'all' | 'mcq' | 'theory'>('all');
  const [printMcqCount, setPrintMcqCount] = useState<string>('');      // '' = all
  const [printTheoryCount, setPrintTheoryCount] = useState<string>(''); // '' = all
  const [printDuration, setPrintDuration] = useState<string>('');       // '' = use exam default
  const [printPassMark, setPrintPassMark] = useState<string>('');       // '' = use exam default
  const [liveMonitor, setLiveMonitor] = useState(true);
  const [monitorFilter, setMonitorFilter] = useState<'all' | 'live' | 'submitted' | 'not_started'>('all');
  const [monitorSearch, setMonitorSearch] = useState('');
  const [monitorSort, setMonitorSort] = useState<'live' | 'progress' | 'score_desc' | 'score_asc' | 'name'>('live');
  const [refreshingSessions, setRefreshingSessions] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [resetReason, setResetReason] = useState('');
  const [resettingSessionId, setResettingSessionId] = useState<string | null>(null);
  const [forcingSessionId, setForcingSessionId] = useState<string | null>(null);
  const [monitorNotice, setMonitorNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const userMapRef = useRef<Record<string, any>>({});
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
        userMapRef.current = umap;
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
        setLastSyncedAt(new Date());
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

  const refreshLiveSessions = useCallback(async (manual = false) => {
    const id = params?.id as string;
    if (!id || !isStaff) return;
    if (manual) setRefreshingSessions(true);
    try {
      const sesRes = await fetch(`/api/cbt/sessions?exam_id=${id}`, { cache: 'no-store' }).then((r) => r.json());
      const umap = userMapRef.current;
      let rawSessions: any[] = Array.isArray(sesRes.data) ? sesRes.data : [];
      if (role === 'school' && profile?.school_id) {
        rawSessions = rawSessions.filter((s: any) => umap[s.user_id]?.school_id === profile.school_id);
      }
      const enriched = rawSessions.map((s: any) => ({
        ...s,
        portal_users: umap[s.user_id] ?? roster.find((r) => r.id === s.user_id) ?? null,
      }));
      setSessions(enriched);
      setLastSyncedAt(new Date());
    } catch {
      // Transient polling errors are ignored silently
    } finally {
      if (manual) setRefreshingSessions(false);
    }
  }, [params?.id, isStaff, role, profile?.school_id, roster]);

  // Real-time 5-second polling for staff while tab is visible
  useEffect(() => {
    if (!isStaff || !liveMonitor || loading || !exam?.id) return;
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshLiveSessions(false);
      }
    }, 5_000);
    return () => window.clearInterval(poll);
  }, [isStaff, liveMonitor, loading, exam?.id, refreshLiveSessions]);

  // 1-second local tick so live countdown timers for in-progress students update smoothly
  useEffect(() => {
    if (!isStaff || !liveMonitor) return;
    const hasLive = sessions.some((s: any) => s.status === 'in_progress');
    if (!hasLive) return;
    const tick = window.setInterval(() => setNowTick(Date.now()), 1_000);
    return () => window.clearInterval(tick);
  }, [isStaff, liveMonitor, sessions]);

  const handleConfirmResetSession = async () => {
    if (!resetTarget?.id) return;
    setResettingSessionId(resetTarget.id);
    setMonitorNotice(null);
    try {
      const res = await fetch(`/api/cbt/sessions/${resetTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: resetReason.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Could not reset this student exam.');
      }
      const studentName = resetTarget.portal_users?.full_name || json?.data?.student_name || 'Student';
      setSessions((prev) => prev.filter((item) => item.id !== resetTarget.id));
      setResetTarget(null);
      setResetReason('');
      setMonitorNotice({
        type: 'success',
        text: `Reset exam for ${studentName}. They can now retake this exam fresh from Question 1.`,
      });
    } catch (err: any) {
      setMonitorNotice({
        type: 'error',
        text: err?.message || 'Could not reset this student exam.',
      });
    } finally {
      setResettingSessionId(null);
    }
  };

  const handleForceSubmitSession = async (targetSession: any) => {
    const studentName = targetSession?.portal_users?.full_name || 'this student';
    if (!confirm(`Finalize and grade ${studentName}'s live sitting right now using their saved answers?`)) return;
    setForcingSessionId(targetSession.id);
    setMonitorNotice(null);
    try {
      const res = await fetch(`/api/cbt/sessions/${targetSession.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'force_submit' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not finalize this exam sitting.');
      const updated = json?.data;
      setSessions((prev) =>
        prev.map((item) =>
          item.id === targetSession.id
            ? { ...item, ...updated, portal_users: item.portal_users }
            : item,
        ),
      );
      setMonitorNotice({
        type: 'success',
        text: `Finalized ${studentName}'s exam — ${updated?.status === 'pending_grading' ? 'Pending manual grading' : `Score: ${updated?.score ?? 0}%`}.`,
      });
    } catch (err: any) {
      setMonitorNotice({
        type: 'error',
        text: err?.message || 'Could not finalize this exam sitting.',
      });
    } finally {
      setForcingSessionId(null);
    }
  };

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
    <div className={`space-y-4 sm:space-y-6 ${MOBILE_PAGE_BOTTOM}`}>
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Link href={hostClassId ? `/dashboard/classes/${hostClassId}?operation=assessment` : `/dashboard/cbt`} className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeftIcon className="w-4 h-4" /> {hostClassId ? 'Back to Class Assessment' : 'Back to CBT'}
          </Link>
          {hostClassId && (
            <>
              <Link href="/dashboard/cbt" className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
                All CBT Assessments →
              </Link>
              {isStaff && (
                <>
                  <Link
                    href={`/dashboard/grades?class_id=${hostClassId}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground hover:border-primary/40 transition-colors"
                  >
                    Mark Class Work
                  </Link>
                  <Link
                    href={`/dashboard/reports/builder?class_id=${hostClassId}${exam?.course_id ? `&course_id=${exam.course_id}` : ''}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                  >
                    Result Builder
                  </Link>
                </>
              )}
            </>
          )}
        </div>

        {/* Exam Hero Card — 3 crisp vertical bands, responsive on iPhone, tablet & desktop */}
        <div className="relative overflow-hidden border border-border bg-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
          <div className="relative z-10 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 bg-brand-red-accent text-white text-[10px] font-black uppercase tracking-wider rounded-full">
                CBT Exam
              </span>
              {exam.programs?.name && (
                <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider min-w-0 truncate">
                  <AcademicCapIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{exam.programs.name}</span>
                </span>
              )}
              <span className={`ml-auto sm:ml-0 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold border ${exam.is_active ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-slate-200 text-slate-900 border-slate-300 dark:bg-muted dark:text-muted-foreground dark:border-border'}`}>
                {exam.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <h1 className="text-lg sm:text-2xl font-extrabold text-foreground leading-snug break-words">
              {exam.title}
            </h1>

            {exam.description && (
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                {exam.description}
              </p>
            )}
          </div>

          {isStaff && (
            <div
              ref={printMenuRef}
              className="relative z-10 pt-3.5 border-t border-border/70 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2"
            >
              {canManageExam && (
                <Link
                  href={`/dashboard/cbt/${exam.id}/edit`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black rounded-xl transition-colors shadow-sm whitespace-nowrap"
                >
                  <PencilIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>Edit Exam</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => handlePrintExam('student', 'all')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-black rounded-xl transition-colors shadow-sm whitespace-nowrap"
              >
                <PrinterIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Student PDF</span>
              </button>
              <button
                type="button"
                onClick={() => handlePrintExam('staff', 'all')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
              >
                <PrinterIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Teacher Key</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintMenuOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-2 bg-background hover:bg-muted border border-border text-foreground text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
              >
                <PrinterIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Print Options</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const link = `${window.location.origin}/dashboard/cbt/${exam.id}/take`;
                  void navigator.clipboard?.writeText(link);
                  setCopiedExamLink(true);
                  setTimeout(() => setCopiedExamLink(false), 2200);
                }}
                title="Copy direct student exam link"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-2 bg-background hover:bg-muted border border-border text-foreground text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
              >
                <ClipboardIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>{copiedExamLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
              {canManageExam && (
                <>
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
                    className={`w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-2 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap ${exam.is_active ? 'bg-amber-100 border-amber-300 text-amber-950 hover:bg-amber-200 dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-200' : 'bg-emerald-100 border-emerald-300 text-emerald-950 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-200'}`}
                  >
                    {exam.is_active ? <><LockClosedIcon className="w-3.5 h-3.5 shrink-0" /><span>Deactivate</span></> : <><LockOpenIcon className="w-3.5 h-3.5 shrink-0" /><span>Activate</span></>}
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
                    className="col-span-2 sm:col-span-1 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-[36px] px-3 py-2 bg-rose-100 hover:bg-rose-200 border border-rose-300 text-rose-900 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-300 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <TrashIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>Delete Exam</span>
                  </button>
                </>
              )}
            </div>
          )}

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
          {isStaff && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(() => {
                const submittedCount = sessions.filter((s: any) => ['completed', 'passed', 'failed', 'pending_grading'].includes(s.status)).length;
                const inProgressCount = sessions.filter((s: any) => s.status === 'in_progress').length;
                const pendingGradeCount = sessions.filter((s: any) => s.status === 'pending_grading' || s.needs_grading).length;
                const notStartedCount = Math.max(0, roster.length - sessions.length);
                const windowClosed = Boolean(exam.end_date && new Date(exam.end_date).getTime() < nowTick);
                return [
                  { label: 'Submitted', value: submittedCount, cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' },
                  { label: 'In Progress', value: inProgressCount, cls: 'border-primary/30 bg-primary/10 text-primary' },
                  { label: 'Needs Grading', value: pendingGradeCount, cls: pendingGradeCount > 0 ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'border-border bg-muted/40 text-muted-foreground' },
                  {
                    label: roster.length > 0 ? (windowClosed ? 'Absent' : 'Not Started') : 'Questions',
                    value: roster.length > 0 ? notStartedCount : questions.length,
                    cls: roster.length > 0 && windowClosed && notStartedCount > 0
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                      : 'border-border bg-muted/40 text-foreground',
                  },
                ].map((stat) => (
                  <div key={stat.label} className={`rounded-2xl border px-3 py-2.5 ${stat.cls}`}>
                    <p className="text-lg font-black leading-none">{stat.value}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider opacity-85">{stat.label}</p>
                  </div>
                ));
              })()}
            </div>
          )}
          {!isStaff && (!mySession || mySession.status === 'in_progress') && (() => {
            const now = Date.now();
            const startsAt = exam.start_date ? new Date(exam.start_date).getTime() : null;
            const endsAt = exam.end_date ? new Date(exam.end_date).getTime() : null;
            const isInProgress = mySession?.status === 'in_progress';
            const notYetOpen = !isInProgress && startsAt !== null && Number.isFinite(startsAt) && now < startsAt;
            const alreadyClosed = !isInProgress && endsAt !== null && Number.isFinite(endsAt) && now > endsAt;
            const inactive = !isInProgress && exam.is_active === false;

            if (inactive) {
              return (
                <div className="mt-4 rounded-xl border border-border bg-muted/50 px-4 py-3 text-xs font-bold text-muted-foreground">
                  This exam is not currently active. Your teacher will activate it when it is time to begin.
                </div>
              );
            }
            if (notYetOpen && startsAt) {
              return (
                <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs font-bold text-primary">
                  Scheduled — opens {new Date(startsAt).toLocaleString()}
                </div>
              );
            }
            if (alreadyClosed && endsAt) {
              return (
                <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-700 dark:text-rose-300">
                  Exam window closed on {new Date(endsAt).toLocaleString()}.
                </div>
              );
            }
            return (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link href={`/dashboard/cbt/${exam.id}/take`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm rounded-xl transition-all shadow-md">
                  {isInProgress ? 'Resume Exam →' : 'Start Exam →'}
                </Link>
                {isInProgress && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    Your saved answers are waiting — click Resume to continue before the timer ends.
                  </span>
                )}
              </div>
            );
          })()}
          {mySession && mySession.status !== 'in_progress' && (
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
          {!isStaff && mySession && mySession.status !== 'in_progress' && mySession.answers && questions.length > 0 && (
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
                      {isManual && (() => {
                        const parsedEssay = parseEssayAnswer(studentAnswer);
                        return (
                        <div className="pl-8 space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Your Answer</p>
                          <div className="px-3 py-2.5 border border-border bg-muted/40 rounded-xl text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                            {parsedEssay.text || (parsedEssay.attachments.length > 0 ? <span className="italic text-muted-foreground">Submitted as attached work below</span> : <span className="italic text-muted-foreground">No answer submitted</span>)}
                          </div>
                          {parsedEssay.attachments.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {parsedEssay.attachments.map((att) => (
                                <a
                                  key={att.url}
                                  href={att.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="group overflow-hidden rounded-xl border border-border bg-background hover:border-primary/50 transition-colors"
                                >
                                  {att.isImage ? (
                                    <img src={att.url} alt={att.name} className="aspect-[4/3] w-full object-cover" />
                                  ) : (
                                    <div className="flex aspect-[4/3] items-center justify-center p-2 text-center text-[11px] font-bold text-primary">
                                      {att.name}
                                    </div>
                                  )}
                                  <p className="truncate px-2 py-1 text-[10px] font-semibold text-muted-foreground">{att.name}</p>
                                </a>
                              ))}
                            </div>
                          )}
                          {q.correct_answer && (
                            <div className="px-3 py-2.5 border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl text-xs text-emerald-900 dark:text-emerald-200">
                              <span className="font-black uppercase tracking-wider text-[10px] block mb-0.5">Model Answer / Key Points</span>
                              {q.correct_answer}
                            </div>
                          )}
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-300">Awaiting manual review</p>
                        </div>
                        );
                      })()}
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

        {/* Staff: Real-Time Exam Monitor & Individual Exam Reset */}
        {isStaff && (sessions.length > 0 || roster.length > 0) && (() => {
          const totalQ = questions.length;
          const countAnswered = (ans: any) => {
            if (!ans || typeof ans !== 'object' || Array.isArray(ans)) return 0;
            return Object.values(ans).filter((v) => String(v ?? '').trim().length > 0).length;
          };
          const remainingSecondsFor = (startTime: string | null) => {
            if (!startTime || !exam?.duration_minutes) return null;
            const endMs = new Date(startTime).getTime() + Number(exam.duration_minutes) * 60_000;
            const examEndMs = exam.end_date ? new Date(exam.end_date).getTime() : Number.POSITIVE_INFINITY;
            return Math.max(0, Math.floor((Math.min(endMs, examEndMs) - nowTick) / 1000));
          };
          const formatRemaining = (secs: number | null) => {
            if (secs === null) return null;
            return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
          };

          const liveSessions = sessions.filter((s: any) => s.status === 'in_progress');
          const submittedSessions = sessions.filter((s: any) => s.status !== 'in_progress');
          const sessionUserIds = new Set(sessions.map((s: any) => s.user_id));
          const notStartedRoster = roster.filter((student) => !sessionUserIds.has(student.id));
          const windowClosed = Boolean(exam.end_date && new Date(exam.end_date).getTime() < nowTick);
          const windowNotOpenYet = Boolean(exam.start_date && new Date(exam.start_date).getTime() > nowTick);

          const totalExpected = Math.max(sessions.length, roster.length);
          const completionPct = totalExpected > 0 ? Math.round((submittedSessions.length / totalExpected) * 100) : 0;
          const gradedScores = submittedSessions
            .map((s: any) => Number(s.score))
            .filter((n: number) => Number.isFinite(n));
          const avgScore = gradedScores.length > 0
            ? Math.round(gradedScores.reduce((a: number, b: number) => a + b, 0) / gradedScores.length)
            : null;
          const passRate = submittedSessions.length > 0
            ? Math.round((submittedSessions.filter((s: any) => s.status === 'passed').length / submittedSessions.length) * 100)
            : null;

          const endingSoonCount = liveSessions.filter((s: any) => {
            const rem = remainingSecondsFor(s.start_time);
            return rem !== null && rem <= 300;
          }).length;
          const idleLiveCount = liveSessions.filter((s: any) => {
            const lastMs = s.updated_at ? new Date(s.updated_at).getTime() : (s.start_time ? new Date(s.start_time).getTime() : 0);
            return lastMs > 0 && nowTick - lastMs > 3 * 60_000;
          }).length;

          const searchNeedle = monitorSearch.trim().toLowerCase();
          const matchesSearch = (name?: string | null, email?: string | null) => {
            if (!searchNeedle) return true;
            return (name ?? '').toLowerCase().includes(searchNeedle) || (email ?? '').toLowerCase().includes(searchNeedle);
          };

          const baseSessions = (monitorFilter === 'live'
            ? liveSessions
            : monitorFilter === 'submitted'
              ? submittedSessions
              : monitorFilter === 'not_started'
                ? []
                : [...liveSessions, ...submittedSessions]
          ).filter((s: any) => matchesSearch(s.portal_users?.full_name, s.portal_users?.email));

          const visibleSessions = [...baseSessions].sort((a: any, b: any) => {
            if (monitorSort === 'name') {
              return String(a.portal_users?.full_name ?? '').localeCompare(String(b.portal_users?.full_name ?? ''));
            }
            if (monitorSort === 'score_desc') {
              return (Number(b.score ?? -1)) - (Number(a.score ?? -1));
            }
            if (monitorSort === 'score_asc') {
              return (Number(a.score ?? 999)) - (Number(b.score ?? 999));
            }
            if (monitorSort === 'progress') {
              return countAnswered(b.answers) - countAnswered(a.answers);
            }
            // 'live': live first (lowest remaining time first), then most recently submitted
            const aLive = a.status === 'in_progress' ? 0 : 1;
            const bLive = b.status === 'in_progress' ? 0 : 1;
            if (aLive !== bLive) return aLive - bLive;
            if (aLive === 0) {
              return (remainingSecondsFor(a.start_time) ?? 999999) - (remainingSecondsFor(b.start_time) ?? 999999);
            }
            return new Date(b.end_time ?? b.updated_at ?? 0).getTime() - new Date(a.end_time ?? a.updated_at ?? 0).getTime();
          });

          const filteredNotStarted = notStartedRoster.filter((student) => matchesSearch(student.full_name, student.email));

          const handleExportMonitorCsv = () => {
            const rows: string[][] = [
              ['Student Name', 'Email', 'Status', 'Answered', 'Total Questions', 'Score (%)', 'Started At', 'Submitted At'],
            ];
            for (const s of [...liveSessions, ...submittedSessions]) {
              rows.push([
                String(s.portal_users?.full_name ?? 'Student'),
                String(s.portal_users?.email ?? ''),
                String(s.status ?? ''),
                String(countAnswered(s.answers)),
                String(totalQ),
                s.score != null ? String(s.score) : '',
                s.start_time ? new Date(s.start_time).toISOString() : '',
                s.end_time ? new Date(s.end_time).toISOString() : '',
              ]);
            }
            for (const st of notStartedRoster) {
              rows.push([
                String(st.full_name ?? 'Student'),
                String(st.email ?? ''),
                windowClosed ? 'absent_missed_window' : 'not_started',
                '0',
                String(totalQ),
                '',
                '',
                '',
              ]);
            }
            const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(exam.title || 'cbt-monitor').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-monitor.csv`;
            a.click();
            URL.revokeObjectURL(url);
          };

          return (
            <div className="bg-card shadow-sm border border-border rounded-2xl overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-border space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setResultsOpen(v => !v)}
                    aria-expanded={resultsOpen}
                    className="flex items-center gap-2 text-left"
                  >
                    <ChartBarIcon className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                    <h2 className="font-black text-foreground">Live Exam Monitor &amp; Results</h2>
                    {liveSessions.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        {liveSessions.length} Live
                      </span>
                    )}
                    <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${resultsOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {lastSyncedAt && (
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        Synced {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setLiveMonitor((v) => !v)}
                      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black transition-colors ${
                        liveMonitor
                          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-border bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${liveMonitor ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50'}`} />
                      {liveMonitor ? 'Auto-Live (5s)' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshLiveSessions(true)}
                      disabled={refreshingSessions}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted px-3 py-1.5 text-[11px] font-bold text-foreground disabled:opacity-50"
                    >
                      <ArrowPathIcon className={`h-3.5 w-3.5 ${refreshingSessions ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>
                </div>

                {monitorNotice && (
                  <div className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                    monitorNotice.type === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  }`}>
                    <span>{monitorNotice.text}</span>
                    <button type="button" onClick={() => setMonitorNotice(null)} aria-label="Dismiss notice" className="p-0.5 opacity-70 hover:opacity-100">
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {resultsOpen && (
                  <div className="space-y-3">
                    {/* Class Completion & Live Telemetry Strip */}
                    <div className="rounded-xl border border-border bg-muted/25 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-black text-foreground">
                            Completion: {submittedSessions.length}/{totalExpected} ({completionPct}%)
                          </span>
                          {avgScore !== null && (
                            <span className="font-bold text-muted-foreground">
                              Avg: <strong className="text-foreground">{avgScore}%</strong>
                            </span>
                          )}
                          {passRate !== null && (
                            <span className="font-bold text-emerald-700 dark:text-emerald-300">
                              Pass Rate: {passRate}%
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {endingSoonCount > 0 && (
                            <span className="rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300">
                              {endingSoonCount} Ending &lt;5m
                            </span>
                          )}
                          {idleLiveCount > 0 && (
                            <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:text-amber-300">
                              {idleLiveCount} Idle &gt;3m
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-all duration-500"
                          style={{ width: `${completionPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Filter Tabs + Search + Sort + Export CSV */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {([
                          { key: 'all', label: `All (${sessions.length + notStartedRoster.length})` },
                          { key: 'live', label: `Live Now (${liveSessions.length})` },
                          { key: 'submitted', label: `Submitted (${submittedSessions.length})` },
                          ...(roster.length > 0 ? [{ key: 'not_started' as const, label: `${windowClosed ? 'Absent' : 'Not Started'} (${notStartedRoster.length})` }] : []),
                        ] as const).map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setMonitorFilter(tab.key)}
                            className={`rounded-xl px-3 py-1.5 text-[11px] font-black transition-colors ${
                              monitorFilter === tab.key
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="search"
                          aria-label="Search monitored students"
                          value={monitorSearch}
                          onChange={(e) => setMonitorSearch(e.target.value)}
                          placeholder="Search student…"
                          className="w-full sm:w-44 rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                        />
                        <select
                          aria-label="Sort monitored students"
                          value={monitorSort}
                          onChange={(e) => setMonitorSort(e.target.value as any)}
                          className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-foreground focus:outline-none focus:border-primary"
                        >
                          <option value="live">Sort: Live First</option>
                          <option value="progress">Sort: Most Answered</option>
                          <option value="score_desc">Sort: Highest Score</option>
                          <option value="score_asc">Sort: Lowest Score</option>
                          <option value="name">Sort: Name A–Z</option>
                        </select>
                        <button
                          type="button"
                          onClick={handleExportMonitorCsv}
                          className="rounded-xl border border-border bg-background hover:bg-muted px-3 py-1.5 text-xs font-bold text-foreground transition-colors"
                        >
                          Export CSV
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {resultsOpen && (
                <div className="divide-y divide-border">
                  {visibleSessions.map((s: any) => {
                    const isLive = s.status === 'in_progress';
                    const answeredCnt = countAnswered(s.answers);
                    const pct = totalQ > 0 ? Math.min(100, Math.round((answeredCnt / totalQ) * 100)) : 0;
                    const remSecs = isLive ? remainingSecondsFor(s.start_time) : null;
                    const remStr = formatRemaining(remSecs);
                    const isEndingSoon = isLive && remSecs !== null && remSecs <= 300;
                    const lastActivityMs = s.updated_at
                      ? new Date(s.updated_at).getTime()
                      : (s.start_time ? new Date(s.start_time).getTime() : 0);
                    const idleMins = isLive && lastActivityMs > 0
                      ? Math.floor((nowTick - lastActivityMs) / 60_000)
                      : 0;

                    return (
                      <div key={s.id} className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-foreground text-sm truncate">
                              {s.portal_users?.full_name ?? 'Student'}
                            </p>
                            {isLive ? (
                              <>
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Live Now
                                </span>
                                {isEndingSoon && (
                                  <span className="rounded-full border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-rose-700 dark:text-rose-300">
                                    Ending Soon
                                  </span>
                                )}
                                {idleMins >= 3 && (
                                  <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">
                                    Idle {idleMins}m
                                  </span>
                                )}
                              </>
                            ) : s.status === 'pending_grading' ? (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                                Pending Grading
                              </span>
                            ) : (
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${
                                s.status === 'passed'
                                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                                  : s.status === 'failed'
                                    ? 'bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300'
                                    : 'bg-muted border-border text-muted-foreground'
                              }`}>
                                {s.status === 'passed' ? 'Passed' : s.status === 'failed' ? 'Failed' : s.status}
                                {s.score != null ? ` · ${parsePaperMarkAnswers(s.answers) ? formatHostMark(parsePaperMarkAnswers(s.answers)) : `${s.score}%`}` : ''}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            {s.portal_users?.email && <span className="truncate">{s.portal_users.email}</span>}
                            {isLive && (
                              <>
                                <span className="font-bold text-foreground">
                                  {answeredCnt}/{totalQ || '?'} answered ({pct}%)
                                </span>
                                {remStr && (
                                  <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${isEndingSoon ? 'text-rose-600 dark:text-rose-400' : 'text-primary'}`}>
                                    <ClockIcon className="h-3.5 w-3.5" /> {remStr} left
                                  </span>
                                )}
                                {s.updated_at && (
                                  <span>Saved {new Date(s.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                )}
                              </>
                            )}
                            {!isLive && s.end_time && (
                              <span>Submitted {new Date(s.end_time).toLocaleString()}</span>
                            )}
                            {isPaperCaptureAnswers(s.answers) && <span>Hall mark</span>}
                          </div>

                          {isLive && totalQ > 0 && (
                            <div className="h-1.5 w-full max-w-xs rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {isLive ? (
                            <button
                              type="button"
                              onClick={() => void handleForceSubmitSession(s)}
                              disabled={forcingSessionId === s.id}
                              title="Finalize and grade this student's saved answers now"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 text-xs font-black text-amber-800 dark:text-amber-200 transition-colors disabled:opacity-50"
                            >
                              <CheckCircleIcon className="h-3.5 w-3.5" />
                              {forcingSessionId === s.id ? 'Finalizing…' : 'Force Submit'}
                            </button>
                          ) : (
                            <Link
                              href={`/dashboard/cbt/${exam.id}/sessions/${s.id}/grade`}
                              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                                s.status === 'pending_grading'
                                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm'
                                  : 'border border-border bg-background hover:bg-muted text-foreground'
                              }`}
                            >
                              <ChartBarIcon className="w-3.5 h-3.5" />
                              {s.status === 'pending_grading' ? 'Grade' : 'Review'}
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => { setResetTarget(s); setResetReason(''); }}
                            disabled={resettingSessionId === s.id}
                            title="Reset this student's exam so they can retake it fresh"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-2 text-xs font-black text-rose-700 dark:text-rose-300 transition-colors disabled:opacity-50"
                          >
                            <ArrowPathIcon className="h-3.5 w-3.5" />
                            Reset
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {(monitorFilter === 'all' || monitorFilter === 'not_started') && filteredNotStarted.map((student) => (
                    <div key={`ns-${student.id}`} className="px-4 sm:px-5 py-3 flex items-center justify-between gap-3 bg-muted/15">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{student.full_name ?? 'Student'}</p>
                        {student.email && <p className="text-[11px] text-muted-foreground truncate">{student.email}</p>}
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                        windowClosed
                          ? 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                          : windowNotOpenYet
                            ? 'border-primary/25 bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground'
                      }`}>
                        {windowClosed ? 'Absent · Missed Window' : windowNotOpenYet ? 'Scheduled' : 'Not Started'}
                      </span>
                    </div>
                  ))}

                  {visibleSessions.length === 0 && ((monitorFilter !== 'all' && monitorFilter !== 'not_started') || filteredNotStarted.length === 0) && (
                    <div className="px-5 py-8 text-center text-xs font-semibold text-muted-foreground">
                      {searchNeedle ? `No students matching "${monitorSearch}".` : 'No students in this view yet.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Reset Individual Student Exam Confirmation Modal */}
        {resetTarget && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => !resettingSessionId && setResetTarget(null)} />
            <div className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400">
                  <ExclamationTriangleIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-black text-foreground">Reset Individual Exam</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Resetting <span className="font-bold text-foreground">{resetTarget.portal_users?.full_name ?? 'this student'}</span>&apos;s sitting will clear their current answers and timer so they can retake <span className="font-semibold text-foreground">{exam.title}</span> fresh.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs flex items-center justify-between">
                <span className="text-muted-foreground font-semibold">Current status</span>
                <span className="font-black text-foreground uppercase">
                  {resetTarget.status === 'in_progress' ? 'In Progress (Live)' : `${resetTarget.status}${resetTarget.score != null ? ` · ${resetTarget.score}%` : ''}`}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1.5">
                  Reason for reset (optional, saved in audit log)
                </label>
                <input
                  type="text"
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="e.g. Network disconnect, browser crash, approved retake"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={Boolean(resettingSessionId)}
                  onClick={() => setResetTarget(null)}
                  className="rounded-xl border border-border bg-background hover:bg-muted px-4 py-2.5 text-xs font-bold text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={Boolean(resettingSessionId)}
                  onClick={() => void handleConfirmResetSession()}
                  className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2.5 text-xs font-black text-white shadow-sm disabled:opacity-50"
                >
                  {resettingSessionId ? 'Resetting…' : 'Confirm Reset Exam'}
                </button>
              </div>
            </div>
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
