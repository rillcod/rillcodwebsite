'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  UserGroupIcon,
} from '@/lib/icons';
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import {
  buildCbtPrintHtml,
  isObjectiveQuestion,
  isTheoryQuestion,
  openCbtPrintWindow,
} from '@/lib/cbt/print-utils';
import { sessionAllowsPaperOverwrite } from '@/lib/cbt/paper-capture';
import {
  SUGGESTED_HOST_PAPER_MAX,
  hallMarkDraftError,
  hostMaxFromExam,
  hostPaperLabel,
  markFromPercent,
  parsePaperMarkAnswers,
  pickHostPaperExamIds,
  type HostAssessmentKind,
} from '@/lib/academic/host-marks';
import { buildCbtNewHref, buildClassTeachingHref, hostPaperDatasheetHref } from '@/lib/curriculum/href';

type StudentRow = { id: string; full_name: string | null };

type SessionRow = {
  id?: string;
  user_id: string;
  answers?: unknown;
  score?: number | null;
  grading_version?: number | null;
};

type RowFeedback = { tone: 'saved' | 'warning' | 'error'; message: string };

type ExamRow = {
  id: string;
  title?: string;
  description?: string | null;
  class_id?: string | null;
  course_id?: string | null;
  program_id?: string | null;
  school_id?: string | null;
  is_active?: boolean;
  duration_minutes?: number | null;
  passing_score?: number | null;
  metadata?: Record<string, unknown> | null;
  programs?: { name?: string | null } | null;
  courses?: { title?: string | null } | null;
  cbt_questions?: Array<{
    id: string;
    question_text: string;
    question_type?: string;
    options?: unknown;
    correct_answer?: string;
    points?: number;
    order_index?: number;
  }>;
};

