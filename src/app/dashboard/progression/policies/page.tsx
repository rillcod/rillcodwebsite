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
  mastery_mode: 'strict' | 'soft';
  track_priority: string[];
};

function toEditablePolicy(program: PolicyProgram): EditablePolicy {
  const policy = program.progression_policy ?? {};
  const trackPriorityArray = Array.isArray(policy.track_priority)
    ? policy.track_priority.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    strict_route_default: policy.strict_route_default !== false,
    auto_flashcards_default: policy.auto_flashcards_default !== false,
    mastery_mode: policy.mastery_mode === 'soft' ? 'soft' : 'strict',
    track_priority: trackPriorityArray,
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
    mastery_mode: 'strict',
    track_priority: [],
  });
  const [newTrack, setNewTrack] = useState('');
  const [deliveryType, setDeliveryType] = useState<'optional' | 'compulsory'>('compulsory');
  const [frequency, setFrequency] = useState<1 | 2>(1);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canManage) return;
    setLoading(true);
    fetch('/api/progression/policies')
      .then((r) => r.json())
      .then((j) => {
        const rows = (j.data ?? []) as PolicyProgram[];
        setPrograms(rows);
        if (rows.length > 0) setSelectedProgramId(rows[0].id);
      })
      .catch(() => toast.error('Failed to load progression policies'))
      .finally(() => setLoading(false));
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
          mastery_mode: form.mastery_mode,
          track_priority: trackPriority,
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
        <h1 className="text-xl font-black text-card-foreground">Progression Policy Control Panel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure per-program defaults for generation behavior without manual JSON editing.
        </p>
        <div className="mt-3">
          <a
            href="/dashboard/progression/analytics"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30"
          >
            Open Analytics Dashboard
          </a>
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
        </div>

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
