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
  const headers = ['Sent', 'To', 'Subject', 'Status', 'Provider event', 'Channel', 'Provider', 'Type', 'Internal', 'Template', 'Error'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) => [
      r.created_at, r.recipient, r.subject, r.status, r.provider_event,
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
      <div className={`text-3xl font-black tracking-tighter ${toneCls}`}>{value}</div>
      <div className={`${LABEL} mt-1.5`}>{label}</div>
    </button>
  );
}

type Filter = 'all' | 'delivered' | 'failed' | 'opened' | 'clicked' | 'stuck' | 'internal' | 'triggered' | 'manual';

export default function EmailLogPage() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [channel, setChannel] = useState('');

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = range === 'all' ? 0
      : Date.now() - ({ '24h': 1, '7d': 7, '30d': 30 }[range] * 24 * 60 * 60 * 1000);
    return rows.filter((r) => {
      if (cutoff && new Date(r.created_at).getTime() < cutoff) return false;
      if (channel && r.channel !== channel) return false;
      const failed = !!r.failed_at || !!r.error;
      if (filter === 'delivered' && !r.delivered_at) return false;
      if (filter === 'failed' && !failed) return false;
      if (filter === 'opened' && !/^open/.test(String(r.provider_event ?? ''))) return false;
      if (filter === 'clicked' && !/^click/.test(String(r.provider_event ?? ''))) return false;
      const unconfirmed = !r.delivered_at && !failed && String(r.status).toLowerCase() === 'sent';
      if (filter === 'stuck' && !(unconfirmed && !r.internal)) return false;
      if (filter === 'internal' && !r.internal) return false;
      if (filter === 'triggered' && !r.automated) return false;
      if (filter === 'manual' && r.automated) return false;
      if (q && !`${r.recipient ?? ''} ${r.subject ?? ''} ${r.template_key ?? ''} ${r.provider ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search, range, channel]);

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
    <div className="p-6 lg:p-8 space-y-8">
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

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <Tile value={summary.total} label="Messages" active={filter === 'all'} onClick={() => setFilter('all')} />
          <Tile value={summary.delivered} label="Delivered" tone="good" active={filter === 'delivered'} onClick={() => setFilter('delivered')} />
          <Tile value={summary.failed} label="Failed / bounced" tone="bad" active={filter === 'failed'} onClick={() => setFilter('failed')} />
          <Tile value={summary.opened} label="Opened" tone="good" active={filter === 'opened'} onClick={() => setFilter('opened')} />
          <Tile value={summary.clicked} label="Clicked" tone="good" active={filter === 'clicked'} onClick={() => setFilter('clicked')} />
          <Tile value={summary.stuck_sent} label="Unconfirmed · real inbox" tone="warn" active={filter === 'stuck'} onClick={() => setFilter('stuck')} />
          <Tile value={summary.internal_sent} label="Internal ID · no mailbox" active={filter === 'internal'} onClick={() => setFilter('internal')} />
          <Tile value={summary.triggered} label="Triggered" active={filter === 'triggered'} onClick={() => setFilter('triggered')} />
          <Tile value={summary.manual} label="Sent by hand" active={filter === 'manual'} onClick={() => setFilter('manual')} />
        </div>
      )}

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
                className="bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
              >
                <option value="">All channels</option>
                {channels.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient, subject, template, provider…"
              className="min-w-[16rem] bg-card border border-border rounded-xl px-4 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
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
                    <div className="text-foreground">{r.recipient || '—'}</div>
                    <div className="flex gap-2">
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
