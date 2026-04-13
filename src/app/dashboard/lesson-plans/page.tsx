// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  DocumentTextIcon, PlusIcon, PencilIcon, CheckCircleIcon, XMarkIcon,
  MagnifyingGlassIcon, BookOpenIcon, ArrowPathIcon, ClipboardDocumentListIcon,
  LightBulbIcon, AcademicCapIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface LessonPlan {
  id: string;
  lesson_id: string;
  objectives: string | null;
  activities: string | null;
  assessment_methods: string | null;
  staff_notes: string | null;
  summary_notes: string | null;
  created_at: string;
  updated_at: string;
  lessons?: {
    id: string;
    title: string;
    course_id: string;
    lesson_type: string | null;
    status: string;
    courses?: { id: string; title: string };
  } | null;
}

interface Lesson {
  id: string;
  title: string;
  lesson_type: string | null;
  courses?: { id: string; title: string } | null;
}

export default function LessonPlansPage() {
  const { profile, loading: authLoading } = useAuth();
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editPlan, setEditPlan] = useState<LessonPlan | null>(null);
  const [viewPlan, setViewPlan] = useState<LessonPlan | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    lesson_id: '',
    objectives: '',
    activities: '',
    assessment_methods: '',
    staff_notes: '',
    summary_notes: '',
  });

  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const canManage = isAdmin || isTeacher;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, lessonsRes] = await Promise.all([
        fetch('/api/lesson-plans'),
        fetch('/api/lessons'),
      ]);
      const plansJson = await plansRes.json();
      const lessonsJson = lessonsRes.ok ? await lessonsRes.json() : { data: [] };
      setPlans(plansJson.data ?? []);
      setLessons(lessonsJson.data ?? []);
    } catch {
      toast.error('Failed to load lesson plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!authLoading && profile) load(); }, [authLoading, profile, load]);

  async function save() {
    if (!form.lesson_id) { toast.error('Please select a lesson'); return; }
    setSubmitting(true);
    try {
      if (editPlan) {
        const res = await fetch(`/api/lesson-plans/${editPlan.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error('Update failed');
        toast.success('Plan updated');
      } else {
        const res = await fetch('/api/lesson-plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
        toast.success('Lesson plan saved');
      }
      setShowForm(false); setEditPlan(null);
      setForm({ lesson_id: '', objectives: '', activities: '', assessment_methods: '', staff_notes: '', summary_notes: '' });
      load();
    } catch (e: any) { toast.error(e.message || 'Failed to save'); }
    finally { setSubmitting(false); }
  }

  function openEdit(plan: LessonPlan) {
    setEditPlan(plan);
    setForm({
      lesson_id: plan.lesson_id,
      objectives: plan.objectives ?? '',
      activities: plan.activities ?? '',
      assessment_methods: plan.assessment_methods ?? '',
      staff_notes: plan.staff_notes ?? '',
      summary_notes: plan.summary_notes ?? '',
    });
    setShowForm(true);
  }

  if (authLoading || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <DocumentTextIcon className="w-16 h-16 text-card-foreground/10" />
        <p className="text-card-foreground/50 text-lg font-semibold">Teacher or admin access required</p>
      </div>
    );
  }

  // Lessons that don't have a plan yet
  const plannedLessonIds = new Set(plans.map(p => p.lesson_id));
  const unplannedLessons = lessons.filter(l => !plannedLessonIds.has(l.id));

  const filtered = plans.filter(p => !search ||
    p.lessons?.title?.toLowerCase().includes(search.toLowerCase()) ||
    p.lessons?.courses?.title?.toLowerCase().includes(search.toLowerCase()) ||
    p.objectives?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <DocumentTextIcon className="w-7 h-7 text-violet-400" />
            Lesson Plans
          </h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">
            {plans.length} plans created · {unplannedLessons.length} lessons need plans
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all">
            <ArrowPathIcon className={`w-4 h-4 text-card-foreground/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setShowForm(true); setEditPlan(null); setForm({ lesson_id: '', objectives: '', activities: '', assessment_methods: '', staff_notes: '', summary_notes: '' }); }}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-violet-500/20">
            <PlusIcon className="w-4 h-4" /> New Plan
          </button>
        </div>
      </div>

      {/* Coverage Banner */}
      {unplannedLessons.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
          <LightBulbIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-bold">{unplannedLessons.length} lesson{unplannedLessons.length !== 1 ? 's' : ''}</span> don't have plans yet.
            <button onClick={() => { setShowForm(true); setEditPlan(null); }} className="ml-1.5 underline underline-offset-2 font-bold hover:text-amber-200">Create a plan</button>
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative w-full sm:w-80">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-card-foreground/30" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plans…"
          className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-violet-500/50" />
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <ClipboardDocumentListIcon className="w-16 h-16 text-card-foreground/10" />
          <p className="text-card-foreground/40 font-semibold">No lesson plans yet</p>
          <button onClick={() => setShowForm(true)} className="text-violet-400 text-sm font-bold hover:underline">Create the first plan</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(plan => (
            <div key={plan.id} className="bg-card border border-white/[0.08] rounded-2xl p-5 hover:border-violet-500/30 transition-all group cursor-pointer"
              onClick={() => setViewPlan(plan)}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {plan.lessons?.courses && (
                      <span className="text-xs text-card-foreground/40 bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[120px]">{plan.lessons.courses.title}</span>
                    )}
                    {plan.lessons?.lesson_type && (
                      <span className="text-xs text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full capitalize">{plan.lessons.lesson_type}</span>
                    )}
                  </div>
                  <h3 className="font-black text-card-foreground text-base">{plan.lessons?.title ?? 'Untitled Lesson'}</h3>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(plan)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                    <PencilIcon className="w-4 h-4 text-card-foreground/50" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {plan.objectives && (
                  <div className="flex gap-2">
                    <AcademicCapIcon className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-card-foreground/60 line-clamp-2">{plan.objectives}</p>
                  </div>
                )}
                {plan.activities && (
                  <div className="flex gap-2">
                    <LightBulbIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-card-foreground/60 line-clamp-2">{plan.activities}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                {['objectives', 'activities', 'assessment_methods', 'staff_notes'].map(field => (
                  <div key={field} title={field.replace(/_/g, ' ')}
                    className={`w-2 h-2 rounded-full ${(plan as any)[field] ? 'bg-emerald-400' : 'bg-white/10'}`} />
                ))}
                <span className="text-xs text-card-foreground/30 ml-1">{['objectives', 'activities', 'assessment_methods', 'staff_notes'].filter(f => (plan as any)[f]).length}/4 sections</span>
                <span className="ml-auto text-xs text-card-foreground/30">
                  {new Date(plan.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Plan Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-white/[0.12] rounded-2xl w-full max-w-2xl shadow-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <h3 className="font-black text-card-foreground text-lg">{editPlan ? 'Edit Lesson Plan' : 'Create Lesson Plan'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/5 rounded-lg"><XMarkIcon className="w-5 h-5 text-card-foreground/50" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {!editPlan && (
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Lesson <span className="text-rose-400">*</span></label>
                  <select value={form.lesson_id} onChange={e => setForm(f => ({ ...f, lesson_id: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50">
                    <option value="">Choose a lesson…</option>
                    {unplannedLessons.map(l => (
                      <option key={l.id} value={l.id}>{l.title}{l.courses ? ` — ${l.courses.title}` : ''}</option>
                    ))}
                    {editPlan && <option value={form.lesson_id}>{editPlan.lessons?.title}</option>}
                  </select>
                </div>
              )}
              {[
                { key: 'objectives', label: 'Learning Objectives', placeholder: 'What should students know/be able to do after this lesson?', rows: 3 },
                { key: 'activities', label: 'Teaching Activities', placeholder: 'Activities, exercises, and teaching methods to use…', rows: 3 },
                { key: 'assessment_methods', label: 'Assessment Methods', placeholder: 'How will you assess student understanding?', rows: 2 },
                { key: 'staff_notes', label: 'Staff Notes', placeholder: 'Internal notes, preparation reminders…', rows: 2 },
                { key: 'summary_notes', label: 'Summary Notes', placeholder: 'Post-lesson summary and reflections…', rows: 2 },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">{f.label}</label>
                  <textarea value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    rows={f.rows} placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-violet-500/50 resize-none" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 p-5 border-t border-white/[0.08]">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={save} disabled={submitting || (!editPlan && !form.lesson_id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                <CheckCircleIcon className="w-4 h-4" /> {submitting ? 'Saving…' : 'Save Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Plan Modal */}
      {viewPlan && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-white/[0.12] rounded-2xl w-full max-w-2xl shadow-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <div>
                <h3 className="font-black text-card-foreground text-lg">{viewPlan.lessons?.title ?? 'Lesson Plan'}</h3>
                {viewPlan.lessons?.courses && <p className="text-sm text-card-foreground/50">{viewPlan.lessons.courses.title}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setViewPlan(null); openEdit(viewPlan); }} className="p-1.5 hover:bg-white/10 rounded-lg">
                  <PencilIcon className="w-4 h-4 text-card-foreground/50" />
                </button>
                <button onClick={() => setViewPlan(null)} className="p-1.5 hover:bg-white/5 rounded-lg">
                  <XMarkIcon className="w-5 h-5 text-card-foreground/50" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {[
                { key: 'objectives', label: 'Learning Objectives', color: 'text-violet-400', bg: 'bg-violet-500/10' },
                { key: 'activities', label: 'Teaching Activities', color: 'text-amber-400', bg: 'bg-amber-500/10' },
                { key: 'assessment_methods', label: 'Assessment Methods', color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { key: 'staff_notes', label: 'Staff Notes', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { key: 'summary_notes', label: 'Summary Notes', color: 'text-rose-400', bg: 'bg-rose-500/10' },
              ].map(f => (viewPlan as any)[f.key] && (
                <div key={f.key} className={`${f.bg} border border-white/10 rounded-xl p-4`}>
                  <h4 className={`text-xs font-black uppercase tracking-wider mb-2 ${f.color}`}>{f.label}</h4>
                  <p className="text-sm text-card-foreground/80 whitespace-pre-wrap">{(viewPlan as any)[f.key]}</p>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-white/[0.08]">
              <button onClick={() => setViewPlan(null)} className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
