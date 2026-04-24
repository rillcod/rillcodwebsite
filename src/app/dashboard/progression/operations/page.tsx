'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { ArrowPathIcon, ArrowLeftIcon } from '@/lib/icons';
import { toast } from 'sonner';

type OpsData = Record<string, Record<string, unknown>>;

// Plain English section names and descriptions
const SECTION_META: Record<string, { label: string; desc: string }> = {
  'lms.ops.calendar': {
    label: 'Academic Calendar',
    desc: 'Set term dates, holidays, and when the school year starts and ends.',
  },
  'lms.ops.permissions': {
    label: 'Who Can Do What',
    desc: 'Control which roles (teacher, school, parent) can access or edit different parts of the platform.',
  },
  'lms.ops.approvals': {
    label: 'Approval Workflows',
    desc: 'Decide whether new students and schools need manual approval before they can access the platform.',
  },
  'lms.ops.assessment': {
    label: 'Assessment Rules',
    desc: 'Set how assignments and exams are graded, retried, and submitted across the platform.',
  },
  'lms.ops.promotion': {
    label: 'Student Promotion Rules',
    desc: 'Define what score or completion rate a student needs to move up to the next level at term end.',
  },
  'lms.ops.alerts': {
    label: 'Alerts & Notifications',
    desc: 'Configure when the system sends automatic alerts — e.g. when a student falls behind or misses a deadline.',
  },
  'lms.ops.communication': {
    label: 'Messaging Defaults',
    desc: 'Set default rules for WhatsApp and inbox messaging — daily limits, cooldowns, and who can message whom.',
  },
  'lms.ops.integrity': {
    label: 'Data Safety',
    desc: 'Controls for data backup frequency and duplicate detection to keep your records clean.',
  },
  'lms.ops.pwa': {
    label: 'Offline / App Mode',
    desc: 'Settings for the mobile app experience — what works offline and how the app behaves on slow connections.',
  },
};

// Plain English key names
function humaniseKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isBoolean(v: unknown): v is boolean { return typeof v === 'boolean'; }
function isNumber(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }

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
      .then(r => r.json())
      .then(j => {
        setData((j.data ?? {}) as OpsData);
        setReadonly(Boolean(j.readonly));
      })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, [canView]);

  const sortedSections = useMemo(
    () => Object.keys(data).sort((a, b) => (SECTION_META[a]?.label ?? a).localeCompare(SECTION_META[b]?.label ?? b)),
    [data],
  );

  function updateValue(section: string, key: string, value: unknown) {
    setData(prev => ({ ...prev, [section]: { ...(prev[section] ?? {}), [key]: value } }));
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
      toast.success('Settings saved');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!canView) return <div className="p-6 text-sm text-muted-foreground">Staff access required.</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <Link href="/dashboard/progression/settings" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeftIcon className="w-4 h-4" /> Back to LMS Settings
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-black">Platform Controls</h1>
            <p className="text-sm text-muted-foreground mt-1">
              These are the global switches for how your platform runs — calendar, approvals, grading rules, messaging, and more.
              Changes here affect everyone on the platform.
            </p>
          </div>
          {readonly && (
            <span className="px-3 py-1.5 text-xs font-bold rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-300 shrink-0">
              View only — contact your admin to make changes
            </span>
          )}
        </div>
      </div>

      {sortedSections.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground text-sm">No settings loaded yet. This usually means the platform hasn't been configured yet.</p>
          <p className="text-xs text-muted-foreground mt-2">Contact your platform admin to initialise the operations settings.</p>
        </div>
      )}

      {sortedSections.map(section => {
        const block = data[section] ?? {};
        const meta = SECTION_META[section] ?? { label: section, desc: '' };
        return (
          <div key={section} className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-sm font-black text-foreground">{meta.label}</p>
              {meta.desc && <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(block).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-border p-3 bg-background/50 space-y-2">
                  <p className="text-xs font-black text-foreground">{humaniseKey(key)}</p>
                  {isBoolean(value) ? (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={value}
                          disabled={readonly || !canSave}
                          onChange={e => updateValue(section, key, e.target.checked)}
                        />
                        <div className={`w-10 h-6 rounded-full transition-colors ${value ? 'bg-violet-600' : 'bg-muted'} ${(readonly || !canSave) ? 'opacity-50' : ''}`} />
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : ''}`} />
                      </div>
                      <span className="text-sm text-foreground">{value ? 'On' : 'Off'}</span>
                    </label>
                  ) : isNumber(value) ? (
                    <input
                      type="number"
                      title={humaniseKey(key)}
                      value={value}
                      disabled={readonly || !canSave}
                      onChange={e => updateValue(section, key, Number(e.target.value))}
                      className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm disabled:opacity-50"
                    />
                  ) : (
                    <input
                      type="text"
                      title={humaniseKey(key)}
                      value={String(value ?? '')}
                      disabled={readonly || !canSave}
                      onChange={e => updateValue(section, key, e.target.value)}
                      className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm disabled:opacity-50"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {canSave && !readonly && sortedSections.length > 0 && (
        <div className="sticky bottom-4">
          <button
            type="button"
            onClick={saveAll}
            disabled={saving}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-black rounded-xl inline-flex items-center justify-center gap-2"
          >
            {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
            Save all changes
          </button>
        </div>
      )}
    </div>
  );
}
