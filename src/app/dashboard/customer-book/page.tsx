'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { MagnifyingGlassIcon, ArrowDownTrayIcon, UserGroupIcon, ArrowLeftIcon, XMarkIcon } from '@/lib/icons';
import { Download, Merge, Phone, Mail, AlertTriangle, Plus, Edit3, Trash2, Save, X, Loader2, Filter, Printer } from 'lucide-react';

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
  student:  { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: 'Student'  },
  parent:   { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',       label: 'Parent'   },
  teacher:  { cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20',          label: 'Teacher'  },
  school:   { cls: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',    label: 'School'   },
  external: { cls: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',          label: 'External' },
};

const SOURCE_CFG: Record<string, { cls: string; label: string }> = {
  consent_form: { cls: 'bg-amber-500/10 text-amber-400',   label: 'Consent Form' },
  portal:       { cls: 'bg-blue-500/10 text-blue-400',     label: 'Portal'       },
  whatsapp:     { cls: 'bg-emerald-500/10 text-emerald-400', label: 'WhatsApp'   },
  manual:       { cls: 'bg-zinc-500/10 text-zinc-400',     label: 'Manual'       },
  manual_crm:   { cls: 'bg-violet-500/10 text-violet-400', label: 'CRM Manual'   },
};

function initials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function avatarColor(role: string) {
  const m: Record<string, string> = { student: 'bg-emerald-600', parent: 'bg-amber-500', teacher: 'bg-blue-600', school: 'bg-indigo-700' };
  return m[role] ?? 'bg-zinc-600';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const BLANK: Omit<ContactBookRow, 'id' | 'confirmed_at'> = {
  full_name: '', email: '', phone: '', role: 'parent',
  school_name: '', class_name: '', source: 'manual', last_channel: 'manual',
};

export default function CustomerBookPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin   = profile?.role === 'admin';
  const isStaff   = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  const [rows, setRows]         = useState<ContactBookRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [q, setQ]               = useState('');
  const [role, setRole]         = useState('all');
  const [source, setSource]     = useState('all');
  const [school, setSchool]     = useState('');
  const [className, setClassName] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ── Add contact ────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState({ ...BLANK });
  const [addSaving, setAddSaving] = useState(false);
  const [addErr, setAddErr]       = useState('');

  // ── Edit contact ───────────────────────────────────────────────────────────
  const [editRow, setEditRow]       = useState<ContactBookRow | null>(null);
  const [editForm, setEditForm]     = useState({ ...BLANK });
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr]       = useState('');

  // ── Merge ──────────────────────────────────────────────────────────────────
  const [showMerge, setShowMerge]     = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeSource, setMergeSource] = useState('');
  const [mergeMsg, setMergeMsg]       = useState('');
  const [merging, setMerging]         = useState(false);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, role, source, school, class: className });
      const res = await fetch(`/api/customer-book?${params}`);
      const json = await res.json();
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch { setRows([]); }
    setLoading(false);
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

  const printReport = () => {
    const params = new URLSearchParams({ q, role, source, school, class: className, format: 'print' });
    window.open(`/api/customer-book?${params}`, '_blank');
  };

  // ── Create ─────────────────────────────────────────────────────────────────
  const createContact = async () => {
    if (!addForm.full_name?.trim()) { setAddErr('Name is required'); return; }
    setAddErr(''); setAddSaving(true);
    const res = await fetch('/api/customer-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    });
    const json = await res.json();
    if (!res.ok) { setAddErr(json.error || 'Failed to create'); setAddSaving(false); return; }
    setRows(prev => [json.data, ...prev]);
    setAddForm({ ...BLANK });
    setShowAdd(false);
    setAddSaving(false);
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const openEdit = (r: ContactBookRow) => {
    setEditRow(r);
    setEditForm({ full_name: r.full_name || '', email: r.email || '', phone: r.phone || '', role: r.role, school_name: r.school_name || '', class_name: r.class_name || '', source: r.source || 'manual', last_channel: r.last_channel || 'manual' });
    setEditErr('');
  };

  const saveEdit = async () => {
    if (!editRow) return;
    if (!editForm.full_name?.trim()) { setEditErr('Name is required'); return; }
    setEditErr(''); setEditSaving(true);
    const res = await fetch(`/api/customer-book/${editRow.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const json = await res.json();
    if (!res.ok) { setEditErr(json.error || 'Save failed'); setEditSaving(false); return; }
    setRows(prev => prev.map(r => r.id === editRow.id ? json.data : r));
    setEditRow(null);
    setEditSaving(false);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteContact = async (id: string) => {
    if (!confirm('Permanently delete this contact? This cannot be undone.')) return;
    setDeleting(id);
    const res = await fetch(`/api/customer-book/${id}`, { method: 'DELETE' });
    if (res.ok) setRows(prev => prev.filter(r => r.id !== id));
    setDeleting(null);
  };

  // ── Merge ──────────────────────────────────────────────────────────────────
  const runMerge = async () => {
    if (!mergeTarget || !mergeSource || mergeTarget === mergeSource) {
      setMergeMsg('Select two different contacts to merge.'); return;
    }
    setMerging(true); setMergeMsg('');
    const res = await fetch('/api/customer-book', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: mergeTarget, source_id: mergeSource }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMergeMsg(json?.error || 'Merge failed'); setMerging(false); return; }
    setMergeMsg('Merge completed successfully.');
    setMergeSource(''); setMergeTarget('');
    await fetchRows();
    setMerging(false);
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (!isStaff) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertTriangle className="w-10 h-10 text-rose-400" />
      <p className="text-[#71717a] font-bold">Staff access only.</p>
    </div>
  );

  // ── Form fields helper ──────────────────────────────────────────────────────
  const contactFields = (form: typeof BLANK, setForm: (v: typeof BLANK) => void) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {([
        ['Full name *', 'full_name', 'text'],
        ['Email', 'email', 'email'],
        ['Phone / WhatsApp', 'phone', 'tel'],
        ['School', 'school_name', 'text'],
        ['Class / Year', 'class_name', 'text'],
      ] as [string, keyof typeof BLANK, string][]).map(([label, field, type]) => (
        <div key={field}>
          <label className="block text-[10px] text-[#71717a] mb-1 uppercase tracking-wide">{label}</label>
          <input value={(form[field] as string) ?? ''} onChange={e => setForm({ ...form, [field]: e.target.value })} type={type}
            className="w-full px-3 py-2 text-sm bg-[#09090b] border border-[#27272a] rounded-lg text-white placeholder-[#3f3f46] focus:outline-none focus:border-[#f5a623]/50" />
        </div>
      ))}
      <div>
        <label className="block text-[10px] text-[#71717a] mb-1 uppercase tracking-wide">Role</label>
        <select value={form.role ?? 'parent'} onChange={e => setForm({ ...form, role: e.target.value })}
          className="w-full px-3 py-2 text-sm bg-[#09090b] border border-[#27272a] rounded-lg text-white focus:outline-none">
          <option value="parent">Parent/Guardian</option>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="school">School Partner</option>
          <option value="external">External</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Link
              href={profile?.role === 'admin' ? '/dashboard/office?workspace=crm' : '/dashboard/crm'}
              className="mt-0.5 p-2 rounded-xl text-[#71717a] hover:text-white hover:bg-[#18181b] transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-[#f5a623] uppercase tracking-widest">CRM</span>
                <span className="text-[#3f3f46] text-xs">›</span>
                <span className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Customer Book</span>
              </div>
              <h1 className="text-xl font-black">Customer Book</h1>
              <p className="text-[#71717a] text-xs mt-0.5">All captured contacts — create, edit, export, and merge duplicates</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#f5a623] hover:bg-[#fcd34d] text-[#09090b] text-xs font-bold rounded-xl transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Contact
            </button>
            <button onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-xl transition-colors">
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button onClick={printReport}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 text-xs font-bold rounded-xl transition-colors">
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
            <button onClick={() => { setShowMerge(v => !v); setMergeMsg(''); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs font-bold rounded-xl transition-colors">
              <Merge className="w-3.5 h-3.5" /> Merge Dupes
            </button>
          </div>
        </div>

        {/* Stats bar */}
        {rows.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            <div className="shrink-0 px-4 py-2 bg-[#18181b] border border-[#27272a] rounded-xl text-center">
              <div className="text-lg font-black text-white">{rows.length}</div>
              <div className="text-[9px] text-[#52525b] uppercase tracking-widest">Total</div>
            </div>
            {Object.entries(ROLE_CFG).map(([r, cfg]) =>
              roleCount[r] ? (
                <button key={r} onClick={() => setRole(role === r ? 'all' : r)}
                  className={`shrink-0 px-4 py-2 rounded-xl border text-center transition-colors cursor-pointer ${role === r ? cfg.cls : 'bg-[#18181b] border-[#27272a]'}`}>
                  <div className={`text-lg font-black ${role === r ? '' : cfg.cls.split(' ')[1]}`}>{roleCount[r]}</div>
                  <div className="text-[9px] text-[#52525b] uppercase tracking-widest">{cfg.label}s</div>
                </button>
              ) : null
            )}
          </div>
        )}

        {/* Merge panel */}
        {showMerge && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-amber-400">Merge Duplicate Contacts</p>
                <p className="text-xs text-[#71717a] mt-0.5">The source record is deleted. All its data is merged into the target.</p>
              </div>
              <button onClick={() => setShowMerge(false)} className="p-1.5 rounded-lg text-[#71717a] hover:text-white">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black text-[#71717a] uppercase tracking-widest block mb-1">Keep (target)</label>
                <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-[#f5a623]/50">
                  <option value="">Select contact to keep…</option>
                  {rows.map(r => <option key={`t-${r.id}`} value={r.id}>{r.full_name || r.email || r.phone} ({r.role})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-[#71717a] uppercase tracking-widest block mb-1">Delete (duplicate)</label>
                <select value={mergeSource} onChange={e => setMergeSource(e.target.value)}
                  className="w-full bg-[#18181b] border border-[#27272a] text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-[#f5a623]/50">
                  <option value="">Select duplicate to remove…</option>
                  {rows.filter(r => r.id !== mergeTarget).map(r => <option key={`s-${r.id}`} value={r.id}>{r.full_name || r.email || r.phone} ({r.role})</option>)}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <button onClick={runMerge} disabled={merging || !mergeTarget || !mergeSource}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-black text-sm rounded-xl transition-colors">
                  {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                  {merging ? 'Merging…' : 'Merge Now'}
                </button>
              </div>
            </div>
            {mergeMsg && (
              <p className={`text-xs font-bold px-3 py-2 rounded-lg ${mergeMsg.includes('success') || mergeMsg.includes('completed') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                {mergeMsg}
              </p>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b]" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, email, phone…"
                className="w-full bg-[#18181b] border border-[#27272a] text-white pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:border-[#f5a623]/50" />
            </div>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs font-bold px-3 py-2 rounded-xl focus:outline-none">
              <option value="all">All Roles</option>
              {Object.entries(ROLE_CFG).map(([r, cfg]) => <option key={r} value={r}>{cfg.label}</option>)}
            </select>
            <select value={source} onChange={e => setSource(e.target.value)}
              className="bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs font-bold px-3 py-2 rounded-xl focus:outline-none">
              {sourceOptions.map(s => <option key={s} value={s}>{s === 'all' ? 'All Sources' : SOURCE_CFG[s]?.label || s}</option>)}
            </select>
            <button onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${showFilters ? 'bg-[#f5a623]/10 border-[#f5a623]/30 text-[#f5a623]' : 'bg-[#18181b] border-[#27272a] text-[#71717a] hover:text-white'}`}>
              <Filter className="w-3 h-3" /> More
            </button>
            {(q || role !== 'all' || source !== 'all' || school || className) && (
              <button onClick={() => { setQ(''); setRole('all'); setSource('all'); setSchool(''); setClassName(''); }}
                className="text-xs text-[#f5a623] hover:underline font-bold px-2">Clear</button>
            )}
            <span className="text-xs text-[#52525b] self-center ml-auto">{rows.length} contacts</span>
          </div>

          {showFilters && (
            <div className="flex gap-2 flex-wrap">
              <input value={school} onChange={e => setSchool(e.target.value)} placeholder="Filter by school…"
                className="bg-[#18181b] border border-[#27272a] text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-[#f5a623]/50 min-w-40" />
              <input value={className} onChange={e => setClassName(e.target.value)} placeholder="Filter by class…"
                className="bg-[#18181b] border border-[#27272a] text-white text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-[#f5a623]/50 min-w-36" />
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-[#0f0f11] border border-[#27272a] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="space-y-0">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-[#1c1c1f]">
                  <div className="w-9 h-9 rounded-full bg-[#27272a] animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-[#27272a] animate-pulse rounded w-40" />
                    <div className="h-2.5 bg-[#27272a] animate-pulse rounded w-60" />
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <UserGroupIcon className="w-10 h-10 text-[#27272a]" />
              <p className="text-[#52525b] font-bold text-sm">No contacts found</p>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#f5a623] text-[#09090b] text-sm font-bold hover:bg-[#fcd34d] transition-colors">
                <Plus className="w-4 h-4" /> Add first contact
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#27272a] bg-[#18181b]/50">
                    {['Contact', 'Role', 'Email', 'Phone', 'School', 'Class', 'Source', 'Added', 'Actions'].map(h => (
                      <th key={h} className="text-left text-[10px] font-black text-[#52525b] uppercase tracking-widest px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c1c1f]">
                  {rows.map(r => {
                    const roleCfg = ROLE_CFG[r.role] ?? ROLE_CFG.external;
                    const srcCfg  = SOURCE_CFG[r.source ?? ''] ?? { cls: 'bg-[#27272a] text-[#71717a]', label: r.source || '—' };
                    const waNum   = r.phone?.replace(/\D/g, '');
                    return (
                      <tr key={r.id} className="hover:bg-[#18181b]/50 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${avatarColor(r.role)}`}>
                              {initials(r.full_name)}
                            </div>
                            <span className="text-sm font-semibold whitespace-nowrap">{r.full_name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${roleCfg.cls}`}>{roleCfg.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          {r.email
                            ? <a href={`mailto:${r.email}`} className="text-xs text-[#71717a] hover:text-[#f5a623] transition-colors truncate max-w-[160px] block">{r.email}</a>
                            : <span className="text-xs text-[#3f3f46]">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-[#71717a]">{r.phone || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-[#71717a] max-w-[120px] block truncate">{r.school_name || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-[#71717a]">{r.class_name || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${srcCfg.cls}`}>{srcCfg.label}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-[#52525b]">{fmtDate(r.confirmed_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {waNum && (
                              <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors" title="WhatsApp">
                                <Phone className="w-3 h-3" />
                              </a>
                            )}
                            {r.email && (
                              <a href={`mailto:${r.email}`}
                                className="p-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-[#a1a1aa] rounded-lg transition-colors" title="Email">
                                <Mail className="w-3 h-3" />
                              </a>
                            )}
                            <button onClick={() => openEdit(r)}
                              className="p-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-[#a1a1aa] rounded-lg transition-colors" title="Edit">
                              <Edit3 className="w-3 h-3" />
                            </button>
                            {isAdmin && (
                              <button onClick={() => deleteContact(r.id)} disabled={deleting === r.id}
                                className="p-1.5 bg-[#27272a] hover:bg-rose-500/20 text-[#71717a] hover:text-rose-400 rounded-lg transition-colors" title="Delete">
                                {deleting === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              </button>
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

      {/* ── Add Contact Modal ────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#18181b] rounded-2xl border border-[#27272a] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272a]">
              <h2 className="text-sm font-black">Add Contact</h2>
              <button onClick={() => { setShowAdd(false); setAddErr(''); }} className="p-1.5 rounded-lg text-[#71717a] hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {addErr && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{addErr}</p>}
              {contactFields(addForm, setAddForm)}
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={createContact} disabled={addSaving || !addForm.full_name?.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#f5a623] text-[#09090b] text-sm font-black hover:bg-[#fcd34d] disabled:opacity-50 transition-colors">
                {addSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create contact
              </button>
              <button onClick={() => { setShowAdd(false); setAddErr(''); }}
                className="px-4 py-2.5 rounded-xl bg-[#27272a] text-[#a1a1aa] text-sm hover:bg-[#3f3f46] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Contact Modal ───────────────────────────────────────────────── */}
      {editRow && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#18181b] rounded-2xl border border-[#27272a] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272a]">
              <h2 className="text-sm font-black">Edit — {editRow.full_name}</h2>
              <button onClick={() => setEditRow(null)} className="p-1.5 rounded-lg text-[#71717a] hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {editErr && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{editErr}</p>}
              {contactFields(editForm, setEditForm)}
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={saveEdit} disabled={editSaving || !editForm.full_name?.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#f5a623] text-[#09090b] text-sm font-black hover:bg-[#fcd34d] disabled:opacity-50 transition-colors">
                {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save changes
              </button>
              <button onClick={() => setEditRow(null)}
                className="px-4 py-2.5 rounded-xl bg-[#27272a] text-[#a1a1aa] text-sm hover:bg-[#3f3f46] transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
