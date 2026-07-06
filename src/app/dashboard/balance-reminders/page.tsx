'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';

interface Settings {
  enabled: boolean; every_days: number; max_reminders: number;
  channel_email: boolean; channel_whatsapp: boolean;
}
interface Row {
  id: string; name: string; parentName: string | null; email: string; phone: string | null;
  amountPaid: number; totalTuition: number; balanceDue: number;
  remindersSent: number; lastReminded: string | null; paused: boolean;
}

const naira = (n: number) => `₦${(n || 0).toLocaleString()}`;

export default function BalanceRemindersPage() {
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
      const j = await r.json();
      if (r.ok) { setSettings(j.settings); setList(j.list ?? []); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!authLoading && isAdmin) load(); }, [authLoading, isAdmin, load]);

  async function saveSettings(patch: Partial<Settings>) {
    setSaving(true);
    setSettings(s => (s ? { ...s, ...patch } as Settings : s)); // optimistic
    try {
      const r = await fetch('/api/admin/balance-reminders', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const j = await r.json();
      if (r.ok) setSettings(j.settings);
    } finally { setSaving(false); }
  }

  async function act(action: string, prospectId?: string) {
    setBusy(prospectId || action);
    try {
      const r = await fetch('/api/admin/balance-reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, prospectId }),
      });
      const j = await r.json();
      if (action === 'run_now') setRunResult(j.result ?? j);
      await load();
    } finally { setBusy(null); }
  }

  if (authLoading || loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!isAdmin) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground text-sm">Admin access required.</p></div>;
  }

  const Toggle = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button onClick={onClick} disabled={saving}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 ${on ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-muted border-border text-muted-foreground'}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />{label}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Balance Reminder Control</h1>
        <p className="text-sm text-muted-foreground mt-1">Regulate the summer-school balance reminders — turn them on/off, set cadence and cap, and manage individual parents.</p>
      </div>

      {/* Master controls */}
      <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Toggle on={!!settings?.enabled} onClick={() => saveSettings({ enabled: !settings?.enabled })}
            label={settings?.enabled ? 'Reminders ON' : 'Reminders OFF'} />
          <Toggle on={!!settings?.channel_email} onClick={() => saveSettings({ channel_email: !settings?.channel_email })} label="Email" />
          <Toggle on={!!settings?.channel_whatsapp} onClick={() => saveSettings({ channel_whatsapp: !settings?.channel_whatsapp })} label="WhatsApp" />
          <div className="flex-1" />
          <button onClick={() => act('run_now')} disabled={busy === 'run_now'}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50">
            {busy === 'run_now' ? 'Running…' : 'Run reminders now'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Remind every (days)</span>
            <input type="number" min={1} max={60} value={settings?.every_days ?? 5}
              onChange={e => setSettings(s => s ? { ...s, every_days: Number(e.target.value) } : s)}
              onBlur={e => saveSettings({ every_days: Number(e.target.value) })}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary" />
          </label>
          <label className="space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Max reminders per parent</span>
            <input type="number" min={1} max={20} value={settings?.max_reminders ?? 4}
              onChange={e => setSettings(s => s ? { ...s, max_reminders: Number(e.target.value) } : s)}
              onBlur={e => saveSettings({ max_reminders: Number(e.target.value) })}
              className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary" />
          </label>
        </div>

        {runResult && (
          <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-xl px-4 py-2 font-mono">
            Last run: {runResult.disabled ? 'reminders are OFF' : `scanned ${runResult.scanned ?? 0} · emailed ${runResult.remindedEmail ?? 0} · whatsapp ${runResult.remindedWhatsapp ?? 0} · capped ${runResult.capped ?? 0} · skipped ${runResult.skipped ?? 0}`}
          </div>
        )}
      </div>

      {/* Parents in the pipeline */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-foreground">Parents with an outstanding balance</h3>
          <span className="text-xs text-muted-foreground">{list.length}</span>
        </div>
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No parents currently owe a balance. 🎉</div>
        ) : (
          <div className="divide-y divide-border">
            {list.map(r => (
              <div key={r.id} className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-foreground truncate">{r.name}</p>
                    {r.paused && <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">Paused</span>}
                    {r.balanceDue <= 0 && <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">Fully paid</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{r.email}{r.phone ? ` · ${r.phone}` : ''}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Balance <span className="font-bold text-foreground">{naira(r.balanceDue)}</span> of {naira(r.totalTuition)} · paid {naira(r.amountPaid)} · reminders {r.remindersSent}
                    {r.lastReminded ? ` · last ${new Date(r.lastReminded).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button onClick={() => act('mark_paid', r.id)} disabled={busy === r.id}
                    className="px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                    Mark paid
                  </button>
                  {r.paused ? (
                    <button onClick={() => act('resume', r.id)} disabled={busy === r.id}
                      className="px-3 py-1.5 bg-muted hover:bg-muted/70 text-foreground border border-border rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">Resume</button>
                  ) : (
                    <button onClick={() => act('pause', r.id)} disabled={busy === r.id}
                      className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">Pause</button>
                  )}
                  <button onClick={() => act('reset', r.id)} disabled={busy === r.id}
                    className="px-3 py-1.5 bg-muted hover:bg-muted/70 text-muted-foreground border border-border rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">Reset count</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
