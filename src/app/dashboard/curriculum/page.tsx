'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { BookOpenIcon, XMarkIcon, SparklesIcon, DocumentTextIcon, ClipboardDocumentListIcon } from '@/lib/icons';

interface Program {
  id: string;
  title: string;
  courses: { id: string; title: string; is_active: boolean }[];
}

interface Curriculum {
  id: string;
  course_id: string;
  content: any;
  version: number;
  created_at: string;
  courses?: { title: string };
  portal_users?: { full_name: string };
}

const SELECT_CLS = 'w-full bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm focus:outline-none focus:border-orange-500';
const INPUT_CLS  = 'w-full bg-card border border-border text-foreground px-4 py-2.5 rounded-none text-sm focus:outline-none focus:border-orange-500';

export default function CurriculumPage() {
  const { profile } = useAuth();
  const [curricula, setCurricula]   = useState<Curriculum[]>([]);
  const [programs, setPrograms]     = useState<Program[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [selected, setSelected]     = useState<Curriculum | null>(null);
  const [error, setError]           = useState('');

  // Form state
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedCourseId,  setSelectedCourseId]  = useState('');
  const [form, setForm] = useState({
    course_name: '',
    grade_level: 'JSS1',
    subject_area: '',
    term_count: '3',
    weeks_per_term: '12',
    notes: '',
  });

  const isStaff = ['admin', 'school', 'teacher'].includes(profile?.role ?? '');

  // Derived: courses from selected program
  const selectedProgram  = programs.find(p => p.id === selectedProgramId);
  const availableCourses = selectedProgram?.courses?.filter(c => c.is_active !== false) ?? [];

  useEffect(() => { loadCurricula(); loadPrograms(); }, []);

  async function loadPrograms() {
    const res = await fetch('/api/programs?is_active=true');
    const json = await res.json();
    setPrograms(json.data ?? []);
  }

  async function loadCurricula() {
    setLoading(true);
    const res = await fetch('/api/curricula');
    const json = await res.json();
    setCurricula(json.data ?? []);
    setLoading(false);
  }

  // When a course is selected, populate course_name automatically
  function handleCourseSelect(courseId: string) {
    setSelectedCourseId(courseId);
    const course = availableCourses.find(c => c.id === courseId);
    if (course) setForm(p => ({ ...p, course_name: course.title }));
  }

  function resetModal() {
    setSelectedProgramId('');
    setSelectedCourseId('');
    setForm({ course_name: '', grade_level: 'JSS1', subject_area: '', term_count: '3', weeks_per_term: '12', notes: '' });
    setError('');
    setShowCreate(false);
  }

  async function generate() {
    if (!form.course_name.trim()) return;
    setCreating(true);
    setError('');
    const res = await fetch('/api/curricula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        course_id: selectedCourseId || undefined,
        term_count: Number(form.term_count),
        weeks_per_term: Number(form.weeks_per_term),
      }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error || 'Generation failed'); setCreating(false); return; }
    await loadCurricula();
    resetModal();
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Tab bar — links the Curriculum → Lesson Plans → Lessons workflow */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
          <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-black">
            <SparklesIcon className="w-4 h-4" /> Curriculum
          </span>
          <Link href="/dashboard/lesson-plans"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <ClipboardDocumentListIcon className="w-4 h-4" /> Lesson Plans
          </Link>
          <Link href="/dashboard/lessons"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
            <BookOpenIcon className="w-4 h-4" /> Lessons
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">AI-Powered</span>
            </div>
            <h1 className="text-3xl font-black">Curriculum Generator</h1>
            <p className="text-muted-foreground text-sm mt-1">Generate full term curricula for any course using AI</p>
          </div>
          {isStaff && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-none transition-colors"
            >
              <SparklesIcon className="w-4 h-4" /> Generate Curriculum
            </button>
          )}
        </div>

        {/* ── Create modal ─────────────────────────────────────────── */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#0d1526] border border-border rounded-none w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
              <div className="flex items-center justify-between">
                <h2 className="font-black flex items-center gap-2">
                  <SparklesIcon className="w-4 h-4 text-orange-400" /> AI Curriculum Generator
                </h2>
                <button onClick={resetModal}><XMarkIcon className="w-5 h-5 text-muted-foreground" /></button>
              </div>

              <div className="space-y-3">
                {/* Step 1 — Program */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                    Program
                  </label>
                  <select
                    value={selectedProgramId}
                    onChange={e => { setSelectedProgramId(e.target.value); setSelectedCourseId(''); setForm(p => ({ ...p, course_name: '' })); }}
                    className={SELECT_CLS}
                  >
                    <option value="">— Select a program —</option>
                    {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>

                {/* Step 2 — Course within program */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                    Course {selectedProgramId ? '*' : '(select a program first)'}
                  </label>
                  <select
                    value={selectedCourseId}
                    onChange={e => handleCourseSelect(e.target.value)}
                    disabled={!selectedProgramId}
                    className={SELECT_CLS}
                  >
                    <option value="">— Select a course —</option>
                    {availableCourses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  {selectedProgramId && availableCourses.length === 0 && (
                    <p className="text-xs text-amber-400 mt-1">No active courses in this program. You can still fill in the name below.</p>
                  )}
                </div>

                {/* Course name — auto-filled from selection or manual */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">
                    Course Name *
                  </label>
                  <input
                    value={form.course_name}
                    onChange={e => setForm(p => ({ ...p, course_name: e.target.value }))}
                    placeholder="e.g. Introduction to Python Programming"
                    className={INPUT_CLS}
                  />
                  {selectedCourseId && (
                    <p className="text-[10px] text-green-400 mt-0.5">Auto-filled from selected course. Edit if needed.</p>
                  )}
                </div>

                {/* Subject Area */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Subject Area</label>
                  <input
                    value={form.subject_area}
                    onChange={e => setForm(p => ({ ...p, subject_area: e.target.value }))}
                    placeholder="e.g. Computer Science, Robotics, AI"
                    className={INPUT_CLS}
                  />
                </div>

                {/* Grade + Terms grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Grade Level</label>
                    <select value={form.grade_level} onChange={e => setForm(p => ({ ...p, grade_level: e.target.value }))} className={SELECT_CLS}>
                      {['KG', 'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6',
                        'JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'].map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Terms</label>
                    <select value={form.term_count} onChange={e => setForm(p => ({ ...p, term_count: e.target.value }))} className={SELECT_CLS}>
                      {['1', '2', '3'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Weeks/Term</label>
                    <select value={form.weeks_per_term} onChange={e => setForm(p => ({ ...p, weeks_per_term: e.target.value }))} className={SELECT_CLS}>
                      {['8', '10', '12', '14', '16'].map(w => <option key={w}>{w}</option>)}
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest block mb-1">Additional Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Any specific topics, constraints, or pedagogy notes…"
                    rows={3}
                    className={INPUT_CLS + ' resize-none'}
                  />
                </div>
              </div>

              {error && <p className="text-rose-400 text-xs">{error}</p>}
              {creating && (
                <p className="text-amber-400 text-xs flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5 animate-spin" />
                  Generating full curriculum… this may take 30–60 seconds
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={resetModal}
                  disabled={creating}
                  className="flex-1 py-2.5 bg-card text-muted-foreground font-bold rounded-none hover:bg-muted text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={generate}
                  disabled={!form.course_name.trim() || creating}
                  className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold rounded-none text-sm transition-colors"
                >
                  {creating ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Curriculum Viewer ────────────────────────────────────── */}
        {selected && (
          <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
            <div className="bg-[#0d1526] border border-border rounded-none w-full max-w-3xl mt-8 mb-8">
              <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-[#0d1526]">
                <div>
                  <h2 className="font-black">{selected.content?.course_title ?? selected.courses?.title ?? 'Curriculum'}</h2>
                  <p className="text-xs text-muted-foreground">
                    Version {selected.version} · {new Date(selected.created_at).toLocaleDateString()} · by {selected.portal_users?.full_name ?? 'Staff'}
                  </p>
                </div>
                <button onClick={() => setSelected(null)}><XMarkIcon className="w-5 h-5 text-muted-foreground" /></button>
              </div>
              <div className="p-5 space-y-6 text-sm">
                {selected.content?.overview && (
                  <div>
                    <h3 className="font-bold text-orange-400 uppercase text-xs tracking-widest mb-2">Overview</h3>
                    <p className="text-foreground/80 leading-relaxed">{selected.content.overview}</p>
                  </div>
                )}
                {selected.content?.learning_outcomes?.length > 0 && (
                  <div>
                    <h3 className="font-bold text-orange-400 uppercase text-xs tracking-widest mb-2">Learning Outcomes</h3>
                    <ul className="space-y-1">
                      {selected.content.learning_outcomes.map((o: string, i: number) => (
                        <li key={i} className="flex gap-2 text-foreground/80">
                          <span className="text-orange-500 font-bold shrink-0">{i + 1}.</span>{o}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.content?.terms?.map((term: any) => (
                  <div key={term.term} className="border border-border rounded-none p-4 space-y-3">
                    <h3 className="font-black text-foreground">Term {term.term}: {term.title}</h3>
                    {term.objectives?.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Objectives</p>
                        <ul className="space-y-0.5">
                          {term.objectives.map((o: string, i: number) => (
                            <li key={i} className="text-xs text-foreground/70 flex gap-1.5">
                              <span className="text-orange-500">•</span>{o}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {term.weeks?.map((week: any) => (
                        <div key={week.week} className="bg-black/20 p-3 rounded-none border border-border/50">
                          <p className="font-bold text-xs text-orange-400 mb-1">Week {week.week}: {week.topic}</p>
                          {week.subtopics?.length > 0 && (
                            <p className="text-xs text-foreground/60">{week.subtopics.join(' · ')}</p>
                          )}
                          {week.assessment && (
                            <p className="text-[10px] text-muted-foreground mt-1 italic">{week.assessment}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {selected.content?.assessment_strategy && (
                  <div>
                    <h3 className="font-bold text-orange-400 uppercase text-xs tracking-widest mb-2">Assessment Strategy</h3>
                    <p className="text-foreground/80 leading-relaxed">{selected.content.assessment_strategy}</p>
                  </div>
                )}
                {(selected.content?.materials_required?.length > 0 || selected.content?.recommended_tools?.length > 0) && (
                  <div className="grid grid-cols-2 gap-4">
                    {selected.content?.materials_required?.length > 0 && (
                      <div>
                        <h3 className="font-bold text-orange-400 uppercase text-xs tracking-widest mb-2">Materials</h3>
                        <ul className="space-y-0.5">
                          {selected.content.materials_required.map((m: string, i: number) => (
                            <li key={i} className="text-xs text-foreground/70 flex gap-1.5"><span className="text-orange-500">•</span>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selected.content?.recommended_tools?.length > 0 && (
                      <div>
                        <h3 className="font-bold text-orange-400 uppercase text-xs tracking-widest mb-2">Tools</h3>
                        <ul className="space-y-0.5">
                          {selected.content.recommended_tools.map((t: string, i: number) => (
                            <li key={i} className="text-xs text-foreground/70 flex gap-1.5"><span className="text-orange-500">•</span>{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Curricula list ───────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : curricula.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-none">
            <BookOpenIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">
              {isStaff ? 'No curricula yet. Generate the first one!' : 'No curricula available.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {curricula.map(c => (
              <div
                key={c.id}
                className="bg-card border border-border rounded-none p-5 space-y-3 hover:border-orange-500/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm">
                    {c.content?.course_title ?? c.courses?.title ?? c.course_id ?? 'Untitled Curriculum'}
                  </h3>
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">v{c.version}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()} · by {c.portal_users?.full_name ?? 'Staff'}
                </p>
                {c.content?.terms?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {c.content.terms.length} term{c.content.terms.length !== 1 ? 's' : ''} ·{' '}
                    {c.content.terms[0]?.weeks?.length ?? 0} weeks/term
                  </p>
                )}
                <button
                  onClick={() => setSelected(c)}
                  className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
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
