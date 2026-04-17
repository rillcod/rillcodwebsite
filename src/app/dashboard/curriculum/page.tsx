'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { BookOpenIcon, PlusIcon, XMarkIcon, SparklesIcon, DocumentTextIcon } from '@/lib/icons';

interface Curriculum {
  id: string;
  course_id: string;
  content: any;
  version: number;
  created_at: string;
  courses?: { title: string };
  portal_users?: { full_name: string };
}

export default function CurriculumPage() {
  const { profile } = useAuth();
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Curriculum | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ course_id: '', course_name: '', grade_level: 'JSS1', subject_area: '', term_count: '3', weeks_per_term: '12', notes: '' });

  const isAdmin = ['admin', 'school'].includes(profile?.role ?? '');

  useEffect(() => { loadCurricula(); }, []);

  async function loadCurricula() {
    setLoading(true);
    const res = await fetch('/api/curricula');
    const json = await res.json();
    setCurricula(json.data ?? []);
    setLoading(false);
  }

  async function generate() {
    if (!form.course_name.trim()) return;
    setCreating(true);
    setError('');
    const res = await fetch('/api/curricula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, term_count: Number(form.term_count), weeks_per_term: Number(form.weeks_per_term) }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || 'Generation failed'); setCreating(false); return; }
    await loadCurricula();
    setShowCreate(false);
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">AI-Powered</span>
            </div>
            <h1 className="text-3xl font-black">Curriculum Generator</h1>
            <p className="text-muted-foreground text-sm mt-1">Generate full term curricula for any course using AI</p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors">
              <SparklesIcon className="w-4 h-4" /> Generate Curriculum
            </button>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#0d1526] border border-border rounded-none w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between">
                <h2 className="font-black flex items-center gap-2"><SparklesIcon className="w-4 h-4 text-orange-400" /> AI Curriculum Generator</h2>
                <button onClick={() => setShowCreate(false)}><XMarkIcon className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Course Name *', key: 'course_name', placeholder: 'e.g. Introduction to Python Programming' },
                  { label: 'Course ID (Supabase)', key: 'course_id', placeholder: 'UUID from courses table' },
                  { label: 'Subject Area', key: 'subject_area', placeholder: 'e.g. Computer Science, Robotics, AI' },
                  { label: 'Additional Notes', key: 'notes', placeholder: 'Any specific topics, constraints, or pedagogy notes…' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">{f.label}</label>
                    <input
                      value={form[f.key as keyof typeof form]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Grade Level</label>
                    <select value={form.grade_level} onChange={e => setForm(p => ({ ...p, grade_level: e.target.value }))} className="w-full bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm focus:outline-none focus:border-orange-500">
                      {['KG', 'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6', 'JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'].map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Terms</label>
                    <select value={form.term_count} onChange={e => setForm(p => ({ ...p, term_count: e.target.value }))} className="w-full bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm focus:outline-none focus:border-orange-500">
                      {['1', '2', '3'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {error && <p className="text-rose-400 text-xs">{error}</p>}
              {creating && <p className="text-amber-400 text-xs flex items-center gap-1.5"><SparklesIcon className="w-3.5 h-3.5 animate-spin" /> Generating full curriculum… this may take 30–60 seconds</p>}
              <div className="flex gap-3">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-card text-muted-foreground font-bold rounded-none hover:bg-muted text-sm transition-colors" disabled={creating}>Cancel</button>
                <button onClick={generate} disabled={!form.course_name.trim() || creating} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold rounded-none text-sm transition-colors">
                  {creating ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Curriculum viewer */}
        {selected && (
          <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
            <div className="bg-[#0d1526] border border-border rounded-none w-full max-w-3xl mt-8 mb-8">
              <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-[#0d1526]">
                <div>
                  <h2 className="font-black">{selected.courses?.title ?? 'Curriculum'}</h2>
                  <p className="text-xs text-muted-foreground">Version {selected.version} · {new Date(selected.created_at).toLocaleDateString()}</p>
                </div>
                <button onClick={() => setSelected(null)}><XMarkIcon className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div className="p-5">
                <pre className="text-xs text-foreground bg-black/20 p-4 overflow-x-auto rounded-none whitespace-pre-wrap">
                  {JSON.stringify(selected.content, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : curricula.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-none">
            <BookOpenIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">{isAdmin ? 'No curricula yet. Generate the first one!' : 'No curricula available.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {curricula.map(c => (
              <div key={c.id} className="bg-card border border-border rounded-none p-5 space-y-3 hover:border-orange-500/30 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm">{c.courses?.title ?? c.course_id}</h3>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">v{c.version}</span>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()} · by {c.portal_users?.full_name ?? 'Admin'}</p>
                <button onClick={() => setSelected(c)} className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors">
                  <DocumentTextIcon className="w-3.5 h-3.5" /> View Curriculum
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
