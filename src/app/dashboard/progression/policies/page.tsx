'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon, ArrowLeftIcon } from '@/lib/icons';
import Link from 'next/link';
import { toast } from 'sonner';

type PolicyProgram = {
  id: string;
  name: string;
  delivery_type: 'optional' | 'compulsory';
  session_frequency_per_week: 1 | 2;
  school_progression_enabled: boolean;
  progression_policy: Record<string, unknown> | null;
};

type EditablePolicy = {
  strict_route_default: boolean;
  auto_flashcards_default: boolean;
  project_based_default: boolean;
  essential_routes_only: boolean;
  mastery_mode: 'strict' | 'soft';
  track_priority: string[];
  qa_min_pass_score: number;
  qa_required_teacher_steps: number;
  qa_required_student_steps: number;
  qa_assessment_drift_mode: 'warn' | 'fail';
  qa_exam_drift_mode: 'warn' | 'fail';
  qa_five_step_mode: 'warn' | 'fail';
};

type ClassOption = { id: string; name: string; schools?: { name?: string } | null };

function toEditablePolicy(program: PolicyProgram): EditablePolicy {
  const policy = program.progression_policy ?? {};
  const trackPriorityArray = Array.isArray(policy.track_priority)
    ? policy.track_priority.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    strict_route_default: policy.strict_route_default !== false,
    auto_flashcards_default: policy.auto_flashcards_default !== false,
    project_based_default: policy.project_based_default === true,
    essential_routes_only: policy.essential_routes_only === true,
    mastery_mode: policy.mastery_mode === 'soft' ? 'soft' : 'strict',
    track_priority: trackPriorityArray,
    qa_min_pass_score: Number(policy.qa_min_pass_score ?? 75) || 75,
    qa_required_teacher_steps: Number(policy.qa_required_teacher_steps ?? 5) || 5,
    qa_required_student_steps: Number(policy.qa_required_student_steps ?? 5) || 5,
    qa_assessment_drift_mode: policy.qa_assessment_drift_mode === 'fail' ? 'fail' : 'warn',
    qa_exam_drift_mode: policy.qa_exam_drift_mode === 'warn' ? 'warn' : 'fail',
    qa_five_step_mode: policy.qa_five_step_mode === 'fail' ? 'fail' : 'warn',
  };
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? 'bg-violet-600' : 'bg-muted'}`} />
        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <div>
        <p className="text-sm font-bold text-foreground group-hover:text-violet-300 transition-colors">{label}</p>
        {hint && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{hint}</p>}
      </div>
    </label>
  );
}

export default function ProgressionPoliciesPage() {
  const { profile, loading: authLoading } = useAuth();
  const canManage = ['teacher', 'admin'].includes(profile?.role ?? '');
  const [programs, setPrograms] = useState<PolicyProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');
  const [form, setForm] = useState<EditablePolicy>({
    strict_route_default: true,
    auto_flashcards_default: true,
    project_based_default: false,
    essential_routes_only: false,
    mastery_mode: 'strict',
    track_priority: [],
    qa_min_pass_score: 75,
    qa_required_teacher_steps: 5,
    qa_required_student_steps: 5,
    qa_assessment_drift_mode: 'warn',
    qa_exam_drift_mode: 'fail',
    qa_five_step_mode: 'warn',
  });
  const [deliveryType, setDeliveryType] = useState<'optional' | 'compulsory'>('compulsory');
  const [frequency, setFrequency] = useState<1 | 2>(1);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [pathMode, setPathMode] = useState<'full' | 'milestone'>('full');
  const [pathSaving, setPathSaving] = useState(false);

  useEffect(() => {
    if (!canManage) return;
    setLoading(true);
    (async () => {
      try {
        const [policyRes, clsRes] = await Promise.all([
          fetch('/api/progression/policies'),
          fetch('/api/classes'),
        ]);
        const policyJson = await policyRes.json().catch(() => ({}));
        const clsJson = await clsRes.json().catch(() => ({}));
        const rows = (policyJson.data ?? []) as PolicyProgram[];
        const clsRows = (clsJson.data ?? []) as ClassOption[];
        setPrograms(rows);
        setClasses(clsRows);
        if (rows.length > 0) setSelectedProgramId(rows[0].id);
        if (clsRows.length > 0) setSelectedClassId(clsRows[0].id);
      } catch {
        toast.error('Failed to load policies');
      } finally {
        setLoading(false);
      }
    })();
  }, [canManage]);

  const selectedProgram = useMemo(
    () => programs.find((p) => p.id === selectedProgramId) ?? null,
    [programs, selectedProgramId],
  );

  useEffect(() => {
    if (!selectedProgram) return;
    setForm(toEditablePolicy(selectedProgram));
    setDeliveryType(selectedProgram.delivery_type ?? 'compulsory');
    setFrequency(selectedProgram.session_frequency_per_week === 2 ? 2 : 1);
    setEnabled(Boolean(selectedProgram.school_progression_enabled));
  }, [selectedProgram]);

  async function savePolicy() {
    if (!selectedProgram) return;
    setSaving(true);
    try {
      const res = await fetch('/api/progression/policies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program_id: selectedProgram.id,
          delivery_type: deliveryType,
          session_frequency_per_week: frequency,
          school_progression_enabled: enabled,
          strict_route_default: form.strict_route_default,
          auto_flashcards_default: form.auto_flashcards_default,
          project_based_default: form.project_based_default,
          essential_routes_only: form.essential_routes_only,
          mastery_mode: form.mastery_mode,
          track_priority: form.track_priority.filter(Boolean),
          qa_min_pass_score: form.qa_min_pass_score,
          qa_required_teacher_steps: form.qa_required_teacher_steps,
          qa_required_student_steps: form.qa_required_student_steps,
          qa_assessment_drift_mode: form.qa_assessment_drift_mode,
          qa_exam_drift_mode: form.qa_exam_drift_mode,
          qa_five_step_mode: form.qa_five_step_mode,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setPrograms(prev => prev.map(p => p.id === selectedProgram.id ? (json.data as PolicyProgram) : p));
      toast.success('Settings saved for ' + selectedProgram.name);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function applyPathVisibility(scope: 'one' | 'all') {
    setPathSaving(true);
    try {
      const payload = scope === 'all'
        ? { apply_to_all: true, mode: pathMode }
        : { class_id: selectedClassId, mode: pathMode };
      const res = await fetch('/api/progression/path-visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success(scope === 'all'
        ? `Updated ${json.data?.updated_count ?? 0} classes`
        : 'Updated selected class');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setPathSaving(false);
    }
  }

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canManage) return (
    <div className="p-6 text-sm text-muted-foreground">Teacher or Admin access required.</div>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeftIcon className="w-4 h-4" /> Back to LMS Settings
        </Link>
        <h1 className="text-xl font-black">Program Rules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control how each program runs — how often classes meet, how students unlock content, and what gets checked automatically.
        </p>
      </div>

      {/* Program picker */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
        <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Which program are you setting rules for?</label>
        <select
          title="Select program"
          value={selectedProgramId}
          onChange={e => setSelectedProgramId(e.target.value)}
          className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
        >
          {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {programs.length === 0 && (
          <p className="text-xs text-amber-400">No programs found. <Link href="/dashboard/programs" className="underline">Create a program first.</Link></p>
        )}
      </div>

      {selectedProgram && (
        <>
          {/* Basic setup */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-sm font-black text-foreground">Basic Setup</p>
              <p className="text-xs text-muted-foreground mt-0.5">The fundamentals — is this program required, and how often do students attend?</p>
            </div>

            <Toggle
              checked={enabled}
              onChange={setEnabled}
              label="This program is active"
              hint="Turn off to pause progression tracking for this program without deleting anything."
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Is this program required or optional?</label>
                <select
                  title="Delivery type"
                  value={deliveryType}
                  onChange={e => setDeliveryType(e.target.value === 'optional' ? 'optional' : 'compulsory')}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                >
                  <option value="compulsory">Required — all students must complete it</option>
                  <option value="optional">Optional — students choose to join</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">How many sessions per week?</label>
                <select
                  title="Session frequency"
                  value={frequency}
                  onChange={e => setFrequency(e.target.value === '2' ? 2 : 1)}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                >
                  <option value="1">Once a week</option>
                  <option value="2">Twice a week</option>
                </select>
              </div>
            </div>
          </div>

          {/* How students move through content */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-sm font-black text-foreground">How Students Move Through Content</p>
              <p className="text-xs text-muted-foreground mt-0.5">Control whether students must pass each step before moving on, or can browse freely.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Content unlocking</label>
              <select
                title="Mastery mode"
                value={form.mastery_mode}
                onChange={e => setForm(f => ({ ...f, mastery_mode: e.target.value === 'soft' ? 'soft' : 'strict' }))}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
              >
                <option value="strict">Locked — students must pass each lesson to unlock the next</option>
                <option value="soft">Open — students can browse all content freely</option>
              </select>
            </div>

            <Toggle
              checked={form.strict_route_default}
              onChange={v => setForm(f => ({ ...f, strict_route_default: v }))}
              label="Follow the set learning path"
              hint="Students follow lessons in the order you set. Turn off to let them jump around."
            />

            <Toggle
              checked={form.essential_routes_only}
              onChange={v => setForm(f => ({ ...f, essential_routes_only: v }))}
              label="Core lessons only"
              hint="Only show the essential lessons — hide bonus and extension content. Good for tight schedules."
            />

            <Toggle
              checked={form.auto_flashcards_default}
              onChange={v => setForm(f => ({ ...f, auto_flashcards_default: v }))}
              label="Auto-create flashcards from lessons"
              hint="When a lesson is generated, flashcard decks are created automatically for students to review."
            />

            <Toggle
              checked={form.project_based_default}
              onChange={v => setForm(f => ({ ...f, project_based_default: v }))}
              label="Project-based learning"
              hint="Lessons are built around hands-on projects rather than traditional step-by-step lessons."
            />
          </div>

          {/* Grading & quality checks */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-sm font-black text-foreground">Grading & Quality Checks</p>
              <p className="text-xs text-muted-foreground mt-0.5">Set the minimum score to pass, and how strictly the system checks lesson structure.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Minimum pass score (%)</label>
                <input
                  type="number"
                  title="Minimum pass score"
                  min={40} max={100}
                  value={form.qa_min_pass_score}
                  onChange={e => setForm(f => ({ ...f, qa_min_pass_score: Math.min(100, Math.max(40, Number(e.target.value || 75))) }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Students need this score to pass a lesson or assessment.</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Teacher steps per lesson</label>
                <input
                  type="number"
                  title="Teacher steps required"
                  min={1} max={8}
                  value={form.qa_required_teacher_steps}
                  onChange={e => setForm(f => ({ ...f, qa_required_teacher_steps: Math.min(8, Math.max(1, Number(e.target.value || 5))) }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                />
                <p className="text-[10px] text-muted-foreground">How many teaching steps a lesson must have (e.g. intro, explain, practice…).</p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Student steps per lesson</label>
                <input
                  type="number"
                  title="Student steps required"
                  min={1} max={8}
                  value={form.qa_required_student_steps}
                  onChange={e => setForm(f => ({ ...f, qa_required_student_steps: Math.min(8, Math.max(1, Number(e.target.value || 5))) }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                />
                <p className="text-[10px] text-muted-foreground">How many student activity steps a lesson must include.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">If assessments drift off-topic</label>
                <select
                  title="Assessment drift mode"
                  value={form.qa_assessment_drift_mode}
                  onChange={e => setForm(f => ({ ...f, qa_assessment_drift_mode: e.target.value === 'fail' ? 'fail' : 'warn' }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                >
                  <option value="warn">Show a warning but allow it</option>
                  <option value="fail">Block it — must be fixed first</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">If exams drift off-topic</label>
                <select
                  title="Exam drift mode"
                  value={form.qa_exam_drift_mode}
                  onChange={e => setForm(f => ({ ...f, qa_exam_drift_mode: e.target.value === 'warn' ? 'warn' : 'fail' }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                >
                  <option value="fail">Block it — must be fixed first</option>
                  <option value="warn">Show a warning but allow it</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">If a lesson is missing steps</label>
                <select
                  title="5-step break mode"
                  value={form.qa_five_step_mode}
                  onChange={e => setForm(f => ({ ...f, qa_five_step_mode: e.target.value === 'fail' ? 'fail' : 'warn' }))}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                >
                  <option value="warn">Show a warning but allow it</option>
                  <option value="fail">Block it — must be fixed first</option>
                </select>
              </div>
            </div>
          </div>

          {/* What students & parents can see */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-sm font-black text-foreground">What Students & Parents Can See</p>
              <p className="text-xs text-muted-foreground mt-0.5">Control how much of the learning path is visible to students and parents.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Visibility level</label>
                <select
                  title="Path visibility mode"
                  value={pathMode}
                  onChange={e => setPathMode(e.target.value === 'milestone' ? 'milestone' : 'full')}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                >
                  <option value="full">Full — show all lessons and weeks</option>
                  <option value="milestone">Milestones only — show key checkpoints, not every lesson</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground">Apply to one class</label>
                <select
                  title="Select class"
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.schools?.name ? ` (${c.schools.name})` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyPathVisibility('one')}
                disabled={pathSaving || !selectedClassId}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-border hover:bg-muted/30 disabled:opacity-50"
              >
                Apply to this class
              </button>
              <button
                type="button"
                onClick={() => applyPathVisibility('all')}
                disabled={pathSaving}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-violet-400/30 text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
              >
                Apply to all classes
              </button>
            </div>
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={savePolicy}
            disabled={saving}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-black rounded-xl flex items-center justify-center gap-2"
          >
            {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
            Save rules for {selectedProgram.name}
          </button>
        </>
      )}
    </div>
  );
}