export function HostPaperDatasheet(props: {
  classId: string;
  kind: HostAssessmentKind;
  courseId?: string | null;
  programId?: string | null;
  schoolId?: string | null;
  studentId?: string | null;
  from?: string | null;
}) {
  const { profile, loading: authLoading } = useAuth();
  const paperName = hostPaperLabel(props.kind);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [className, setClassName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [programName, setProgramName] = useState('');
  const [courseId, setCourseId] = useState(props.courseId || '');
  const [programId, setProgramId] = useState(props.programId || '');
  const [schoolId, setSchoolId] = useState(props.schoolId || '');
  const [exam, setExam] = useState<ExamRow | null>(null);
  const [roster, setRoster] = useState<StudentRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [hallDraft, setHallDraft] = useState<Record<string, string>>({});
  const [baselineDraft, setBaselineDraft] = useState<Record<string, string>>({});
  const [paperOutOf, setPaperOutOf] = useState(String(SUGGESTED_HOST_PAPER_MAX[props.kind]));
  const [baselineMax, setBaselineMax] = useState(SUGGESTED_HOST_PAPER_MAX[props.kind]);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'success' | 'warning'>('success');
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
  const [learnerSearch, setLearnerSearch] = useState('');
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  const questions = useMemo(
    () => [...(exam?.cbt_questions ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [exam],
  );
  const parsedPaperMax = Number(paperOutOf);
  const paperMaxError = !Number.isInteger(parsedPaperMax) || parsedPaperMax < 1 || parsedPaperMax > 1000
    ? 'Use a whole-number paper total from 1 to 1000.'
    : null;
  const hallMax = paperMaxError ? SUGGESTED_HOST_PAPER_MAX[props.kind] : parsedPaperMax;
  const markedCount = roster.filter((row) => String(hallDraft[row.id] ?? '').trim() !== '').length;
  const invalidRows = useMemo(() => roster
    .map((student) => ({ student, error: hallMarkDraftError(hallDraft[student.id], paperMaxError ? null : hallMax) }))
    .filter((row): row is { student: StudentRow; error: string } => !!row.error), [hallDraft, hallMax, paperMaxError, roster]);
  const clearedRows = useMemo(() => roster.filter((student) =>
    String(baselineDraft[student.id] ?? '').trim() !== ''
    && String(hallDraft[student.id] ?? '').trim() === ''), [baselineDraft, hallDraft, roster]);
  const paperTotalChanged = hallMax !== baselineMax;
  const dirtyStudentIds = useMemo(() => new Set(roster
    .filter((student) => {
      const next = String(hallDraft[student.id] ?? '').trim();
      const previous = String(baselineDraft[student.id] ?? '').trim();
      return next !== '' && (next !== previous || paperTotalChanged);
    })
    .map((student) => student.id)), [baselineDraft, hallDraft, paperTotalChanged, roster]);
  const visibleRoster = useMemo(() => {
    const query = learnerSearch.trim().toLowerCase();
    return roster.filter((student) => {
      if (query && !String(student.full_name ?? '').toLowerCase().includes(query)) return false;
      return !outstandingOnly || String(hallDraft[student.id] ?? '').trim() === '';
    });
  }, [hallDraft, learnerSearch, outstandingOnly, roster]);
  const hasUnsavedChanges = dirtyStudentIds.size > 0 || clearedRows.length > 0;

  const backHref =
    props.from === 'write'
      ? '/dashboard/reports/builder'
      : buildClassTeachingHref({ classId: props.classId, courseId: courseId || props.courseId });

  const generateHref = buildCbtNewHref({
    classId: props.classId,
    courseId: courseId || props.courseId,
    programId: programId || props.programId,
    schoolId: schoolId || props.schoolId,
    hostAssessment: props.kind,
    title: paperName,
    examType: props.kind === 'examination' ? 'examination' : 'evaluation',
    sit: 'print',
  });

  const load = useCallback(async (options?: {
    background?: boolean;
    preserveDraft?: Record<string, string>;
    preserveStudentIds?: Set<string>;
  }) => {
    if (!options?.background) setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const [klassRes, rosterRes] = await Promise.all([
        db.from('classes').select('id,name,school_id,program_id,current_course_id,schools(name)').eq('id', props.classId).maybeSingle(),
        fetch(`/api/portal-users?role=student&scoped=true&class_id=${props.classId}`, { cache: 'no-store' }).then(async (r) => {
          const json = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(json.error || 'The class roster could not be loaded');
          return json;
        }),
      ]);
      if (klassRes.error) throw new Error(klassRes.error.message);
      const klass = klassRes.data as any;
      if (!klass) throw new Error('Class not found');
      setClassName(klass.name || '');
      setSchoolName(klass.schools?.name || '');
      setSchoolId(klass.school_id || props.schoolId || '');
      setProgramId(klass.program_id || props.programId || '');
      const nextCourseId = props.courseId || klass.current_course_id || '';
      setCourseId(nextCourseId);

      let examQuery = db.from('cbt_exams').select('id,title,metadata,class_id,course_id,created_at');
      examQuery = nextCourseId
        ? examQuery.or(`class_id.eq.${props.classId},course_id.eq.${nextCourseId}`)
        : examQuery.eq('class_id', props.classId);
      const { data: examRows, error: examListError } = await examQuery;
      if (examListError) throw new Error(examListError.message);
      const scoped = ((examRows ?? []) as ExamRow[]).filter((row) => {
        const examClass = String(row.class_id || (row.metadata as any)?.target_class_id || '');
        return !examClass || examClass === props.classId;
      });
      const picked = pickHostPaperExamIds(scoped, {
        classId: props.classId,
        courseId: nextCourseId || null,
      });
      const examId = picked[props.kind];
      let loadedExam: ExamRow | null = null;
      let loadedSessions: any[] = [];
      if (examId) {
        const [detail, sesRes] = await Promise.all([
          fetch(`/api/cbt/exams/${examId}`, { cache: 'no-store' }).then(async (r) => {
            const json = await r.json();
            if (!r.ok) throw new Error(json.error || 'Paper not available');
            return json.data as ExamRow;
          }),
          fetch(`/api/cbt/sessions?exam_id=${examId}`, { cache: 'no-store' }).then(async (r) => {
            const json = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(json.error || `${paperName} marks could not be loaded`);
            return json;
          }),
        ]);
        loadedExam = detail;
        loadedSessions = Array.isArray(sesRes.data) ? sesRes.data as SessionRow[] : [];
      }
      setExam(loadedExam);
      setSessions(loadedSessions);
      setCourseName(loadedExam?.courses?.title || '');
      setProgramName(loadedExam?.programs?.name || '');
      const paperMax = hostMaxFromExam({
        metadata: loadedExam?.metadata,
        cbt_questions: loadedExam?.cbt_questions,
      }) || SUGGESTED_HOST_PAPER_MAX[props.kind];
      setPaperOutOf(String(paperMax));
      setBaselineMax(paperMax);

      const classRoster = (rosterRes.data ?? []) as StudentRow[];
      setRoster(classRoster);
      const draft: Record<string, string> = {};
      for (const student of classRoster) {
        const existing = loadedSessions.find((row) => row.user_id === student.id);
        const paper = parsePaperMarkAnswers(existing?.answers) || markFromPercent(existing?.score, paperMax);
        if (paper) draft[student.id] = String(paper.earned);
      }
      const displayDraft = { ...draft };
      for (const studentId of options?.preserveStudentIds ?? []) {
        if (options?.preserveDraft && studentId in options.preserveDraft) {
          displayDraft[studentId] = options.preserveDraft[studentId];
        }
      }
      setBaselineDraft(draft);
      setHallDraft(displayDraft);
    } catch (err: any) {
      setError(err.message || 'Could not load this paper');
    } finally {
      if (!options?.background) setLoading(false);
    }
  }, [paperName, props.classId, props.courseId, props.kind, props.programId, props.schoolId]);

  useEffect(() => {
    if (authLoading || !profile) return;
    void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  const ensureExam = async () => {
    if (exam?.id) return exam.id;
    setPreparing(true);
    try {
      const res = await fetch('/api/cbt/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${courseName || 'Coding'} — ${paperName}`,
          description: `${paperName} for ${className}`.trim(),
          class_id: props.classId,
          course_id: courseId || props.courseId || null,
          program_id: programId || props.programId || null,
          school_id: schoolId || props.schoolId || null,
          is_active: false,
          exam_type: props.kind === 'examination' ? 'examination' : 'evaluation',
          metadata: {
            host_assessment: props.kind,
            host_max: hallMax,
            sit: 'print',
            generated_from: 'taught_weeks',
            target_class_id: props.classId,
            visibility: 'class',
          },
          questions: [],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not open this paper');
      const id = json.data?.id as string;
      if (!id) throw new Error('Paper was not created');
      // Keep the teacher's unsaved entries in place. Reloading here used to
      // wipe the sheet immediately after opening its backing paper record.
      setExam((current) => ({ ...(current ?? {}), ...(json.data ?? {}), id }));
      return id;
    } finally {
      setPreparing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    setRowFeedback({});
    try {
      if (paperMaxError) throw new Error(paperMaxError);
      if (invalidRows.length > 0) {
        const names = invalidRows.slice(0, 3).map((row) => row.student.full_name || 'Learner').join(', ');
        throw new Error(`Correct the highlighted ${paperName} mark${invalidRows.length === 1 ? '' : 's'} for ${names}${invalidRows.length > 3 ? ` and ${invalidRows.length - 3} more` : ''}. No marks were changed.`);
      }
      if (clearedRows.length > 0) {
        const names = clearedRows.slice(0, 3).map((row) => row.full_name || 'Learner').join(', ');
        throw new Error(`A saved mark was left blank for ${names}${clearedRows.length > 3 ? ` and ${clearedRows.length - 3} more` : ''}. Enter the corrected mark; blank fields do not delete recorded scores.`);
      }
      if (dirtyStudentIds.size === 0) {
        setNoticeTone('success');
        setNotice(`All entered ${paperName} marks are already saved.`);
        return;
      }
      const draftAtSave = { ...hallDraft };
      const examId = await ensureExam();
      const scores = roster
        .filter((student) => dirtyStudentIds.has(student.id))
        .map((student) => ({
          user_id: student.id,
          earned: draftAtSave[student.id],
          expected_version: sessions.find((row) => row.user_id === student.id)?.grading_version ?? null,
        }))
        .filter((row) => String(row.earned ?? '').trim() !== '')
        .map((row) => ({
          user_id: row.user_id,
          earned: Number(row.earned),
          max: hallMax,
          expected_version: row.expected_version,
      }));
      if (scores.length === 0) throw new Error('Enter at least one mark.');
      const outcome: {
        saved: Array<{ user_id: string }>;
        skipped: Array<{ user_id: string; reason?: string }>;
        failed: Array<{ user_id: string; reason?: string }>;
        warnings: string[];
      } = { saved: [], skipped: [], failed: [], warnings: [] };
      // The API deliberately caps one mutation at 80 learners. Large classes
      // are split here while keeping one visible outcome per learner.
      for (let offset = 0; offset < scores.length; offset += 80) {
        const batch = scores.slice(offset, offset + 80);
        try {
          const res = await fetch('/api/cbt/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'record_paper',
              exam_id: examId,
              paper_kind: props.kind,
              paper_max: hallMax,
              scores: batch,
            }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            const reason = payload.error || 'This batch could not be saved; retry these learners.';
            outcome.failed.push(...batch.map((row) => ({ user_id: row.user_id, reason })));
            continue;
          }
          outcome.saved.push(...(payload.data?.saved ?? []));
          outcome.skipped.push(...(payload.data?.skipped ?? []));
          outcome.failed.push(...(payload.data?.failed ?? []));
          outcome.warnings.push(...(payload.data?.warnings ?? []));
        } catch {
          outcome.failed.push(...batch.map((row) => ({
            user_id: row.user_id,
            reason: 'The connection was interrupted. This mark was kept on screen; retry it.',
          })));
        }
      }
      const json = { data: outcome };
      const savedCount = json.data?.saved?.length ?? 0;
      const skippedCount = json.data?.skipped?.length ?? 0;
      const failedCount = json.data?.failed?.length ?? 0;
      const warningText = Array.isArray(json.data?.warnings) ? json.data.warnings.join(' ') : '';
      setNoticeTone(failedCount > 0 || skippedCount > 0 || !!warningText ? 'warning' : 'success');
      const nextFeedback: Record<string, RowFeedback> = {};
      for (const row of json.data?.saved ?? []) {
        nextFeedback[row.user_id] = { tone: 'saved', message: 'Saved' };
      }
      for (const row of json.data?.skipped ?? []) {
        nextFeedback[row.user_id] = { tone: 'warning', message: row.reason || 'Refresh and review this mark' };
      }
      for (const row of json.data?.failed ?? []) {
        nextFeedback[row.user_id] = { tone: 'error', message: row.reason || 'Not saved; retry this mark' };
      }
      setRowFeedback(nextFeedback);
      setNotice(failedCount > 0
        ? `${savedCount} marks saved. ${failedCount} could not be saved and ${skippedCount} newer or protected marks were left untouched. The sheet has been refreshed; retry only the unsaved entries. ${warningText}`.trim()
        : skippedCount > 0
          ? `${savedCount} marks saved. ${skippedCount} changed elsewhere or belong to an online sitting and were left untouched; the refreshed sheet now shows the latest values. ${warningText}`.trim()
          : `${savedCount} marks saved. Write reads these same marks. ${warningText}`.trim());
      const failedIds = new Set<string>((json.data?.failed ?? []).map((row: { user_id: string }) => row.user_id));
      await load({
        background: true,
        preserveDraft: draftAtSave,
        preserveStudentIds: failedIds,
      });
    } catch (err: any) {
      setError(err.message || 'Could not save marks');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintPaper = (mode: 'student' | 'staff') => {
    if (questions.length === 0) {
      setError('Generate the paper first, then print it.');
      return;
    }
    openCbtPrintWindow(buildCbtPrintHtml({
      title: exam?.title || paperName,
      schoolName: schoolName || profile?.school_name || 'RILLCOD TECHNOLOGIES',
      subtitle: [className, courseName || exam?.courses?.title].filter(Boolean).join(' · ') || undefined,
      description: exam?.description?.trim() || undefined,
      durationMinutes: exam?.duration_minutes || 60,
      passingScore: exam?.passing_score ?? 70,
      dateStr: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
      docRef: `${paperName.replace(/\s+/g, '-').toUpperCase()}-${props.classId.slice(0, 8)}`,
      logoUrl: `${window.location.origin}/logo.png`,
      mcqQuestions: questions.filter((q) => isObjectiveQuestion(q)),
      theoryQuestions: questions.filter((q) => isTheoryQuestion(q)),
      mode,
      examTypeLabel: paperName.toUpperCase(),
    }));
  };

  const handlePrintSheet = () => {
    const rows = roster.map((student, index) => {
      const earned = String(hallDraft[student.id] ?? '').trim();
      return `<tr><td>${index + 1}</td><td>${escapeHtml(student.full_name || 'Student')}</td><td>${earned || ''}</td><td>${hallMax}</td></tr>`;
    }).join('');
    const html = `<!doctype html><html><head><title>${paperName} mark sheet</title>
      <style>
        body{font-family:Georgia,serif;padding:18mm;color:#111}
        h1{font-size:20px;margin:0 0 4px}
        p{margin:0 0 12px;color:#444;font-size:13px}
        table{width:100%;border-collapse:collapse}
        th,td{border:1px solid #111;padding:6px 8px;font-size:13px}
        th{text-align:left;background:#f3f4f6}
        td:first-child,td:nth-child(3),td:nth-child(4){text-align:right;width:64px}
        @page{size:A4;margin:14mm}
      </style></head><body>
      <h1>${escapeHtml(paperName)} mark sheet</h1>
      <p>${escapeHtml([schoolName, className, courseName].filter(Boolean).join(' · '))}</p>
      <table><thead><tr><th>#</th><th>Learner</th><th>Mark</th><th>Out of</th></tr></thead>
      <tbody>${rows}</tbody></table>
      </body></html>`;
    const popup = window.open('', '_blank');
    if (!popup) {
      setError('Allow pop-ups to print the mark sheet.');
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const updateHallDraft = (studentId: string, value: string) => {
    setHallDraft((currentDraft) => ({ ...currentDraft, [studentId]: value }));
    setRowFeedback((current) => {
      if (!(studentId in current)) return current;
      const next = { ...current };
      delete next[studentId];
      return next;
    });
    setNotice(null);
  };

  const guardNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!hasUnsavedChanges) return;
    const unsavedCount = dirtyStudentIds.size + clearedRows.length;
    if (!window.confirm(`Leave this ${paperName} sheet? ${unsavedCount} unsaved change${unsavedCount === 1 ? '' : 's'} will be lost.`)) {
      event.preventDefault();
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 ${MOBILE_PAGE_BOTTOM}`}>
      <Link href={backHref} onClick={guardNavigation} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="h-4 w-4" />
        {props.from === 'write' ? 'Back to Write' : 'Back to class'}
      </Link>

      <header className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">Official school result · mark entry</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">{paperName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[schoolName, className, courseName || programName].filter(Boolean).join(' · ') || 'This class'}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-foreground">
          Enter every learner&apos;s <strong>{paperName}</strong> score below. Only changed rows are saved. The student, parent and PDF report read this same record.
        </p>
        <nav aria-label="School paper mark sheets" className="mt-4 grid grid-cols-3 gap-2">
          {(['first_test', 'second_test', 'examination'] as HostAssessmentKind[]).map((kind) => {
            const active = kind === props.kind;
            return (
              <Link
                key={kind}
                href={hostPaperDatasheetHref({
                  kind,
                  classId: props.classId,
                  courseId: courseId || props.courseId,
                  programId: programId || props.programId,
                  schoolId: schoolId || props.schoolId,
                  from: props.from,
                })}
                aria-current={active ? 'page' : undefined}
                onClick={guardNavigation}
                className={`flex min-h-12 items-center justify-center rounded-xl border px-2 text-center text-xs font-black transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background text-foreground hover:border-primary/40'
                }`}
              >
                {hostPaperLabel(kind)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handlePrintPaper('student')}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-black uppercase tracking-wider"
          >
            <PrinterIcon className="h-4 w-4" /> Print paper
          </button>
          <button
            type="button"
            onClick={handlePrintSheet}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-black uppercase tracking-wider"
          >
            <PrinterIcon className="h-4 w-4" /> Print mark sheet
          </button>
          <Link
            href={generateHref}
            onClick={guardNavigation}
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-3 text-xs font-black uppercase tracking-wider text-primary-foreground"
          >
            {questions.length > 0 ? 'Refresh paper' : 'Generate paper'}
          </Link>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>
      ) : null}
      {notice ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          noticeTone === 'warning'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
        }`}>{notice}</div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-5 py-4 space-y-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-black flex items-center gap-2">
                <UserGroupIcon className="h-5 w-5 text-primary" />
                {paperName} mark sheet
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {markedCount} of {roster.length} learners entered
                {dirtyStudentIds.size > 0 ? ` · ${dirtyStudentIds.size} unsaved` : ' · all changes saved'}
              </p>
            </div>
            <div>
              <label htmlFor="school-paper-total" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                {paperName} total
                <input
                  id="school-paper-total"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  step={1}
                  value={paperOutOf}
                  onChange={(e) => { setPaperOutOf(e.target.value); setNotice(null); }}
                  aria-invalid={!!paperMaxError}
                  aria-describedby={paperMaxError ? 'school-paper-total-error' : undefined}
                  className={`h-11 w-24 rounded-xl border bg-background px-2 text-right text-sm font-black text-foreground ${paperMaxError ? 'border-rose-500' : 'border-border'}`}
                />
              </label>
              {paperMaxError ? <p id="school-paper-total-error" className="mt-1 max-w-52 text-right text-[11px] text-rose-600 dark:text-rose-400">{paperMaxError}</p> : null}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${roster.length ? Math.round((markedCount / roster.length) * 100) : 0}%` }} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Find a learner</span>
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={learnerSearch}
                onChange={(event) => setLearnerSearch(event.target.value)}
                placeholder="Find learner by name"
                className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
            <button
              type="button"
              aria-pressed={outstandingOnly}
              onClick={() => setOutstandingOnly((current) => !current)}
              className={`min-h-11 rounded-xl border px-3 text-xs font-black ${outstandingOnly ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-foreground'}`}
            >
              {outstandingOnly ? 'Showing missing marks' : `Missing marks (${roster.length - markedCount})`}
            </button>
          </div>
          {invalidRows.length > 0 || clearedRows.length > 0 ? (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-700 dark:text-rose-300">
              {invalidRows.length > 0 ? `${invalidRows.length} mark${invalidRows.length === 1 ? '' : 's'} need correction. ` : ''}
              {clearedRows.length > 0 ? `${clearedRows.length} saved mark${clearedRows.length === 1 ? ' is' : 's are'} blank; type the corrected score instead.` : ''}
              {' '}Nothing will save until these rows are resolved.
            </div>
          ) : null}
        </div>

        <div className="divide-y divide-border sm:hidden">
          {visibleRoster.map((student) => {
            const existing = sessions.find((row) => row.user_id === student.id);
            const locked = !!existing && !sessionAllowsPaperOverwrite(existing);
            const current = props.studentId === student.id;
            const inputError = hallMarkDraftError(hallDraft[student.id], paperMaxError ? null : hallMax);
            const cleared = String(baselineDraft[student.id] ?? '').trim() !== '' && String(hallDraft[student.id] ?? '').trim() === '';
            const feedback = rowFeedback[student.id];
            return (
              <div key={student.id} className={`p-4 ${current ? 'bg-primary/5' : ''}`}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground">{student.full_name || 'Student'}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{paperName} · out of {hallMax}</p>
                  </div>
                  {current ? <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary">Selected learner</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={hallMax}
                    step={1}
                    disabled={locked || saving || preparing}
                    value={hallDraft[student.id] ?? ''}
                    onChange={(event) => updateHallDraft(student.id, event.target.value)}
                    aria-label={`${paperName} mark for ${student.full_name || 'this learner'}, out of ${hallMax}`}
                    aria-invalid={!!inputError || cleared}
                    className={`h-12 min-w-0 flex-1 rounded-xl border bg-background px-3 text-right text-lg font-black ${inputError || cleared ? 'border-rose-500' : dirtyStudentIds.has(student.id) ? 'border-primary' : 'border-border'}`}
                  />
                  <span className="w-14 text-sm font-bold text-muted-foreground">/ {hallMax}</span>
                </div>
                {locked ? <p className="mt-2 text-xs text-muted-foreground">Online CBT sitting recorded; review it in CBT grading.</p> : null}
                {inputError || cleared ? <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{inputError || 'Enter a corrected score; blank does not delete a saved mark.'}</p> : null}
                {feedback ? <p className={`mt-2 text-xs font-semibold ${feedback.tone === 'saved' ? 'text-emerald-600 dark:text-emerald-400' : feedback.tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-600 dark:text-rose-400'}`}>{feedback.message}</p> : null}
                {!feedback && dirtyStudentIds.has(student.id) && !inputError ? <p className="mt-2 text-xs font-semibold text-primary">Unsaved change</p> : null}
              </div>
            );
          })}
          {visibleRoster.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">No learners match this view.</p> : null}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Learner</th>
                <th className="px-4 py-3 w-40 text-right">Mark</th>
                <th className="px-4 py-3 w-48">Save status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRoster.map((student) => {
                const existing = sessions.find((row) => row.user_id === student.id);
                const locked = !!existing && !sessionAllowsPaperOverwrite(existing);
                const current = props.studentId === student.id;
                const inputError = hallMarkDraftError(hallDraft[student.id], paperMaxError ? null : hallMax);
                const cleared = String(baselineDraft[student.id] ?? '').trim() !== '' && String(hallDraft[student.id] ?? '').trim() === '';
                const feedback = rowFeedback[student.id];
                return (
                  <tr key={student.id} className={current ? 'bg-primary/5' : undefined}>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{roster.findIndex((row) => row.id === student.id) + 1}</td>
                    <td className="px-4 py-3 font-semibold">
                      {student.full_name || 'Student'}
                      {current ? <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-primary">This learner</span> : null}
                      {locked ? <p className="text-[11px] font-normal text-muted-foreground">CBT sitting already recorded</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <input
                          type="number"
                          min={0}
                          max={hallMax}
                          step={1}
                          disabled={locked || saving || preparing}
                          value={hallDraft[student.id] ?? ''}
                          onChange={(e) => updateHallDraft(student.id, e.target.value)}
                          // Forty identical boxes down a column: without the learner's
                          // name here a screen reader announces every one of them as
                          // "edit box", and there is no way to tell whose mark is whose.
                          aria-label={`${hostPaperLabel(props.kind)} mark for ${student.full_name || 'this learner'}, out of ${hallMax}`}
                          aria-invalid={!!inputError || cleared}
                          className={`h-11 w-20 rounded-xl border bg-background px-2 text-right text-sm font-black ${inputError || cleared ? 'border-rose-500' : dirtyStudentIds.has(student.id) ? 'border-primary' : 'border-border'}`}
                        />
                        <span className="w-10 text-xs text-muted-foreground">/{hallMax}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {locked ? <span className="text-muted-foreground">Online CBT score</span>
                        : inputError || cleared ? <span className="font-semibold text-rose-600 dark:text-rose-400">{inputError || 'Enter the corrected mark'}</span>
                          : feedback ? <span className={feedback.tone === 'saved' ? 'font-semibold text-emerald-600 dark:text-emerald-400' : feedback.tone === 'warning' ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-semibold text-rose-600 dark:text-rose-400'}>{feedback.message}</span>
                            : dirtyStudentIds.has(student.id) ? <span className="font-semibold text-primary">Unsaved change</span>
                              : String(hallDraft[student.id] ?? '').trim() !== '' ? <span className="text-emerald-600 dark:text-emerald-400">Saved</span>
                                : <span className="text-muted-foreground">Not entered</span>}
                    </td>
                  </tr>
                );
              })}
              {visibleRoster.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-sm text-muted-foreground">{roster.length === 0 ? 'No learners on this class yet.' : 'No learners match this view.'}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-2 z-20 flex flex-col gap-3 border-t border-border bg-card/95 px-5 py-4 shadow-[0_-12px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            {exam?.id
              ? dirtyStudentIds.size > 0
                ? `${dirtyStudentIds.size} changed ${paperName} mark${dirtyStudentIds.size === 1 ? '' : 's'} will be saved. Unchanged scores stay untouched.`
                : `${paperName} is up to date. Student, parent and PDF views read these scores.`
              : `The first save creates this ${paperName} record without losing what you typed.`}
          </p>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || preparing || roster.length === 0 || dirtyStudentIds.size === 0 || invalidRows.length > 0 || clearedRows.length > 0 || !!paperMaxError}
            className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-primary px-5 text-xs font-black uppercase tracking-wider text-primary-foreground disabled:opacity-50"
          >
            {saving || preparing ? 'Saving safely…' : dirtyStudentIds.size > 0 ? `Save ${dirtyStudentIds.size} changed mark${dirtyStudentIds.size === 1 ? '' : 's'}` : 'All changes saved'}
          </button>
        </div>
      </section>

      <details className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="font-black">View {paperName} questions</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {questions.length > 0
                ? `${questions.length} question${questions.length === 1 ? '' : 's'} · ${questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0) || hallMax} marks`
                : 'No questions yet. Generate the paper when the taught weeks are ready.'}
            </p>
          </div>
          <span className="shrink-0 text-xs font-black text-primary">Open preview</span>
        </summary>
        {questions.length > 0 ? (
          <ol className="divide-y divide-border border-t border-border">
            {questions.map((question, index) => (
              <li key={question.id || index} className="px-5 py-4">
                <div className="flex gap-3">
                  <span className="w-6 shrink-0 text-sm font-black text-muted-foreground">{index + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <CbtMarkdown text={question.question_text} className="text-sm text-foreground" />
                    {Array.isArray(question.options) && question.options.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {question.options.map((option: any, optionIndex: number) => (
                          <p key={optionIndex} className="text-sm text-muted-foreground">
                            {String.fromCharCode(65 + optionIndex)}. {typeof option === 'string' ? option : String(option?.text ?? option ?? '')}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">{question.points || 0} marks</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="border-t border-border px-5 py-8 text-sm text-muted-foreground">
            No {paperName} questions have been prepared yet. The recorded marks remain available above.
          </div>
        )}
      </details>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
