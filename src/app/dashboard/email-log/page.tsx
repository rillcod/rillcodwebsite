'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowPathIcon, EnvelopeIcon, ShieldCheckIcon, ExclamationTriangleIcon,
  EyeIcon, XMarkIcon, CheckCircleIcon, XCircleIcon, PaperAirplaneIcon,
  ArrowTopRightOnSquareIcon, ClipboardIcon, ClipboardDocumentCheckIcon,
} from '@/lib/icons';

/**
 * Provider-neutral communication delivery and recovery evidence.
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
  source_type: string | null;
  source_id: string | null;
  attempt_count: number | null;
  event_count: number | null;
  last_event_at: string | null;
  created_at: string;
};

type Summary = {
  total: number; delivered: number; failed: number;
  engaged: number; opened: number; clicked: number;
  stuck_sent: number; internal_sent: number; triggered: number; manual: number;
  queued: number; suppressed: number; unmatched_receipts: number;
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
  a.download = `communication-delivery-${new Date().toISOString().slice(0, 10)}.csv`;
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
  const status = String(r.status || 'unknown').toLowerCase();
  const failed = status === 'failed' || status === 'suppressed';
  const delivered = status === 'delivered' || status === 'read';
  const label = status;
  const cls = failed
    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
    : delivered
      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
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
  const toneCls = tone === 'bad' ? 'text-rose-600 dark:text-rose-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground';
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`${CARD} p-5 text-left transition-all ${onClick ? 'hover:border-indigo-500/50 cursor-pointer' : 'cursor-default'} ${active ? 'border-indigo-500 ring-1 ring-indigo-500/40' : ''}`}>
      <div className={`text-2xl sm:text-3xl font-black tracking-tighter ${toneCls}`}>{value}</div>
      <div className={`${LABEL} mt-1.5`}>{label}</div>
    </button>
  );
}

/** Lifecycle, derived from status + the *_at timestamps. */
type Outcome = 'all' | 'queued' | 'delivered' | 'failed' | 'suppressed' | 'opened' | 'clicked' | 'unconfirmed';
/** Whether the address can actually receive mail. */
type Audience = 'all' | 'real' | 'internal';
/** The `automated` column. */
type Origin = 'all' | 'triggered' | 'manual';

/** One row's derived lifecycle facts, computed once and reused. */
function facts(r: Row) {
  const status = String(r.status ?? '').toLowerCase();
  const failed = status === 'failed';
  const ev = String(r.provider_event ?? '');
  return {
    failed,
    queued: status === 'queued',
    delivered: status === 'delivered' || status === 'read',
    suppressed: status === 'suppressed',
    opened: /^open/.test(ev),
    clicked: /^click/.test(ev),
    unconfirmed: status === 'sent',
  };
}

