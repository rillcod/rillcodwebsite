'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { 
  ArrowPathIcon, 
  ArrowLeftIcon, 
  AcademicCapIcon, 
  ShieldCheckIcon, 
  BeakerIcon, 
  EyeIcon 
} from '@/lib/icons';
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
    <label className="flex items-start gap-4 cursor-pointer group">
      <div className="relative mt-1 shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-12 h-6.5 rounded-full transition-all duration-500 border border-border/50 ${checked ? 'bg-primary shadow-[0_0_15px_rgba(124,58,237,0.4)]' : 'bg-muted/50'}`} />
        <div className={`absolute top-1 left-1 w-4.5 h-4.5 rounded-full bg-white shadow-xl transition-transform duration-500 ${checked ? 'translate-x-5.5' : ''}`} />
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-black text-foreground group-hover:text-primary transition-colors uppercase tracking-tight">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground leading-relaxed italic opacity-70">{hint}</p>}
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
      toast.success('Governance rules updated for ' + selectedProgram.name);
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
        ? `Visibility updated for ${json.data?.updated_count ?? 0} classes`
        : 'Visibility updated for selected class');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setPathSaving(false);
    }
  }

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canManage) return (
    <div className="p-20 text-center text-muted-foreground font-black uppercase tracking-widest italic opacity-50">Staff access required.</div>
  );

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-12 pb-32">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-card border border-border rounded-[4rem] p-10 sm:p-16 shadow-2xl">
        <div className="absolute top-0 right-0 w-[50rem] h-[50rem] bg-primary/10 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[40rem] h-[40rem] bg-violet-600/5 rounded-full blur-[120px] -ml-48 -mb-48 pointer-events-none" />
        
        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground hover:text-primary mb-10 transition-colors relative z-10">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Intelligence Hub
        </Link>
        
        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-card-foreground leading-tight">Program Excellence Rules</h1>
          <p className="text-xl text-muted-foreground max-w-3xl leading-relaxed italic">
            Define the academic DNA of your programs. Configure delivery requirements, 
            learning path behavior, and automated quality standards.
          </p>
        </div>
      </div>

      {/* Program Selector */}
      <div className="bg-card/50 backdrop-blur-3xl border border-border rounded-[2.5rem] p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="flex-1 space-y-3">
            <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-6">Target Academic Program</label>
            <select
              title="Select program"
              value={selectedProgramId}
              onChange={e => setSelectedProgramId(e.target.value)}
              className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black uppercase tracking-widest focus:border-primary outline-none transition-all shadow-inner appearance-none"
            >
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {programs.length === 0 && (
            <p className="text-sm text-rose-400 font-black uppercase tracking-widest shrink-0">No programs found. <Link href="/dashboard/programs" className="underline">Create one →</Link></p>
          )}
        </div>
      </div>

      {selectedProgram && (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          {/* 1. Academic Fundamentals */}
          <div className="bg-card border border-border rounded-[3.5rem] overflow-hidden shadow-2xl">
            <div className="p-10 border-b border-border bg-muted/10 flex items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <AcademicCapIcon className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-[11px] font-black text-foreground uppercase tracking-[0.3em] leading-none">01 · Academic Fundamentals</h2>
                <p className="text-sm text-muted-foreground mt-2 italic">Core settings governing program status and attendance frequency.</p>
              </div>
            </div>
            <div className="p-10 sm:p-14 space-y-12">
              <Toggle
                checked={enabled}
                onChange={setEnabled}
                label="Program Active Status"
                hint="When disabled, progression tracking and automated content generation are paused for this program."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 pt-4">
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Completion Requirement</label>
                  <select
                    title="Delivery type"
                    value={deliveryType}
                    onChange={e => setDeliveryType(e.target.value === 'optional' ? 'optional' : 'compulsory')}
                    className="w-full px-8 py-4 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none focus:border-primary transition-all shadow-sm"
                  >
                    <option value="compulsory">Required (Core Program)</option>
                    <option value="optional">Optional (Elective Path)</option>
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Session Frequency</label>
                  <select
                    title="Session frequency"
                    value={frequency}
                    onChange={e => setFrequency(e.target.value === '2' ? 2 : 1)}
                    className="w-full px-8 py-4 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none focus:border-primary transition-all shadow-sm"
                  >
                    <option value="1">Standard (1 session / week)</option>
                    <option value="2">Intensive (2 sessions / week)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Learning Experience */}
          <div className="bg-card border border-border rounded-[3.5rem] overflow-hidden shadow-2xl">
            <div className="p-10 border-b border-border bg-muted/10 flex items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <BeakerIcon className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h2 className="text-[11px] font-black text-foreground uppercase tracking-[0.3em] leading-none">02 · Learning Experience</h2>
                <p className="text-sm text-muted-foreground mt-2 italic">Control how students encounter and unlock their learning materials.</p>
              </div>
            </div>
            <div className="p-10 sm:p-14 space-y-12">
              <div className="space-y-4">
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Unlocking Logic</label>
                <select
                  title="Mastery mode"
                  value={form.mastery_mode}
                  onChange={e => setForm(f => ({ ...f, mastery_mode: e.target.value === 'soft' ? 'soft' : 'strict' }))}
                  className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none focus:border-primary transition-all shadow-inner"
                >
                  <option value="strict">Linear Lock (Pass one to unlock next)</option>
                  <option value="soft">Exploration Mode (Open browsing allowed)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-4">
                <Toggle
                  checked={form.strict_route_default}
                  onChange={v => setForm(f => ({ ...f, strict_route_default: v }))}
                  label="Enforced Path Following"
                  hint="Ensures students follow the designed pedagogical sequence."
                />
                <Toggle
                  checked={form.essential_routes_only}
                  onChange={v => setForm(f => ({ ...f, essential_routes_only: v }))}
                  label="Focused Core Delivery"
                  hint="Hides bonus/extension content to prioritize primary objectives."
                />
                <Toggle
                  checked={form.auto_flashcards_default}
                  onChange={v => setForm(f => ({ ...f, auto_flashcards_default: v }))}
                  label="Instant Review Decks"
                  hint="Automatically generate flashcard sets from new lesson content."
                />
                <Toggle
                  checked={form.project_based_default}
                  onChange={v => setForm(f => ({ ...f, project_based_default: v }))}
                  label="Hands-on Project Priority"
                  hint="Prioritize practical projects over traditional lecture-style lessons."
                />
              </div>
            </div>
          </div>

          {/* 3. Excellence Standards */}
          <div className="bg-card border border-border rounded-[3.5rem] overflow-hidden shadow-2xl">
            <div className="p-10 border-b border-border bg-muted/10 flex items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <ShieldCheckIcon className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h2 className="text-[11px] font-black text-foreground uppercase tracking-[0.3em] leading-none">03 · Excellence Standards</h2>
                <p className="text-sm text-muted-foreground mt-2 italic">Set the quality floor and automated compliance checks for content.</p>
              </div>
            </div>
            <div className="p-10 sm:p-14 space-y-14">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Pass Threshold (%)</label>
                  <input
                    type="number"
                    min={40} max={100}
                    value={form.qa_min_pass_score}
                    onChange={e => setForm(f => ({ ...f, qa_min_pass_score: Math.min(100, Math.max(40, Number(e.target.value || 75))) }))}
                    className="w-full px-8 py-4 bg-background border border-border rounded-2xl font-black text-xl outline-none focus:border-amber-500 transition-all shadow-inner"
                  />
                </div>
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Teaching Milestones</label>
                  <input
                    type="number"
                    min={1} max={8}
                    value={form.qa_required_teacher_steps}
                    onChange={e => setForm(f => ({ ...f, qa_required_teacher_steps: Math.min(8, Math.max(1, Number(e.target.value || 5))) }))}
                    className="w-full px-8 py-4 bg-background border border-border rounded-2xl font-black text-xl outline-none focus:border-amber-500 transition-all shadow-inner"
                  />
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-4 opacity-50">Steps per lesson.</p>
                </div>
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Activity Depth</label>
                  <input
                    type="number"
                    min={1} max={8}
                    value={form.qa_required_student_steps}
                    onChange={e => setForm(f => ({ ...f, qa_required_student_steps: Math.min(8, Math.max(1, Number(e.target.value || 5))) }))}
                    className="w-full px-8 py-4 bg-background border border-border rounded-2xl font-black text-xl outline-none focus:border-amber-500 transition-all shadow-inner"
                  />
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-4 opacity-50">Student activities.</p>
                </div>
              </div>

              <div className="space-y-8 p-10 bg-muted/20 rounded-[2.5rem] border border-border shadow-inner">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-500/70 text-center">Identity & Structural Integrity Controls</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Assignment Drift</label>
                    <select
                      value={form.qa_assessment_drift_mode}
                      onChange={e => setForm(f => ({ ...f, qa_assessment_drift_mode: e.target.value === 'fail' ? 'fail' : 'warn' }))}
                      className="w-full px-6 py-4 bg-background border border-border rounded-xl font-black uppercase tracking-widest text-[11px] outline-none focus:border-amber-500 transition-all"
                    >
                      <option value="warn">Warn only</option>
                      <option value="fail">Block & Enforce</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Examination Drift</label>
                    <select
                      value={form.qa_exam_drift_mode}
                      onChange={e => setForm(f => ({ ...f, qa_exam_drift_mode: e.target.value === 'warn' ? 'warn' : 'fail' }))}
                      className="w-full px-6 py-4 bg-background border border-border rounded-xl font-black uppercase tracking-widest text-[11px] outline-none focus:border-amber-500 transition-all"
                    >
                      <option value="fail">Block & Enforce</option>
                      <option value="warn">Warn only</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Structure Guard</label>
                    <select
                      value={form.qa_five_step_mode}
                      onChange={e => setForm(f => ({ ...f, qa_five_step_mode: e.target.value === 'fail' ? 'fail' : 'warn' }))}
                      className="w-full px-6 py-4 bg-background border border-border rounded-xl font-black uppercase tracking-widest text-[11px] outline-none focus:border-amber-500 transition-all"
                    >
                      <option value="warn">Warn only</option>
                      <option value="fail">Block & Enforce</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Public Transparency */}
          <div className="bg-card border border-border rounded-[3.5rem] overflow-hidden shadow-2xl">
            <div className="p-10 border-b border-border bg-muted/10 flex items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <EyeIcon className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-[11px] font-black text-foreground uppercase tracking-[0.3em] leading-none">04 · Public Transparency</h2>
                <p className="text-sm text-muted-foreground mt-2 italic">Configure visibility for students and parents on the portal.</p>
              </div>
            </div>
            <div className="p-10 sm:p-14 space-y-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Path Visibility Mode</label>
                  <select
                    value={pathMode}
                    onChange={e => setPathMode(e.target.value === 'milestone' ? 'milestone' : 'full')}
                    className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none focus:border-blue-500 transition-all shadow-inner"
                  >
                    <option value="full">Full Access (All weeks visible)</option>
                    <option value="milestone">Milestones Only (Checkpoints only)</option>
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-4">Scope targeting</label>
                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    className="w-full px-8 py-5 bg-background border border-border rounded-2xl font-black uppercase tracking-widest outline-none focus:border-blue-500 transition-all shadow-inner"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.schools?.name ? ` — ${c.schools.name}` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => applyPathVisibility('one')}
                  disabled={pathSaving || !selectedClassId}
                  className="px-10 py-4 text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl border border-border hover:bg-muted/30 transition-all disabled:opacity-50 shadow-sm"
                >
                  Apply to Class
                </button>
                <button
                  type="button"
                  onClick={() => applyPathVisibility('all')}
                  disabled={pathSaving}
                  className="px-10 py-4 text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl border border-blue-500/30 text-blue-400 hover:bg-blue-500/5 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/5"
                >
                  Apply to All Modules
                </button>
              </div>
            </div>
          </div>

          {/* Sync Button */}
          <div className="pt-8">
            <button
              type="button"
              onClick={savePolicy}
              disabled={saving}
              className="group relative w-full overflow-hidden rounded-[2.5rem] bg-primary py-8 text-sm font-black uppercase tracking-[0.4em] text-white shadow-[0_40px_100px_rgba(124,58,237,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              <div className="flex items-center justify-center gap-4">
                <ArrowPathIcon className={`w-6 h-6 ${saving ? 'animate-spin' : ''}`} />
                {saving ? 'Synchronizing Governance Rules...' : `Commit Excellence Standards`}
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
