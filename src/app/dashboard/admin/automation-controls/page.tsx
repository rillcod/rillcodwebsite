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

type Channels = { whatsappApiApproved: boolean; whatsappApiMode: 'off' | 'review' | 'approved'; manualWhatsAppUrl: string };
const GROUPS: Array<{ title: string; description: string; rows: Array<{ key: keyof Controls; label: string; detail: string }> }> = [
  {
    title: 'Help customers until the work is finished',
    description: 'Remind staff about open customer work. This does not send marketing.',
    rows: [
      { key: 'customer_followup_enabled', label: 'Remind staff about unfinished work', detail: 'The staff owner is reminded. The admin sees it when it becomes late.' },
    ],
  },
  {
    title: 'Retention',
    description: 'Helpful reminders for existing learners who have allowed them.',
    rows: [
      { key: 'retention_streaks_enabled', label: 'Learning streak reminders', detail: 'Prompt opted-in students who have not completed learning activity today.' },
    ],
  },
  {
    title: 'Marketing and prospect follow-up',
    description: 'Only people who agreed to marketing receive it. The main switch controls every item below.',
    rows: [
      { key: 'marketing_enabled', label: 'Marketing master switch', detail: 'Stop or allow all automated nurture and scheduled newsletter publishing.' },
      { key: 'lead_nurture_enabled', label: 'Lead nurture emails', detail: 'Run the paced three-step conversation for eligible, unconverted leads.' },
      { key: 'form_followup_enabled', label: 'Form follow-up sequence', detail: 'Run consent-aware WhatsApp and email follow-up for incomplete or pending forms.' },
      { key: 'newsletter_auto_publish_enabled', label: 'Scheduled newsletter publishing', detail: 'Publish only newsletters already prepared, targeted, and scheduled by staff.' },
    ],
  },
];
const WORK_AREAS = [
  { label: 'Office Desk - start here', detail: 'See people, work items, staff owners, messages, and problems', href: '/dashboard/admin/office-desk' },
  { label: 'People and duty', detail: 'Set availability and current duty owner', href: '/dashboard/admin/operations-duty' },
  { label: 'Customer cases', detail: 'See ownership, status, SLA, and full history', href: '/dashboard/cases' },
  { label: 'Finance controls', detail: 'Control billing, invoice, balance, and channels', href: '/dashboard/finance?workspace=settings' },
  { label: 'Customer follow-up', detail: 'See prospects and customers who need the next helpful contact', href: '/dashboard/crm' },
  { label: 'Marketing content', detail: 'Draft, approve, target, and schedule newsletters', href: '/dashboard/newsletters' },
  { label: 'Approved message wording', detail: 'Review the words used in automatic customer messages', href: '/dashboard/admin/communication-templates' },
  { label: 'Office results', detail: 'See response speed, successful delivery, safety, and customer value', href: '/dashboard/admin/operations-performance' },
  { label: 'Feedback and quality', detail: 'Answer, resolve, and audit customer feedback', href: '/dashboard/feedback' },
  { label: 'Scheduled work', detail: 'Check timed automatic work and retry failed messages', href: '/dashboard/admin/operations-health' },
];


export default function AutomationControlsPage() {
  const [controls, setControls] = useState<Controls | null>(null);
  const [channels, setChannels] = useState<Channels | null>(null);
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
      setChannels(json.channels);
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
      setChannels(json.channels);
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
          <h1 className="text-2xl font-black text-foreground">Automatic work settings</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Choose what the office may do automatically. The external schedule can start a check, but it cannot bypass a switch that is off.</p>
        </div>
        <Link href="/dashboard/admin/operations-duty" className="rounded-xl border border-border px-4 py-2 text-sm font-bold">Staff duty board</Link>
      </header>
      {channels && !channels.whatsappApiApproved && <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
        <h2 className="font-black text-foreground">{channels.whatsappApiMode === 'review' ? 'WhatsApp Meta review mode' : 'WhatsApp API safely paused'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{channels.whatsappApiMode === 'review'
          ? 'Only phone numbers listed for Meta review can receive API test messages. Customer cron and outbox delivery remain paused.'
          : 'Facebook/Meta approval is still pending. Automatic WhatsApp API sends are held safely; in-app work and approved email continue normally.'
        }</p>
        <a href={channels.manualWhatsAppUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white">
          Open manual WhatsApp: 08116600091
        </a>
      </section>}
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
