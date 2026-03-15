// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeft, BookOpen,
  Sparkles, Save, Layout, Settings2, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import CanvaEditor from '@/features/lessons/components/CanvaEditor';
import LessonAITools from '@/components/ai/LessonAITools';

export default function AddLessonPage() {
  const router = useRouter();
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const preProgramId = searchParams?.get('program_id');
  const preCourseId = searchParams?.get('course_id');
  const isMinimal = searchParams?.get('minimal') === 'true';

  const [courses, setCourses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'settings' | 'content'>('settings');

  // AI generation state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratingNotes, setAiGeneratingNotes] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiGrade, setAiGrade] = useState('JSS1–SS3');
  const [aiSubject, setAiSubject] = useState('');
  const [lastModel, setLastModel] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    lesson_notes: '',
    course_id: '',
    lesson_type: 'hands-on',
    duration_minutes: '60',
    session_date: '',
    video_url: '',
    status: 'draft',
    order_index: '',
    content_layout: [] as any[]
  });

  useEffect(() => {
    if (authLoading || !profile) return;
    
    const fetchData = async () => {
      const db = createClient();
      let query = db
        .from('courses')
        .select('id, title, program_id, school_id, programs(name)')
        .eq('is_active', true);

      if (profile?.school_id) {
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
    };

    fetchData();
  }, [profile?.id, authLoading, preProgramId, preCourseId, profile?.school_id]);

  // Auto-fill subject from selected course
  const handleCourseChange = (courseId: string) => {
    setForm(prev => ({ ...prev, course_id: courseId }));
    if (courseId && !aiSubject) {
      const course = courses.find(c => c.id === courseId);
      if (course?.title) setAiSubject(course.title);
      if (course?.title && !aiTopic) setAiTopic(course.title);
    }
  };

  // Full lesson generation — fills everything
  const handleAiGenerate = async (topicOverride?: string) => {
    const topicToUse = topicOverride || aiTopic;
    if (!topicToUse.trim()) { setAiError('Enter a topic first.'); setAiOpen(true); return; }

    setAiGenerating(true);
    setAiError(null);
    setLastModel(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'lesson',
          topic: topicToUse,
          gradeLevel: aiGrade,
          subject: aiSubject || undefined,
          durationMinutes: form.duration_minutes ? parseInt(form.duration_minutes) : 60,
          contentType: form.lesson_type,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Generation failed');
      const d = payload.data;
      setLastModel(payload.model ?? null);
      setForm(prev => ({
        ...prev,
        title: d.title ?? (topicOverride || prev.title),
        description: d.description ?? prev.description,
        lesson_notes: d.lesson_notes ?? prev.lesson_notes,
        content_layout: Array.isArray(d.content_layout) && d.content_layout.length > 0
          ? d.content_layout
          : prev.content_layout,
        video_url: d.video_url ?? prev.video_url,
        duration_minutes: d.duration_minutes ? String(d.duration_minutes) : prev.duration_minutes,
        lesson_type: d.lesson_type ?? prev.lesson_type,
      }));
      setAiOpen(false);
      setActiveTab('content');
    } catch (e: any) {
      setAiError(e.message ?? 'Failed to generate lesson');
      setAiOpen(true);
    } finally {
      setAiGenerating(false);
    }
  };

  // Notes-only generation — only overwrites lesson_notes
  const handleGenerateNotesOnly = async () => {
    const topicToUse = form.title || aiTopic;
    if (!topicToUse.trim()) { setAiError('Enter a lesson title or topic first.'); setAiOpen(true); return; }

    setAiGeneratingNotes(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'lesson-notes',
          topic: topicToUse,
          gradeLevel: aiGrade,
          subject: aiSubject || undefined,
          durationMinutes: form.duration_minutes ? parseInt(form.duration_minutes) : 60,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Generation failed');
      const notes = payload.data?.lesson_notes;
      if (notes) setForm(prev => ({ ...prev, lesson_notes: notes }));
    } catch (e: any) {
      setAiError(e.message ?? 'Failed to generate notes');
    } finally {
      setAiGeneratingNotes(false);
    }
  };

  const handleMagicTitle = () => {
    if (!form.course_id) { setError('Select a course first'); return; }
    const course = courses.find(c => c.id === form.course_id);
    if (course?.title) { setAiTopic(course.title); setAiSubject(course.title); }
    setAiOpen(true);
  };

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
        lesson_notes: form.lesson_notes.trim() || null,
        course_id: form.course_id,
        lesson_type: form.lesson_type,
        status: form.status,
        video_url: form.video_url.trim() || null,
        content_layout: form.content_layout,
        created_by: profile?.id || '',
      };
      if (form.duration_minutes) payload.duration_minutes = parseInt(form.duration_minutes);
      if (form.order_index) payload.order_index = parseInt(form.order_index) || null;
      if (form.session_date) payload.session_date = new Date(form.session_date).toISOString();

      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to create lesson'); }
      const { data } = await res.json();
      router.push(`/dashboard/lessons/${data.id}/edit`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create lesson');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || profileLoading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className={`min-h-screen bg-[#0f0f1a] text-white ${isMinimal ? 'p-0' : 'p-4 sm:p-8'}`}>
      <div className={`${isMinimal ? 'w-full' : 'max-w-5xl mx-auto'} space-y-8`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {!isMinimal ? (
            <Link href="/dashboard/lessons" className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Lessons
            </Link>
          ) : <div />}
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-sm rounded-xl shadow-xl shadow-cyan-900/40 transition-all disabled:opacity-50">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'CREATING...' : (isMinimal ? 'CREATE' : 'CREATE LESSON')}
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">New Session</span>
          </div>
          <h1 className="text-4xl font-black">Create Lesson</h1>
        </div>

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-sm font-medium">
            {error}
          </div>
        )}

        {/* AI Generate Panel */}
        <div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/5 border border-violet-500/20 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setAiOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Generate with AI</p>
                <p className="text-xs text-white/40">
                  {lastModel
                    ? <span>Last built with <span className="text-violet-400">{lastModel.split('/').pop()}</span></span>
                    : 'Auto-fill title, notes, and visual content blocks'}
                </p>
              </div>
            </div>
            {aiOpen ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
          </button>

          {aiOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-violet-500/20">
              {aiError && (
                <div className="flex items-start gap-2 mt-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                  <span className="flex-shrink-0">⚠</span> {aiError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
                <div className="space-y-1 md:col-span-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Lesson Topic *</label>
                  <input
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAiGenerate(); } }}
                    placeholder="e.g. Introduction to Python loops"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Grade Level</label>
                  <select
                    value={aiGrade}
                    onChange={e => setAiGrade(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                  >
                    {['Basic 1–Basic 3', 'Basic 4–Basic 6', 'JSS1', 'JSS2', 'JSS3', 'JSS1–JSS3', 'SS1', 'SS2', 'SS3', 'SS1–SS3', 'JSS1–SS3', 'Basic 1–SS3'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Subject</label>
                  <input
                    value={aiSubject}
                    onChange={e => setAiSubject(e.target.value)}
                    placeholder="e.g. Python Programming"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-violet-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAiGenerate()}
                  disabled={aiGenerating || aiGeneratingNotes}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all self-end"
                >
                  {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {aiGenerating ? 'Building lesson...' : 'Full AI Build'}
                </button>
              </div>
              <p className="text-[10px] text-white/30">
                <strong className="text-white/50">Full AI Build</strong> — generates title, description, notes, and all visual content blocks.
                Use <strong className="text-white/50">Generate Notes</strong> (in the notes field) to only rewrite the study notes.
                Press <kbd className="px-1 py-0.5 bg-white/10 rounded text-[9px]">Enter</kbd> in topic to quick-build.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-2xl w-fit">
          <TabBtn active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings2} label="Settings" />
          <TabBtn active={activeTab === 'content'} onClick={() => setActiveTab('content')} icon={Layout} label="Visual Content" />
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-8">
          {activeTab === 'settings' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Lesson Title *</label>
                    <button type="button" onClick={handleMagicTitle} className="text-[10px] font-black uppercase tracking-widest text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
                      <Sparkles className="w-3 h-3" /> Magic Suggest
                    </button>
                  </div>
                  <input
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Building your first App"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Linked Course</label>
                  <div className="relative">
                    <select value={form.course_id} onChange={e => handleCourseChange(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none appearance-none cursor-pointer">
                      <option value="">Select Course</option>
                      {courses.map((c: any) => <option key={c.id} value={c.id}>{c.title}{c.programs?.name ? ` — ${c.programs.name}` : ''}</option>)}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ChevronDown className="w-4 h-4 text-white/20" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <SelectField label="Type" value={form.lesson_type} options={['hands-on', 'video', 'interactive', 'workshop', 'coding']} onChange={(v: string) => setForm({ ...form, lesson_type: v })} />
                <Field label="Duration (min)" value={form.duration_minutes} type="number" onChange={(v: string) => setForm({ ...form, duration_minutes: v })} />
                <Field label="Order index" value={form.order_index} type="number" onChange={(v: string) => setForm({ ...form, order_index: v })} />
                <SelectField label="Status" value={form.status} options={['draft', 'scheduled', 'active']} onChange={(v: string) => setForm({ ...form, status: v })} />
              </div>

              <Field label="Brief Description" value={form.description} textarea onChange={(v: string) => setForm({ ...form, description: v })} />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Lesson Notes (Student Prerequisite)</label>
                  <button type="button" onClick={handleGenerateNotesOnly}
                    className="text-[9px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1 hover:text-violet-300 transition-colors disabled:opacity-50"
                    disabled={aiGeneratingNotes || aiGenerating}>
                    {aiGeneratingNotes
                      ? <><Loader2 className="w-3 h-3 animate-spin" /> Writing...</>
                      : <><Sparkles className="w-3 h-3" /> Generate Notes</>}
                  </button>
                </div>
                <textarea
                  value={form.lesson_notes}
                  onChange={e => setForm({ ...form, lesson_notes: e.target.value })}
                  placeholder="Detailed study notes for the student..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none resize-none"
                  rows={6}
                />
              </div>
              <Field label="Video URL (YouTube/Direct)" value={form.video_url} onChange={(v: string) => setForm({ ...form, video_url: v })} />
            </div>
          )}

          {activeTab === 'content' && (
            <div className="animate-in fade-in duration-500">
              <CanvaEditor layout={form.content_layout} onChange={l => setForm({ ...form, content_layout: l })} />
            </div>
          )}
        </div>

        {/* Hugging Face AI Tools */}
        <LessonAITools
          lessonTitle={form.title}
          lessonSubject={aiSubject}
          lessonGrade={aiGrade}
          lessonText={form.description}
          onTranscript={(text) => setForm(prev => ({
            ...prev,
            description: prev.description ? `${prev.description}\n\n${text}` : text,
          }))}
        />
      </div>

    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: any) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40' : 'text-white/40 hover:text-white hover:bg-white/5'}`}>
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function Field({ label, value, onChange, textarea, rows = 3, type = 'text' }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</label>
      {textarea ? (
        <textarea value={value} rows={rows} onChange={e => onChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none resize-none" />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none" />
      )}
    </div>
  );
}

function SelectField({ label, value, options, onChange }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none cursor-pointer">
        {options.map((o: any) => <option key={o} value={o}>{o.replace(/[-_]/g, ' ').toUpperCase()}</option>)}
      </select>
    </div>
  );
}
