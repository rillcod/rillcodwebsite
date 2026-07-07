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
  unlinked: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
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

type LinkRow = {
  id: string;
  created_at: string;
  parent_id: string;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  student_user_id: string | null;
  student_name: string | null;
  school_name: string | null;
  class_name: string | null;
};

type Person = { id: string; full_name: string; email?: string | null; school_name?: string | null; class_name?: string | null };

// Debounced search picker used to choose a parent or a student for a manual link.
function PersonPicker({ kind, value, onChange, placeholder }: {
  kind: 'parent' | 'student'; value: Person | null; onChange: (p: Person | null) => void; placeholder: string;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (value) return;
    const t = q.trim();
    if (t.length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/parent-claim/links?find=${kind}&q=${encodeURIComponent(t)}`, { signal: ctrl.signal })
        .then(r => r.json()).then(j => setResults(j.rows ?? [])).catch(() => {});
    }, 250);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q, kind, value]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{value.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">{value.email || [value.class_name, value.school_name].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="text-[10px] font-black uppercase tracking-widest text-rose-400 hover:underline flex-shrink-0">Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-xl border border-border bg-card shadow-xl">
          {results.map(r => (
            <button key={r.id} type="button" onMouseDown={() => { onChange(r); setOpen(false); setQ(''); }}
              className="w-full text-left px-3 py-2 hover:bg-muted/40 border-b border-border/40 last:border-0">
              <p className="text-sm font-bold">{r.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{r.email || [r.class_name, r.school_name].filter(Boolean).join(' · ') || '—'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ParentClaimsAuditPage() {
  const { profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<'audit' | 'unlinked' | 'links'>('audit');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [linksSearch, setLinksSearch] = useState('');
  const [linksLoading, setLinksLoading] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [pickParent, setPickParent] = useState<Person | null>(null);
  const [pickStudent, setPickStudent] = useState<Person | null>(null);
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

  const loadLinks = useCallback(async () => {
    setLinksLoading(true);
    try {
      const params = new URLSearchParams();
      if (linksSearch.trim()) params.set('search', linksSearch.trim());
      const res = await fetch(`/api/parent-claim/links?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setLinks(json.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load links');
    } finally {
      setLinksLoading(false);
    }
  }, [linksSearch]);

  async function createLink() {
    if (!pickParent || !pickStudent) return;
    setLinkBusy(true);
    try {
      const res = await fetch('/api/parent-claim/links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: pickParent.id, studentUserId: pickStudent.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to link');
      toast.success(`Linked ${pickStudent.full_name} → ${pickParent.full_name}`);
      setPickParent(null); setPickStudent(null);
      void loadLinks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create link');
    } finally {
      setLinkBusy(false);
    }
  }

  async function unlinkLink(id: string, label: string) {
    if (!confirm(`Remove this parent–child link?\n\n${label}\n\nThe result gate will re-lock for this child until a parent claims again.`)) return;
    try {
      const res = await fetch('/api/parent-claim/links', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to unlink');
      toast.success('Link removed');
      void loadLinks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove link');
    }
  }

  useEffect(() => {
    if (!authLoading && profile && isStaffRole(profile.role)) {
      if (tab === 'audit') void load();
      else if (tab === 'unlinked') void loadUnlinked();
      else void loadLinks();
    }
  }, [authLoading, profile, tab, load, loadUnlinked, loadLinks]);

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
              Manage parent–child links: view & create links, invite unlinked parents to self-claim, and audit every scan (codes sent, links, blocked hijacks).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { if (tab === 'audit') void load(); else if (tab === 'unlinked') void loadUnlinked(); else void loadLinks(); }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-xs font-black uppercase tracking-widest hover:bg-muted"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading || linksLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <div className="flex gap-2 border-b border-border pb-1">
        {(['links', 'unlinked', 'audit'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-t-lg ${tab === t ? 'bg-card border border-border border-b-transparent text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'audit' ? 'Claim activity' : t === 'unlinked' ? `Unlinked (${unlinked.length || '…'})` : 'Linked parents'}
          </button>
        ))}
      </div>

      {tab === 'links' ? (
        <div className="space-y-5">
          {/* Create a link */}
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Link a parent to a child</p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 md:items-start">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Child (student)</label>
                <PersonPicker kind="student" value={pickStudent} onChange={setPickStudent} placeholder="Search student name…" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Parent</label>
                <PersonPicker kind="parent" value={pickParent} onChange={setPickParent} placeholder="Search parent name or email…" />
              </div>
              <button
                type="button"
                disabled={!pickParent || !pickStudent || linkBusy}
                onClick={() => void createLink()}
                className="md:mt-[22px] px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:bg-primary/90"
              >
                {linkBusy ? 'Linking…' : 'Link'}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Creates the verified parent–child link (unlocks the result gate) and delivers nothing — no OTP needed since staff is doing it. Provisions a student registry row if missing.</p>
          </div>

          {/* Search current links */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm"
              placeholder="Search linked parent, child, email, school…"
              value={linksSearch}
              onChange={e => setLinksSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void loadLinks(); }}
            />
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {linksLoading ? (
              <div className="p-12 text-center text-muted-foreground text-sm">Loading links…</div>
            ) : links.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">No parent–child links yet. Use the form above, or “Unlinked” to invite parents to self-claim.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="text-left px-4 py-3">Child</th>
                      <th className="text-left px-4 py-3">Parent</th>
                      <th className="text-left px-4 py-3">School</th>
                      <th className="text-left px-4 py-3 whitespace-nowrap">Linked</th>
                      <th className="text-right px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map(l => (
                      <tr key={l.id} className="border-b border-border/60 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <p className="font-bold">{l.student_name || '—'}</p>
                          {l.class_name && <p className="text-xs text-muted-foreground">{l.class_name}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-foreground">{l.parent_name || l.parent_email || '—'}</p>
                          <p className="text-xs text-muted-foreground">{l.parent_email}{l.parent_phone ? ` · ${l.parent_phone}` : ''}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{l.school_name || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {l.student_user_id && (
                            <Link href={`/dashboard/parents/add?student_id=${encodeURIComponent(l.student_user_id)}`} className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline mr-3">Add co-parent</Link>
                          )}
                          <button
                            type="button"
                            onClick={() => void unlinkLink(l.id, `${l.student_name || 'Child'} → ${l.parent_name || l.parent_email || 'Parent'}`)}
                            className="text-[10px] font-black uppercase tracking-widest text-rose-400 hover:underline"
                          >
                            Unlink
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : tab === 'unlinked' ? (
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          <a href={row.scanUrl} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline mr-3">
                            {row.scanCode}
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setPickStudent({ id: row.studentUserId, full_name: row.fullName, school_name: row.schoolName, class_name: row.className });
                              setPickParent(null);
                              setTab('links');
                            }}
                            className="text-[10px] font-black uppercase tracking-widest text-foreground/70 hover:text-primary hover:underline"
                          >
                            Link now
                          </button>
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
          <option value="unlinked">Unlinked</option>
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
