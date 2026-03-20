// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, ClipboardDocumentListIcon, CalendarIcon,
  CheckIcon, ExclamationTriangleIcon, ArrowPathIcon, PlusIcon, TrashIcon,
  ChevronUpIcon, ChevronDownIcon, AcademicCapIcon,
  CodeBracketIcon, CommandLineIcon, SparklesIcon as SparklesIconOutline
} from '@/lib/icons';
import { isPuterAvailable, puterChat } from '@/lib/puter-ai';

interface Question {
  question_text: string;
  question_type: string;
  options: string[];
  correct_answer: string;
  points: number;
  metadata?: {
    logic_sentence?: string; // e.g. "When [BLANK] click, move [BLANK] steps"
    logic_blocks?: string[];  // e.g. ["Green Flag", "10", "Space Key"]
  };
}

const emptyQuestion = (): Question => ({
  question_text: '',
  question_type: 'multiple_choice',
  options: ['', '', '', ''],
  correct_answer: '',
  points: 5,
  metadata: { logic_sentence: '', logic_blocks: ['', '', ''] }
});

export default function NewAssignmentPage() {
  const router = useRouter();
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const preProgramId = searchParams?.get('program_id');
  const preCourseId = searchParams?.get('course_id');
  const preLessonId = searchParams?.get('lesson_id');
  const [courses, setCourses] = useState<any[]>([]);
  const [linkedLesson, setLinkedLesson] = useState<{ id: string; title: string } | null>(null);
  const isMinimal = searchParams?.get('minimal') === 'true';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    instructions: '',
    course_id: '',
    due_date: '',
    max_points: '100',
    assignment_type: 'homework',
  });
  const [questions, setQuestions] = useState<Question[]>([]);

  // AI Generation State
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiLastModel, setAiLastModel] = useState<string | null>(null);
  const [aiJustGenerated, setAiJustGenerated] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) { setAiError('Enter a topic first.'); return; }
    setAiGenerating(true);
    setAiError(null);
    setAiLastModel(null);
    try {
      let data: any = null;

      if (isPuterAvailable()) {
        // Free path — Puter.js
        const prompt = `Generate a structured assignment for Nigerian secondary school students on this topic: "${aiTopic}".
Return ONLY valid JSON (no markdown, no code fence) with this shape:
{
  "title": "...",
  "description": "...",
  "instructions": "Step-by-step instructions...",
  "assignment_type": "homework|project|coding|quiz",
  "questions": [
    { "question_text": "...", "question_type": "multiple_choice", "options": ["A","B","C","D"], "correct_answer": "A", "points": 5 }
  ]
}
Include 3-5 questions. Match difficulty to JSS/SS level.`;
        const raw = await puterChat(prompt);
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('AI returned unexpected format');
        data = JSON.parse(jsonMatch[0]);
        setAiLastModel('Puter.js (Free)');
      } else {
        // Fallback — server route
        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'assignment', topic: aiTopic }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Generation failed');
        data = result.data;
        setAiLastModel(result.model?.split('/')?.pop() ?? 'OpenRouter');
      }

      setForm(prev => ({
        ...prev,
        title: data.title || prev.title,
        description: data.description || prev.description,
        instructions: data.instructions || prev.instructions,
        assignment_type: data.assignment_type || prev.assignment_type,
      }));
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions.map((q: any) => ({
          question_text: q.question_text || '',
          question_type: q.question_type || 'multiple_choice',
          options: Array.isArray(q.options) ? q.options : ['', '', '', ''],
          correct_answer: q.correct_answer || '',
          points: q.points || 5,
          metadata: { logic_sentence: '', logic_blocks: ['', '', ''] },
        })));
      }
      setAiJustGenerated(true);
      setTimeout(() => setAiJustGenerated(false), 3000);
      setAiOpen(false);
      // Scroll form into view
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e: any) {
      setAiError(e.message || 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    
    // Fetch courses with a more robust query for teachers/admins
    const fetchData = async () => {
      let query = createClient()
        .from('courses')
        .select('id, title, program_id, school_id, programs(name)')
        .eq('is_active', true);

      // If teacher has a school, prioritize that school's courses + global ones
      if (profile?.school_id) {
        // use filter to handle the OR condition effectively
        query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
      }

      const { data } = await query.order('title');
      const courseList = data ?? [];
      setCourses(courseList);

      // Auto-select if IDs provided in URL
      if (preCourseId) {
        setForm(prev => ({ ...prev, course_id: preCourseId }));
      } else if (preProgramId && courseList.length > 0) {
        const matching = courseList.find((c: any) => c.program_id === preProgramId);
        if (matching) setForm(prev => ({ ...prev, course_id: matching.id }));
      }

      // Fetch linked lesson title if lesson_id provided
      if (preLessonId) {
        const db = createClient();
        const { data: lessonRow } = await db.from('lessons').select('id, title, course_id').eq('id', preLessonId).single();
        if (lessonRow) {
          setLinkedLesson({ id: lessonRow.id, title: lessonRow.title });
          // Also auto-select the lesson's course
          setForm(prev => ({ ...prev, course_id: lessonRow.course_id ?? prev.course_id }));
        }
      }
    };

    fetchData();
  }, [profile?.id, authLoading, preProgramId, preCourseId, preLessonId, profile?.school_id]);

  const addQuestion = () => setQuestions(q => [...q, emptyQuestion()]);
  const removeQuestion = (i: number) => setQuestions(q => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, patch: Partial<Question>) =>
    setQuestions(q => q.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  const updateOption = (qi: number, oi: number, val: string) =>
    setQuestions(q => q.map((item, idx) => idx === qi ? { ...item, options: item.options.map((o, j) => j === oi ? val : o) } : item));
  const moveQuestion = (i: number, dir: -1 | 1) => {
    setQuestions(prev => {
      const next = [...prev];
      const target = i + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  };

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.course_id) {
      setError('Title and course are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        instructions: form.instructions.trim() || null,
        course_id: form.course_id,
        lesson_id: linkedLesson?.id ?? null,
        max_points: parseInt(form.max_points) || 100,
        assignment_type: form.assignment_type,
        is_active: true,
        created_by: profile?.id || '',
        questions: questions.length > 0 ? questions.filter(q => q.question_text.trim()) : null,
      };
      if (form.due_date) payload.due_date = new Date(form.due_date).toISOString();

      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to create assignment'); }
      // Return to the lesson if this assignment was created from a lesson
      if (linkedLesson?.id) {
        router.push(`/dashboard/lessons/${linkedLesson.id}`);
      } else {
        router.push('/dashboard/assignments');
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || profileLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Staff access required.</p>
    </div>
  );

  return (
    <div className={`min-h-screen bg-background text-foreground ${isMinimal ? 'p-0' : 'p-4 sm:p-8'}`}>
      <div className={`${isMinimal ? 'w-full' : 'max-w-4xl mx-auto'} space-y-6`}>

        {!isMinimal && (
          <Link href="/dashboard/assignments"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeftIcon className="w-4 h-4" /> Back to Assignments
          </Link>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardDocumentListIcon className="w-5 h-5 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-[0.2em]">{isMinimal ? 'Add Context' : 'New Assignment'}</span>
            </div>
            <h1 className="text-3xl font-black italic tracking-tight">Create Assignment</h1>
            {!isMinimal && <p className="text-muted-foreground text-sm mt-1 font-medium italic">Define challenges for applied learning</p>}
          </div>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-8 py-3 bg-amber-600 hover:bg-amber-500 text-foreground font-black text-xs uppercase tracking-[0.2em] rounded-none shadow-xl shadow-amber-900/40 transition-all disabled:opacity-50">
            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            {saving ? 'Creating...' : (isMinimal ? 'CREATE' : 'PUBLISH TASK')}
          </button>
        </div>

        {linkedLesson && (
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 p-4">
            <AcademicCapIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Linked to Lesson</p>
              <p className="text-sm font-bold text-foreground truncate">{linkedLesson.title}</p>
            </div>
            <Link href={`/dashboard/lessons/${linkedLesson.id}`} className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest">
              ← Back to Lesson
            </Link>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-none p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        {/* AI Assignment Generator */}
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-400/5 border border-amber-500/20 rounded-none overflow-hidden">
          <button
            type="button"
            onClick={() => setAiOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-none bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                <SparklesIconOutline className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-black text-foreground uppercase tracking-widest">AI Assignment Generator</p>
                <p className="text-[10px] text-muted-foreground font-medium">
                  {aiLastModel
                    ? <span>Generated with <span className="text-amber-400">{aiLastModel}</span></span>
                    : 'Auto-fills title, description, instructions & questions'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isPuterAvailable() && (
                <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-widest">FREE</span>
              )}
              <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${aiOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {aiOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-amber-500/20">
              {aiError && (
                <div className="flex items-start gap-2 mt-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2">
                  <span className="flex-shrink-0">⚠</span> {aiError}
                </div>
              )}
              <div className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-3 space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Topic / Subject *</label>
                  <input
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAiGenerate(); } }}
                    placeholder="e.g. Introduction to Python functions"
                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={aiGenerating}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60 self-end"
                >
                  {aiGenerating
                    ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Generating...</>
                    : <><SparklesIconOutline className="w-4 h-4" /> Generate</>}
                </button>
              </div>
            </div>
          )}
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className={`bg-card shadow-sm border rounded-none p-6 space-y-5 transition-all duration-700 ${aiJustGenerated ? 'border-amber-500/60 shadow-amber-500/10 shadow-lg' : 'border-border'}`}>

          {aiJustGenerated && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold animate-in fade-in duration-300">
              <CheckIcon className="w-4 h-4" /> AI filled the form below — review and adjust as needed
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Title <span className="text-rose-400">*</span>
            </label>
            <input type="text" required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Python Functions Exercise"
              className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-amber-500 transition-colors" />
          </div>

          {/* Course */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Course <span className="text-rose-400">*</span>
            </label>
            <select required value={form.course_id}
              onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
              className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-amber-500 cursor-pointer">
              <option value="">Select a course…</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.title}{c.programs?.name ? ` — ${c.programs.name}` : ''}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Type</label>
              <select value={form.assignment_type}
                onChange={e => setForm(f => ({ ...f, assignment_type: e.target.value }))}
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-amber-500 cursor-pointer">
                <option value="homework">📚 Homework</option>
                <option value="project">🛠 Project / Lab</option>
                <option value="coding">💻 Coding Challenge</option>
                <option value="quiz">📝 Interactive Quiz</option>
                <option value="exam">🎯 Main Exam</option>
                <option value="presentation">🎤 Presentation</option>
                <option value="essay">📄 Essay</option>
                <option value="research">🔬 Research Assignment</option>
                <option value="lab">🧪 Science Lab</option>
                <option value="discussion">💬 Discussion / Reflection</option>
              </select>
            </div>

            {/* Max Points */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Max Points</label>
              <input type="number" min="1" max="1000" value={form.max_points}
                onChange={e => setForm(f => ({ ...f, max_points: e.target.value }))}
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-amber-500 transition-colors" />
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                <span className="flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5" /> Due Date</span>
              </label>
              <input type="datetime-local" value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-amber-500 transition-colors" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Description</label>
            <textarea rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief overview of the assignment…"
              className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-amber-500 transition-colors resize-none" />
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Instructions</label>
            <textarea rows={4} value={form.instructions}
              onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
              placeholder="Step-by-step instructions for students…"
              className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-amber-500 transition-colors resize-none" />
          </div>

          {/* ── Question Canvas ── */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                  <AcademicCapIcon className="w-4 h-4 text-amber-400" />
                  Questions ({questions.length})
                </h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">Optional: Add questions for an interactive homework experience</p>
              </div>
              <button type="button" onClick={addQuestion}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-none transition-colors">
                <PlusIcon className="w-3.5 h-3.5" /> Add Question
              </button>
            </div>

            {questions.map((q, qi) => (
              <div key={qi} className="bg-white/3 border border-border rounded-none overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-card shadow-sm border-b border-border">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter">Q{qi + 1}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveQuestion(qi, -1)} disabled={qi === 0}
                      className="p-1 text-muted-foreground hover:text-muted-foreground disabled:opacity-0 transition-colors">
                      <ChevronUpIcon className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => moveQuestion(qi, 1)} disabled={qi === questions.length - 1}
                      className="p-1 text-muted-foreground hover:text-muted-foreground disabled:opacity-0 transition-colors">
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => removeQuestion(qi)}
                      className="p-1 text-rose-400/60 hover:text-rose-400 transition-colors">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <textarea rows={2} value={q.question_text}
                    onChange={e => updateQuestion(qi, { question_text: e.target.value })}
                    placeholder="Enter question text…"
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-amber-500 transition-colors resize-none" />

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Type</label>
                      <select value={q.question_type}
                        onChange={e => updateQuestion(qi, { question_type: e.target.value, options: ['', '', '', ''], correct_answer: '' })}
                        className="w-full px-3 py-2 bg-card shadow-sm border border-border rounded-none text-xs text-foreground focus:outline-none cursor-pointer">
                        <option value="multiple_choice">Multiple Choice</option>
                        <option value="true_false">True / False</option>
                        <option value="fill_blank">Fill in Blank</option>
                        <option value="essay">Essay / Free Text</option>
                        <option value="coding_blocks">Visual Logic Block</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Points</label>
                      <input type="number" min="1" value={q.points}
                        onChange={e => updateQuestion(qi, { points: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 bg-card shadow-sm border border-border rounded-none text-xs text-foreground focus:outline-none" />
                    </div>
                    {(q.question_type === 'fill_blank' || q.question_type === 'essay') && (
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Correct Answer / Reference</label>
                        <input type="text" value={q.correct_answer}
                          onChange={e => updateQuestion(qi, { correct_answer: e.target.value })}
                          placeholder={q.question_type === 'fill_blank' ? "Exact answer..." : "Grading guide..."}
                          className="w-full px-3 py-2 bg-card shadow-sm border border-border rounded-none text-xs text-foreground placeholder-muted-foreground focus:outline-none" />
                      </div>
                    )}

                    {q.question_type === 'coding_blocks' && (
                      <div className="sm:col-span-1">
                         <label className="block text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Correct Blocks (ordered, comma separated)</label>
                         <input type="text" value={q.correct_answer}
                            onChange={e => updateQuestion(qi, { correct_answer: e.target.value })}
                            placeholder="e.g. Green Flag, 10"
                            className="w-full px-3 py-2 bg-card shadow-sm border border-border rounded-none text-xs text-foreground placeholder-muted-foreground focus:outline-none" />
                      </div>
                    )}
                  </div>

                  {q.question_type === 'coding_blocks' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Logic Sentence ([BLANK] = placeholder)</label>
                          <input type="text" value={q.metadata?.logic_sentence}
                             onChange={e => updateQuestion(qi, { metadata: { ...q.metadata, logic_sentence: e.target.value } })}
                             placeholder="e.g. When [BLANK] clicked, move [BLANK] steps"
                             className="w-full px-3 py-2 bg-card shadow-sm border border-border rounded-none text-xs text-foreground placeholder-muted-foreground focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Draggable Options (comma separated)</label>
                          <input type="text" value={q.metadata?.logic_blocks?.join(', ')}
                            onChange={e => updateQuestion(qi, { metadata: { ...q.metadata, logic_blocks: e.target.value.split(',').map(s=>s.trim()) } })}
                            placeholder="e.g. Green Flag, 10, Space Key"
                            className="w-full px-3 py-2 bg-card shadow-sm border border-border rounded-none text-xs text-foreground placeholder-muted-foreground focus:outline-none" />
                        </div>
                    </div>
                  )}

                  {q.question_type === 'true_false' && (
                    <div className="flex gap-4 pt-2">
                      {['True', 'False'].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => updateQuestion(qi, { correct_answer: opt })}
                          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-none border font-bold transition-all ${q.correct_answer === opt ? 'bg-amber-600 border-amber-500 text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}
                        >
                          {q.correct_answer === opt && <CheckIcon className="w-4 h-4" />}
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {q.question_type === 'multiple_choice' && (
                    <div className="space-y-3">
                      <label className="block text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Options (Select correct one)</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className={`flex items-center gap-2 p-1 rounded-none border transition-all ${q.correct_answer === opt && opt !== '' ? 'bg-amber-500/10 border-amber-500/50' : 'bg-card shadow-sm border-border'}`}>
                            <button
                              type="button"
                              onClick={() => updateQuestion(qi, { correct_answer: opt })}
                              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${q.correct_answer === opt && opt !== '' ? 'bg-amber-500 border-amber-500 text-foreground' : 'border-border hover:border-amber-500/50'}`}
                            >
                              {q.correct_answer === opt && opt !== '' && <CheckIcon className="w-3 h-3 font-black" />}
                            </button>
                            <input type="text" value={opt}
                              onChange={e => {
                                const newVal = e.target.value;
                                const isCorrect = q.correct_answer === opt;
                                updateOption(qi, oi, newVal);
                                if (isCorrect) updateQuestion(qi, { correct_answer: newVal });
                              }}
                              placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                              className="flex-1 bg-transparent border-none px-1 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link href="/dashboard/assignments"
              className="px-5 py-2.5 bg-card shadow-sm hover:bg-muted text-muted-foreground text-sm font-bold rounded-none transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-foreground text-sm font-bold rounded-none transition-all disabled:opacity-50 shadow-lg shadow-amber-900/20">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Assignment'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
