// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  AcademicCapIcon, ArrowLeftIcon, PlusIcon, PencilIcon, TrashIcon,
  CheckCircleIcon, XMarkIcon, ClockIcon, ChartBarIcon, ArrowPathIcon,
  CheckBadgeIcon, DocumentTextIcon, ArrowsUpDownIcon, LockOpenIcon, LockClosedIcon,
  ChevronDownIcon, ChevronUpIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import { buildWrittenPaperHtml, openWrittenPaperPrint, type WrittenPaperCopy } from '@/lib/exams/written-paper-print';
import QuestionAuthoringStudio, { type StudioGeneratedQuestion } from '@/components/cbt/QuestionAuthoringStudio';

interface Exam {
  id: string;
  title: string;
  description: string | null;
  class_id?: string | null;
  course_id?: string | null;
  program_id?: string | null;
  duration_minutes: number | null;
  total_points: number;
  passing_score: number;
  max_attempts: number;
  is_active: boolean;
  randomize_questions: boolean;
  randomize_options: boolean;
  courses?: { id: string; title: string; program_id?: string | null };
}

interface Question {
  id: string;
  question_text: string;
  question_type: string;
  points: number;
  order_index: number;
  options: string[] | null;
  correct_answer: any;
  explanation: string | null;
}

interface ExamAttempt {
  id: string;
  status: string | null;
  score: number | null;
  total_points: number | null;
  percentage: number | null;
  submitted_at: string | null;
  tab_switches: number | null;
  grading_version?: number | null;
  moderation_status?: 'unreviewed' | 'reviewed' | 'approved' | 'returned' | null;
  student?: { full_name: string | null; email: string | null } | null;
}

const Q_TYPES = ['multiple_choice', 'true_false', 'short_answer', 'essay', 'fill_in_blank'];

