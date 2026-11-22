// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  SparklesIcon,
  ArrowPathIcon,
  ClockIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  EXAMINER_PRESETS,
  composeSmartExamTitle,
  type ExaminerPreset,
} from '@/lib/cbt/examiner-presets';

interface ExamClassOption {
  id: string;
  name: string;
  teacher_id: string | null;
  program_id: string | null;
  current_course_id: string | null;
  academic_offering_id: string | null;
  offering_period_id: string | null;
  status: string | null;
}

export default function NewExamPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const preClassId = searchParams?.get('class_id') || '';
  const preCourseId = searchParams?.get('course_id') || '';
  const preProgramId = searchParams?.get('program_id') || '';

  const [programs, setPrograms] = useState<any[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ExamClassOption[]>([]);
  const [classId, setClassId] = useState(preClassId);
  const [assessmentScope, setAssessmentScope] = useState<'class_result' | 'practice'>('class_result');
  const [selectedProgramId, setSelectedProgramId] = useState(preProgramId);
  const [activePresetId, setActivePresetId] = useState<ExaminerPreset['id'] | null>('term_exam');
  const [submitting, setSubmitting] = useState(false);
  const [genDesc, setGenDesc] = useState(false);
  const userEditedTitleRef = useRef(false);

  const [form, setForm] = useState({
    course_id: preCourseId,
    title: '',
    description: '',
    duration_minutes: 60,
    total_points: 100,
    passing_score: 50,
    max_attempts: 1,
    randomize_questions: true,
    randomize_options: true,
    is_active: false,
  });

  useEffect(() => {
    fetch('/api/programs?is_active=true')
      .then((r) => r.json())
      .then((j) => setPrograms(j.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!profile || !['admin', 'teacher'].includes(profile.role)) return;
    const loadClasses = async () => {
      const db = createClient();
      let query = db
        .from('classes')
        .select('id,name,teacher_id,program_id,current_course_id,academic_offering_id,offering_period_id,status')
        .order('name');
      if (profile.role === 'teacher') query = query.eq('teacher_id', profile.id);
      const { data, error } = await query;
      if (error) {
        toast.error('Classes could not be loaded. Refresh and try again.');
        return;
      }
      const active = ((data ?? []) as ExamClassOption[]).filter((item) => item.status !== 'archived');
      setAvailableClasses(active);
      const target = preClassId
        ? active.find((item) => item.id === preClassId)
        : active.length === 1
          ? active[0]
          : null;
      if (target) {
        setClassId(target.id);
        if (target.program_id) setSelectedProgramId((prev) => prev || target.program_id!);
        if (target.current_course_id) {
          setForm((current) => ({ ...current, course_id: current.course_id || target.current_course_id! }));
        }
      }
    };
    void loadClasses();
  }, [profile, preClassId]);

  const courses = (programs.find((p: any) => p.id === selectedProgramId)?.courses ?? []) as { id: string; title: string }[];
  const selectedClassObj = availableClasses.find((c) => c.id === classId) ?? null;
  const selectedProgramObj = programs.find((p: any) => p.id === selectedProgramId) ?? null;
  const selectedCourseObj = courses.find((c) => c.id === form.course_id) ?? null;

  // Auto-compose official title whenever context or preset changes (never overwrites manual edits)
  useEffect(() => {
    if (userEditedTitleRef.current) return;
    const preset = activePresetId ? EXAMINER_PRESETS.find((p) => p.id === activePresetId) : null;
    const suggested = composeSmartExamTitle({
      courseTitle: selectedCourseObj?.title || null,
      programName: selectedProgramObj?.name || null,
      className: selectedClassObj?.name || null,
      examType: preset?.examType ?? 'examination',
      presetLabel: preset?.label ?? 'Written Examination',
    });
    if (suggested) {
      setForm((prev) => (prev.title === suggested ? prev : { ...prev, title: suggested }));
    }
  }, [selectedCourseObj?.title, selectedProgramObj?.name, selectedClassObj?.name, activePresetId]);

  const canManage = profile?.role === 'admin' || profile?.role === 'teacher';

  function selectClass(nextClassId: string) {
    setClassId(nextClassId);
    const selected = availableClasses.find((item) => item.id === nextClassId);
    if (!selected) return;
    if (selected.program_id) setSelectedProgramId(selected.program_id);
    if (selected.current_course_id) {
      setForm((current) => ({ ...current, course_id: selected.current_course_id || current.course_id }));
    }
  }

  function applyPreset(preset: ExaminerPreset) {
    setActivePresetId(preset.id);
    setForm((prev) => ({
      ...prev,
      duration_minutes: preset.durationMinutes,
      total_points: preset.targetMarks,
      passing_score: preset.passingScore,
    }));
  }

  async function generateDescription() {
    if (!form.title.trim()) {
      toast.error('Enter an exam title first');
      return;
    }
    setGenDesc(true);
    try {
      const prompt = `You are an expert Chief Examiner designing a formal school written examination.
Write concise, student-facing exam instructions for:

Exam Title: "${form.title}"${selectedCourseObj ? `\nSubject/Course: "${selectedCourseObj.title}"` : ''}${selectedClassObj ? `\nClass: "${selectedClassObj.name}"` : ''}
Duration: ${form.duration_minutes} minutes | Total Points: ${form.total_points} | Pass Mark: ${form.passing_score}%

Return ONLY the instruction text (2-4 clear sentences). Mention time allowed, how to attempt all required sections neatly, material rules, and brief encouragement. No JSON, no headings.`;

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'custom', prompt }),
      });
      const j = await res.json();
      const text = (j.content ?? j.text ?? j.result ?? '').trim();
      if (!text) {
        toast.error('AI returned empty — try again');
        return;
      }
      setForm((f) => ({ ...f, description: text }));
      toast.success('AI examiner instructions generated');
    } catch (e: any) {
      toast.error(e.message ?? 'AI generation failed');
    } finally {
      setGenDesc(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.course_id || !form.title.trim()) {
      toast.error('Programme, course, and exam title are required.');
      return;
    }
    if (assessmentScope === 'class_result' && !classId) {
      toast.error('Choose the class receiving this result, or select Practice only.');
      return;
    }
    if (
      assessmentScope === 'class_result' &&
      selectedClassObj &&
      (!selectedClassObj.academic_offering_id || !selectedClassObj.offering_period_id)
    ) {
      toast.error('Repair this class academic offering and reporting period before creating official work.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          title: form.title.trim(),
          class_id: classId || null,
          assessment_scope: assessmentScope,
          duration_minutes: Number(form.duration_minutes),
          total_points: Number(form.total_points),
          passing_score: Number(form.passing_score),
          max_attempts: Number(form.max_attempts),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to create exam');
      }
      const j = await res.json();
      toast.success('Written exam created! Now add or AI-generate your questions.');
      router.push(`/dashboard/exams/${j.data.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create exam');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] mobile-page-root">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 mobile-page-root">
        <AcademicCapIcon className="w-16 h-16 text-rose-600/40 dark:text-rose-400/40" />
        <p className="text-muted-foreground text-lg font-semibold">Access denied</p>
      </div>
    );
  }

  const backHref = classId ? `/dashboard/classes/${classId}?operation=assessment` : '/dashboard/exams';

  return (
    <div className="min-h-screen bg-background text-foreground px-3 py-4 sm:p-6 lg:p-8 pb-24 mobile-page-root">
      <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back to Written Exams
        </Link>

        {/* Executive Hero Header */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-md">
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shadow-lg shadow-emerald-900/20 shrink-0">
                <AcademicCapIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
                  Written Examination Builder
                </span>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground mt-1">
                  Create Written Exam
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Configure the exam shell in seconds, then add or AI-generate essay, short-answer, and diagram questions on the next step.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CBT Disambiguation Banner */}
        <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/8 px-4 py-3 text-xs sm:text-sm">
          <InformationCircleIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-foreground/90">
            Need instant auto-graded MCQ, True/False, or coding-block tests?{' '}
            <Link href="/dashboard/cbt/new" className="font-black text-primary underline underline-offset-2 hover:opacity-80">
              Open CBT Examiner Studio instead →
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 1. Examiner Blueprints */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-foreground flex items-center gap-1.5">
                  <SparklesIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  1. Quick Examiner Blueprints
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick a standard exam format to auto-set duration, total marks, and pass score.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {EXAMINER_PRESETS.map((preset) => {
                const selected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      selected
                        ? 'border-emerald-600 bg-emerald-500/12 ring-1 ring-emerald-500/30 shadow-xs'
                        : 'border-border bg-muted/25 hover:border-emerald-500/40 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black text-foreground">{preset.shortLabel}</span>
                      <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${
                        selected ? 'bg-emerald-700 text-white' : 'bg-card border border-border text-muted-foreground'
                      }`}>
                        {preset.targetMarks} pts
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <ClockIcon className="w-3 h-3" /> {preset.durationMinutes} min · {preset.passingScore}% pass
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Class, Programme, Course & Title */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-foreground">
                  2. Where should this exam be used?
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose a class to auto-fill Programme, Course, and an official Exam Title.
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setAssessmentScope('class_result')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors ${
                    assessmentScope === 'class_result'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Class result
                </button>
                <button
                  type="button"
                  onClick={() => setAssessmentScope('practice')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors ${
                    assessmentScope === 'practice'
                      ? 'bg-sky-700 text-white shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Practice only
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="written-exam-class" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {assessmentScope === 'class_result' ? 'Result Class' : 'Limit Practice to a Class'}
                {assessmentScope === 'class_result' && <span className="text-rose-600 dark:text-rose-400"> *</span>}
              </label>

              {availableClasses.length > 0 && availableClasses.length <= 8 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableClasses.map((item) => {
                    const active = classId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectClass(item.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                            : 'bg-background border-border text-foreground hover:border-emerald-500/40'
                        }`}
                      >
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <select
                id="written-exam-class"
                value={classId}
                onChange={(event) => selectClass(event.target.value)}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              >
                <option value="">
                  {assessmentScope === 'class_result' ? 'Choose the class receiving this exam…' : 'Programme-wide practice'}
                </option>
                {availableClasses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.academic_offering_id && item.offering_period_id ? '' : ' — setup required'}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="written-exam-program" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Programme <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <select
                  id="written-exam-program"
                  value={selectedProgramId}
                  onChange={(e) => {
                    const nextProgramId = e.target.value;
                    setSelectedProgramId(nextProgramId);
                    setForm((f) => ({ ...f, course_id: '' }));
                    if (selectedClassObj?.program_id && selectedClassObj.program_id !== nextProgramId) {
                      setClassId('');
                    }
                  }}
                  required
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                >
                  <option value="">Select a programme…</option>
                  {programs.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="written-exam-course" className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Course / Subject <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <select
                  id="written-exam-course"
                  value={form.course_id}
                  onChange={(e) => setForm((f) => ({ ...f, course_id: e.target.value }))}
                  required
                  disabled={!selectedProgramId}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 disabled:opacity-50"
                >
                  <option value="">{selectedProgramId ? 'Select a course…' : 'Choose a programme first'}</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="written-exam-title" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Exam Title <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                {!userEditedTitleRef.current && form.title && (
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Auto-titled</span>
                )}
              </div>
              <input
                id="written-exam-title"
                value={form.title}
                onChange={(e) => {
                  userEditedTitleRef.current = true;
                  setForm((f) => ({ ...f, title: e.target.value }));
                }}
                required
                placeholder="e.g. Python Programming — Full Term Examination (Basic 5A)"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="written-exam-instructions" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Instructions for Students
                </label>
                <button
                  type="button"
                  onClick={generateDescription}
                  disabled={genDesc || !form.title.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/12 hover:bg-primary/20 border border-primary/30 text-primary disabled:opacity-40 text-[11px] font-black transition-all"
                >
                  {genDesc ? (
                    <>
                      <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-3.5 h-3.5" /> AI Examiner Draft
                    </>
                  )}
                </button>
              </div>
              <textarea
                id="written-exam-instructions"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Topics covered, time allocation, permitted materials…"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-y"
              />
            </div>
          </div>

          {/* 3. Timing, Scoring & Security */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm space-y-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-foreground">
              3. Timing, Scoring &amp; Delivery Rules
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {[
                { key: 'duration_minutes', label: 'Duration (min)', min: 5 },
                { key: 'total_points', label: 'Total Marks', min: 1 },
                { key: 'passing_score', label: 'Pass Score (%)', min: 1, max: 100 },
                { key: 'max_attempts', label: 'Max Attempts', min: 1 },
              ].map((f) => (
                <div key={f.key}>
                  <label htmlFor={`written-${f.key}`} className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    {f.label}
                  </label>
                  <input
                    id={`written-${f.key}`}
                    type="number"
                    min={f.min}
                    max={f.max}
                    value={(form as any)[f.key]}
                    onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 tabular-nums"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2 border-t border-border/60">
              {[
                { key: 'randomize_questions', label: 'Randomize question order for each student' },
                { key: 'randomize_options', label: 'Randomize answer options (MCQ questions)' },
                { key: 'is_active', label: 'Activate immediately (visible to students right away)' },
              ].map((t) => {
                const checked = Boolean((form as any)[t.key]);
                return (
                  <div key={t.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-2.5">
                    <span className="text-xs sm:text-sm font-medium text-foreground">{t.label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      aria-label={t.label}
                      onClick={() => setForm((f) => ({ ...f, [t.key]: !checked }))}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                        checked ? 'bg-emerald-700' : 'bg-muted-foreground/30'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                          checked ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sticky Mobile-First Action Bar */}
          <div className="sticky bottom-3 z-30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-border bg-card/95 backdrop-blur-xl px-4 py-3 shadow-xl">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <Link
                href={backHref}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-bold transition-colors"
              >
                Cancel
              </Link>
              <span className="text-xs font-bold text-muted-foreground">
                {form.duration_minutes}m · {form.total_points} marks · {form.passing_score}% pass
              </span>
            </div>
            <button
              type="submit"
              disabled={submitting || !form.course_id || !form.title.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-black rounded-xl shadow-md transition-all"
            >
              <CheckCircleIcon className="w-4 h-4" />
              {submitting ? 'Creating Exam…' : 'Create & Add Questions →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
