// @refresh reset
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ShieldCheckIcon, MagnifyingGlassIcon, ArrowPathIcon,
  ChevronLeftIcon, ChevronRightIcon, UserGroupIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import { isStaffRole } from '@/lib/dashboard/route-access';

type AuditRow = {
  id: string;
  student_id: string | null;
  parent_id: string | null;
  email: string | null;
  phone: string | null;
  action: string;
  siblings_linked: number;
  note: string | null;
  created_at: string;
  student_name?: string | null;
  parent_name?: string | null;
};

const ACTION_STYLE: Record<string, string> = {
  linked: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  blocked: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  code_sent: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

type UnlinkedRow = {
  studentUserId: string;
  fullName: string;
  schoolName: string | null;
  className: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  scanCode: string;
  scanUrl: string;
};

export default function ParentClaimsAuditPage() {
  const { profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<'audit' | 'unlinked'>('audit');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search.trim()) params.set('search', search.trim());
      if (action) params.set('action', action);
      const res = await fetch(`/api/parent-claim/audit?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load audit trail');
    } finally {
      setLoading(false);
    }
  }, [page, search, action]);

  const loadUnlinked = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/parent-claim/unlinked?limit=100');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setUnlinked(json.rows ?? []);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load unlinked students');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && profile && isStaffRole(profile.role)) {
      if (tab === 'audit') void load();
      else void loadUnlinked();
    }
  }, [authLoading, profile, tab, load, loadUnlinked]);

  useEffect(() => {
    if (!authLoading && profile && isStaffRole(profile.role)) {
      fetch('/api/parent-claim/unlinked?limit=100')
        .then(r => r.ok ? r.json() : { rows: [] })
        .then(j => setUnlinked(j.rows ?? []))
        .catch(() => {});
    }
  }, [authLoading, profile]);

  async function sendInvites(ids: string[]) {
    if (ids.length === 0) return;
    setInviting(true);
    try {
      const res = await fetch('/api/parent-claim/unlinked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentUserIds: ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Invite failed');
      toast.success(`Sent ${json.sent} invite(s)${json.failed ? ` · ${json.failed} failed` : ''}`);
      void loadUnlinked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send invites');
    } finally {
      setInviting(false);
    }
  }

  if (authLoading) {
    return <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>;
  }
  if (!profile || !isStaffRole(profile.role)) {
    return <div className="p-8 text-center text-rose-400 text-sm font-bold">Staff access only.</div>;
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <UserGroupIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Parent QR Claims</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Audit trail when parents self-link via result / ID-card scans — codes sent, links created, and blocked hijacks.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { if (tab === 'audit') void load(); else void loadUnlinked(); }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <div className="flex gap-2 border-b border-border pb-1">
        {(['audit', 'unlinked'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-t-lg ${tab === t ? 'bg-card border border-border border-b-transparent text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'audit' ? 'Claim activity' : `Unlinked (${unlinked.length || '…'})`}
          </button>
        ))}
      </div>

      {tab === 'unlinked' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Students with a portal account but no verified parent link. Send a scan link so parents can self-link and get logins.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={inviting || selected.size === 0}
                onClick={() => void sendInvites([...selected])}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {inviting ? 'Sending…' : `Invite selected (${selected.size})`}
              </button>
              <button
                type="button"
                disabled={inviting || unlinked.filter(u => u.parentEmail).length === 0}
                onClick={() => void sendInvites(unlinked.filter(u => u.parentEmail).map(u => u.studentUserId))}
                className="px-4 py-2 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted disabled:opacity-50"
              >
                Invite all with email
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-muted-foreground text-sm">Loading unlinked students…</div>
            ) : unlinked.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">All students in scope have a linked parent — great!</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="px-4 py-3 w-10"><span className="sr-only">Select</span></th>
                      <th className="text-left px-4 py-3">Student</th>
                      <th className="text-left px-4 py-3">Parent contact</th>
                      <th className="text-left px-4 py-3">Scan link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unlinked.map(row => (
                      <tr key={row.studentUserId} className="border-b border-border/60 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            disabled={!row.parentEmail}
                            checked={selected.has(row.studentUserId)}
                            onChange={e => {
                              setSelected(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(row.studentUserId);
                                else next.delete(row.studentUserId);
                                return next;
                              });
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold">{row.fullName}</p>
                          <p className="text-xs text-muted-foreground">{[row.className, row.schoolName].filter(Boolean).join(' · ')}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {row.parentEmail ? (
                            <>
                              <p className="font-mono">{row.parentEmail}</p>
                              {row.parentPhone && <p className="text-muted-foreground">{row.parentPhone}</p>}
                            </>
                          ) : (
                            <span className="text-rose-400 font-bold">No email — add in Students first</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <a href={row.scanUrl} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline">
                            {row.scanCode}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm"
            placeholder="Search email, phone, note…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-bold"
          value={action}
          onChange={e => { setAction(e.target.value); setPage(1); }}
        >
          <option value="">All actions</option>
          <option value="linked">Linked</option>
          <option value="code_sent">Code sent</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Loading audit entries…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">No parent claim activity yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <th className="text-left px-4 py-3">When</th>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3">Parent contact</th>
                  <th className="text-left px-4 py-3">Student</th>
                  <th className="text-left px-4 py-3">Details</th>
                  <th className="text-left px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${ACTION_STYLE[row.action] ?? 'bg-muted text-muted-foreground border-border'}`}>
                        {row.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-foreground">{row.parent_name || row.email || '—'}</p>
                      <p className="text-xs text-muted-foreground">{row.email}{row.phone ? ` · ${row.phone}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 font-medium">{row.student_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.siblings_linked > 0 && <span>{row.siblings_linked} sibling(s) linked · </span>}
                      {row.note || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.action === 'linked' && row.student_id ? (
                        <Link
                          href={`/dashboard/parents/add?student_id=${encodeURIComponent(row.student_id)}`}
                          className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                        >
                          Add co-parent
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
          <span>Page {page} of {totalPages} · {total} entries</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg border border-border disabled:opacity-40">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg border border-border disabled:opacity-40">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex gap-3">
        <ShieldCheckIcon className="w-5 h-5 text-primary flex-shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Blocked</strong> means a stranger tried to claim a child already linked to another parent.
          Use <strong className="text-foreground">Unlinked</strong> to email scan invites to parents who aren&apos;t linked yet.
        </p>
      </div>
        </>
      )}
    </div>
  );
}
