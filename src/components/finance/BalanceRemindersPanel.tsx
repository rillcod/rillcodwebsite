'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@/contexts/auth-context';

interface Settings {
  enabled: boolean;
  every_days: number;
  max_reminders: number;
  channel_email: boolean;
  channel_whatsapp: boolean;
}

interface Row {
  id: string;
  name: string;
  parentName: string | null;
  email: string;
  phone: string | null;
  amountPaid: number;
  totalTuition: number;
  balanceDue: number;
  remindersSent: number;
  lastReminded: string | null;
  paused: boolean;
}

const naira = (n: number) => `₦${(n || 0).toLocaleString()}`;

type Variant = 'rules' | 'queue';

/**
 * Balance reminders — split by Finance workspace job:
 *  - rules  → Settings (cadence / channels / on-off)
 *  - queue  → Collections (parents with outstanding balances)
 */
export default function BalanceRemindersPanel({
  embedded = false,
  variant = 'queue',
}: {
  embedded?: boolean;
  variant?: Variant;
}) {
  const { profile, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any>(null);

  const isAdmin = profile?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/balance-reminders', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Failed to load balance reminders');
      setSettings(j.settings ?? {
        enabled: false,
        every_days: 5,
        max_reminders: 4,
        channel_email: true,
        channel_whatsapp: false,
      });
      setList(j.list ?? []);
    } catch (e: any) {
      setSettings(null);
      setList([]);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) load();
  }, [authLoading, isAdmin, load]);

  async function saveSettings(patch: Partial<Settings>) {
    setSaving(true);
    setSettings((s) => (s ? ({ ...s, ...patch } as Settings) : ({
      enabled: false,
      every_days: 5,
      max_reminders: 4,
      channel_email: true,
      channel_whatsapp: false,
      ...patch,
    } as Settings)));
    try {
      const r = await fetch('/api/admin/balance-reminders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Failed to save');
      if (j.settings) setSettings(j.settings);
    } catch (e: any) {
      await load();
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function act(action: string, prospectId?: string) {
    setBusy(prospectId || action);
    try {
      const r = await fetch('/api/admin/balance-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, prospectId }),
      });
      const j = await r.json();
      if (action === 'run_now') setRunResult(j.result ?? j);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground text-sm">Admin access required.</p>
      </div>
    );
  }

  const Toggle = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
        on
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
          : 'bg-muted border-border text-muted-foreground'
      }`}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
      {label}
    </button>
  );

  const wrap = (node: ReactNode) => (
    <div className={embedded ? 'space-y-4' : 'max-w-6xl mx-auto px-4 py-8 space-y-6'}>{node}</div>
  );

  if (variant === 'rules') {
    return wrap(
      <>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Settings</p>
          <h2 className="text-xl font-black text-foreground mt-0.5">Balance reminder rules</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure cadence and channels. Chase parents with outstanding balances under{' '}
            <Link href="/dashboard/finance?workspace=collections" className="text-primary font-bold hover:underline">
              Collections
            </Link>
            .
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Toggle
              on={!!settings?.enabled}
              onClick={() => saveSettings({ enabled: !settings?.enabled })}
              label={settings?.enabled ? 'Reminders ON' : 'Reminders OFF'}
            />
            <Toggle
              on={!!settings?.channel_email}
              onClick={() => saveSettings({ channel_email: !settings?.channel_email })}
              label="Email"
            />
            <Toggle
              on={!!settings?.channel_whatsapp}
              onClick={() => saveSettings({ channel_whatsapp: !settings?.channel_whatsapp })}
              label="WhatsApp"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Remind every (days)
              </span>
              <input
                type="number"
                min={1}
                max={60}
                value={settings?.every_days ?? 5}
                onChange={(e) => setSettings((s) => (s ? { ...s, every_days: Number(e.target.value) } : s))}
                onBlur={(e) => saveSettings({ every_days: Number(e.target.value) })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Max reminders per parent
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={settings?.max_reminders ?? 4}
                onChange={(e) => setSettings((s) => (s ? { ...s, max_reminders: Number(e.target.value) } : s))}
                onBlur={(e) => saveSettings({ max_reminders: Number(e.target.value) })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </label>
          </div>
        </div>
      </>,
    );
  }

  // variant === 'queue'
  return wrap(
    <>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Collections</p>
          <h2 className="text-xl font-black text-foreground mt-0.5">Outstanding parents</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Summer-school balances still due. Invoice cron rules &amp; channels live in{' '}
            <Link href="/dashboard/finance?workspace=settings" className="text-primary font-bold hover:underline">
              Settings
            </Link>
            {' '}(Invoice automation + Balance reminder rules).
            {settings && !settings.enabled && (
              <span className="ml-2 text-amber-400 font-bold">Reminders are currently OFF.</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => act('run_now')}
          disabled={busy === 'run_now' || !settings?.enabled}
          className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50 shrink-0"
        >
          {busy === 'run_now' ? 'Running…' : 'Run reminders now'}
        </button>
      </div>

      {runResult && (
        <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-xl px-4 py-2 font-mono">
          Last run:{' '}
          {runResult.disabled
            ? 'reminders are OFF'
            : `scanned ${runResult.scanned ?? 0} · emailed ${runResult.remindedEmail ?? 0} · whatsapp ${runResult.remindedWhatsapp ?? 0} · capped ${runResult.capped ?? 0} · skipped ${runResult.skipped ?? 0}`}
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-foreground">Parents with an outstanding balance</h3>
          <span className="text-xs text-muted-foreground">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No parents currently owe a balance.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {list.map((r) => (
              <div key={r.id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-foreground truncate">{r.name}</p>
                    {r.paused && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                        Paused
                      </span>
                    )}
                    {r.balanceDue <= 0 && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        Fully paid
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.email}
                    {r.phone ? ` · ${r.phone}` : ''}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Balance <span className="font-bold text-foreground">{naira(r.balanceDue)}</span> of{' '}
                    {naira(r.totalTuition)} · paid {naira(r.amountPaid)} · reminders {r.remindersSent}
                    {r.lastReminded ? ` · last ${new Date(r.lastReminded).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => act('mark_paid', r.id)}
                    disabled={busy === r.id}
                    className="px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    Mark paid
                  </button>
                  {r.paused ? (
                    <button
                      type="button"
                      onClick={() => act('resume', r.id)}
                      disabled={busy === r.id}
                      className="px-3 py-1.5 bg-muted hover:bg-muted/70 text-foreground border border-border rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => act('pause', r.id)}
                      disabled={busy === r.id}
                      className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                    >
                      Pause
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => act('reset', r.id)}
                    disabled={busy === r.id}
                    className="px-3 py-1.5 bg-muted hover:bg-muted/70 text-muted-foreground border border-border rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    Reset count
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>,
  );
}