export default function EmailLogPage() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ledgerReady, setLedgerReady] = useState(true);
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
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = useCallback((text: string, key: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRow(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email-log?limit=500');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load the delivery log');
      setRows(json.rows ?? []);
      setSummary(json.summary ?? null);
      setLedgerReady(json.ledger_ready !== false);
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
      queued: 0, suppressed: 0, unconfirmed: 0, real: 0, internal: 0, triggered: 0, manual: 0,
    };
    for (const r of scope) {
      const f = facts(r);
      if (f.delivered) c.delivered++;
      if (f.failed) c.failed++;
      if (f.queued) c.queued++;
      if (f.suppressed) c.suppressed++;
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
      if (outcome === 'queued' && !f.queued) return false;
      if (outcome === 'suppressed' && !f.suppressed) return false;
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
    return <div className="p-8"><ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" /></div>;
  }
  if (profile.role !== 'admin') {
    return (
      <div className="p-8">
        <div className={`${CARD} p-8 flex items-start gap-4`}>
          <ShieldCheckIcon className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>
            <h2 className="font-black text-foreground">Administrators only</h2>
            <p className="text-sm text-muted-foreground">The delivery log covers every recipient, so it is admin-only.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 mobile-page-root">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">Communication Delivery</h1>
          <p className="text-sm text-muted-foreground">
            One lifecycle for email and WhatsApp, from queue to provider receipt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/office?workspace=settings&section=templates"
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:bg-accent">
            Message templates
          </Link>
          <Link href="/dashboard/office?workspace=settings&section=health"
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:bg-accent">
            Resolve failures
          </Link>
          <button onClick={load} disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:bg-accent disabled:opacity-60">
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {!ledgerReady && !error ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">Lifecycle detail needs a refresh</p>
            <p className="mt-1">The message records are visible, but receipt, attempt or recipient details could not be fully verified. Retry before acting on an unconfirmed delivery.</p>
          </div>
        </div>
      ) : null}

      {ledgerReady && (summary?.unmatched_receipts ?? 0) > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">{summary?.unmatched_receipts} provider receipt{summary?.unmatched_receipts === 1 ? '' : 's'} awaiting a message link</p>
            <p className="mt-1">The receipt is preserved and will reconcile automatically when its outbound message arrives. Use Resolve failures if it remains here.</p>
          </div>
        </div>
      ) : null}

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
            <Tile value={counts.queued} label="Queued" tone="warn" active={outcome === 'queued'} onClick={() => setOutcome('queued')} />
            <Tile value={counts.delivered} label="Delivered" tone="good" active={outcome === 'delivered'} onClick={() => setOutcome('delivered')} />
            <Tile value={counts.failed} label="Failed" tone="bad" active={outcome === 'failed'} onClick={() => setOutcome('failed')} />
            <Tile value={counts.suppressed} label="Suppressed" tone="warn" active={outcome === 'suppressed'} onClick={() => setOutcome('suppressed')} />
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
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
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

            <input aria-label="Search email log"
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
                {['To', 'Status', 'Subject', 'Type', 'Sent', ''].map((h) => (
                  <th key={h} className={`${LABEL} px-4 py-3 whitespace-nowrap`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedRow(r)}
                  className="hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 transition-colors align-top cursor-pointer group"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="font-semibold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {r.recipient_name || r.recipient || '—'}
                    </div>
                    {r.recipient_name && (
                      <div className="text-xs text-muted-foreground font-mono">{r.recipient}</div>
                    )}
                    {r.school && (
                      <div className="text-xs text-muted-foreground/80">{r.school}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {r.recipient_role && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                          {r.recipient_role}
                        </span>
                      )}
                      {r.channel && r.channel !== 'email' && (
                        <span className="rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                          {r.channel}
                        </span>
                      )}
                      {r.internal && (
                        <span
                          className="rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
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
                      <div className="mt-1 max-w-[16rem] text-xs text-rose-600 dark:text-rose-400 truncate" title={r.error || r.provider_reason || ''}>
                        {r.error || r.provider_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    <div className="max-w-[26rem] truncate font-medium text-foreground" title={r.subject ?? ''}>
                      {r.subject || '—'}
                    </div>
                    {r.template_key && (
                      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70 font-mono">
                        {r.template_key}
                      </div>
                    )}
                    {(r.source_type || r.event_count != null) && (
                      <div className="text-[10px] text-muted-foreground/70">
                        {r.source_type ? `Source: ${r.source_type}` : 'Direct send'}
                        {r.event_count != null ? ` · ${r.event_count} event${r.event_count === 1 ? '' : 's'}` : ''}
                        {r.attempt_count && r.attempt_count > 1 ? ` · ${r.attempt_count} attempts` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-xs">
                    {r.automated ? 'Triggered' : 'By hand'}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground text-xs" title={r.created_at}>
                    {ago(r.created_at)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRow(r);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-muted-foreground bg-muted/60 hover:bg-indigo-600 hover:text-white transition-colors"
                      title="Inspect delivery details"
                    >
                      <EyeIcon className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>
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

      {/* Interactive Delivery Inspection Drawer */}
      {selectedRow && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="w-full max-w-2xl bg-card border-l border-border h-full overflow-y-auto shadow-2xl flex flex-col animate-in slide-in-from-right duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border p-5 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill r={selectedRow} />
                  <span className="text-xs text-muted-foreground font-mono">
                    ID: {selectedRow.id.slice(0, 8)}…
                  </span>
                  {selectedRow.channel && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {selectedRow.channel}
                    </span>
                  )}
                  {selectedRow.provider && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {selectedRow.provider}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-foreground leading-snug">
                  {selectedRow.subject || '(No subject line)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Close inspector (Esc)"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-6 flex-1">
              {/* Delivery Outcome Banner */}
              {selectedRow.status === 'failed' || selectedRow.status === 'suppressed' ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 flex items-start gap-3">
                  <XCircleIcon className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-sm">Delivery Unsuccessful</div>
                    <div>
                      {selectedRow.error || selectedRow.provider_reason || 'The mail provider reported a delivery failure or suppression.'}
                    </div>
                  </div>
                </div>
              ) : selectedRow.internal ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 flex items-start gap-3">
                  <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-sm">Internal Portal Identifier</div>
                    <div>
                      This message was addressed to a synthetic login ID (<span className="font-mono">{selectedRow.recipient}</span>). It cannot receive external SMTP emails. If credentials need to be delivered to a guardian, update their account with an actual inbox or use WhatsApp delivery.
                    </div>
                  </div>
                </div>
              ) : selectedRow.status === 'delivered' || selectedRow.status === 'read' ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-start gap-3">
                  <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-sm">Confirmed Delivered</div>
                    <div>
                      The provider accepted and handed off this communication to the destination mail server.
                      {selectedRow.provider_event && ` Event: ${selectedRow.provider_event}.`}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300 flex items-start gap-3">
                  <PaperAirplaneIcon className="w-5 h-5 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-sm">Dispatched / Sent</div>
                    <div>
                      Transmitted through {selectedRow.provider || 'gateway'}. Awaiting provider delivery receipt or webhook confirmation.
                    </div>
                  </div>
                </div>
              )}

              {/* Lifecycle Progress Pipeline */}
              <div className={`${CARD} p-4 space-y-3`}>
                <h4 className={LABEL}>Lifecycle Audit Trail</h4>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[
                    {
                      label: 'Created',
                      done: true,
                      timestamp: selectedRow.created_at,
                    },
                    {
                      label: 'Sent',
                      done: selectedRow.sent_at != null || selectedRow.status !== 'queued',
                      timestamp: selectedRow.sent_at,
                    },
                    {
                      label: 'Delivered',
                      done: selectedRow.delivered_at != null || selectedRow.status === 'delivered' || selectedRow.status === 'read',
                      timestamp: selectedRow.delivered_at,
                    },
                    {
                      label: selectedRow.status === 'failed' ? 'Failed' : 'Read / Opened',
                      done: selectedRow.status === 'failed' || selectedRow.read_at != null || (selectedRow.provider_event?.includes('open') ?? false),
                      isError: selectedRow.status === 'failed',
                      timestamp: selectedRow.failed_at || selectedRow.read_at,
                    },
                  ].map((step, idx) => (
                    <div key={step.label} className="flex flex-col items-center text-center p-2 rounded-lg bg-muted/40 border border-border/50">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        {step.label}
                      </div>
                      <div className="my-1.5">
                        {step.isError ? (
                          <XCircleIcon className="w-5 h-5 text-rose-500" />
                        ) : step.done ? (
                          <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-[10px] text-muted-foreground">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate w-full">
                        {step.timestamp ? ago(step.timestamp) : step.done ? 'Recorded' : 'Pending'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recipient Profile Card */}
              <div className={`${CARD} p-5 space-y-4`}>
                <div className="flex items-center justify-between">
                  <h4 className={LABEL}>Recipient Information</h4>
                  <span className="text-xs text-muted-foreground">
                    {selectedRow.internal ? 'Internal Login' : 'Standard Mailbox'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Target Name:</span>
                    <div className="font-semibold text-foreground text-sm mt-0.5">
                      {selectedRow.recipient_name || 'Not associated with a named portal user'}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Destination Address:</span>
                    <div className="font-mono text-foreground font-semibold text-xs mt-0.5 flex items-center gap-1.5">
                      <span className="truncate">{selectedRow.recipient || '—'}</span>
                      {selectedRow.recipient && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(selectedRow.recipient || '', 'recipient')}
                          className="text-muted-foreground hover:text-foreground"
                          title="Copy address"
                        >
                          {copiedKey === 'recipient' ? (
                            <ClipboardDocumentCheckIcon className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <ClipboardIcon className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">School / Organization:</span>
                    <div className="font-medium text-foreground mt-0.5">
                      {selectedRow.school || 'Unassigned / Global'}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Portal Role:</span>
                    <div className="font-medium text-foreground mt-0.5 capitalize">
                      {selectedRow.recipient_role || 'General Contact'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Technical & Dispatch Trace */}
              <div className={`${CARD} p-5 space-y-3`}>
                <div className="flex items-center justify-between">
                  <h4 className={LABEL}>Technical & Dispatch Details</h4>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(selectedRow, null, 2), 'json')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {copiedKey === 'json' ? (
                      <>
                        <ClipboardDocumentCheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Copied JSON</span>
                      </>
                    ) : (
                      <>
                        <ClipboardIcon className="w-3.5 h-3.5" />
                        <span>Copy Diagnostic JSON</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border">
                    <div className="text-muted-foreground">Template Key:</div>
                    <div className="font-mono font-bold text-foreground mt-0.5">
                      {selectedRow.template_key || 'direct_send'}
                    </div>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border">
                    <div className="text-muted-foreground">Dispatch Type:</div>
                    <div className="font-medium text-foreground mt-0.5">
                      {selectedRow.automated ? 'Triggered (Automated)' : 'Manual (Admin Action)'}
                    </div>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border">
                    <div className="text-muted-foreground">Delivery Provider:</div>
                    <div className="font-medium text-foreground mt-0.5 capitalize">
                      {selectedRow.provider || 'default'} ({selectedRow.channel || 'email'})
                    </div>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border">
                    <div className="text-muted-foreground">Source Context:</div>
                    <div className="font-medium text-foreground mt-0.5">
                      {selectedRow.source_type ? `${selectedRow.source_type} (${selectedRow.source_id || 'no id'})` : 'Direct API Send'}
                    </div>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border">
                    <div className="text-muted-foreground">Total Attempts:</div>
                    <div className="font-medium text-foreground mt-0.5">
                      {selectedRow.attempt_count ?? 1}
                    </div>
                  </div>
                  <div className="bg-muted/30 p-2.5 rounded-lg border border-border">
                    <div className="text-muted-foreground">Lifecycle Events:</div>
                    <div className="font-medium text-foreground mt-0.5">
                      {selectedRow.event_count ?? 0} recorded
                    </div>
                  </div>
                </div>

                {/* Error diagnostics trace if any */}
                {(selectedRow.error || selectedRow.provider_reason) && (
                  <div className="mt-3 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
                      Error Diagnostics Trace
                    </span>
                    <pre className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 text-rose-600 dark:text-rose-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                      {selectedRow.error || selectedRow.provider_reason}
                    </pre>
                  </div>
                )}
              </div>

              {/* Recovery & Action Strip */}
              <div className="space-y-2 pt-2">
                <h4 className={LABEL}>Resolution & Quick Actions</h4>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/students/resend-credentials?search=${encodeURIComponent(selectedRow.recipient || selectedRow.recipient_name || '')}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    <span>Inspect & Resend in Student Credentials</span>
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedRow.id, 'id')}
                    className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-semibold text-xs transition-colors"
                  >
                    {copiedKey === 'id' ? (
                      <>
                        <ClipboardDocumentCheckIcon className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Copied ID</span>
                      </>
                    ) : (
                      <>
                        <ClipboardIcon className="w-3.5 h-3.5" />
                        <span>Copy Message ID</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="sticky bottom-0 bg-card/95 backdrop-blur border-t border-border p-4 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Recorded {new Date(selectedRow.created_at).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="px-4 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
