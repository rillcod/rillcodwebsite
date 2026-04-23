'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { ArrowPathIcon } from '@/lib/icons';
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
  const [newTrack, setNewTrack] = useState('');
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
        toast.error('Failed to load progression policies');
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
      const trackPriority = form.track_priority.filter(Boolean);
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
          track_priority: trackPriority,
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
      setPrograms((prev) =>
        prev.map((p) => (p.id === selectedProgram.id ? (json.data as PolicyProgram) : p)),
      );
      toast.success('Progression policy saved');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function applyPathVisibility(scope: 'one' | 'all') {
    setPathSaving(true);
    try {
      const payload =
        scope === 'all'
          ? { apply_to_all: true, mode: pathMode }
          : { class_id: selectedClassId, mode: pathMode };
      const res = await fetch('/api/progression/path-visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      if (scope === 'all') {
        toast.success(`Path visibility updated for ${json.data?.updated_count ?? 0} classes`);
      } else {
        toast.success('Path visibility updated for selected class');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setPathSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!canManage) {
    return <div className="p-6 text-sm text-muted-foreground">Teacher/Admin access required.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <h1 className="text-xl font-black text-card-foreground">LMS Settings - Progression Policies</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your LMS progression defaults per program without manual JSON editing.
        </p>
        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            <a
              href="/dashboard/progression/settings"
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
            >
              Open Settings Home
            </a>
            <a
              href="/dashboard/progression/analytics"
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
            >
              Open Analytics Dashboard
            </a>
            <a
              href="/dashboard/progression/project-registry"
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
            >
              Open Project Registry
            </a>
            <a
              href="/dashboard/progression/audit"
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
            >
              Open Audit Log
            </a>
            <a
              href="/dashboard/progression/marker-integrity"
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
            >
              Open Marker Integrity
            </a>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div>
          <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Program</label>
          <select
            value={selectedProgramId}
            onChange={(e) => setSelectedProgramId(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
          >
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Delivery Mode Default</label>
            <select
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value === 'optional' ? 'optional' : 'compulsory')}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
            >
              <option value="compulsory">Compulsory</option>
              <option value="optional">Optional</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Session Frequency / Week</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value === '2' ? 2 : 1)}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
            >
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Quick mode toggles</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDeliveryType('optional');
                setEnabled(true);
                setForm((f) => ({ ...f, project_based_default: false, essential_routes_only: false }));
              }}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
            >
              Optional mode
            </button>
            <button
              type="button"
              onClick={() => {
                setDeliveryType('compulsory');
                setEnabled(true);
                setForm((f) => ({ ...f, project_based_default: false, essential_routes_only: true }));
              }}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
            >
              Compulsory mode
            </button>
            <button
              type="button"
              onClick={() => {
                setDeliveryType('optional');
                setEnabled(true);
                setForm((f) => ({ ...f, project_based_default: true, essential_routes_only: false }));
              }}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
            >
              Project-based mode
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-3 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">
            Student/Parent Path Visibility
          </p>
          <p className="text-xs text-muted-foreground">
            Choose what path detail students and parents can see.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">
                Mode
              </label>
              <select
                value={pathMode}
                onChange={(e) => setPathMode(e.target.value === 'milestone' ? 'milestone' : 'full')}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
              >
                <option value="full">Full details</option>
                <option value="milestone">Milestone only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">
                One class
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.schools?.name ? ` (${c.schools.name})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPathVisibility('one')}
              disabled={pathSaving || !selectedClassId}
              className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30 disabled:opacity-50"
            >
              Apply to one class
            </button>
            <button
              type="button"
              onClick={() => applyPathVisibility('all')}
              disabled={pathSaving}
              className="px-3 py-2 text-xs font-bold rounded-lg border border-violet-400/30 text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
            >
              Apply to all classes
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Progression Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.strict_route_default}
              onChange={(e) => setForm((f) => ({ ...f, strict_route_default: e.target.checked }))}
            />
            Strict Route Default
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.auto_flashcards_default}
              onChange={(e) => setForm((f) => ({ ...f, auto_flashcards_default: e.target.checked }))}
            />
            Auto Flashcards Default
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.project_based_default}
              onChange={(e) => setForm((f) => ({ ...f, project_based_default: e.target.checked }))}
            />
            Project-based by default
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.essential_routes_only}
              onChange={(e) => setForm((f) => ({ ...f, essential_routes_only: e.target.checked }))}
            />
            Essential routes only
          </label>
        </div>

        <details className="rounded-xl border border-border bg-card/50 p-3">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-muted-foreground">
            Advanced details
          </summary>
          <div className="mt-2 text-xs text-muted-foreground space-y-1">
            <p>Database: <code>programs.delivery_type</code>, <code>programs.progression_policy</code></p>
            <p>API: <code>GET/PUT /api/progression/policies</code></p>
            <p>Route behavior keys: <code>strict_route_default</code>, <code>essential_routes_only</code></p>
          </div>
        </details>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Mastery Mode</label>
            <select
              value={form.mastery_mode}
              onChange={(e) => setForm((f) => ({ ...f, mastery_mode: e.target.value === 'soft' ? 'soft' : 'strict' }))}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
            >
              <option value="strict">Strict unlock</option>
              <option value="soft">Soft unlock</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Track Priority</label>
            <div className="space-y-2">
              {form.track_priority.map((track, idx) => (
                <div key={`${track}-${idx}`} className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm">{track}</div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => {
                      if (idx === 0) return f;
                      const next = [...f.track_priority];
                      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                      return { ...f, track_priority: next };
                    })}
                    className="px-2 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => {
                      if (idx >= f.track_priority.length - 1) return f;
                      const next = [...f.track_priority];
                      [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                      return { ...f, track_priority: next };
                    })}
                    className="px-2 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({
                      ...f,
                      track_priority: f.track_priority.filter((_, i) => i !== idx),
                    }))}
                    className="px-2 py-2 text-xs font-bold rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={newTrack}
                  onChange={(e) => setNewTrack(e.target.value)}
                  placeholder="Add track id (e.g., young_innovator)"
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-xl text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = newTrack.trim();
                    if (!value) return;
                    setForm((f) => ({
                      ...f,
                      track_priority: f.track_priority.includes(value)
                        ? f.track_priority
                        : [...f.track_priority, value],
                    }));
                    setNewTrack('');
                  }}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background/50 p-4 space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-300">Syllabus QA Controls</p>
            <p className="text-xs text-muted-foreground mt-1">
              Define what your QA layer should enforce for coverage, 5-step structure, and syllabus rhythm drift.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Minimum Pass Score</label>
              <input
                type="number"
                min={40}
                max={100}
                value={form.qa_min_pass_score}
                onChange={(e) => setForm((f) => ({ ...f, qa_min_pass_score: Math.min(100, Math.max(40, Number(e.target.value || 75))) }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Teacher Steps Required</label>
              <input
                type="number"
                min={1}
                max={8}
                value={form.qa_required_teacher_steps}
                onChange={(e) => setForm((f) => ({ ...f, qa_required_teacher_steps: Math.min(8, Math.max(1, Number(e.target.value || 5))) }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Student Steps Required</label>
              <input
                type="number"
                min={1}
                max={8}
                value={form.qa_required_student_steps}
                onChange={(e) => setForm((f) => ({ ...f, qa_required_student_steps: Math.min(8, Math.max(1, Number(e.target.value || 5))) }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Assessment Drift Mode</label>
              <select
                value={form.qa_assessment_drift_mode}
                onChange={(e) => setForm((f) => ({ ...f, qa_assessment_drift_mode: e.target.value === 'fail' ? 'fail' : 'warn' }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
              >
                <option value="warn">Warn</option>
                <option value="fail">Fail</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Exam Drift Mode</label>
              <select
                value={form.qa_exam_drift_mode}
                onChange={(e) => setForm((f) => ({ ...f, qa_exam_drift_mode: e.target.value === 'warn' ? 'warn' : 'fail' }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
              >
                <option value="fail">Fail</option>
                <option value="warn">Warn</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">5-Step Break Mode</label>
              <select
                value={form.qa_five_step_mode}
                onChange={(e) => setForm((f) => ({ ...f, qa_five_step_mode: e.target.value === 'fail' ? 'fail' : 'warn' }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
              >
                <option value="warn">Warn</option>
                <option value="fail">Fail</option>
              </select>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={savePolicy}
          disabled={saving || !selectedProgram}
          className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl"
        >
          {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
          Save Policy
        </button>
      </div>
    </div>
  );
}
