'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { ArrowPathIcon } from '@/lib/icons';
import { toast } from 'sonner';

type OpsData = Record<string, Record<string, unknown>>;

const SECTION_LABELS: Record<string, string> = {
  'lms.ops.calendar': 'Academic Calendar Controls',
  'lms.ops.permissions': 'Role Permissions Matrix',
  'lms.ops.approvals': 'Approval Workflows',
  'lms.ops.assessment': 'Assessment Policy Pack',
  'lms.ops.promotion': 'Promotion Rules Engine',
  'lms.ops.alerts': 'Alerts & Escalations',
  'lms.ops.communication': 'Communication Defaults',
  'lms.ops.integrity': 'Data Integrity & Backup',
  'lms.ops.pwa': 'PWA / Offline Controls',
};

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export default function OperationsSettingsPage() {
  const { profile, loading: authLoading } = useAuth();
  const canView = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');
  const canSave = ['admin', 'teacher'].includes(profile?.role ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [data, setData] = useState<OpsData>({});

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    fetch('/api/progression/operations-settings')
      .then((r) => r.json())
      .then((j) => {
        setData((j.data ?? {}) as OpsData);
        setReadonly(Boolean(j.readonly));
      })
      .catch(() => toast.error('Failed to load operations settings'))
      .finally(() => setLoading(false));
  }, [canView]);

  const sortedSections = useMemo(
    () => Object.keys(data).sort((a, b) => (SECTION_LABELS[a] ?? a).localeCompare(SECTION_LABELS[b] ?? b)),
    [data],
  );

  function updateValue(section: string, key: string, value: unknown) {
    setData((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] ?? {}),
        [key]: value,
      },
    }));
  }

  async function saveAll() {
    if (!canSave || readonly) return;
    setSaving(true);
    try {
      const res = await fetch('/api/progression/operations-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: data }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Save failed');
      toast.success('LMS operations settings saved');
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
  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Staff access required.</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <h1 className="text-xl font-black">LMS Settings - Operations Control Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Central controls for calendar, permissions, approvals, assessment, promotion, alerts, communication, integrity, and PWA.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/dashboard/progression/settings" className="px-3 py-2 text-xs font-bold rounded-lg border border-border hover:bg-muted/30">
            Back to Settings Home
          </Link>
          {readonly && (
            <span className="px-3 py-2 text-xs font-bold rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300">
              Read-only view for school role
            </span>
          )}
        </div>
      </div>

      {sortedSections.map((section) => {
        const block = data[section] ?? {};
        const label = SECTION_LABELS[section] ?? section;
        return (
          <div key={section} className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-black text-foreground">{label}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(block).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-border p-3 bg-background/50">
                  <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{key.replaceAll('_', ' ')}</p>
                  {isBoolean(value) ? (
                    <label className="mt-2 inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={value}
                        disabled={readonly || !canSave}
                        onChange={(e) => updateValue(section, key, e.target.checked)}
                      />
                      <span>{value ? 'Enabled' : 'Disabled'}</span>
                    </label>
                  ) : isNumber(value) ? (
                    <input
                      type="number"
                      value={value}
                      disabled={readonly || !canSave}
                      onChange={(e) => updateValue(section, key, Number(e.target.value))}
                      className="mt-2 w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={String(value ?? '')}
                      disabled={readonly || !canSave}
                      onChange={(e) => updateValue(section, key, e.target.value)}
                      className="mt-2 w-full px-3 py-2 bg-background border border-border rounded-xl text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="sticky bottom-4">
        <button
          type="button"
          onClick={saveAll}
          disabled={saving || readonly || !canSave}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-black rounded-xl inline-flex items-center justify-center gap-2"
        >
          {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
          Save Operations Settings
        </button>
      </div>
    </div>
  );
}
