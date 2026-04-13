// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  CreditCardIcon, PlusIcon, PencilIcon, CheckCircleIcon, XMarkIcon,
  MagnifyingGlassIcon, ArrowPathIcon, CalendarDaysIcon, BuildingOfficeIcon,
  ExclamationTriangleIcon, ClockIcon, ShieldCheckIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

type SubStatus = 'active' | 'cancelled' | 'expired' | 'suspended';

interface Subscription {
  id: string;
  school_id: string;
  plan_name: string;
  plan_type: string | null;
  billing_cycle: 'monthly' | 'quarterly' | 'yearly';
  amount: number;
  currency: string;
  status: SubStatus;
  start_date: string;
  end_date: string | null;
  max_students: number | null;
  max_teachers: number | null;
  features: Record<string, any>;
  created_at: string;
  schools?: { id: string; name: string; email: string } | null;
}

const STATUS_CONFIG: Record<SubStatus, { label: string; color: string }> = {
  active:    { label: 'Active',    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  cancelled: { label: 'Cancelled', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  expired:   { label: 'Expired',   color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  suspended: { label: 'Suspended', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

const BILLING_LABELS: Record<string, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Annual' };

function StatusBadge({ status }: { status: SubStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.expired;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.color}`}>{cfg.label}</span>;
}

export default function SubscriptionsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    school_id: '', plan_name: '', plan_type: 'standard', billing_cycle: 'monthly',
    amount: 0, currency: 'NGN', start_date: '', end_date: '',
    max_students: '', max_teachers: '', status: 'active',
  });

  const isAdmin = profile?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subsRes, schoolsRes] = await Promise.all([
        fetch('/api/subscriptions?limit=100'),
        isAdmin ? fetch('/api/schools') : Promise.resolve(null),
      ]);
      const subsJson = await subsRes.json();
      setSubs(subsJson.data ?? []);
      if (schoolsRes) {
        const schoolsJson = await schoolsRes.json();
        setSchools(schoolsJson.data ?? []);
      }
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { if (!authLoading && profile) load(); }, [authLoading, profile, load]);

  async function save() {
    setSubmitting(true);
    try {
      const payload = { ...form, amount: Number(form.amount), max_students: form.max_students ? Number(form.max_students) : null, max_teachers: form.max_teachers ? Number(form.max_teachers) : null, end_date: form.end_date || null };
      let res;
      if (editSub) {
        res = await fetch(`/api/subscriptions/${editSub.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        res = await fetch('/api/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      toast.success(editSub ? 'Subscription updated' : 'Subscription created');
      setShowForm(false); setEditSub(null);
      load();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setSubmitting(false); }
  }

  async function cancelSub(id: string) {
    if (!confirm('Cancel this subscription?')) return;
    await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
    toast.success('Subscription cancelled');
    load();
  }

  function openEdit(sub: Subscription) {
    setEditSub(sub);
    setForm({
      school_id: sub.school_id, plan_name: sub.plan_name, plan_type: sub.plan_type ?? 'standard',
      billing_cycle: sub.billing_cycle, amount: sub.amount, currency: sub.currency,
      start_date: sub.start_date?.split('T')[0] ?? '', end_date: sub.end_date?.split('T')[0] ?? '',
      max_students: sub.max_students ? String(sub.max_students) : '', max_teachers: sub.max_teachers ? String(sub.max_teachers) : '',
      status: sub.status,
    });
    setShowForm(true);
  }

  if (authLoading || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldCheckIcon className="w-16 h-16 text-card-foreground/10" />
        <p className="text-card-foreground/50 text-lg font-semibold">Admin access required</p>
      </div>
    );
  }

  const filtered = subs.filter(s => {
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const matchSearch = !search || s.plan_name.toLowerCase().includes(search.toLowerCase()) || s.schools?.name?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const revenue = subs.filter(s => s.status === 'active').reduce((acc, s) => {
    const monthly = s.billing_cycle === 'monthly' ? s.amount : s.billing_cycle === 'quarterly' ? s.amount / 3 : s.amount / 12;
    return acc + monthly;
  }, 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <CreditCardIcon className="w-7 h-7 text-emerald-400" />
            Subscriptions
          </h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">Manage school subscription plans and billing</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all">
            <ArrowPathIcon className={`w-4 h-4 text-card-foreground/50 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setShowForm(true); setEditSub(null); setForm({ school_id: '', plan_name: '', plan_type: 'standard', billing_cycle: 'monthly', amount: 0, currency: 'NGN', start_date: new Date().toISOString().split('T')[0], end_date: '', max_students: '', max_teachers: '', status: 'active' }); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20">
            <PlusIcon className="w-4 h-4" /> New Subscription
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: subs.filter(s => s.status === 'active').length, color: 'text-emerald-400' },
          { label: 'Expired', value: subs.filter(s => s.status === 'expired').length, color: 'text-rose-400' },
          { label: 'Suspended', value: subs.filter(s => s.status === 'suspended').length, color: 'text-amber-400' },
          { label: 'Est. MRR', value: `₦${Math.round(revenue).toLocaleString()}`, color: 'text-blue-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-white/[0.08] rounded-xl p-4 text-center">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs font-bold text-card-foreground/40 uppercase tracking-wider mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-card-foreground/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by school or plan…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-emerald-500/50" />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'expired', 'suspended', 'cancelled'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s === 'all' ? 'all' : s as SubStatus)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${statusFilter === s ? 'bg-emerald-500 text-white' : 'bg-white/5 text-card-foreground/60 hover:bg-white/10'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <CreditCardIcon className="w-16 h-16 text-card-foreground/10" />
          <p className="text-card-foreground/40 font-semibold">No subscriptions found</p>
        </div>
      ) : (
        <div className="bg-card border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">School</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Billing</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Expires</th>
                  <th className="text-right px-4 py-3 text-xs font-black uppercase tracking-wider text-card-foreground/40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(sub => {
                  const isExpiringSoon = sub.end_date && new Date(sub.end_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                  return (
                    <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                            <BuildingOfficeIcon className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span className="font-semibold text-card-foreground">{sub.schools?.name ?? 'Unknown School'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-card-foreground">{sub.plan_name}</p>
                        {sub.plan_type && <p className="text-xs text-card-foreground/40 capitalize">{sub.plan_type}</p>}
                      </td>
                      <td className="px-4 py-3 text-card-foreground/70">{BILLING_LABELS[sub.billing_cycle]}</td>
                      <td className="px-4 py-3 font-bold text-card-foreground">{sub.currency} {Number(sub.amount).toLocaleString()}</td>
                      <td className="px-4 py-3"><StatusBadge status={sub.status} /></td>
                      <td className="px-4 py-3">
                        {sub.end_date ? (
                          <div className="flex items-center gap-1">
                            {isExpiringSoon && <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-400" />}
                            <span className={`text-xs ${isExpiringSoon ? 'text-amber-400 font-bold' : 'text-card-foreground/50'}`}>
                              {new Date(sub.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        ) : <span className="text-xs text-card-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(sub)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                            <PencilIcon className="w-3.5 h-3.5 text-card-foreground/50" />
                          </button>
                          {sub.status === 'active' && (
                            <button onClick={() => cancelSub(sub.id)} className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-xs font-bold rounded-lg transition-all">
                              Cancel
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
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-white/[0.12] rounded-2xl w-full max-w-lg shadow-2xl my-4">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.08]">
              <h3 className="font-black text-card-foreground text-lg">{editSub ? 'Edit Subscription' : 'New Subscription'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-white/5 rounded-lg"><XMarkIcon className="w-5 h-5 text-card-foreground/50" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">School</label>
                <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50">
                  <option value="">Select school…</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Plan Name</label>
                  <input value={form.plan_name} onChange={e => setForm(f => ({ ...f, plan_name: e.target.value }))} placeholder="e.g. Pro School"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Billing Cycle</label>
                  <select value={form.billing_cycle} onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50">
                    {['monthly', 'quarterly', 'yearly'].map(b => <option key={b} value={b}>{BILLING_LABELS[b]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Amount</label>
                  <input type="number" min={0} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Currency</label>
                  <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50">
                    {['NGN', 'USD', 'GBP', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">End Date</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Max Students</label>
                  <input type="number" min={0} value={form.max_students} onChange={e => setForm(f => ({ ...f, max_students: e.target.value }))} placeholder="Unlimited"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Max Teachers</label>
                  <input type="number" min={0} value={form.max_teachers} onChange={e => setForm(f => ({ ...f, max_teachers: e.target.value }))} placeholder="Unlimited"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50" />
                </div>
              </div>
              {editSub && (
                <div>
                  <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-emerald-500/50">
                    {['active', 'suspended', 'cancelled', 'expired'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-white/[0.08]">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={save} disabled={submitting || !form.school_id || !form.plan_name}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all">
                <CheckCircleIcon className="w-4 h-4" /> {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
