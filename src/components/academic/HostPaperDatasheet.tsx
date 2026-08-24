'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon,
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
import { isPaperCaptureAnswers } from '@/lib/cbt/paper-capture';
import {
  SUGGESTED_HOST_PAPER_MAX,
  hostMaxFromExam,
  hostPaperLabel,
  markFromPercent,
  parsePaperMarkAnswers,
  pickHostPaperExamIds,
  type HostAssessmentKind,
} from '@/lib/academic/host-marks';
import { buildCbtNewHref, buildClassTeachingHref } from '@/lib/curriculum/href';

type StudentRow = { id: string; full_name: string | null };

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
  const [sessions, setSessions] = useState<any[]>([]);
  const [hallDraft, setHallDraft] = useState<Record<string, string>>({});
  const [paperOutOf, setPaperOutOf] = useState(String(SUGGESTED_HOST_PAPER_MAX[props.kind]));
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const questions = useMemo(
    () => [...(exam?.cbt_questions ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [exam],
  );
  const hallMax = Math.max(1, parseInt(paperOutOf, 10) || SUGGESTED_HOST_PAPER_MAX[props.kind]);
  const markedCount = roster.filter((row) => String(hallDraft[row.id] ?? '').trim() !== '').length;

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const [klassRes, rosterRes] = await Promise.all([
        db.from('classes').select('id,name,school_id,program_id,current_course_id,schools(name)').eq('id', props.classId).maybeSingle(),
        fetch(`/api/portal-users?role=student&scoped=true&class_id=${props.classId}`, { cache: 'no-store' }).then((r) => r.json()),
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
      const { data: examRows } = await examQuery;
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
          fetch(`/api/cbt/sessions?exam_id=${examId}`, { cache: 'no-store' }).then((r) => r.json()),
        ]);
        loadedExam = detail;
        loadedSessions = Array.isArray(sesRes.data) ? sesRes.data : [];
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

      const classRoster = (rosterRes.data ?? []) as StudentRow[];
      setRoster(classRoster);
      const draft: Record<string, string> = {};
      for (const student of classRoster) {
        const existing = loadedSessions.find((row: any) => row.user_id === student.id);
        const paper = parsePaperMarkAnswers(existing?.answers) || markFromPercent(existing?.score, paperMax);
        if (paper) draft[student.id] = String(paper.earned);
      }
      setHallDraft(draft);
    } catch (err: any) {
      setError(err.message || 'Could not load this paper');
    } finally {
      setLoading(false);
    }
  }, [props.classId, props.courseId, props.kind, props.programId, props.schoolId]);

  useEffect(() => {
    if (authLoading || !profile) return;
    void load();
  }, [authLoading, profile, load]);

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
      await load();
      return id;
    } finally {
      setPreparing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const examId = await ensureExam();
      const scores = roster
        .map((student) => ({
          user_id: student.id,
          earned: hallDraft[student.id],
          expected_version: sessions.find((row: any) => row.user_id === student.id)?.grading_version ?? null,
        }))
        .filter((row) => String(row.earned ?? '').trim() !== '')
        .map((row) => ({
          user_id: row.user_id,
          earned: Number(row.earned),
          max: hallMax,
          expected_version: row.expected_version,
        }));
      if (scores.length === 0) throw new Error('Enter at least one mark.');
      const res = await fetch('/api/cbt/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_paper', exam_id: examId, scores }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save marks');
      const savedCount = json.data?.saved?.length ?? 0;
      const skippedCount = json.data?.skipped?.length ?? 0;
      const failedCount = json.data?.failed?.length ?? 0;
      const warningText = Array.isArray(json.data?.warnings) ? json.data.warnings.join(' ') : '';
      setNotice(failedCount > 0
        ? `${savedCount} marks saved. ${failedCount} could not be saved and ${skippedCount} newer or protected marks were left untouched. The sheet has been refreshed; retry only the unsaved entries. ${warningText}`.trim()
        : skippedCount > 0
          ? `${savedCount} marks saved. ${skippedCount} changed elsewhere or belong to an online sitting and were left untouched; the refreshed sheet now shows the latest values. ${warningText}`.trim()
          : `${savedCount} marks saved. Write reads these same marks. ${warningText}`.trim());
      await load();
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

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 ${MOBILE_PAGE_BOTTOM}`}>
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="h-4 w-4" />
        {props.from === 'write' ? 'Back to Write' : 'Back to class'}
      </Link>

      <header className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">School paper</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">{paperName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[schoolName, className, courseName || programName].filter(Boolean).join(' · ') || 'This class'}
        </p>
        <p className="mt-3 text-sm text-foreground">
          See the paper, print it for the hall, then enter marks on this sheet. Write reads the same marks — one record.
        </p>
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
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">{notice}</div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-black">{paperName} paper</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {questions.length > 0
              ? `${questions.length} question${questions.length === 1 ? '' : 's'} · ${questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0) || hallMax} marks`
              : 'No questions on this paper yet. Generate it from weeks already taught, or print a blank and still enter hall marks below.'}
          </p>
        </div>
        {questions.length > 0 ? (
          <ol className="divide-y divide-border">
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
          <div className="px-5 py-8 text-sm text-muted-foreground">
            This is the {paperName} datasheet for the class. Generate the paper when taught weeks are ready. You can still enter marks now.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-5 py-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-black flex items-center gap-2">
                <UserGroupIcon className="h-5 w-5 text-primary" />
                {paperName} mark sheet
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {markedCount}/{roster.length} entered
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              Out of
              <input
                type="number"
                min={1}
                value={paperOutOf}
                onChange={(e) => setPaperOutOf(e.target.value)}
                className="h-11 w-20 rounded-xl border border-border bg-background px-2 text-right text-sm font-black text-foreground"
              />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Learner</th>
                <th className="px-4 py-3 w-40 text-right">Mark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roster.map((student, index) => {
                const existing = sessions.find((row: any) => row.user_id === student.id);
                const locked = existing && !isPaperCaptureAnswers(existing.answers);
                const current = props.studentId === student.id;
                return (
                  <tr key={student.id} className={current ? 'bg-primary/5' : undefined}>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{index + 1}</td>
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
                          disabled={locked || saving || preparing}
                          value={hallDraft[student.id] ?? ''}
                          onChange={(e) => setHallDraft((currentDraft) => ({ ...currentDraft, [student.id]: e.target.value }))}
                          // Forty identical boxes down a column: without the learner's
                          // name here a screen reader announces every one of them as
                          // "edit box", and there is no way to tell whose mark is whose.
                          aria-label={`${hostPaperLabel(props.kind)} mark for ${student.full_name || 'this learner'}, out of ${hallMax}`}
                          className="h-11 w-20 rounded-xl border border-border bg-background px-2 text-right text-sm font-black"
                        />
                        <span className="w-10 text-xs text-muted-foreground">/{hallMax}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {roster.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-sm text-muted-foreground">No learners on this class yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-xs text-muted-foreground">
            {exam?.id
              ? `${paperName} marks stay on this sheet. Write only reads them.`
              : 'Saving opens this paper for the class so Write can read the marks.'}
          </p>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || preparing || roster.length === 0}
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-xs font-black uppercase tracking-wider text-primary-foreground disabled:opacity-50"
          >
            {saving || preparing ? 'Saving…' : `Save ${paperName} marks`}
          </button>
        </div>
      </section>
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
