'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowPathIcon, EnvelopeIcon, ShieldCheckIcon, ExclamationTriangleIcon,
} from '@/lib/icons';

/**
 * Email & messaging delivery — what Resend shows, without leaving the app.
 *
 * Reads /api/admin/email-log (admin only). Every field already existed in
 * communication_delivery_log; the subject line comes from metadata.subject and
 * provider_event is written by the email-status webhook.
 */

type Row = {
  id: string;
  recipient: string | null;
  /** Resolved by matching the address back to portal_users. */
  recipient_name: string | null;
  recipient_role: string | null;
  school: string | null;
  subject: string | null;
  channel: string | null;
  provider: string | null;
  status: string | null;
  automated: boolean | null;
  template_key: string | null;
  error: string | null;
  provider_event: string | null;
  provider_reason: string | null;
  /** @rillcod.com portal identifier rather than a real mailbox. */
  internal: boolean;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  created_at: string;
};

type Summary = {
  total: number; delivered: number; failed: number;
  engaged: number; opened: number; clicked: number;
  stuck_sent: number; internal_sent: number; triggered: number; manual: number;
};

const CARD = 'bg-card shadow-sm border border-border rounded-xl';
const LABEL = 'text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground';

/**
 * Export the currently filtered rows. A UTF-8 BOM is prepended so Excel on
 * Windows opens accented names and subjects correctly.
 */
