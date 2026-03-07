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
  const { profile, loading: authLoading } = useAuth();

  const [courses, setCourses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'settings' | 'content'>('settings');

  // AI generation state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState('');
  const [aiGrade, setAiGrade] = useState('JSS1–SS3');
  const [aiSubject, setAiSubject] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
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
    const db = createClient();
    let q = db.from('courses').select('id, title, programs(name)').eq('is_active', true).order('title');
    if (profile?.role === 'teacher') {
      q = (q as any).eq('teacher_id', profile.id);
    }
    q.then(({ data }) => setCourses(data ?? []));
  }, [profile?.id, authLoading]);

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) { setAiError('Enter a topic first.'); return; }
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'lesson',
          topic: aiTopic,
          gradeLevel: aiGrade,
          subject: aiSubject || undefined,
          durationMinutes: form.duration_minutes ? parseInt(form.duration_minutes) : 60,
          contentType: form.lesson_type,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Generation failed');
      const d = payload.data;
      setForm(prev => ({
        ...prev,
        title: d.title ?? prev.title,
        description: d.description ?? prev.description,
        content_layout: d.content_layout ?? prev.content_layout,
        video_url: d.video_url ?? prev.video_url,
      }));
      setAiOpen(false);
      setActiveTab('content');
    } catch (e: any) {
      setAiError(e.message ?? 'Failed to generate');
    } finally {
      setAiGenerating(false);
    }
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
        course_id: form.course_id,
        lesson_type: form.lesson_type,
        status: form.status,
        video_url: form.video_url.trim() || null,
        content_layout: form.content_layout,
        created_by: profile!.id,
      };
      if (form.duration_minutes) payload.duration_minutes = parseInt(form.duration_minutes);
      if (form.order_index) payload.order_index = parseInt(form.order_index) || null;
      if (form.session_date) payload.session_date = new Date(form.session_date).toISOString();

      const { data, error: err } = await createClient().from('lessons').insert(payload).select().single();
      if (err) throw err;
      router.push(`/dashboard/lessons/${data.id}/edit`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create lesson');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        <div className="flex items-center justify-between">
          <Link href="/dashboard/lessons" className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Lessons
          </Link>
          <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black text-sm rounded-xl shadow-xl shadow-cyan-900/40 transition-all disabled:opacity-50">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'CREATING...' : 'CREATE LESSON'}
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
                <p className="text-xs text-white/40">Auto-fill lesson content using Claude AI</p>
              </div>
            </div>
            {aiOpen ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
          </button>

          {aiOpen && (
            <div className="px-5 pb-5 space-y-4 border-t border-violet-500/20">
              {aiError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{aiError}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
                <div className="space-y-1 md:col-span-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Lesson Topic *</label>
                  <input
                    value={aiTopic}
                    onChange={e => setAiTopic(e.target.value)}
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
                    {['Basic 1–Basic 3','Basic 4–Basic 6','JSS1–JSS3','SS1–SS3','JSS1–SS3','Basic 1–SS3'].map(g => (
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
                  onClick={handleAiGenerate}
                  disabled={aiGenerating}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all self-end"
                >
                  {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {aiGenerating ? 'Generating...' : 'Generate'}
                </button>
              </div>
              <p className="text-[10px] text-white/30">AI will fill in the lesson title, description, and visual content blocks. You can edit everything after generation.</p>
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
                <Field label="Lesson Title" value={form.title} onChange={(v: string) => setForm({ ...form, title: v })} />
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Linked Course</label>
                  <select value={form.course_id} onChange={e => setForm({ ...form, course_id: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-cyan-500 outline-none">
                    <option value="">Select Course</option>
                    {courses.map((c: any) => <option key={c.id} value={c.id}>{c.title}{c.programs?.name ? ` — ${c.programs.name}` : ''}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <SelectField label="Type" value={form.lesson_type} options={['hands-on', 'video', 'interactive', 'workshop', 'coding']} onChange={(v: string) => setForm({ ...form, lesson_type: v })} />
                <Field label="Duration (min)" value={form.duration_minutes} type="number" onChange={(v: string) => setForm({ ...form, duration_minutes: v })} />
                <Field label="Order index" value={form.order_index} type="number" onChange={(v: string) => setForm({ ...form, order_index: v })} />
                <SelectField label="Status" value={form.status} options={['draft', 'scheduled', 'active']} onChange={(v: string) => setForm({ ...form, status: v })} />
              </div>

              <Field label="Description" value={form.description} textarea onChange={(v: string) => setForm({ ...form, description: v })} />
              <Field label="Video URL / Media Link" value={form.video_url} onChange={(v: string) => setForm({ ...form, video_url: v })} />
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
