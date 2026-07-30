'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { MagnifyingGlassIcon, ArrowDownTrayIcon, UserGroupIcon, ArrowLeftIcon } from '@/lib/icons';
import { Plus, Edit3, Trash2, Save, X, Loader2, Filter, Printer, Phone, Mail, AlertTriangle } from 'lucide-react';
import {
  CRM_ROLE_CFG,
  CRM_SOURCE_CFG,
  crmAvatarColor,
  crmFmtDate,
  crmInitials,
} from '@/lib/crm/ui';
import { CrmContactFormFields, type CrmContactFormValues } from '@/components/crm/CrmContactFormFields';
import { CrmMergePanel } from '@/components/crm/CrmMergePanel';

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
  metadata?: Record<string, unknown> | null;
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  partial: 'Typing…',
  submitted_unpaid: 'Submitted',
  paystack_pending: 'Paystack pending',
  abandoned: 'Abandoned',
  failed: 'Failed',
  pending_verification: 'Bank pending',
};

function leadStatusLabel(row: ContactBookRow): string | null {
  const meta = row.metadata ?? {};
  const status = String(meta.payment_status ?? meta.capture_stage ?? '').trim();
  if (!status) return null;
  return PAYMENT_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

const BLANK: CrmContactFormValues = {
  full_name: '', email: '', phone: '', role: 'parent',
  school_name: '', class_name: '', source: 'manual', last_channel: 'manual',
};

export default function CustomerBookPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  const [rows, setRows] = useState<ContactBookRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [source, setSource] = useState('all');
  const [leadGroup, setLeadGroup] = useState(false);
  const [school, setSchool] = useState('');
  const [className, setClassName] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ...BLANK });
  const [addSaving, setAddSaving] = useState(false);
  const [addErr, setAddErr] = useState('');

  const [editRow, setEditRow] = useState<ContactBookRow | null>(null);
  const [editForm, setEditForm] = useState({ ...BLANK });
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState('');

  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeSource, setMergeSource] = useState('');
  const [mergeMsg, setMergeMsg] = useState('');
  const [merging, setMerging] = useState(false);

  const [deleting, setDeleting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, role, source, school, class: className });
      if (leadGroup) params.set('group', 'leads');
      const res = await fetch(`/api/customer-book?${params}`);
      const json = await res.json();
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [q, role, source, school, className, leadGroup]);

  useEffect(() => {
    if (!isStaff) return;
    const t = setTimeout(() => { void fetchRows(); }, 280);
    return () => clearTimeout(t);
  }, [fetchRows, isStaff]);

  const sourceOptions = useMemo(() => {
    const set = new Set<string>(['form_capture', 'dropped_payment', 'consent_form', 'portal_registration']);
    rows.forEach(r => { if (r.source) set.add(r.source); });
    return ['all', ...Array.from(set)];
  }, [rows]);

  const syncDroppedPayers = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/customer-book/sync-dropped-payers', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Sync failed');
      setSyncMsg(json.message || `Synced ${json.synced ?? 0} contact(s).`);
      await fetchRows();
    } catch (e: unknown) {
      setSyncMsg(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const reconcileParentStages = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/customer-book/reconcile-parent-stages', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Reconcile failed');
      setSyncMsg(json.message || 'Parent stages reconciled.');
      await fetchRows();
    } catch (e: unknown) {
      setSyncMsg(e instanceof Error ? e.message : 'Reconcile failed');
    } finally {
      setSyncing(false);
    }
  };

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

  const createContact = async () => {
    if (!addForm.full_name?.trim()) { setAddErr('Name is required'); return; }
    setAddErr('');
    setAddSaving(true);
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

  const openEdit = (r: ContactBookRow) => {
    setEditRow(r);
    setEditForm({
      full_name: r.full_name || '', email: r.email || '', phone: r.phone || '', role: r.role,
      school_name: r.school_name || '', class_name: r.class_name || '',
      source: r.source || 'manual', last_channel: r.last_channel || 'manual',
    });
    setEditErr('');
  };

  const saveEdit = async () => {
    if (!editRow) return;
    if (!editForm.full_name?.trim()) { setEditErr('Name is required'); return; }
    setEditErr('');
    setEditSaving(true);
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

  const deleteContact = async (id: string) => {
    if (!confirm('Permanently delete this contact? This cannot be undone.')) return;
    setDeleting(id);
    const res = await fetch(`/api/customer-book/${id}`, { method: 'DELETE' });
    if (res.ok) setRows(prev => prev.filter(r => r.id !== id));
    setDeleting(null);
  };

  const runMerge = async () => {
    if (!mergeTarget || !mergeSource || mergeTarget === mergeSource) {
      setMergeMsg('Select two different contacts to merge.');
      return;
    }
    setMerging(true);
    setMergeMsg('');
    const res = await fetch('/api/customer-book', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_id: mergeTarget, source_id: mergeSource }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setMergeMsg(json?.error || 'Merge failed'); setMerging(false); return; }
    setMergeMsg('Merge completed successfully.');
    setMergeSource('');
    setMergeTarget('');
    await fetchRows();
    setMerging(false);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <AlertTriangle className="w-10 h-10 text-rose-600 dark:text-rose-400" />
        <p className="font-semibold">Staff access only.</p>
      </div>
    );
  }

  const backHref = profile?.role === 'admin' ? '/dashboard/office?workspace=crm' : '/dashboard/crm';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Link
              href={backHref}
              className="mt-0.5 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-primary uppercase tracking-widest">CRM</span>
                <span className="text-muted-foreground/50 text-xs">›</span>
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Contact Directory</span>
              </div>
              <h1 className="text-xl font-black">Contact Directory</h1>
              <p className="text-muted-foreground text-xs mt-0.5">All captured contacts — create, edit, export, and merge duplicates</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Contact
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-xl transition-colors"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={printReport}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-bold rounded-xl transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
            <button
              type="button"
              onClick={() => { setShowMerge(v => !v); setMergeMsg(''); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-bold rounded-xl transition-colors"
            >
              Merge Dupes
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => void reconcileParentStages()}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-xl transition-colors disabled:opacity-60"
                >
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserGroupIcon className="w-3.5 h-3.5" />}
                  Fix parent stages
                </button>
                <button
                  type="button"
                  onClick={() => void syncDroppedPayers()}
                  disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold rounded-xl transition-colors disabled:opacity-60"
                >
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  Sync dropped payers
                </button>
              </>
            )}
          </div>
        </div>

        {syncMsg && (
          <p className="text-xs font-bold text-muted-foreground px-1">{syncMsg}</p>
        )}

        {rows.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
            <div className="shrink-0 px-4 py-2 bg-card border border-border rounded-xl text-center">
              <div className="text-lg font-black">{rows.length}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Total</div>
            </div>
            {Object.entries(CRM_ROLE_CFG).map(([r, cfg]) =>
              roleCount[r] ? (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(role === r ? 'all' : r)}
                  className={`shrink-0 px-4 py-2 rounded-xl border text-center transition-colors cursor-pointer ${
                    role === r ? cfg.cls : 'bg-card border-border'
                  }`}
                >
                  <div className={`text-lg font-black ${role === r ? '' : cfg.cls.split(' ')[1]}`}>{roleCount[r]}</div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-widest">{cfg.label}s</div>
                </button>
              ) : null,
            )}
          </div>
        )}

        {showMerge && (
          <CrmMergePanel
            rows={rows}
            mergeTarget={mergeTarget}
            mergeSource={mergeSource}
            onMergeTargetChange={setMergeTarget}
            onMergeSourceChange={setMergeSource}
            onMerge={runMerge}
            merging={merging}
            message={mergeMsg}
            onClose={() => setShowMerge(false)}
          />
        )}

        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Name, email, phone…"
                className="w-full bg-background border border-border text-foreground pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="bg-background border border-border text-muted-foreground text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-primary"
            >
              <option value="all">All Roles</option>
              {Object.entries(CRM_ROLE_CFG).map(([r, cfg]) => (
                <option key={r} value={r}>{cfg.label}</option>
              ))}
            </select>
            <select
              value={source}
              onChange={e => { setSource(e.target.value); setLeadGroup(false); }}
              className="bg-background border border-border text-muted-foreground text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-primary"
            >
              {sourceOptions.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Sources' : CRM_SOURCE_CFG[s]?.label || s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => { setLeadGroup(v => !v); if (!leadGroup) setSource('all'); }}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                leadGroup ? 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400' : 'bg-background border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              Captured leads
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                showFilters ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Filter className="w-3 h-3" /> More
            </button>
            {(q || role !== 'all' || source !== 'all' || leadGroup || school || className) && (
              <button
                type="button"
                onClick={() => { setQ(''); setRole('all'); setSource('all'); setLeadGroup(false); setSchool(''); setClassName(''); }}
                className="text-xs text-primary hover:underline font-bold px-2"
              >
                Clear
              </button>
            )}
            <span className="text-xs text-muted-foreground self-center ml-auto">{rows.length} contacts</span>
          </div>

          {showFilters && (
            <div className="flex gap-2 flex-wrap">
              <input
                value={school}
                onChange={e => setSchool(e.target.value)}
                placeholder="Filter by school…"
                className="bg-background border border-border text-foreground text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-primary min-w-40"
              />
              <input
                value={className}
                onChange={e => setClassName(e.target.value)}
                placeholder="Filter by class…"
                className="bg-background border border-border text-foreground text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-primary min-w-36"
              />
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {loading ? (
            <div className="space-y-0">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border">
                  <div className="w-9 h-9 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-muted animate-pulse rounded w-40" />
                    <div className="h-2.5 bg-muted animate-pulse rounded w-60" />
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <UserGroupIcon className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-muted-foreground font-bold text-sm">No contacts found</p>
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add first contact
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['Contact', 'Role', 'Email', 'Phone', 'School', 'Class', 'Source', 'Added', 'Actions'].map(h => (
                      <th key={h} className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(r => {
                    const roleCfg = CRM_ROLE_CFG[r.role] ?? CRM_ROLE_CFG.external;
                    const srcCfg = CRM_SOURCE_CFG[r.source ?? ''] ?? { cls: 'bg-muted text-muted-foreground', label: r.source || '—' };
                    const waNum = r.phone?.replace(/\D/g, '');
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-foreground shrink-0 ${crmAvatarColor(r.role)}`}>
                              {crmInitials(r.full_name)}
                            </div>
                            <span className="text-sm font-semibold whitespace-nowrap">{r.full_name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${roleCfg.cls}`}>{roleCfg.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          {r.email
                            ? <a href={`mailto:${r.email}`} className="text-xs text-muted-foreground hover:text-primary transition-colors truncate max-w-[160px] block">{r.email}</a>
                            : <span className="text-xs text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{r.phone || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground max-w-[120px] block truncate">{r.school_name || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-muted-foreground">{r.class_name || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full w-fit ${srcCfg.cls}`}>{srcCfg.label}</span>
                            {leadStatusLabel(r) && (
                              <span className="text-[9px] text-muted-foreground capitalize">{leadStatusLabel(r)}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-muted-foreground">{crmFmtDate(r.confirmed_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            {waNum && (
                              <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors" title="WhatsApp">
                                <Phone className="w-3 h-3" />
                              </a>
                            )}
                            {r.email && (
                              <a href={`mailto:${r.email}`}
                                className="p-1.5 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg transition-colors" title="Email">
                                <Mail className="w-3 h-3" />
                              </a>
                            )}
                            <button type="button" onClick={() => openEdit(r)}
                              className="p-1.5 bg-muted hover:bg-muted/80 text-muted-foreground rounded-lg transition-colors" title="Edit">
                              <Edit3 className="w-3 h-3" />
                            </button>
                            {isAdmin && (
                              <button type="button" onClick={() => deleteContact(r.id)} disabled={deleting === r.id}
                                className="p-1.5 bg-muted hover:bg-rose-500/20 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors" title="Delete">
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

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-black">Add Contact</h2>
              <button type="button" onClick={() => { setShowAdd(false); setAddErr(''); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {addErr && <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{addErr}</p>}
              <CrmContactFormFields form={addForm} onChange={setAddForm} />
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button type="button" onClick={createContact} disabled={addSaving || !addForm.full_name?.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {addSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create contact
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setAddErr(''); }}
                className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm hover:bg-muted/80 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-black">Edit — {editRow.full_name}</h2>
              <button type="button" onClick={() => setEditRow(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {editErr && <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{editErr}</p>}
              <CrmContactFormFields form={editForm} onChange={setEditForm} />
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button type="button" onClick={saveEdit} disabled={editSaving || !editForm.full_name?.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save changes
              </button>
              <button type="button" onClick={() => setEditRow(null)}
                className="px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm hover:bg-muted/80 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
