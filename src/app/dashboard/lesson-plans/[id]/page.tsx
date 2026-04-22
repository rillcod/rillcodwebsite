// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowLeftIcon, PencilIcon, CheckCircleIcon, PrinterIcon,
  PlusIcon, TrashIcon, ArrowPathIcon, BookOpenIcon, SparklesIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import PipelineStepper from '@/components/pipeline/PipelineStepper';

interface WeekEntry {
  week: number;
  topic: string;
  objectives?: string;
  activities?: string;
  notes?: string;
  progression_badge?: {
    id?: string;
    label?: string;
    variant?: string;
  };
}

interface LessonPlan {
  id: string;
  course_id?: string | null;
  class_id?: string | null;
  school_id?: string | null;
  term?: string | null;
  term_start?: string | null;
  term_end?: string | null;
  sessions_per_week?: number | null;
  curriculum_version_id?: string | null;
  status?: string | null;
  version?: number | null;
  plan_data?: { weeks?: WeekEntry[] } | null;
  objectives?: string | null;
  activities?: string | null;
  created_at: string;
  updated_at: string;
  courses?: { id: string; title: string } | null;
  classes?: { id: string; name: string } | null;
  schools?: { id: string; name: string } | null;
  curriculum?: { id: string; version: number; course_id: string } | null;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['published'],
  published: ['archived'],
  archived: [],
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  published: { label: 'Published', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  archived:  { label: 'Archived',  cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

export default function LessonPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weeks, setWeeks] = useState<WeekEntry[]>([]);
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [weekDraft, setWeekDraft] = useState<WeekEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'weeks' | 'content'>('weeks');
  const [generating, setGenerating] = useState<'lessons' | 'assignments' | 'projects' | 'progression' | null>(null);
  const [genProgress, setGenProgress] = useState<{ generated: number; total: number; status: string } | null>(null);
  const [linkedLessons, setLinkedLessons] = useState<{ id: string; title: string; status: string; metadata?: { week?: number } | null }[]>([]);
  const isSchoolRole = profile?.role === 'school';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, lessonsRes] = await Promise.all([
        fetch(`/api/lesson-plans/${id}`),
        fetch(`/api/lessons?lesson_plan_id=${id}`),
      ]);
      if (!planRes.ok) { toast.error('Plan not found'); router.push('/dashboard/lesson-plans'); return; }
      const j = await planRes.json();
      const p: LessonPlan = j.data;
      setPlan(p);
      setWeeks([...(p.plan_data?.weeks ?? []) as WeekEntry[]].sort((a, b) => a.week - b.week));
      if (lessonsRes.ok) {
        const lj = await lessonsRes.json();
        setLinkedLessons(lj.data ?? []);
      }
    } catch {
      toast.error('Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!authLoading && profile) load();
  }, [authLoading, profile, load]);

  async function saveWeeks(updatedWeeks: WeekEntry[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_data: { weeks: updatedWeeks } }),
      });
      if (!res.ok) throw new Error('Save failed');
      setWeeks(updatedWeeks);
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function transitionStatus(newStatus: string) {
    if (!plan) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, version: newStatus === 'published' ? (plan.version ?? 1) + 1 : plan.version }),
      });
      if (!res.ok) throw new Error('Status update failed');
      toast.success(`Plan ${newStatus}`);
      load();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  function addWeek() {
    const newWeek: WeekEntry = { week: weeks.length + 1, topic: '', objectives: '', activities: '', notes: '' };
    setWeeks(prev => [...prev, newWeek]);
    setEditingWeek(newWeek.week);
    setWeekDraft(newWeek);
  }

  function startEdit(w: WeekEntry) {
    setEditingWeek(w.week);
    setWeekDraft({ ...w });
  }

  function cancelEdit() {
    setEditingWeek(null);
    setWeekDraft(null);
    // Remove unsaved empty weeks
    setWeeks(prev => prev.filter(w => w.topic.trim() !== '' || w.week !== (weeks.length)));
  }

  function saveWeekEdit() {
    if (!weekDraft) return;
    const updated = weeks.map(w => w.week === weekDraft.week ? weekDraft : w);
    setEditingWeek(null);
    setWeekDraft(null);
    saveWeeks(updated);
  }

  function deleteWeek(weekNum: number) {
    const updated = weeks
      .filter(w => w.week !== weekNum)
      .map((w, i) => ({ ...w, week: i + 1 }));
    saveWeeks(updated);
  }

  async function bulkGenerate(type: 'lessons' | 'assignments' | 'projects') {
    if (!plan || plan.status !== 'published') {
      toast.error('Only published plans can generate content');
      return;
    }
    setGenerating(type);
    setGenProgress({ generated: 0, total: weeks.length, status: 'Starting...' });

    try {
      const res = await fetch(`/api/lesson-plans/${id}/generate-${type}`, { method: 'POST' });
      if (!res.ok) throw new Error('Generation failed');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          if (data.done) {
            toast.success(`Generated ${data.generated} ${type}, skipped ${data.skipped}`);
            setGenProgress(null);
            setGenerating(null);
            load();
            return;
          }
          setGenProgress({ generated: data.generated, total: data.total, status: data.status });
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Generation failed');
      setGenProgress(null);
      setGenerating(null);
    }
  }

  async function generateProgression() {
    if (!plan) return;
    setGenerating('progression');
    try {
      const res = await fetch(`/api/lesson-plans/${id}/generate-progression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strict_route: true,
          year_number: 1,
          term_number: 1,
          weeks_count: weeks.length > 0 ? weeks.length : 12,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Progression generation failed');
      toast.success(
        `Generated ${j.data?.generated_weeks ?? 0} weeks with strict Platform → School route.`,
      );
      load();
    } catch (err: any) {
      toast.error(err.message || 'Progression generation failed');
    } finally {
      setGenerating(null);
    }
  }

  if (authLoading || loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!plan) return null;

  const status = plan.status ?? 'draft';
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  const nextStatuses = STATUS_TRANSITIONS[status] ?? [];
  const courseTitle = plan.courses?.title ?? 'Unknown Course';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto print:p-0 print:space-y-4">
      {/* Print letterhead */}
      <div className="hidden print:block border-b border-black pb-3 mb-2">
        <div className="flex items-start gap-3">
          <img src="/logo.png" alt="Rillcod Technologies" className="w-14 h-14 object-contain" />
          <div className="flex-1 min-w-0 text-black">
            <p className="text-lg font-black leading-tight">RILLCOD TECHNOLOGIES</p>
            <p className="text-[11px] leading-tight">Coding Today, Innovating Tomorrow</p>
            <p className="text-[10px] leading-tight mt-1">
              26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City · 08116600091 · support@rillcod.com
            </p>
          </div>
          <div className="text-right text-black">
            <p className="text-[10px] font-bold uppercase tracking-wider">Document</p>
            <p className="text-xs font-black uppercase">Term Lesson Plan</p>
            <p className="text-[10px] mt-1">{new Date().toLocaleDateString('en-GB')}</p>
          </div>
        </div>
      </div>

      {/* Shared pipeline */}
      <div className="print:hidden">
        <PipelineStepper
          current="plans"
          courseId={plan.course_id ?? null}
          courseTitle={courseTitle}
          curriculumId={plan.curriculum_version_id ?? null}
          lessonPlanId={plan.id}
        />

        {/* AI Lesson Assistant banner — discoverable entry point */}
        {weeks.some(w => !linkedLessons.find(l => l.metadata?.week === w.week)) && (
          <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                <SparklesIcon className="w-4 h-4 text-violet-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-violet-300">AI Lesson Assistant</p>
                <p className="text-xs text-card-foreground/70 mt-0.5 leading-snug">
                  Click <span className="font-bold text-violet-300">Create Lesson</span> on any week below — the AI builder opens with topic, grade and subject pre-filled. Pick a mode (Academic · Project · Interactive) and generate a full rich lesson in seconds.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Back + Print */}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard/lesson-plans" className="flex items-center gap-2 text-card-foreground/50 hover:text-card-foreground text-sm font-bold transition-colors min-h-[44px]">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Plans
        </Link>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-card-foreground/70 font-bold transition-all min-h-[44px]">
          <PrinterIcon className="w-4 h-4" /> Export PDF
        </button>
      </div>

      {/* Header */}
      <div className="bg-card border border-white/[0.08] rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${badge.cls}`}>{badge.label}</span>
              {(plan.version ?? 1) > 1 && (
                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">v{plan.version}</span>
              )}
            </div>
            <h1 className="text-xl font-black text-card-foreground">
              {plan.term ?? 'Term Plan'} — {courseTitle}
            </h1>
            {plan.classes?.name && <p className="text-card-foreground/50 text-sm mt-0.5">{plan.classes.name}</p>}
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {nextStatuses.map(ns => (
              <button key={ns} onClick={() => transitionStatus(ns)} disabled={saving}
                className="px-3 py-1.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all capitalize">
                {ns === 'published' ? 'Publish' : ns === 'archived' ? 'Archive' : ns}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs text-card-foreground/50">
          {plan.term_start && <div><span className="font-bold text-card-foreground/70">Start:</span> {new Date(plan.term_start).toLocaleDateString('en-GB')}</div>}
          {plan.term_end && <div><span className="font-bold text-card-foreground/70">End:</span> {new Date(plan.term_end).toLocaleDateString('en-GB')}</div>}
          {plan.sessions_per_week && <div><span className="font-bold text-card-foreground/70">Sessions/wk:</span> {plan.sessions_per_week}</div>}
          {plan.schools?.name && <div><span className="font-bold text-card-foreground/70">School:</span> {plan.schools.name}</div>}
        </div>

        {/* Linked curriculum */}
        {plan.curriculum_version_id && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
            <BookOpenIcon className="w-4 h-4 flex-shrink-0" />
            <span>Linked curriculum: {plan.curriculum?.course_id ?? plan.curriculum_version_id.slice(0, 8)}…
              {plan.curriculum?.version ? ` (v${plan.curriculum.version})` : ''}
            </span>
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm 12mm;
          }
          body {
            background: #fff !important;
            color: #111 !important;
          }
        }
      `}</style>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/[0.08] print:hidden">
        <button
          onClick={() => setActiveTab('weeks')}
          className={`px-4 py-2 text-sm font-bold transition-all ${
            activeTab === 'weeks'
              ? 'text-violet-400 border-b-2 border-violet-400'
              : 'text-card-foreground/50 hover:text-card-foreground/70'
          }`}
        >
          Week-by-Week Plan
        </button>
        <button
          onClick={() => setActiveTab('content')}
          className={`px-4 py-2 text-sm font-bold transition-all ${
            activeTab === 'content'
              ? 'text-violet-400 border-b-2 border-violet-400'
              : 'text-card-foreground/50 hover:text-card-foreground/70'
          }`}
        >
          Content Dashboard
        </button>
      </div>

      {/* Week Entries */}
      {activeTab === 'weeks' && (
        <div className="space-y-3">
        <div className="flex items-center justify-between print:hidden">
          <h2 className="text-base font-black text-card-foreground">Week-by-Week Plan</h2>
          <button onClick={addWeek} disabled={saving || editingWeek !== null}
            className="flex items-center gap-2 px-3 py-1.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
            <PlusIcon className="w-4 h-4" /> Add Week
          </button>
        </div>

        {weeks.length === 0 ? (
          <div className="bg-card border border-white/[0.08] rounded-2xl p-8 text-center print:hidden">
            <p className="text-card-foreground/40 text-sm">No weeks added yet. Click "Add Week" to start building your plan.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {weeks.map(w => (
              <div key={w.week} className="bg-card border border-white/[0.08] rounded-2xl overflow-hidden">
                {editingWeek === w.week && weekDraft ? (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-black text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">Week {w.week}</span>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1">Topic <span className="text-rose-400">*</span></label>
                      <input value={weekDraft.topic} onChange={e => setWeekDraft(d => d ? { ...d, topic: e.target.value } : d)}
                        placeholder="Week topic…"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1">Objectives</label>
                      <textarea value={weekDraft.objectives ?? ''} onChange={e => setWeekDraft(d => d ? { ...d, objectives: e.target.value } : d)}
                        rows={2} placeholder="Learning objectives…"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 resize-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1">Activities</label>
                      <textarea value={weekDraft.activities ?? ''} onChange={e => setWeekDraft(d => d ? { ...d, activities: e.target.value } : d)}
                        rows={2} placeholder="Teaching activities…"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 resize-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1">Teacher Notes</label>
                      <textarea value={weekDraft.notes ?? ''} onChange={e => setWeekDraft(d => d ? { ...d, notes: e.target.value } : d)}
                        rows={2} placeholder="Internal notes…"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 resize-none" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveWeekEdit} disabled={!weekDraft.topic.trim() || saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
                        <CheckCircleIcon className="w-3.5 h-3.5" /> Save
                      </button>
                      <button onClick={cancelEdit} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 text-xs font-bold rounded-xl transition-all">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-black text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">Week {w.week}</span>
                          {w.progression_badge?.label && (
                            <span className="text-[10px] font-black text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/30">
                              {w.progression_badge.label}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-card-foreground text-sm">{w.topic || <span className="text-card-foreground/30 italic">No topic</span>}</h3>
                        {w.objectives && <p className="text-xs text-card-foreground/50 mt-1 line-clamp-1">{w.objectives}</p>}
                      </div>
                      <div className="flex items-center gap-1 print:hidden">
                        <button onClick={() => startEdit(w)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                          <PencilIcon className="w-3.5 h-3.5 text-card-foreground/40" />
                        </button>
                        <button onClick={() => deleteWeek(w.week)} className="p-1.5 hover:bg-rose-500/10 rounded-lg transition-all">
                          <TrashIcon className="w-3.5 h-3.5 text-rose-400/60" />
                        </button>
                      </div>
                    </div>
                    {/* Print view: show all fields */}
                    <div className="hidden print:block mt-2 space-y-1 text-xs text-card-foreground/70">
                      {w.objectives && <p><strong>Objectives:</strong> {w.objectives}</p>}
                      {w.activities && <p><strong>Activities:</strong> {w.activities}</p>}
                      {w.notes && <p><strong>Notes:</strong> {w.notes}</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {saving && (
          <div className="flex items-center gap-2 text-xs text-card-foreground/40 print:hidden">
            <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Saving…
          </div>
        )}
      </div>
      )}

      {/* Content Dashboard Tab */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          {status === 'published' && (
            <div className="bg-card border border-white/[0.08] rounded-2xl p-4">
              <h3 className="text-sm font-black text-card-foreground mb-3">Bulk Content Generation</h3>
              <div className="flex flex-wrap gap-2">
                {isSchoolRole && (
                  <button
                    onClick={generateProgression}
                    disabled={generating !== null}
                    className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
                  >
                    <SparklesIcon className="w-4 h-4" /> Generate Progression Route
                  </button>
                )}
                <button
                  onClick={() => bulkGenerate('lessons')}
                  disabled={generating !== null}
                  className="flex items-center gap-2 px-3 py-1.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
                >
                  <SparklesIcon className="w-4 h-4" /> Generate All Lessons
                </button>
                <button
                  onClick={() => bulkGenerate('assignments')}
                  disabled={generating !== null}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
                >
                  <SparklesIcon className="w-4 h-4" /> Generate All Assignments
                </button>
                <button
                  onClick={() => bulkGenerate('projects')}
                  disabled={generating !== null}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
                >
                  <SparklesIcon className="w-4 h-4" /> Generate All Projects
                </button>
              </div>
              {genProgress && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-xs text-card-foreground/70">
                    <span>{genProgress.status}</span>
                    <span>{genProgress.generated} / {genProgress.total}</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-violet-500 h-full transition-all duration-300"
                      style={{ width: `${(genProgress.generated / genProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-card border border-white/[0.08] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-card-foreground">Content Overview</h3>
              {linkedLessons.length > 0 && (
                <Link
                  href={`/dashboard/lessons?lesson_plan_id=${id}`}
                  className="text-xs text-violet-400 hover:text-violet-300 font-bold transition-colors"
                >
                  View all {linkedLessons.length} lesson{linkedLessons.length !== 1 ? 's' : ''} →
                </Link>
              )}
            </div>
            {weeks.length === 0 ? (
              <p className="text-card-foreground/40 text-sm">No weeks defined yet.</p>
            ) : (
              <div className="space-y-2">
                {weeks.map(w => {
                  const weekLesson = linkedLessons.find(l => l.metadata?.week === w.week);
                  const weekDescription = [w.objectives, w.activities].filter(Boolean).join('\n\n');
                  const weekNotes = [
                    w.notes ? `Teacher Notes:\n${w.notes}` : null,
                    w.objectives ? `Learning Objectives:\n${w.objectives}` : null,
                    w.activities ? `Planned Activities:\n${w.activities}` : null,
                  ].filter(Boolean).join('\n\n');
                  const addLessonHref =
                    `/dashboard/lessons/add?` +
                    new URLSearchParams({
                      lesson_plan_id: plan.id,
                      week: String(w.week),
                      ...(plan.course_id ? { course_id: plan.course_id } : {}),
                      ...(w.topic ? { title: w.topic } : {}),
                      ...(w.topic ? { topic: w.topic } : {}),
                      ...(courseTitle ? { subject: courseTitle } : {}),
                      ...(weekDescription ? { description: weekDescription } : {}),
                      ...(weekNotes ? { lesson_notes: weekNotes } : {}),
                      flow_origin: 'lesson-plan',
                    }).toString();
                  return (
                    <div key={w.week} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-white/5 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-black text-violet-400">Week {w.week}</span>
                          <span className="text-sm text-card-foreground truncate">{w.topic}</span>
                        </div>
                        <div className="flex gap-3 text-xs text-card-foreground/50">
                          {weekLesson ? (
                            <Link
                              href={`/dashboard/lessons/${weekLesson.id}`}
                              className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors"
                            >
                              ✓ Lesson ({weekLesson.status})
                            </Link>
                          ) : (
                            <span className="text-card-foreground/30">No lesson yet</span>
                          )}
                        </div>
                      </div>
                      {!weekLesson && (
                        <Link
                          href={addLessonHref}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold border border-emerald-500/30 text-emerald-400 rounded-md hover:bg-emerald-500/10 transition-colors whitespace-nowrap min-h-[36px]"
                          title="Create lesson for this week"
                        >
                          <SparklesIcon className="w-3.5 h-3.5" />
                          Create Lesson
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
