// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { extractPdfText } from '@/lib/pdf/extract-text';
import {
  ArrowLeftIcon, AcademicCapIcon, PlusIcon, TrashIcon,
  CheckIcon, ArrowPathIcon, ExclamationTriangleIcon, ChevronDownIcon,
  SparklesIcon, CheckCircleIcon,
} from '@/lib/icons';
import {
  isObjectiveQuestion,
  isTheoryQuestion,
  buildCbtPrintHtml,
  openCbtPrintWindow,
} from '@/lib/cbt/print-utils';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';

interface Question {
  question_text: string;
  question_type: string;
  options: string[];
  correct_answer: string;
  points: number;
  section: 'objective' | 'subjective' | 'practical';
}

const emptyQuestion = (): Question => ({
  question_text: '',
  question_type: 'multiple_choice',
  options: ['', '', '', ''],
  correct_answer: '',
  points: 5,
  section: 'objective',
});

export default function NewExamPage() {
  const router = useRouter();
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const preProgramId = searchParams?.get('program_id');
  const preCourseId = searchParams?.get('course_id');
  const preClassId = searchParams?.get('class_id');
  const preSchoolId = searchParams?.get('school_id');
  const preTopic = searchParams?.get('topic');
  const preWeek = searchParams?.get('week');
  const preCurrId = searchParams?.get('curriculum_id');
  const preLessonPlanId = searchParams?.get('lesson_plan_id');
  const preLessonId = searchParams?.get('lesson_id');
  const preExamType = searchParams?.get('exam_type') as 'examination' | 'evaluation' | null;
  const isMinimal = searchParams?.get('minimal') === 'true';
  const [programs, setPrograms] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [assignedSchools, setAssignedSchools] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [classId, setClassId] = useState<string | null>(preClassId || null);
  const [className, setClassName] = useState<string>('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    program_id: '',
    course_id: '',
    duration_minutes: '60',
    passing_score: '70',
    start_date: '',
    end_date: '',
    access_window_minutes: '60',
    is_active: true,
    exam_type: preExamType === 'evaluation' ? 'evaluation' : 'examination',
    school_id: preSchoolId || '',
  });
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);
  const [sectionWeights, setSectionWeights] = useState({ objective: 60, subjective: 30, practical: 10 });
  const [useWeights, setUseWeights] = useState(false);

  // AI Generation State
  const [aiOpen, setAiOpen] = useState(!!preTopic);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState(preTopic || '');
  const [sourceText, setSourceText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [extractMsg, setExtractMsg] = useState('');
  const [aiMcqCount, setAiMcqCount] = useState(preExamType === 'evaluation' ? '0' : '10');
  const [aiTheoryCount, setAiTheoryCount] = useState(preExamType === 'evaluation' ? '10' : '0');
  // Track which questions are selected (all selected by default)
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [printFilter, setPrintFilter] = useState<'all' | 'mcq' | 'theory'>('all');
  const examBoundary = form.exam_type === 'evaluation'
    ? { label: 'Evaluation/Test', min: 5, max: 20, duration: '20-45 min', note: 'Focused check for recent class learning.' }
    : { label: 'Main Examination', min: 5, max: 40, duration: '45-120 min', note: 'Broader assessment with realistic coverage.' };

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) { setAiError('Enter a topic first.'); return; }
    const mcq    = Math.max(0, Math.min(examBoundary.max, parseInt(aiMcqCount)    || 0));
    const theory = Math.max(0, Math.min(examBoundary.max, parseInt(aiTheoryCount) || 0));
    const total  = mcq + theory;
    if (total < examBoundary.min) { setAiError(`${examBoundary.label} should have at least ${examBoundary.min} questions for a realistic paper.`); return; }
    if (total > examBoundary.max) { setAiError(`${examBoundary.label} should not exceed ${examBoundary.max} generated questions. Reduce MCQ or theory count.`); return; }
    setAiGenerating(true);
    setAiError(null);
    try {
      // Ground the questions in the SELECTED programme/course (the form already
      // captures them) so generation follows the normal programme/course scope.
      const selectedCourse = courses.find((c: any) => c.id === form.course_id);
      const selectedProgramName = programs.find((p: any) => p.id === form.program_id)?.name
        || (selectedCourse as any)?.programs?.name;
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cbt',
          topic: aiTopic,
          questionCount: total,
          mcqCount: mcq,
          theoryCount: theory,
          courseName: (selectedCourse as any)?.title || undefined,
          subject: (selectedCourse as any)?.title || undefined,
          programName: selectedProgramName || undefined,
          className: className || undefined,
          examType: form.exam_type,
          sourceName: sourceName || undefined,
          ...(sourceText ? { sourceMaterial: sourceText } : {}),
        })
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);

      const data = result.data;
      setForm(prev => ({
        ...prev,
        title: data.title || prev.title,
        description: data.description || prev.description,
        duration_minutes: (data.duration_minutes || 60).toString(),
        passing_score: (data.passing_score || 70).toString(),
      }));
      if (data.questions?.length > 0) {
        const qs = data.questions.map((q: any) => ({
          question_text: q.question_text || '',
          question_type: q.question_type || 'multiple_choice',
          options: q.options || ['', '', '', ''],
          correct_answer: q.correct_answer || '',
          points: q.points || 5,
          section: (q.section || (['essay', 'fill_blank', 'coding_blocks'].includes(q.question_type) ? 'subjective' : 'objective')) as Question['section'],
        }));
        setQuestions(qs);
        // Select all generated questions by default
        setSelectedQuestions(new Set(qs.map((_: any, i: number) => i)));
      }
      setAiOpen(false);
    } catch (e: any) {
      setAiError(e.message || 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    const db = createClient();
    
    // 1. Fetch admin school list; teachers load schools together with scoped courses below.
    if (profile.role === 'admin') {
      db.from('schools').select('id, name').eq('status', 'approved').order('name')
        .then(({ data }) => setAssignedSchools(data ?? []));
    }

    // 2. Fetch programs
    db.from('programs').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => {
        setPrograms(data ?? []);
        if (preProgramId) setForm(prev => ({ ...prev, program_id: preProgramId }));
      });

    const loadCourses = (schoolIds?: string[]) => {
      let courseQuery = db.from('courses').select('id, title, program_id, school_id, programs(name)').eq('is_active', true);
      if (profile.role === 'teacher') {
        const filters = ['school_id.is.null', ...(schoolIds ?? []).map(id => `school_id.eq.${id}`)];
        courseQuery = courseQuery.or(filters.join(','));
      } else if (profile.role !== 'admin' && profile?.school_id) {
        courseQuery = courseQuery.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      }
      return courseQuery.order('title').then(({ data }) => {
        const cList = data ?? [];
        setCourses(cList);
        if (preCourseId) {
          const c = cList.find((x: any) => x.id === preCourseId);
          setForm(prev => ({ ...prev, course_id: c ? preCourseId : '', program_id: c?.program_id || prev.program_id }));
        }
      });
    };

    // 3. Fetch courses after teacher school scope is known.
    if (profile.role !== 'teacher') {
      loadCourses();
    }

    const setTeacherSchools = (schools: Array<{ id: string; name: string }>) => {
      setAssignedSchools(schools);
      if (schools.length === 1) setForm(prev => ({ ...prev, school_id: prev.school_id || schools[0].id }));
      loadCourses(schools.map(s => s.id));
    };

    // Keep the old promise chain lightweight while still avoiding broad teacher course fetches.
    if (profile.role === 'teacher') {
      const schoolMap = new Map<string, string>();
      const loads: PromiseLike<any>[] = [];
      if (profile.school_id) {
        loads.push(
          db.from('schools').select('id, name').eq('id', profile.school_id).maybeSingle()
            .then(({ data }) => { if (data?.id) schoolMap.set(data.id, data.name); }),
        );
      }
      loads.push(
        db.from('teacher_schools').select('school_id, schools(id, name)').eq('teacher_id', profile.id)
          .then(({ data }) => {
            (data ?? []).forEach((row: any) => {
              if (row.schools?.id) schoolMap.set(row.schools.id, row.schools.name);
            });
          }),
      );
      Promise.all(loads).then(() => {
        setTeacherSchools([...schoolMap.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)));
      });
    }

    // Pre-fill programme and lock school when launched from a class page.
    if (preClassId) {
      db.from('classes').select('id, name, program_id, school_id').eq('id', preClassId).maybeSingle()
        .then(({ data: cls }) => {
          if (!cls) return;
          setClassId(cls.id);
          setClassName(cls.name || '');
          setForm(prev => ({
            ...prev,
            program_id: cls.program_id || prev.program_id,
            school_id: cls.school_id || prev.school_id,
          }));
        });
    }
  }, [profile?.id, authLoading, preProgramId, preCourseId, preClassId, preSchoolId]);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
  const selectedSchoolName = assignedSchools.find(s => s.id === form.school_id)?.name || '';
  const autoClosePreview = form.start_date
    ? new Date(new Date(form.start_date).getTime() + ((parseInt(form.access_window_minutes, 10) || parseInt(form.duration_minutes, 10) || 60) * 60_000))
    : null;

  const addQuestion = () => setQuestions(q => [...q, emptyQuestion()]);
  const removeQuestion = (i: number) => setQuestions(q => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, patch: Partial<Question>) =>
    setQuestions(q => q.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  const updateOption = (qi: number, oi: number, val: string) =>
    setQuestions(q => q.map((item, idx) => idx === qi ? { ...item, options: item.options.map((o, j) => j === oi ? val : o) } : item));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.program_id) {
      setError('Title and programme are required.');
      return;
    }
    if (profile?.role === 'teacher' && !form.school_id) {
      setError('Select the school that should see this exam.');
      return;
    }
    if (useWeights && sectionWeights.objective + sectionWeights.subjective + sectionWeights.practical !== 100) {
      setError('Section weights must total exactly 100%.');
      return;
    }
    // Use selected questions if any selection was made, otherwise use all filled questions
    const hasSelection = selectedQuestions.size > 0;
    const validQuestions = questions.filter((q, i) =>
      q.question_text.trim() && (!hasSelection || selectedQuestions.has(i))
    );
    if (validQuestions.length === 0) {
      setError('Add at least one question (or tick the questions you want to include).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const weightTotal = sectionWeights.objective + sectionWeights.subjective + sectionWeights.practical;
      const examPayload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        program_id: form.program_id,
        course_id: form.course_id || null,
        duration_minutes: parseInt(form.duration_minutes) || 60,
        passing_score: parseInt(form.passing_score) || 70,
        total_questions: validQuestions.length,
        metadata: {
            exam_type: form.exam_type,
            ...(useWeights ? { section_weights: sectionWeights, weights_total: weightTotal } : {}),
            ...(preWeek ? { week: parseInt(preWeek, 10) } : {}),
            ...(preCurrId ? { curriculum_id: preCurrId } : {}),
            ...(preLessonPlanId ? { lesson_plan_id: preLessonPlanId } : {}),
            ...(preLessonId ? { lesson_id: preLessonId } : {}),
            source: preCurrId ? 'curriculum' : (classId ? 'class' : 'standalone'),
            ...(classId ? { target_class_id: classId, visibility: 'class' } : {}),
        },
        questions: validQuestions.map((q, i) => ({
          question_text: q.question_text.trim(),
          question_type: q.question_type,
          options: ['multiple_choice', 'true_false'].includes(q.question_type)
            ? q.options.filter((o: string) => o.trim())
            : null,
          correct_answer: q.correct_answer.trim(),
          points: q.points,
          section: q.section,
          order_index: i + 1,
        })),
      };
      if (form.start_date) {
        const start = new Date(form.start_date);
        examPayload.start_date = start.toISOString();
        const windowMinutes = parseInt(form.access_window_minutes, 10) || parseInt(form.duration_minutes, 10) || 60;
        examPayload.end_date = new Date(start.getTime() + windowMinutes * 60_000).toISOString();
        examPayload.metadata.access_window_minutes = windowMinutes;
      } else if (form.end_date) {
        examPayload.end_date = new Date(form.end_date).toISOString();
      }
      if (classId) examPayload.class_id = classId;
      if (preLessonPlanId) examPayload.lesson_plan_id = preLessonPlanId;
      if (preLessonId) examPayload.lesson_id = preLessonId;
      if (preWeek) examPayload.curriculum_week_number = parseInt(preWeek, 10);
      if (form.school_id) examPayload.school_id = form.school_id;
      else if (profile?.school_id) examPayload.school_id = profile.school_id;

      const res = await fetch('/api/cbt/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(examPayload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to create exam'); }

      router.push(classId ? `/dashboard/classes/${classId}?operation=assessment` : '/dashboard/cbt');
    } catch (e: any) {
      setError(e.message ?? 'Failed to create exam');
    } finally {
      setSaving(false);
    }
  };

  // ── Print exam sheet — always prints every filled question (selection is for save only) ──
  const handlePrintExam = (mode: 'student' | 'staff') => {
    let toPrint = questions.filter((q) => q.question_text.trim());
    if (printFilter === 'mcq') toPrint = toPrint.filter(isObjectiveQuestion);
    if (printFilter === 'theory') toPrint = toPrint.filter(isTheoryQuestion);
    if (toPrint.length === 0) {
      alert(printFilter === 'mcq' ? 'No objective (MCQ/True-False) questions found.' : printFilter === 'theory' ? 'No theory questions found.' : 'No questions to print. Add questions first.');
      return;
    }

    const prog = programs.find(p => p.id === form.program_id)?.name ?? '';
    const course = courses.find(c => c.id === form.course_id)?.title ?? '';
    const mcq = toPrint.filter(isObjectiveQuestion);
    const theory = toPrint.filter(isTheoryQuestion);

    openCbtPrintWindow(buildCbtPrintHtml({
      title: form.title || 'Computer-Based Test',
      schoolName: 'Rillcod Technologies',
      subtitle: [prog, course].filter(Boolean).join(' · ') || undefined,
      description: form.description.trim() || undefined,
      durationMinutes: parseInt(form.duration_minutes, 10) || 60,
      passingScore: parseInt(form.passing_score, 10) || 70,
      dateStr: new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }),
      docRef: `CBT-${Date.now().toString(36).toUpperCase()}`,
      logoUrl: `${window.location.origin}/logo.png`,
      mcqQuestions: mcq,
      theoryQuestions: theory,
      mode,
      examTypeLabel: printFilter === 'mcq' ? 'OBJECTIVE' : printFilter === 'theory' ? 'THEORY' : 'EXAMINATION',
    }));
  };

  if (authLoading || profileLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
      <p className="text-muted-foreground">Staff access required.</p>
    </div>
  );

  return (
    <div className={`min-h-screen bg-background text-foreground ${isMinimal ? 'p-0' : 'p-4 sm:p-8'}`}>
      <div className={`${isMinimal ? 'w-full' : 'max-w-4xl mx-auto'} space-y-6`}>
        {!isMinimal && (
          <Link href="/dashboard/cbt" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeftIcon className="w-4 h-4" /> Back to CBT
          </Link>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AcademicCapIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{isMinimal ? 'Add Context' : 'New Exam'}</span>
            </div>
            <h1 className="text-3xl font-extrabold italic tracking-tight">Create CBT Exam</h1>
            {!isMinimal && <p className="text-muted-foreground text-sm mt-1 font-medium italic">Architect your assessment environment</p>}
          </div>
          <div className="flex items-center gap-2">
            {questions.some(q => q.question_text.trim()) && (
              <div className="flex items-center gap-1">
                {/* Question type filter for print */}
                <div className="flex border border-primary/30 rounded-xl overflow-hidden">
                  {(['all', 'mcq', 'theory'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setPrintFilter(f)}
                      className={`px-2.5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${printFilter === f ? 'bg-primary/30 text-primary' : 'bg-primary/10 text-primary/50 hover:bg-primary/20 hover:text-primary'}`}>
                      {f === 'all' ? 'All' : f === 'mcq' ? 'Obj' : 'Theory'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePrintExam('student')}
                    className="flex items-center gap-2 px-4 py-3 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-black text-[10px] uppercase tracking-[0.18em] rounded-xl transition-all"
                  >
                    Student Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintExam('staff')}
                    className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-black text-[10px] uppercase tracking-[0.18em] rounded-xl transition-all"
                  >
                    Teacher Copy
                  </button>
                </div>
              </div>
            )}
            <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-foreground font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-xl shadow-emerald-900/40 transition-all disabled:opacity-50">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Creating...' : (isMinimal ? 'CREATE' : 'PUBLISH EXAM')}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <p className="text-rose-600 dark:text-rose-400 text-sm">{error}</p>
          </div>
        )}

        {/* Premium AI Exam Engine Panel */}
        <div className="p-8 bg-gradient-to-br from-primary/20 to-primary/70/10 border border-primary/20 rounded-[2rem] space-y-6 relative overflow-hidden group">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-[100px] group-hover:bg-primary/20 transition-all duration-1000" />
            
            <div className="flex items-center justify-between relative">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 border border-primary/30">
                        <SparklesIcon className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-foreground uppercase italic tracking-tighter">Premium AI Exam Engine</h3>
                        <p className="text-[10px] text-primary font-black uppercase tracking-[0.4em]">High-Precision Assessment Synthesis</p>
                    </div>
                </div>
                <button 
                  onClick={() => setAiOpen(!aiOpen)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-[10px] font-black text-foreground uppercase tracking-widest transition-all rounded-xl border border-white/10"
                >
                  {aiOpen ? 'Hide Controls' : 'Open Designer'}
                </button>
            </div>

            {aiOpen && (
              <div className="space-y-4 pt-4 relative animate-in slide-in-from-top-4 duration-500">
                  {/* Row 1: Topic */}
                  <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-brand-red-600/60">What topic is this exam on?</label>
                      <input
                          value={aiTopic}
                          onChange={e => setAiTopic(e.target.value)}
                          placeholder="e.g. Introduction to Python, Basic Electronics, Algebra"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-foreground placeholder:text-white/20 outline-none focus:border-primary/50 transition-all"
                      />
                  </div>

                  {/* Optional: base the questions on a PDF */}
                  <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-brand-red-600/60">Base on a PDF (optional)</label>
                      {sourceName ? (
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-500/10 border border-violet-500/25 rounded-2xl">
                          <span className="text-sm">📄</span>
                          <span className="text-xs text-violet-700 dark:text-violet-300 font-bold truncate flex-1">{sourceName}</span>
                          <button type="button" onClick={() => { setSourceText(''); setSourceName(''); }} className="text-[10px] font-black uppercase text-muted-foreground hover:text-white">Remove</button>
                        </div>
                      ) : (
                        <label className={`flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${extractingPdf ? 'border-violet-500/30 bg-violet-500/5' : 'border-white/10 hover:border-violet-500/40'}`}>
                          <span className="text-sm">📄</span>
                          <span className="text-xs font-bold text-muted-foreground">{extractingPdf ? (extractMsg || 'Reading PDF…') : 'Upload a PDF to build questions from'}</span>
                          <input type="file" className="hidden" accept="application/pdf" disabled={extractingPdf}
                            onChange={async e => {
                              const input = e.currentTarget; const file = input.files?.[0] ?? null; input.value = '';
                              if (!file) return;
                              setExtractingPdf(true); setAiError(null); setExtractMsg('Reading PDF…');
                              try {
                                const t = await extractPdfText(file, 8000, setExtractMsg);
                                if (t) { setSourceText(t); setSourceName(file.name); }
                                else setAiError('Could not read text from that PDF (is it scanned images?).');
                              } catch { setAiError('Could not read that PDF.'); }
                              finally { setExtractingPdf(false); }
                            }} />
                        </label>
                      )}
                  </div>

                  {/* Row 2: MCQ Count | Theory Count | Total badge | Generate button */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Realistic boundary</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {examBoundary.label}: {examBoundary.min}-{examBoundary.max} questions · {examBoundary.duration}. {examBoundary.note}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-brand-red-600/60">
                            Multiple-choice questions
                          </label>
                          <input
                            type="number" min="0" max={examBoundary.max}
                            value={aiMcqCount}
                            onChange={e => setAiMcqCount(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all"
                          />
                      </div>
                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-brand-red-600/60">
                            Written / essay questions
                          </label>
                          <input
                            type="number" min="0" max={examBoundary.max}
                            value={aiTheoryCount}
                            onChange={e => setAiTheoryCount(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all"
                          />
                      </div>
                      {/* Total display */}
                      <div className="flex flex-col items-center justify-center h-full py-2 gap-0.5 border border-white/10 rounded-2xl bg-white/5">
                          <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Total Questions</span>
                          <span className="text-3xl font-black text-primary leading-none">
                            {(parseInt(aiMcqCount) || 0) + (parseInt(aiTheoryCount) || 0)}
                          </span>
                          <span className="text-[8px] text-muted-foreground uppercase">
                            {parseInt(aiMcqCount) || 0} obj · {parseInt(aiTheoryCount) || 0} theory
                          </span>
                      </div>
                      <button
                          type="button"
                          onClick={handleAiGenerate}
                          disabled={aiGenerating}
                          className="flex flex-col items-center justify-center gap-1.5 p-4 bg-primary hover:bg-primary rounded-[1.5rem] transition-all shadow-xl shadow-primary/40 disabled:opacity-50"
                      >
                          <div className="text-[10px] font-black text-foreground uppercase tracking-widest">{aiGenerating ? 'Processing...' : 'Generate Exam'}</div>
                          <div className="text-[8px] text-muted-foreground uppercase">Architecture Build</div>
                      </button>
                  </div>

                  {aiError && <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold uppercase tracking-widest pl-2">Error: {aiError}</p>}
                  {aiGenerating && (
                      <div className="flex items-center gap-3 text-primary animate-pulse pl-2 border-l-2 border-primary">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Accessing OpenRouter Neural Clusters...</span>
                      </div>
                  )}
              </div>
            )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Exam Details */}
          <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Exam Details</h2>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                Exam Title <span className="text-rose-600 dark:text-rose-400">*</span>
              </label>
              <input type="text" required value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Python Programming Midterm"
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                  Programme <span className="text-rose-600 dark:text-rose-400">*</span>
                </label>
                <select required value={form.program_id}
                  onChange={e => {
                    const pid = e.target.value;
                    const currentCourse = courses.find(x => x.id === form.course_id);
                    setForm(f => ({
                      ...f,
                      program_id: pid,
                      course_id: currentCourse?.program_id === pid ? f.course_id : '',
                    }));
                  }}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                  <option value="">Select programme…</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                  Course {form.program_id ? <span className="text-rose-600 dark:text-rose-400">*</span> : <span className="text-muted-foreground">(select programme first)</span>}
                </label>
                <select value={form.course_id}
                  onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                  disabled={!form.program_id}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-40">
                  <option value="">{form.program_id ? 'Select a course…' : '— pick a programme first —'}</option>
                  {courses
                    .filter(c => c.program_id === form.program_id)
                    .filter(c => !form.school_id || !c.school_id || c.school_id === form.school_id)
                    .map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                Visible To School {profile?.role === 'teacher' ? <span className="text-rose-600 dark:text-rose-400">*</span> : <span className="text-muted-foreground">(optional for admin)</span>}
              </label>
              <select
                value={form.school_id}
                onChange={e => {
                  const schoolId = e.target.value;
                  setForm(f => {
                    const currentCourse = courses.find(c => c.id === f.course_id);
                    const keepCourse = !currentCourse?.school_id || !schoolId || currentCourse.school_id === schoolId;
                    return { ...f, school_id: schoolId, course_id: keepCourse ? f.course_id : '' };
                  });
                }}
                disabled={!!classId}
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">
                  {profile?.role === 'admin' ? 'Platform-wide / no school gate' : 'Select one of your assigned schools…'}
                </option>
                {assignedSchools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
              </select>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {classId
                  ? `Locked to the class school${selectedSchoolName ? `: ${selectedSchoolName}` : ''}.`
                  : form.school_id
                    ? `Only students and staff scoped to ${selectedSchoolName || 'this school'} will see this exam.`
                    : 'Teachers must choose one assigned school so the exam is not exposed outside the intended school.'}
              </p>
            </div>

            {/* Exam Type — critical for score routing */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button"
                onClick={() => setForm(f => ({ ...f, exam_type: 'examination' }))}
                className={`flex items-start gap-3 px-4 py-3 border text-left transition-all ${form.exam_type === 'examination' ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-card border-border hover:border-indigo-500/30'}`}>
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 border-2 ${form.exam_type === 'examination' ? 'bg-indigo-500 border-indigo-500' : 'border-muted-foreground'}`} />
                <div>
                  <p className="text-xs font-black text-foreground uppercase tracking-widest">Examination</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">40% of final grade · main end-of-term exam</p>
                </div>
              </button>
              <button type="button"
                onClick={() => setForm(f => ({ ...f, exam_type: 'evaluation' }))}
                className={`flex items-start gap-3 px-4 py-3 border text-left transition-all ${form.exam_type === 'evaluation' ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-card border-border hover:border-cyan-500/30'}`}>
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 border-2 ${form.exam_type === 'evaluation' ? 'bg-cyan-500 border-cyan-500' : 'border-muted-foreground'}`} />
                <div>
                  <p className="text-xs font-black text-foreground uppercase tracking-widest">Evaluation (Test)</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">20% of final grade · compulsory class test</p>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Duration (min)</label>
                <input type="number" min="5" value={form.duration_minutes}
                  onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Passing Score (%)</label>
                <input type="number" min="1" max="100" value={form.passing_score}
                  onChange={e => setForm(f => ({ ...f, passing_score: e.target.value }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Status</label>
                <select value={form.is_active ? 'active' : 'inactive'}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Start Date/Time</label>
                <input type="datetime-local" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Open Window (min)</label>
                <input type="number" min="5" value={form.access_window_minutes}
                  onChange={e => setForm(f => ({ ...f, access_window_minutes: e.target.value }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Auto Closes</label>
                <p className="text-sm font-semibold text-foreground">
                  {autoClosePreview ? autoClosePreview.toLocaleString() : 'Set a start time'}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                  After this time students cannot start or continue the exam.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Description</label>
              <textarea rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional exam description…"
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-none" />
            </div>
          </div>

          {/* Section Weights */}
          <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Section Weighting</h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">Assign % weight per section. Total must equal 100%.</p>
              </div>
              <button type="button" onClick={() => setUseWeights(w => !w)}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all ${useWeights ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-card shadow-sm border-border text-muted-foreground hover:border-emerald-500/30'}`}>
                {useWeights ? 'Weighted ON' : 'Flat Points (default)'}
              </button>
            </div>
            {useWeights && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  {(['objective', 'subjective', 'practical'] as const).map(sec => (
                    <div key={sec}>
                      <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">{sec} %</label>
                      <input type="number" min="0" max="100"
                        value={sectionWeights[sec]}
                        onChange={e => setSectionWeights(w => ({ ...w, [sec]: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                    </div>
                  ))}
                </div>
                {(() => {
                  const total = sectionWeights.objective + sectionWeights.subjective + sectionWeights.practical;
                  return (
                    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${total === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      <div className={`w-2 h-2 rounded-full ${total === 100 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      Total: {total}% {total === 100 ? '— Valid' : '— Must equal 100%'}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                  Questions ({selectedQuestions.size > 0 ? `${selectedQuestions.size} selected / ` : ''}{questions.length} total)
                </h2>
                {selectedQuestions.size > 0 && (
                  <p className="text-[10px] text-emerald-600/60 dark:text-emerald-400/60 mt-0.5">Only ticked questions will be included in the exam</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {questions.length > 0 && (
                  <button type="button"
                    onClick={() => {
                      if (selectedQuestions.size === questions.length) {
                        setSelectedQuestions(new Set());
                      } else {
                        setSelectedQuestions(new Set(questions.map((_, i) => i)));
                      }
                    }}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 bg-card shadow-sm rounded-xl border border-border">
                    {selectedQuestions.size === questions.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
                <button type="button" onClick={addQuestion}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors">
                  <PlusIcon className="w-3.5 h-3.5" /> Add Question
                </button>
              </div>
            </div>

            {questions.map((q, qi) => {
              const isSelected = selectedQuestions.has(qi);
              return (
              <div key={qi} className={`border rounded-xl overflow-hidden transition-all group ${isSelected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-card shadow-sm border-border hover:bg-white/[0.07]'}`}>
                <div className="flex items-center justify-between px-5 py-3 bg-white/3 border-b border-border">
                  <div className="flex items-center gap-3">
                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedQuestions);
                        if (next.has(qi)) next.delete(qi); else next.add(qi);
                        setSelectedQuestions(next);
                      }}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400' : 'border-border hover:border-emerald-500/50'}`}
                    >
                      {isSelected && <CheckIcon className="w-3 h-3 text-foreground" />}
                    </button>
                    <span className="text-xs font-black text-muted-foreground w-6 tracking-tighter italic">#{qi + 1}</span>
                    <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        {q.question_type === 'essay' || q.question_type === 'fill_blank' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-black uppercase text-amber-600 dark:text-amber-400 italic flex items-center gap-1">
                                <SparklesIcon className="w-2.5 h-2.5" /> Manual Eval
                            </span>
                        ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 italic flex items-center gap-1">
                                <CheckCircleIcon className="w-2.5 h-2.5" /> Auto Graded
                            </span>
                        )}
                    </div>
                  </div>
                  {questions.length > 1 && (
                    <button type="button" onClick={() => removeQuestion(qi)}
                      className="p-1.5 text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-colors scale-90 opacity-40 group-hover:opacity-100 group-hover:scale-100">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-5 space-y-4">

                <textarea rows={4} value={q.question_text}
                  onChange={e => updateQuestion(qi, { question_text: e.target.value })}
                  placeholder="Enter question text… Use ```python for code blocks, or `inline code`"
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-y font-mono" />
                {(q.question_text.includes('```') || q.question_text.includes('`')) && (
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Preview</p>
                    <CbtMarkdown text={q.question_text} className="text-sm" />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Type</label>
                    <select value={q.question_type}
                      onChange={e => updateQuestion(qi, {
                        question_type: e.target.value,
                        options: e.target.value === 'true_false' ? ['True', 'False'] : ['', '', '', ''],
                        correct_answer: '',
                        section: e.target.value === 'essay' ? 'subjective' : q.section,
                      })}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="fill_blank">Fill in Blank</option>
                      <option value="essay">Essay</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Section</label>
                    <select value={q.section}
                      onChange={e => updateQuestion(qi, { section: e.target.value as Question['section'] })}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                      <option value="objective">Objective — multiple choice / true-false</option>
                      <option value="subjective">Subjective — written / essay answers</option>
                      <option value="practical">Practical — hands-on / lab task</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Points</label>
                    <input type="number" min="1" value={q.points}
                      onChange={e => updateQuestion(qi, { points: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  {(q.question_type === 'fill_blank' || q.question_type === 'essay') && (
                    <div className="sm:col-span-2">
                        <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Correct Answer / Scoring Guide</label>
                        <input type="text" value={q.correct_answer}
                            onChange={e => updateQuestion(qi, { correct_answer: e.target.value })}
                            placeholder={q.question_type === 'fill_blank' ? "Exact answer..." : "Grading rubric or points guide..."}
                            className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                    </div>
                  )}
                </div>

                {q.question_type === 'true_false' && (
                  <div className="flex gap-4">
                    {['True', 'False'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateQuestion(qi, { correct_answer: opt })}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all ${q.correct_answer === opt ? 'bg-emerald-500 border-emerald-400 text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        {q.correct_answer === opt && <CheckIcon className="w-4 h-4" />}
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.question_type === 'multiple_choice' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs text-muted-foreground uppercase tracking-widest">Options (Select the correct one)</label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {q.options.map((opt, oi) => {
                        const isCorrect = q.correct_answer === opt && opt !== '';
                        return (
                          <div 
                            key={oi} 
                            onClick={(e) => {
                              if (opt.trim()) updateQuestion(qi, { correct_answer: opt });
                            }}
                            className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all cursor-pointer group/opt ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/20' : 'bg-card shadow-sm border-border hover:border-border'}`}
                          >
                            <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center flex-shrink-0 transition-all ${isCorrect ? 'bg-emerald-500 border-emerald-500 text-foreground shadow-lg shadow-emerald-500/20' : 'border-border group-hover/opt:border-border text-muted-foreground'}`}>
                              {isCorrect ? <CheckIcon className="w-4 h-4 font-black" /> : <span className="text-[10px] font-black">{String.fromCharCode(65 + oi)}</span>}
                            </div>
                            <input 
                              type="text" 
                              value={opt}
                              onClick={e => e.stopPropagation()}
                              onChange={e => {
                                const newVal = e.target.value;
                                const wasCorrect = q.correct_answer === opt;
                                updateOption(qi, oi, newVal);
                                if (wasCorrect) updateQuestion(qi, { correct_answer: newVal });
                              }}
                              placeholder={`Enter option ${String.fromCharCode(65 + oi)}…`}
                              className="flex-1 bg-transparent border-none px-1 py-1 text-sm text-foreground placeholder-muted-foreground focus:outline-none" 
                            />
                            {isCorrect && (
                              <span className="hidden sm:block text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mr-2">Correct</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </div>
              </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Link href="/dashboard/cbt"
              className="px-5 py-2.5 bg-card shadow-sm hover:bg-muted text-muted-foreground text-sm font-bold rounded-xl transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/20">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Exam'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
