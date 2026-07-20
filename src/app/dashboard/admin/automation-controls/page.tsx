'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Controls = {
  customer_followup_enabled: boolean;
  retention_streaks_enabled: boolean;
  marketing_enabled: boolean;
  lead_nurture_enabled: boolean;
  form_followup_enabled: boolean;
  newsletter_auto_publish_enabled: boolean;
};

const GROUPS: Array<{ title: string; description: string; rows: Array<{ key: keyof Controls; label: string; detail: string }> }> = [
  {
    title: 'Customer follow-up',
    description: 'Internal reminders and escalation for open service cases. This does not send marketing to customers.',
    rows: [
      { key: 'customer_followup_enabled', label: 'Case follow-up and escalation', detail: 'Remind the assigned staff member and escalate overdue work to admin.' },
    ],
  },
  {
    title: 'Retention',
    description: 'Helpful engagement for existing learners, still subject to each user notification preference.',
    rows: [
      { key: 'retention_streaks_enabled', label: 'Learning streak reminders', detail: 'Prompt opted-in students who have not completed learning activity today.' },
    ],
  },
  {
    title: 'Marketing and nurture',
    description: 'Consent-led prospect follow-up and approved scheduled content. The master switch overrides every item below it.',
    rows: [
      { key: 'marketing_enabled', label: 'Marketing master switch', detail: 'Stop or allow all automated nurture and scheduled newsletter publishing.' },
      { key: 'lead_nurture_enabled', label: 'Lead nurture emails', detail: 'Run the paced three-step conversation for eligible, unconverted leads.' },
      { key: 'form_followup_enabled', label: 'Form follow-up sequence', detail: 'Run consent-aware WhatsApp and email follow-up for incomplete or pending forms.' },
      { key: 'newsletter_auto_publish_enabled', label: 'Scheduled newsletter publishing', detail: 'Publish only newsletters already prepared, targeted, and scheduled by staff.' },
    ],
  },
];
const WORK_AREAS = [
  { label: 'People and duty', detail: 'Set availability and current duty owner', href: '/dashboard/admin/operations-duty' },
  { label: 'Customer cases', detail: 'See ownership, status, SLA, and full history', href: '/dashboard/cases' },
  { label: 'Finance controls', detail: 'Control billing, invoice, balance, and channels', href: '/dashboard/finance?workspace=settings' },
  { label: 'Customer retention', detail: 'Review leads, relationships, and pipeline work', href: '/dashboard/crm' },
  { label: 'Marketing content', detail: 'Draft, approve, target, and schedule newsletters', href: '/dashboard/newsletters' },
  { label: 'Message templates', detail: 'Test, approve, and version customer communications', href: '/dashboard/admin/communication-templates' },
  { label: 'Feedback and quality', detail: 'Answer, resolve, and audit customer feedback', href: '/dashboard/feedback' },
  { label: 'Operations health', detail: 'Monitor cron runs and recover failed messages', href: '/dashboard/admin/operations-health' },
];


export default function AutomationControlsPage() {
  const [controls, setControls] = useState<Controls | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Controls | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/automation-controls', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load controls.');
      setControls(json.controls);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load controls.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggle(key: keyof Controls) {
    if (!controls) return;
    setSaving(key);
    setError('');
    const next = !controls[key];
    try {
      const response = await fetch('/api/admin/automation-controls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to save control.');
      setControls(json.controls);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save control.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Administration</p>
          <h1 className="text-2xl font-black text-foreground">Office automation controls</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Direct control of customer follow-up, retention, and marketing. External cron jobs cannot override these switches.</p>
        </div>
        <Link href="/dashboard/admin/operations-duty" className="rounded-xl border border-border px-4 py-2 text-sm font-bold">Staff duty board</Link>
      </header>
      <section>
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Administration work areas</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WORK_AREAS.map((area) => <Link key={area.href} href={area.href} className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50 hover:bg-primary/5">
            <p className="font-black text-foreground">{area.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{area.detail}</p>
          </Link>)}
        </div>
      </section>


      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-500">{error}</p>}
      {loading && <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading controls...</div>}

      {!loading && controls && GROUPS.map((group) => (
        <section key={group.title} className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-black text-foreground">{group.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
          <div className="mt-4 divide-y divide-border">
            {group.rows.map((row) => {
              const on = controls[row.key];
              const blockedByMarketing = group.title === 'Marketing and nurture' && row.key !== 'marketing_enabled' && !controls.marketing_enabled;
              return <div key={row.key} className="flex items-center justify-between gap-4 py-4">
                <div><p className="text-sm font-bold text-foreground">{row.label}</p><p className="text-xs text-muted-foreground">{row.detail}</p></div>
                <button type="button" onClick={() => void toggle(row.key)} disabled={saving !== null} className={`min-w-24 rounded-xl border px-3 py-2 text-xs font-black uppercase ${on && !blockedByMarketing ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : 'border-border bg-muted text-muted-foreground'} disabled:opacity-50`}>
                  {saving === row.key ? 'Saving' : blockedByMarketing ? 'Blocked' : on ? 'On' : 'Off'}
                </button>
              </div>;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
