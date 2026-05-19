'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  MagnifyingGlassIcon, ArrowDownTrayIcon, UserGroupIcon,
  ArrowLeftIcon, XMarkIcon,
} from '@/lib/icons';
import { Download, Merge, Phone, Mail, AlertTriangle } from 'lucide-react';

type ContactBookRow = {
  id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  school_name: string | null;
  class_name: string | null;
  source: string | null;
  last_channel: string | null;
  confirmed_at: string | null;
};

const ROLE_CFG: Record<string, { cls: string; label: string }> = {
  student:  { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: 'Student' },
  parent:   { cls: 'bg-primary/15 text-primary border-primary/20',             label: 'Parent'  },
  teacher:  { cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',          label: 'Teacher' },
  school:   { cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',    label: 'School'  },
  external: { cls: 'bg-muted text-muted-foreground border-border',             label: 'External'},
};

const SOURCE_CFG: Record<string, string> = {
  consent_form:  'bg-amber-500/10 text-amber-400',
  portal:        'bg-primary/10 text-primary',
  whatsapp:      'bg-emerald-500/10 text-emerald-400',
  manual:        'bg-muted text-muted-foreground',
};

function initials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function avatarBg(role: string) {
  if (role === 'student')  return 'bg-emerald-600';
  if (role === 'parent')   return 'bg-primary';
  if (role === 'teacher')  return 'bg-blue-600';
  if (role === 'school')   return 'bg-indigo-700';
  return 'bg-muted';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CustomerBookPage() {
  const { profile, loading: authLoading } = useAuth();
  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  const [rows, setRows]     = useState<ContactBookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ]           = useState('');
  const [role, setRole]     = useState('all');
  const [source, setSource] = useState('all');
  const [school, setSchool] = useState('');
  const [className, setClassName] = useState('');

  // Merge
  const [showMerge, setShowMerge]       = useState(false);
  const [mergeTarget, setMergeTarget]   = useState('');
  const [mergeSource, setMergeSource]   = useState('');
  const [mergeMsg, setMergeMsg]         = useState('');
  const [merging, setMerging]           = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, role, source, school, class: className });
      const res  = await fetch(`/api/customer-book?${params}`);
      const json = await res.json();
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q, role, source, school, className]);

  useEffect(() => {
    if (!isStaff) return;
    const t = setTimeout(() => { void fetchRows(); }, 280);
    return () => clearTimeout(t);
  }, [fetchRows, isStaff]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.source) set.add(r.source); });
    return ['all', ...Array.from(set)];
  }, [rows]);

  const roleCount = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach(r => { map[r.role] = (map[r.role] ?? 0) + 1; });
    return map;
  }, [rows]);

  const exportCsv = () => {
    const params = new URLSearchParams({ q, role, source, school, class: className, format: 'csv' });
    window.open(`/api/customer-book?${params}`, '_blank');
  };

  const runMerge = async () => {
    if (!mergeTarget || !mergeSource || mergeTarget === mergeSource) {
      setMergeMsg('Select two different contacts to merge.');
      return;
    }
    setMerging(true); setMergeMsg('');
    try {
      const res = await fetch('/api/customer-book', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: mergeTarget, source_id: mergeSource }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMergeMsg(json?.error || 'Merge failed'); return; }
      setMergeMsg('Merge completed successfully.');
      setMergeSource(''); setMergeTarget('');
      await fetchRows();
    } finally {
      setMerging(false);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p className="text-muted-foreground font-bold">Staff access only.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/dashboard/crm" className="mt-0.5 p-2 rounded-xl hover:bg-muted transition-colors">
              <ArrowLeftIcon className="w-4 h-4 text-muted-foreground" />
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">CRM</span>
                <span className="text-muted-foreground text-xs">›</span>
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Customer Book</span>
              </div>
              <h1 className="text-2xl font-black">Customer Book</h1>
              <p className="text-muted-foreground text-sm mt-0.5">All captured contacts — export, filter, and merge duplicates</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-xl transition-colors"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              onClick={() => { setShowMerge(v => !v); setMergeMsg(''); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs font-bold rounded-xl transition-colors"
            >
              <Merge className="w-3.5 h-3.5" /> Merge Duplicates
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {rows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-card border border-border/50 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
              <p className="text-xl font-black text-foreground">{rows.length}</p>
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Total</p>
            </div>
            {Object.entries(ROLE_CFG).map(([r, cfg]) => (
              roleCount[r] ? (
                <div key={r} className="bg-card border border-border/50 rounded-xl p-3 text-center">
                  <p className={`text-xl font-black ${cfg.cls.split(' ')[1]}`}>{roleCount[r]}</p>
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{cfg.label}s</p>
                </div>
              ) : null
            ))}
          </div>
        )}

        {/* Merge panel */}
        {showMerge && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-amber-400">Merge Duplicate Contacts</p>
                <p className="text-xs text-muted-foreground mt-0.5">The source record is deleted. All its data is merged into the target.</p>
              </div>
              <button onClick={() => setShowMerge(false)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Keep (target)</label>
                <select
                  value={mergeTarget}
                  onChange={e => setMergeTarget(e.target.value)}
                  className="w-full bg-card border border-border text-foreground text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-primary"
                >
                  <option value="">Select contact to keep…</option>
                  {rows.map(r => (
                    <option key={`t-${r.id}`} value={r.id}>
                      {r.full_name || r.email || r.phone || r.id.slice(0, 8)} ({r.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Delete (source / duplicate)</label>
                <select
                  value={mergeSource}
                  onChange={e => setMergeSource(e.target.value)}
                  className="w-full bg-card border border-border text-foreground text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-primary"
                >
                  <option value="">Select duplicate to remove…</option>
                  {rows.filter(r => r.id !== mergeTarget).map(r => (
                    <option key={`s-${r.id}`} value={r.id}>
                      {r.full_name || r.email || r.phone || r.id.slice(0, 8)} ({r.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <button
                  onClick={runMerge}
                  disabled={merging || !mergeTarget || !mergeSource}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-black text-sm rounded-xl transition-colors"
                >
                  {merging ? (
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Merge className="w-4 h-4" />
                  )}
                  {merging ? 'Merging…' : 'Merge Now'}
                </button>
              </div>
            </div>
            {mergeMsg && (
              <p className={`text-xs font-bold px-3 py-2 rounded-lg ${mergeMsg.includes('success') || mergeMsg.includes('completed') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {mergeMsg}
              </p>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-56">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Name, email, phone…"
              className="w-full bg-card border border-border text-foreground pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <select value={role} onChange={e => setRole(e.target.value)}
            className="bg-card border border-border text-foreground text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-primary">
            <option value="all">All Roles</option>
            <option value="student">Student</option>
            <option value="parent">Parent</option>
            <option value="teacher">Teacher</option>
            <option value="school">School</option>
            <option value="external">External</option>
          </select>
          <select value={source} onChange={e => setSource(e.target.value)}
            className="bg-card border border-border text-foreground text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-primary">
            {sourceOptions.map(s => <option key={s} value={s}>{s === 'all' ? 'All Sources' : s}</option>)}
          </select>
          <input
            value={school}
            onChange={e => setSchool(e.target.value)}
            placeholder="Filter school…"
            className="bg-card border border-border text-foreground text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-primary min-w-32"
          />
          <input
            value={className}
            onChange={e => setClassName(e.target.value)}
            placeholder="Filter class…"
            className="bg-card border border-border text-foreground text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-primary min-w-28"
          />
          {(q || role !== 'all' || source !== 'all' || school || className) && (
            <button
              onClick={() => { setQ(''); setRole('all'); setSource('all'); setSchool(''); setClassName(''); }}
              className="text-xs text-primary hover:underline font-bold"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{rows.length} contacts</span>
        </div>

        {/* Table */}
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="space-y-0">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border/30">
                  <div className="w-9 h-9 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-muted animate-pulse rounded w-40" />
                    <div className="h-2.5 bg-muted animate-pulse rounded w-60" />
                  </div>
                  <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
                  <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <UserGroupIcon className="w-10 h-10 text-muted-foreground/20" />
              <p className="text-muted-foreground font-bold text-sm">No contacts found</p>
              {(q || role !== 'all' || source !== 'all') && (
                <button onClick={() => { setQ(''); setRole('all'); setSource('all'); }} className="text-xs text-primary hover:underline">Clear filters</button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    {['Contact', 'Role', 'Email', 'Phone', 'School', 'Class', 'Source', 'Added', 'Actions'].map(h => (
                      <th key={h} className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rows.map(r => {
                    const roleCfg = ROLE_CFG[r.role] ?? ROLE_CFG.external;
                    const srcCls  = SOURCE_CFG[r.source ?? ''] ?? 'bg-muted text-muted-foreground';
                    const waNum   = r.phone?.replace(/\D/g, '');
                    return (
                      <tr key={r.id} className="hover:bg-muted/20 transition-colors group">
                        {/* Contact */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${avatarBg(r.role)}`}>
                              {initials(r.full_name)}
                            </div>
                            <span className="text-sm font-bold text-foreground whitespace-nowrap">{r.full_name || '—'}</span>
                          </div>
                        </td>
                        {/* Role */}
                        <td className="px-4 py-3">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${roleCfg.cls}`}>{roleCfg.label}</span>
                        </td>
                        {/* Email */}
                        <td className="px-4 py-3">
                          {r.email ? (
                            <a href={`mailto:${r.email}`} className="text-xs text-muted-foreground hover:text-primary transition-colors truncate max-w-[160px] block">
                              {r.email}
                            </a>
                          ) : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                        {/* Phone */}
                        <td className="px-4 py-3">
                          {r.phone ? (
                            <span className="text-xs text-muted-foreground">{r.phone}</span>
                          ) : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                        {/* School */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground max-w-[120px] block truncate">{r.school_name || '—'}</span>
                        </td>
                        {/* Class */}
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{r.class_name || '—'}</span>
                        </td>
                        {/* Source */}
                        <td className="px-4 py-3">
                          {r.source ? (
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${srcCls}`}>{r.source.replace(/_/g, ' ')}</span>
                          ) : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                        {/* Added */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-muted-foreground">{fmtDate(r.confirmed_at)}</span>
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {waNum && (
                              <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors" title="WhatsApp">
                                <Phone className="w-3 h-3" />
                              </a>
                            )}
                            {r.email && (
                              <a href={`mailto:${r.email}`}
                                className="p-1.5 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg transition-colors" title="Email">
                                <Mail className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