function QuestionTypeTag({ type }: { type: string }) {
  const colors: Record<string, string> = {
    multiple_choice: 'bg-primary/20 text-primary',
    true_false: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    short_answer: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
    essay: 'bg-primary/20 text-primary',
    fill_in_blank: 'bg-primary/20 text-primary',
    matching: 'bg-pink-500/20 text-pink-600 dark:text-pink-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${colors[type] ?? 'bg-white/10 text-card-foreground/60'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editQ, setEditQ] = useState<Question | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [optionCount, setOptionCount] = useState(4);
  const [attemptsOpen, setAttemptsOpen] = useState(true);
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [deletingExam, setDeletingExam] = useState(false);

  const [qForm, setQForm] = useState({
    question_text: '',
    question_type: 'multiple_choice',
    points: 1,
    options: ['', '', '', ''],
    correct_answer: '',
    explanation: '',
  });

  const canManage = profile?.role === 'admin' || profile?.role === 'teacher';
  const canReview = canManage || profile?.role === 'school';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [examRes, qRes, attemptRes] = await Promise.all([
        fetch(`/api/exams/${id}`),
        fetch(`/api/exams/${id}/questions`),
        fetch(`/api/exams/${id}/attempts`, { cache: 'no-store' }),
      ]);
      if (!examRes.ok) throw new Error('Exam not found');
      const examJson = await examRes.json();
      const qJson = qRes.ok ? await qRes.json() : { data: [] };
      const attemptJson = attemptRes.ok ? await attemptRes.json() : { data: [] };
      setExam(examJson.data);
      setQuestions(qJson.data ?? []);
      setAttempts(attemptJson.data ?? []);
    } catch {
      toast.error('Failed to load exam');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (!authLoading && profile) load(); }, [authLoading, profile, load]);

  function openForm(q?: Question) {
    if (q) {
      setEditQ(q);
      const opts = Array.isArray(q.options) ? q.options : ['', '', '', ''];
      setOptionCount(opts.length);
      setQForm({ question_text: q.question_text, question_type: q.question_type, points: q.points, options: opts, correct_answer: String(q.correct_answer ?? ''), explanation: q.explanation ?? '' });
    } else {
      setEditQ(null);
      setOptionCount(4);
      setQForm({ question_text: '', question_type: 'multiple_choice', points: 1, options: ['', '', '', ''], correct_answer: '', explanation: '' });
    }
    setShowForm(true);
  }

  async function handleStudioQuestions(incoming: StudioGeneratedQuestion[], importMode: 'append' | 'replace') {
    if (!incoming.length) return;
    const replaceExisting = importMode === 'replace';
    setSubmitting(true);
    try {
      if (replaceExisting && questions.length > 0 && attempts.length === 0) {
        await Promise.all(
          questions.map(existing =>
            fetch(`/api/exams/${id}/questions/${existing.id}`, { method: 'DELETE' })
          ),
        );
      }

      const startIndex = replaceExisting ? 1 : questions.length + 1;
      const batch = incoming.map((q, idx) => {
        const mappedType =
          q.question_type === 'fill_blank'
            ? 'fill_in_blank'
            : ['multiple_choice', 'true_false', 'short_answer', 'essay', 'fill_in_blank'].includes(q.question_type)
              ? q.question_type
              : 'short_answer';
        const opts = ['multiple_choice', 'true_false'].includes(mappedType)
          ? (q.options ?? []).filter(Boolean)
          : null;
        return {
          question_text: q.question_text,
          question_type: mappedType,
          points: q.points || 2,
          order_index: startIndex + idx,
          options: opts,
          correct_answer: q.correct_answer || q.marking_guide || '',
          explanation:
            q.marking_guide ||
            q.explanation ||
            String(q.metadata?.marking_guide ?? q.metadata?.explanation ?? '') ||
            null,
        };
      });

      const res = await fetch(`/api/exams/${id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: batch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save imported questions');

      toast.success(`Saved ${batch.length} question${batch.length !== 1 ? 's' : ''} with answers & marking guides!`);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Could not import questions');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveQuestion() {
    if (!qForm.question_text.trim()) { toast.error('Question text required'); return; }
    setSubmitting(true);
    try {
      const payload = {
        ...qForm,
        points: Number(qForm.points),
        options: ['multiple_choice', 'true_false'].includes(qForm.question_type) ? qForm.options.filter(Boolean) : null,
      };
      let res;
      if (editQ) {
        res = await fetch(`/api/exams/${id}/questions/${editQ.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        res = await fetch(`/api/exams/${id}/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success(editQ ? 'Question updated' : 'Question added');
      setShowForm(false);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to save question'); }
    finally { setSubmitting(false); }
  }

  async function deleteQuestion(qid: string) {
    if (!confirm('Delete this question?')) return;
    const res = await fetch(`/api/exams/${id}/questions/${qid}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Question deleted'); load(); }
    else toast.error('Failed to delete');
  }

  async function toggleActive() {
    if (!exam) return;
    const response = await fetch(`/api/exams/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !exam.is_active }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(payload.error || 'Exam status could not be changed');
      return;
    }
    setExam(e => e ? { ...e, is_active: !e.is_active } : e);
    toast.success(`Exam ${exam.is_active ? 'deactivated' : 'activated'}`);
  }

  if (authLoading || loading) {
    return <div className="flex items-center justify-center min-h-[60vh] mobile-page-root"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!exam) return <div className="p-6 text-center text-card-foreground/50">Exam not found</div>;

  const totalPoints = questions.reduce((s, q) => s + q.points, 0);

  const handlePrintExam = (copy: WrittenPaperCopy) => {
    const docRef = `WRT-${Date.now().toString(36).toUpperCase()}`;
    const html = buildWrittenPaperHtml({ exam, questions, copy, reference: docRef });
    if (!openWrittenPaperPrint(html)) {
      toast.error('Allow pop-ups to open the printable paper.');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 mobile-page-root">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href={exam.class_id ? `/dashboard/classes/${exam.class_id}?operation=assessment` : '/dashboard/exams'} className="p-2 hover:bg-white/5 rounded-xl transition-all mt-1" title={exam.class_id ? 'Back to Class Assessment' : 'Back to Written Exams'}>
          <ArrowLeftIcon className="w-5 h-5 text-card-foreground/50" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${exam.is_active ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30' : 'bg-slate-200 text-slate-900 border-slate-300 dark:bg-zinc-500/20 dark:text-zinc-200 dark:border-zinc-500/30'}`}>
              {exam.is_active ? <LockOpenIcon className="w-3 h-3" /> : <LockClosedIcon className="w-3 h-3" />}
              {exam.is_active ? 'Active' : 'Inactive'}
            </span>
            {exam.courses && <span className="text-xs text-card-foreground/40 bg-white/5 px-2 py-0.5 rounded-full">{exam.courses.title}</span>}
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-card-foreground">{exam.title}</h1>
          {exam.description && <p className="text-card-foreground/50 text-sm mt-1">{exam.description}</p>}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {exam.class_id && (
              <Link
                href={`/dashboard/reports/builder?class_id=${exam.class_id}${exam.course_id ? `&course_id=${exam.course_id}` : ''}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 transition-all"
              >
                Result Builder
              </Link>
            )}
            <button onClick={toggleActive}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${exam.is_active ? 'bg-amber-200 border-amber-400 text-amber-950 hover:bg-amber-300 dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-300' : 'bg-emerald-200 border-emerald-400 text-emerald-950 hover:bg-emerald-300 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-300'}`}>
              {exam.is_active ? <><LockClosedIcon className="w-3.5 h-3.5" /> Deactivate</> : <><LockOpenIcon className="w-3.5 h-3.5" /> Activate</>}
            </button>
            <Link href={`/dashboard/exams/${id}/edit`} className="p-2 border border-border bg-card hover:bg-muted rounded-xl transition-all" title="Edit exam settings">
              <PencilIcon className="w-4 h-4 text-foreground" />
            </Link>
            <button
              type="button"
              disabled={deletingExam}
              onClick={async () => {
                if (!confirm(`Delete written exam "${exam.title}"? This cannot be undone.`)) return;
                setDeletingExam(true);
                try {
                  const res = await fetch(`/api/exams/${id}`, { method: 'DELETE' });
                  if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    throw new Error(j.error || 'Failed to delete exam');
                  }
                  toast.success('Exam deleted');
                  router.push(exam.class_id ? `/dashboard/classes/${exam.class_id}?operation=assessment` : '/dashboard/exams');
                } catch (err: any) {
                  toast.error(err?.message || 'Failed to delete exam');
                  setDeletingExam(false);
                }
              }}
              aria-label="Delete written exam"
              title="Delete exam"
              className="p-2 border border-rose-300 dark:border-rose-500/30 bg-rose-100 dark:bg-rose-500/15 hover:bg-rose-200 text-rose-900 dark:text-rose-300 rounded-xl transition-all disabled:opacity-50"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Exam Config Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Duration', value: exam.duration_minutes ? `${exam.duration_minutes}m` : '—', icon: ClockIcon },
          { label: 'Total Points', value: `${totalPoints}/${exam.total_points}`, icon: ChartBarIcon },
          { label: 'Pass Score', value: `${exam.passing_score}%`, icon: CheckBadgeIcon },
          { label: 'Max Attempts', value: String(exam.max_attempts), icon: ArrowPathIcon },
        ].map(m => (
          <div key={m.label} className="bg-card border border-white/[0.08] rounded-xl p-3 text-center">
            <m.icon className="w-4 h-4 text-primary mx-auto mb-1.5" />
            <p className="font-black text-card-foreground">{m.value}</p>
            <p className="text-[10px] font-bold text-card-foreground/40 uppercase tracking-wider">{m.label}</p>
          </div>
        ))}
      </div>

      {canReview && (
        <section className="rounded-2xl border border-border bg-card/60 overflow-hidden" aria-labelledby="written-attempts-heading">
          <button
            type="button"
            onClick={() => setAttemptsOpen(v => !v)}
            aria-expanded={attemptsOpen}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 bg-muted/20 border-b border-border/60 text-left hover:bg-muted/30 transition-colors"
          >
            <div>
              <div className="flex items-center gap-2">
                <h2 id="written-attempts-heading" className="text-base sm:text-lg font-black text-card-foreground">Learner attempts</h2>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-black text-primary">{attempts.length}</span>
              </div>
              <p className="text-xs text-muted-foreground">Review submitted papers and publish complete, auditable grades.</p>
            </div>
            <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${attemptsOpen ? 'rotate-180' : ''}`} />
          </button>
          {attemptsOpen && (
          <div className="p-4">
          {attempts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">No learner has started this paper.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {attempts.map(attempt => (
                <Link key={attempt.id} href={`/dashboard/exams/${id}/attempts/${attempt.id}`} className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-bold text-foreground">{attempt.student?.full_name || 'Learner'}</p><p className="truncate text-xs text-muted-foreground">{attempt.student?.email || 'No email'}</p></div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${attempt.moderation_status === 'returned' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : attempt.status === 'graded' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : attempt.status === 'submitted' ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-muted text-muted-foreground'}`}>{attempt.moderation_status === 'returned' ? 'Correction requested' : attempt.moderation_status === 'approved' ? 'Verified' : attempt.status === 'submitted' ? 'Needs review' : attempt.status === 'graded' ? 'Graded' : attempt.status || 'In progress'}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{attempt.status === 'graded' ? `${Number(attempt.percentage ?? 0).toFixed(1)}% · ${attempt.score ?? 0}/${attempt.total_points ?? 0}` : attempt.submitted_at ? `Submitted ${new Date(attempt.submitted_at).toLocaleDateString()}` : 'Attempt in progress'}</span>{(attempt.tab_switches ?? 0) > 0 && <span>{attempt.tab_switches} tab switch{attempt.tab_switches === 1 ? '' : 'es'}</span>}</div>
                </Link>
              ))}
            </div>
          )}
          </div>
          )}
        </section>
      )}

      {/* AI Question Designer & Blueprint Studio for Written Exam */}
      {canManage && attempts.length === 0 && (
        <QuestionAuthoringStudio
          mode="written"
          classId={exam.class_id ?? null}
          programId={exam.program_id ?? exam.courses?.program_id ?? ''}
          courseId={exam.course_id ?? exam.courses?.id ?? ''}
          courseTitle={exam.courses?.title ?? ''}
          initialTopic={exam.title}
          currentQuestions={questions.map(q => ({
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options,
            correct_answer: String(q.correct_answer ?? ''),
            points: q.points,
            explanation: q.explanation,
          }))}
          existingQuestionTexts={questions.map(q => q.question_text)}
          onImportQuestions={handleStudioQuestions}
        />
      )}

      {/* Questions Header (collapsible with count + full CRUD) */}
      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 bg-muted/20 border-b border-border/60">
        <button
          type="button"
          onClick={() => setQuestionsOpen(v => !v)}
          aria-expanded={questionsOpen}
          className="flex items-center gap-2 text-left flex-1 min-w-0"
        >
          <DocumentTextIcon className="w-5 h-5 text-primary flex-shrink-0" />
          <h2 className="text-base sm:text-lg font-black text-card-foreground">Questions</h2>
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-black text-primary">
            {questions.length} · {totalPoints} pts
          </span>
          <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${questionsOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {questions.length > 0 && canReview && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={() => handlePrintExam('candidate')}
                className="min-h-10 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted">
                <DocumentTextIcon className="mr-1.5 inline h-4 w-4" /> Candidate paper
              </button>
              <button onClick={() => handlePrintExam('teacher')}
                className="min-h-10 rounded-xl border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <DocumentTextIcon className="mr-1.5 inline h-4 w-4" /> Teacher copy
              </button>
            </div>
          )}
          {canManage && (
            <button onClick={() => openForm()}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl transition-all text-xs sm:text-sm shadow-sm">
              <PlusIcon className="w-4 h-4" /> Add Question
            </button>
          )}
        </div>
      </div>

      {/* Questions List */}
      {questionsOpen && (
      <div className="p-4">
      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 bg-card border border-dashed border-border rounded-2xl">
          <DocumentTextIcon className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-muted-foreground font-semibold">No questions yet</p>
          {canManage && <button onClick={() => openForm()} className="text-primary text-sm font-bold hover:underline">Add the first question</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-all group">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-xs font-black text-primary flex-shrink-0 mt-0.5">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <QuestionTypeTag type={q.question_type} />
                    <span className="text-xs text-muted-foreground font-bold">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-card-foreground text-sm font-medium">{q.question_text}</p>
                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className={`text-xs flex items-center gap-2 px-2 py-1 rounded-lg ${String(q.correct_answer) === String(oi) || q.correct_answer === opt ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-300 font-bold' : 'text-muted-foreground'}`}>
                          {String(q.correct_answer) === String(oi) || q.correct_answer === opt ? <CheckCircleIcon className="w-3 h-3 flex-shrink-0" /> : <span className="w-3 h-3 flex-shrink-0" />}
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                  {!Array.isArray(q.options) && q.correct_answer && (
                    <div className="mt-2 rounded-xl border border-emerald-300 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5 px-3 py-2 text-xs text-foreground">
                      <span className="font-black uppercase tracking-wider text-[10px] text-emerald-800 dark:text-emerald-300 block mb-0.5">
                        Expected Answer / Model Answer
                      </span>
                      {String(q.correct_answer)}
                    </div>
                  )}
                  {q.explanation && (
                    <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
                      <span className="font-black uppercase tracking-wider text-[10px] text-primary block mb-0.5">
                        Marking Guide / Rubric &amp; Rationale
                      </span>
                      {q.explanation}
                    </div>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openForm(q)} aria-label="Edit question" title="Edit question" className="p-2 hover:bg-muted rounded-lg transition-all">
                      <PencilIcon className="w-3.5 h-3.5 text-foreground" />
                    </button>
                    <button onClick={() => deleteQuestion(q.id)} aria-label="Delete question" title="Delete question" className="p-2 hover:bg-rose-100 dark:hover:bg-rose-500/20 rounded-lg transition-all">
                      <TrashIcon className="w-3.5 h-3.5 text-rose-700 dark:text-rose-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
      )}
      </div>

      {/* Question Form Modal */}
      {showForm && canManage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div role="dialog" aria-modal="true" className="bg-card border border-white/[0.12] rounded-2xl w-full max-w-2xl shadow-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <h3 className="font-black text-card-foreground text-lg">{editQ ? 'Edit Question' : 'Add Question'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/5 rounded-lg"><XMarkIcon className="w-5 h-5 text-card-foreground/50" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Type */}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Question Type</label>
                <div className="flex flex-wrap gap-2">
                  {Q_TYPES.map(t => (
                    <button key={t} onClick={() => setQForm(f => ({ ...f, question_type: t }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${qForm.question_type === t ? 'bg-primary text-white' : 'bg-white/5 text-card-foreground/60 hover:bg-white/10'}`}>
                      {t.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question text */}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Question Text</label>
                <textarea value={qForm.question_text} onChange={e => setQForm(f => ({ ...f, question_text: e.target.value }))} rows={3}
                  placeholder="Enter your question here…"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-primary/50 resize-none" />
              </div>

              {/* Points */}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Points</label>
                <input type="number" min={1} value={qForm.points} onChange={e => setQForm(f => ({ ...f, points: Number(e.target.value) }))}
                  className="w-28 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-primary/50" />
              </div>

              {/* Options for MCQ / T-F */}
              {['multiple_choice', 'true_false'].includes(qForm.question_type) && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-card-foreground/50 uppercase">Answer Options</label>
                    {qForm.question_type === 'multiple_choice' && (
                      <button onClick={() => { setOptionCount(n => n + 1); setQForm(f => ({ ...f, options: [...f.options, ''] })); }}
                        className="text-xs text-primary font-bold hover:underline">+ Add option</button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {qForm.question_type === 'true_false' ? (
                      ['True', 'False'].map((opt, i) => (
                        <label key={opt} className="flex items-center gap-3 cursor-pointer">
                          <input type="radio" name="correct" checked={qForm.correct_answer === opt}
                            onChange={() => setQForm(f => ({ ...f, options: ['True', 'False'], correct_answer: opt }))} />
                          <span className="text-sm text-card-foreground">{opt}</span>
                        </label>
                      ))
                    ) : (
                      qForm.options.slice(0, optionCount).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="radio" name="correct" checked={qForm.correct_answer === String(i)}
                            onChange={() => setQForm(f => ({ ...f, correct_answer: String(i) }))} />
                          <input value={opt} onChange={e => setQForm(f => ({ ...f, options: f.options.map((o, oi) => oi === i ? e.target.value : o) }))}
                            placeholder={`Option ${i + 1}`}
                            className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-primary/50" />
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-card-foreground/30 mt-1">Select the correct answer using the radio button</p>
                </div>
              )}

              {/* Correct answer for short_answer / fill_in_blank */}
              {['short_answer', 'fill_in_blank'].includes(qForm.question_type) && (
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Expected Answer</label>
                  <input value={qForm.correct_answer} onChange={e => setQForm(f => ({ ...f, correct_answer: e.target.value }))}
                    placeholder="Enter the expected answer…"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-primary/50" />
                </div>
              )}

              {/* Explanation */}
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Explanation (optional)</label>
                <input value={qForm.explanation} onChange={e => setQForm(f => ({ ...f, explanation: e.target.value }))}
                  placeholder="Explain the correct answer…"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/[0.08]">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={saveQuestion} disabled={submitting || !qForm.question_text.trim()}
                className="flex-1 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                {submitting ? 'Saving…' : editQ ? 'Update' : 'Add Question'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