function downloadCsv(rows: Row[]) {
  const headers = ['Sent', 'To', 'Name', 'Role', 'School', 'Subject', 'Status', 'Provider event', 'Channel', 'Provider', 'Type', 'Internal', 'Template', 'Error'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) => [
      r.created_at, r.recipient, r.recipient_name, r.recipient_role, r.school,
      r.subject, r.status, r.provider_event,
      r.channel, r.provider, r.automated ? 'Triggered' : 'By hand',
      r.internal ? 'internal id' : '', r.template_key, r.error,
    ].map(esc).join(',')),
  ];
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `email-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** "14 min ago", "3 h ago", "2 d ago" — matches how Resend presents it. */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function StatusPill({ r }: { r: Row }) {
  // failed_at / error beat `status`, which can lag behind the webhook.
  const failed = !!r.failed_at || !!r.error;
  const delivered = !!r.delivered_at;
  const label = failed ? (r.provider_event || 'failed')
    : delivered ? 'delivered'
    : (r.status || 'unknown');
  const cls = failed
    ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
    : delivered
      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
      : 'bg-amber-500/10 text-amber-500 border-amber-500/30';
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function Tile({ value, label, tone = 'default', active, onClick }: {
  value: number; label: string; tone?: 'default' | 'good' | 'warn' | 'bad';
  active?: boolean; onClick?: () => void;
}) {
  const toneCls = tone === 'bad' ? 'text-rose-500' : tone === 'warn' ? 'text-amber-500'
    : tone === 'good' ? 'text-emerald-500' : 'text-foreground';
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`${CARD} p-5 text-left transition-all ${onClick ? 'hover:border-indigo-500/50 cursor-pointer' : 'cursor-default'} ${active ? 'border-indigo-500 ring-1 ring-indigo-500/40' : ''}`}>
      <div className={`text-2xl sm:text-3xl font-black tracking-tighter ${toneCls}`}>{value}</div>
      <div className={`${LABEL} mt-1.5`}>{label}</div>
    </button>
  );
}

/** Lifecycle, derived from status + the *_at timestamps. */
type Outcome = 'all' | 'delivered' | 'failed' | 'opened' | 'clicked' | 'unconfirmed';
/** Whether the address can actually receive mail. */
type Audience = 'all' | 'real' | 'internal';
/** The `automated` column. */
type Origin = 'all' | 'triggered' | 'manual';

/** One row's derived lifecycle facts, computed once and reused. */
function facts(r: Row) {
  const failed = !!r.failed_at || !!r.error;
  const ev = String(r.provider_event ?? '');
  return {
    failed,
    delivered: !!r.delivered_at,
    opened: /^open/.test(ev),
    clicked: /^click/.test(ev),
    unconfirmed: !r.delivered_at && !failed && String(r.status).toLowerCase() === 'sent',
  };
}

export default function EmailLogPage() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Independent axes, mirroring the columns the system actually records.
  // They combine, because a message is delivered AND triggered AND opened at
  // once — collapsing them into one filter made those mutually exclusive.
  const [outcome, setOutcome] = useState<Outcome>('all');   // status + timestamps
  const [audience, setAudience] = useState<Audience>('all'); // recipient reachability
  const [origin, setOrigin] = useState<Origin>('all');       // automated flag
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [channel, setChannel] = useState('');                // channel column
  const [provider, setProvider] = useState('');              // provider column
  const [school, setSchool] = useState('');                  // resolved from portal_users
  const [role, setRole] = useState('');                      // recipient's role

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email-log?limit=500');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load the delivery log');
      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the delivery log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (profile?.role === 'admin') void load(); }, [profile?.role, load]);

  const channels = useMemo(
    () => Array.from(new Set(rows.map((r) => r.channel).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const providers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.provider).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const schools = useMemo(
    () => Array.from(new Set(rows.map((r) => r.school).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const roles = useMemo(
    () => Array.from(new Set(rows.map((r) => r.recipient_role).filter(Boolean) as string[])).sort(),
    [rows],
  );

  /**
   * Scope = the rows in range, on the selected channel/provider. Every tile
   * count is computed over THIS set, so the numbers always describe what you
   * are currently looking at rather than the whole table.
   */
  const scope = useMemo(() => {
    const cutoff = range === 'all' ? 0
      : Date.now() - ({ '24h': 1, '7d': 7, '30d': 30 }[range] * 24 * 60 * 60 * 1000);
    return rows.filter((r) => {
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      if (channel && r.channel !== channel) return false;
      if (provider && r.provider !== provider) return false;
      if (school && r.school !== school) return false;
      if (role && r.recipient_role !== role) return false;
      return true;
    });
  }, [rows, range, channel, provider, school, role]);

  const counts = useMemo(() => {
    const c = {
      total: scope.length, delivered: 0, failed: 0, opened: 0, clicked: 0,
      unconfirmed: 0, real: 0, internal: 0, triggered: 0, manual: 0,
    };
    for (const r of scope) {
      const f = facts(r);
      if (f.delivered) c.delivered++;
      if (f.failed) c.failed++;
      if (f.opened) c.opened++;
      if (f.clicked) c.clicked++;
      if (f.unconfirmed) c.unconfirmed++;
      if (r.internal) c.internal++; else c.real++;
      if (r.automated) c.triggered++; else c.manual++;
    }
    return c;
  }, [scope]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scope.filter((r) => {
      const f = facts(r);
      if (outcome === 'delivered' && !f.delivered) return false;
      if (outcome === 'failed' && !f.failed) return false;
      if (outcome === 'opened' && !f.opened) return false;
      if (outcome === 'clicked' && !f.clicked) return false;
      if (outcome === 'unconfirmed' && !f.unconfirmed) return false;
      if (audience === 'internal' && !r.internal) return false;
      if (audience === 'real' && r.internal) return false;
      if (origin === 'triggered' && !r.automated) return false;
      if (origin === 'manual' && r.automated) return false;
      if (q && !`${r.recipient ?? ''} ${r.recipient_name ?? ''} ${r.school ?? ''} ${r.subject ?? ''} ${r.template_key ?? ''} ${r.provider ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [scope, outcome, audience, origin, search]);

  const resetAll = () => {
    setOutcome('all'); setAudience('all'); setOrigin('all');
    setChannel(''); setProvider(''); setSchool(''); setRole(''); setSearch(''); setRange('all');
  };
  const anyFilter = outcome !== 'all' || audience !== 'all' || origin !== 'all'
    || !!channel || !!provider || !!school || !!role || !!search || range !== 'all';

  if (authLoading || !profile) {
    return <div className="p-8"><ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }
  if (profile.role !== 'admin') {
    return (
      <div className="p-8">
        <div className={`${CARD} p-8 flex items-start gap-4`}>
          <ShieldCheckIcon className="w-6 h-6 text-rose-500 shrink-0" />
          <div>
            <h2 className="font-black text-foreground">Administrators only</h2>
            <p className="text-sm text-muted-foreground">The delivery log covers every recipient, so it is admin-only.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">Email &amp; Messaging</h1>
          <p className="text-sm text-muted-foreground">
            Every message sent, and what happened to it — no need to open Resend.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:bg-accent disabled:opacity-60">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">{error}</p>
      )}

      {/*
        Three independent axes, each mirroring a column the system records.
        They COMBINE — "failed" + "triggered" + a school is a valid question.
        Counts are computed over the current date/channel/provider/school scope,
        so a tile always describes what you are actually looking at.
      */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-2">
          <h3 className={LABEL}>Outcome · status &amp; timestamps</h3>
          <div className="grid grid-cols-3 gap-3">
            <Tile value={counts.total} label="In scope" active={outcome === 'all'} onClick={() => setOutcome('all')} />
            <Tile value={counts.delivered} label="Delivered" tone="good" active={outcome === 'delivered'} onClick={() => setOutcome('delivered')} />
            <Tile value={counts.failed} label="Failed" tone="bad" active={outcome === 'failed'} onClick={() => setOutcome('failed')} />
            <Tile value={counts.opened} label="Opened" tone="good" active={outcome === 'opened'} onClick={() => setOutcome('opened')} />
            <Tile value={counts.clicked} label="Clicked" tone="good" active={outcome === 'clicked'} onClick={() => setOutcome('clicked')} />
            <Tile value={counts.unconfirmed} label="Unconfirmed" tone="warn" active={outcome === 'unconfirmed'} onClick={() => setOutcome('unconfirmed')} />
          </div>
        </section>

        <section className="space-y-2">
          <h3 className={LABEL}>Recipient · can they receive?</h3>
          <div className="grid grid-cols-3 gap-3">
            <Tile value={counts.total} label="Anyone" active={audience === 'all'} onClick={() => setAudience('all')} />
            <Tile value={counts.real} label="Real mailbox" tone="good" active={audience === 'real'} onClick={() => setAudience('real')} />
            <Tile value={counts.internal} label="Internal ID" active={audience === 'internal'} onClick={() => setAudience('internal')} />
          </div>
        </section>

        <section className="space-y-2">
          <h3 className={LABEL}>Origin · automated flag</h3>
          <div className="grid grid-cols-3 gap-3">
            <Tile value={counts.total} label="Either" active={origin === 'all'} onClick={() => setOrigin('all')} />
            <Tile value={counts.triggered} label="Triggered" active={origin === 'triggered'} onClick={() => setOrigin('triggered')} />
            <Tile value={counts.manual} label="By hand" active={origin === 'manual'} onClick={() => setOrigin('manual')} />
          </div>
        </section>
      </div>

      {summary && summary.engaged === 0 && summary.delivered > 0 && (
        <div className={`${CARD} p-4 flex items-start gap-3`}>
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            No opens recorded. Delivery and bounce events are arriving, so if you want open and click
            tracking too, add <span className="font-mono text-xs">email.opened</span> and{' '}
            <span className="font-mono text-xs">email.clicked</span> to the webhook subscription in Resend.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={LABEL}>
            <EnvelopeIcon className="w-3.5 h-3.5 inline mr-1.5" />
            {filtered.length} shown
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* Date range — the first question when monitoring is "what went out today" */}
            <div className="inline-flex rounded-xl border border-border overflow-hidden">
              {([['24h', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All']] as const).map(([key, lbl]) => (
                <button
                  key={key}
                  onClick={() => setRange(key)}
                  className={`px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
                    range === key ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            {channels.length > 1 && (
              <select
                value={channel} onChange={(e) => setChannel(e.target.value)}
                className="w-full sm:w-auto bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              >
                <option value="">All channels</option>
                {channels.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {schools.length > 0 && (
              <select
                value={school} onChange={(e) => setSchool(e.target.value)}
                className="w-full sm:w-auto sm:max-w-[14rem] bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              >
                <option value="">All schools</option>
                {schools.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}

            {roles.length > 1 && (
              <select
                value={role} onChange={(e) => setRole(e.target.value)}
                className="w-full sm:w-auto bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              >
                <option value="">All roles</option>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            )}

            {providers.length > 1 && (
              <select
                value={provider} onChange={(e) => setProvider(e.target.value)}
                className="w-full sm:w-auto bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              >
                <option value="">All providers</option>
                {providers.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}

            {anyFilter && (
              <button onClick={resetAll}
                className="rounded-xl border border-border px-4 py-2 text-xs font-black uppercase tracking-wider text-muted-foreground hover:bg-accent">
                Clear all
              </button>
            )}

            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient, subject, template, provider…"
              className="w-full sm:w-auto sm:min-w-[16rem] bg-card border border-border rounded-xl px-4 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
            />

            <button
              onClick={() => downloadCsv(filtered)}
              disabled={filtered.length === 0}
              className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:bg-accent disabled:opacity-50"
              title="Export exactly what is shown below"
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {['To', 'Status', 'Subject', 'Type', 'Sent'].map((h) => (
                  <th key={h} className={`${LABEL} px-4 py-3 whitespace-nowrap`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40 align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="text-foreground">{r.recipient_name || r.recipient || '—'}</div>
                    {r.recipient_name && (
                      <div className="text-xs text-muted-foreground">{r.recipient}</div>
                    )}
                    {r.school && (
                      <div className="text-xs text-muted-foreground/80">{r.school}</div>
                    )}
                    <div className="flex gap-2">
                      {r.recipient_role && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{r.recipient_role}</span>
                      )}
                      {r.channel && r.channel !== 'email' && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{r.channel}</span>
                      )}
                      {r.internal && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70"
                          title="A portal login identifier, not a real mailbox — delivery can never be confirmed"
                        >
                          internal id
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <StatusPill r={r} />
                    {(r.error || r.provider_reason) && (
                      <div className="mt-1 max-w-[16rem] text-xs text-rose-500">{r.error || r.provider_reason}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    <div className="max-w-[26rem] truncate" title={r.subject ?? ''}>{r.subject || '—'}</div>
                    {r.template_key && (
                      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">{r.template_key}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {r.automated ? 'Triggered' : 'By hand'}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground" title={r.created_at}>
                    {ago(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing matches that filter.</p>
          )}
          {loading && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              <ArrowPathIcon className="w-4 h-4 animate-spin inline mr-2" />Loading…
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
