'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useOfficeOptional } from './OfficeContext';

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
      {
        key: 'customer_followup_enabled',
        label: 'Remind staff about unfinished work',
        detail: 'The staff owner is reminded. The admin sees it when it becomes late.',
      },
    ],
  },
  {
    title: 'Retention',
    description: 'Helpful reminders for existing learners who have allowed them.',
    rows: [
      {
        key: 'retention_streaks_enabled',
        label: 'Learning streak reminders',
        detail: 'Prompt opted-in students who have not completed learning activity today.',
      },
    ],
  },
  {
    title: 'Marketing and prospect follow-up',
    description: 'Only people who agreed to marketing receive it. The main switch controls every item below.',
    rows: [
      {
        key: 'marketing_enabled',
        label: 'Marketing master switch',
        detail: 'Stop or allow all automated nurture and scheduled newsletter publishing.',
      },
      {
        key: 'lead_nurture_enabled',
        label: 'Lead nurture emails',
        detail: 'Friendly monthly-paced emails about programmes (Summer School, Young Innovators, Teen Developers).',
      },
      {
        key: 'form_followup_enabled',
        label: 'Form follow-up (WhatsApp)',
        detail: 'Consent-aware WhatsApp check-ins at week 1 and week 3 — not daily.',
      },
      {
        key: 'newsletter_auto_publish_enabled',
        label: 'Scheduled newsletter publishing',
        detail: 'Publish only newsletters already prepared, targeted, and scheduled by staff.',
      },
    ],
  },
];

type Props = { embedded?: boolean };

export function AutomationControlsPanel({ embedded = false }: Props) {
  const office = useOfficeOptional();
  const notify = office?.notifyOfficeChange;
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

  useEffect(() => {
    void load();
  }, [load]);

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
      notify?.('settings');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save control.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6">
      {!embedded ? (
        <header>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Administration</p>
          <h1 className="text-2xl font-black text-foreground">Automatic work settings</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Choose what the office may do automatically. The external schedule can start a check, but it cannot bypass a
            switch that is off.
          </p>
        </header>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Choose what the office may do automatically. A schedule cannot bypass a switch that is off.
          </p>
          <Link
            href="/dashboard/finance?workspace=settings"
            className="inline-flex min-h-11 touch-manipulation items-center rounded-xl border border-border px-4 py-2 text-sm font-bold"
          >
            Finance controls
          </Link>
        </div>
      )}

      {channels && !channels.whatsappApiApproved ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 className="font-black text-foreground">
            {channels.whatsappApiMode === 'review' ? 'WhatsApp Meta review mode' : 'WhatsApp API safely paused'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {channels.whatsappApiMode === 'review'
              ? 'Only phone numbers listed for Meta review can receive API test messages. Customer cron and outbox delivery remain paused.'
              : 'Facebook/Meta approval is still pending. Automatic WhatsApp API sends are held safely; in-app work and approved email continue normally.'}
          </p>
          <a
            href={channels.manualWhatsAppUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 touch-manipulation items-center rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white"
          >
            Open manual WhatsApp: 08116600091
          </a>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading controls...
        </div>
      ) : null}

      {!loading &&
        controls &&
        GROUPS.map((group) => (
          <section key={group.title} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-black text-foreground">{group.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
            <div className="mt-4 divide-y divide-border">
              {group.rows.map((row) => {
                const on = controls[row.key];
                const blockedByMarketing =
                  group.title === 'Marketing and prospect follow-up' &&
                  row.key !== 'marketing_enabled' &&
                  !controls.marketing_enabled;
                return (
                  <div key={row.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.detail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggle(row.key)}
                      disabled={saving !== null}
                      className={`min-h-11 min-w-24 shrink-0 touch-manipulation rounded-xl border px-3 py-2 text-xs font-black uppercase disabled:opacity-50 ${
                        on && !blockedByMarketing
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-border bg-muted text-muted-foreground'
                      }`}
                    >
                      {saving === row.key ? 'Saving' : blockedByMarketing ? 'Blocked' : on ? 'On' : 'Off'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
