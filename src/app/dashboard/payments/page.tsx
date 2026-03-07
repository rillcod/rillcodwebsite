'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BanknotesIcon, PlusIcon, PencilIcon, TrashIcon,
  XMarkIcon, CheckIcon, BuildingOfficeIcon, ShieldCheckIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

type PaymentAccount = {
  id: string;
  owner_type: 'rillcod' | 'school';
  school_id: string | null;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  account_type: 'savings' | 'current';
  payment_note: string | null;
  is_active: boolean;
  schools?: { name: string } | null;
};

const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank Nigeria', 'Ecobank Nigeria', 'Fidelity Bank',
  'First Bank of Nigeria', 'First City Monument Bank (FCMB)', 'Guaranty Trust Bank (GTB)',
  'Heritage Bank', 'Jaiz Bank', 'Keystone Bank', 'Kuda Bank',
  'Moniepoint MFB', 'OPay', 'PalmPay', 'Polaris Bank',
  'Providus Bank', 'Stanbic IBTC Bank', 'Standard Chartered Bank',
  'Sterling Bank', 'SunTrust Bank', 'Union Bank', 'United Bank for Africa (UBA)',
  'Unity Bank', 'VFD MFB', 'Wema Bank', 'Zenith Bank',
].sort();

const BLANK: Omit<PaymentAccount, 'id' | 'schools'> = {
  owner_type: 'school', school_id: null, label: '', bank_name: '',
  account_number: '', account_name: '', account_type: 'savings',
  payment_note: '', is_active: true,
};

function AccountCard({ account, onEdit, onDelete, canManage }: {
  account: PaymentAccount;
  onEdit: (a: PaymentAccount) => void;
  onDelete: (id: string) => void;
  canManage: boolean;
}) {
  const isRillcod = account.owner_type === 'rillcod';
  return (
    <div className={`bg-white/5 border rounded-2xl p-5 space-y-3 ${isRillcod ? 'border-violet-500/30' : 'border-white/10'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isRillcod ? 'bg-violet-600/20' : 'bg-white/10'}`}>
            {isRillcod
              ? <ShieldCheckIcon className="w-5 h-5 text-violet-400" />
              : <BuildingOfficeIcon className="w-5 h-5 text-white/50" />}
          </div>
          <div className="min-w-0">
            <p className="font-black text-white text-sm truncate">{account.label}</p>
            <p className="text-[10px] text-white/30 uppercase tracking-widest">
              {isRillcod ? 'Rillcod Academy' : (account.schools?.name ?? 'School Account')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!account.is_active && (
            <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[10px] font-black rounded-full uppercase">Inactive</span>
          )}
          {canManage && (
            <>
              <button onClick={() => onEdit(account)}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                <PencilIcon className="w-4 h-4 text-white/40 hover:text-white" />
              </button>
              <button onClick={() => onDelete(account.id)}
                className="p-2 hover:bg-rose-500/20 rounded-xl transition-colors">
                <TrashIcon className="w-4 h-4 text-rose-400/60 hover:text-rose-400" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Bank</p>
          <p className="font-bold text-white text-[13px]">{account.bank_name}</p>
        </div>
        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Account Type</p>
          <p className="font-bold text-white text-[13px] capitalize">{account.account_type}</p>
        </div>
        <div className="col-span-2 bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
          <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Account Name</p>
          <p className="font-bold text-white text-[13px]">{account.account_name}</p>
        </div>
        <div className="col-span-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-emerald-400/70 uppercase tracking-widest mb-1">Account Number</p>
            <p className="font-black text-emerald-300 text-lg tracking-[0.15em]">{account.account_number}</p>
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(account.account_number)}
            className="text-[10px] font-bold text-emerald-400/60 hover:text-emerald-300 transition-colors px-2 py-1 bg-emerald-500/10 rounded-lg"
          >
            Copy
          </button>
        </div>
      </div>

      {account.payment_note && (
        <div className="flex gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          <InformationCircleIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-300/80">{account.payment_note}</p>
        </div>
      )}
    </div>
  );
}

export default function PaymentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const canManage = isAdmin || isSchool;

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [form, setForm] = useState<Omit<PaymentAccount, 'id' | 'schools'>>({ ...BLANK });
  const [saving, setSaving] = useState(false);

  const db = createClient();

  async function load() {
    setLoading(true); setError(null);
    const { data, error: err } = await (db as any).from('payment_accounts')
      .select('*, schools(name)')
      .order('owner_type').order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setAccounts((data ?? []) as PaymentAccount[]);
    setLoading(false);
  }

  useEffect(() => {
    if (authLoading || !profile) return;
    load();
    if (isAdmin) {
      db.from('schools').select('id, name').order('name')
        .then(({ data }) => setSchools((data ?? []) as { id: string; name: string }[]));
    }
  }, [profile?.id, authLoading]); // eslint-disable-line

  const openNew = () => {
    setEditing(null);
    setForm({
      ...BLANK,
      owner_type: isSchool ? 'school' : 'rillcod',
      school_id: isSchool ? (profile as any)?.school_id ?? null : null,
    });
    setShowForm(true);
  };

  const openEdit = (a: PaymentAccount) => {
    setEditing(a);
    setForm({
      owner_type: a.owner_type, school_id: a.school_id, label: a.label,
      bank_name: a.bank_name, account_number: a.account_number,
      account_name: a.account_name, account_type: a.account_type,
      payment_note: a.payment_note ?? '', is_active: a.is_active,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.label.trim() || !form.bank_name || !form.account_number.trim() || !form.account_name.trim()) {
      setError('Label, bank, account number, and account name are required.');
      return;
    }
    setSaving(true); setError(null);
    const payload = {
      ...form,
      payment_note: form.payment_note || null,
      school_id: form.owner_type === 'rillcod' ? null : (form.school_id || null),
      created_by: profile!.id,
    };
    const q = editing
      ? (db as any).from('payment_accounts').update(payload).eq('id', editing.id)
      : (db as any).from('payment_accounts').insert(payload);
    const { error: err } = await q;
    if (err) setError(err.message);
    else { await load(); setShowForm(false); }
    setSaving(false);
  };

  const del = async (id: string) => {
    if (!confirm('Remove this payment account?')) return;
    await (db as any).from('payment_accounts').delete().eq('id', id);
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  const rillcodAccounts = accounts.filter(a => a.owner_type === 'rillcod');
  const schoolAccounts  = accounts.filter(a => a.owner_type === 'school');

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BanknotesIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Finance</span>
            </div>
            <h1 className="text-3xl font-extrabold">Payment Accounts</h1>
            <p className="text-white/40 text-sm mt-1">
              {isAdmin ? 'Manage Rillcod and school bank account details' :
                isSchool ? 'Your school\'s payment account for fee collection' :
                  'Payment account details for your school'}
            </p>
          </div>
          {canManage && (
            <button onClick={openNew}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm rounded-xl transition-all hover:scale-105 shadow-lg shadow-violet-900/30">
              <PlusIcon className="w-4 h-4" /> Add Account
            </button>
          )}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
          </div>
        )}

        {/* Rillcod Academy Accounts */}
        {(isAdmin || rillcodAccounts.length > 0) && (
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-black uppercase tracking-widest text-violet-400">Rillcod Academy Accounts</h2>
              <div className="h-px flex-1 bg-violet-500/20" />
              {isAdmin && (
                <button
                  onClick={() => { setForm({ ...BLANK, owner_type: 'rillcod', school_id: null }); setEditing(null); setShowForm(true); }}
                  className="text-[10px] font-black text-violet-400/60 hover:text-violet-300 flex items-center gap-1">
                  <PlusIcon className="w-3 h-3" /> Add
                </button>
              )}
            </div>
            {rillcodAccounts.length === 0 ? (
              <div className="text-center py-10 bg-white/5 border border-dashed border-violet-500/20 rounded-2xl">
                <p className="text-white/30 text-sm">No Rillcod payment accounts set up yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rillcodAccounts.map(a => (
                  <AccountCard key={a.id} account={a} onEdit={openEdit} onDelete={del} canManage={isAdmin} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* School Accounts */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <BuildingOfficeIcon className="w-4 h-4 text-white/40" />
            <h2 className="text-sm font-black uppercase tracking-widest text-white/40">
              {isSchool ? 'Your School Account' : 'Partner School Accounts'}
            </h2>
            <div className="h-px flex-1 bg-white/10" />
            {isSchool && (
              <button
                onClick={() => { setForm({ ...BLANK, owner_type: 'school', school_id: (profile as any)?.school_id ?? null }); setEditing(null); setShowForm(true); }}
                className="text-[10px] font-black text-white/40 hover:text-white flex items-center gap-1">
                <PlusIcon className="w-3 h-3" /> Add
              </button>
            )}
          </div>
          {schoolAccounts.length === 0 ? (
            <div className="text-center py-10 bg-white/5 border border-dashed border-white/10 rounded-2xl">
              <BuildingOfficeIcon className="w-10 h-10 mx-auto text-white/10 mb-3" />
              <p className="text-white/30 text-sm">
                {isSchool ? 'Add your school\'s bank account for fee collection.' : 'No school payment accounts set up yet.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schoolAccounts.map(a => (
                <AccountCard key={a.id} account={a} onEdit={openEdit} onDelete={del}
                  canManage={isAdmin || (isSchool && a.school_id === (profile as any)?.school_id)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-[#0f0f1a] border border-white/10 rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-white">{editing ? 'Edit Account' : 'Add Payment Account'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/10">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Owner type (admin only) */}
              {isAdmin && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Owner</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['rillcod', 'school'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => setForm(f => ({ ...f, owner_type: t, school_id: t === 'rillcod' ? null : f.school_id }))}
                        className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${form.owner_type === t ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}>
                        {t === 'rillcod' ? 'Rillcod Academy' : 'Partner School'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* School selector (admin, school type) */}
              {isAdmin && form.owner_type === 'school' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Partner School <span className="text-rose-400">*</span></label>
                  <select value={form.school_id ?? ''} onChange={e => setForm(f => ({ ...f, school_id: e.target.value || null }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                    <option value="">— Select school —</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {/* Label */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Label <span className="text-rose-400">*</span></label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Main Collection Account, School Fees Account"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>

              {/* Bank + Account type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Bank Name <span className="text-rose-400">*</span></label>
                  <select value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                    <option value="">— Select bank —</option>
                    {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Number <span className="text-rose-400">*</span></label>
                  <input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    placeholder="10 digits" maxLength={10}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500 font-mono tracking-widest" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Type</label>
                  <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value as any }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500">
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                  </select>
                </div>
              </div>

              {/* Account name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Account Name <span className="text-rose-400">*</span></label>
                <input value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
                  placeholder="Exact name on the bank account"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500" />
              </div>

              {/* Payment note */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Payment Note / Instructions</label>
                <textarea value={form.payment_note ?? ''} onChange={e => setForm(f => ({ ...f, payment_note: e.target.value }))}
                  placeholder="e.g. Use student name and class as payment reference. Send proof to school admin."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-violet-500 resize-none" />
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${form.is_active ? 'bg-violet-600' : 'bg-white/10'}`}
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
                  <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform shadow ${form.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-white/60 font-semibold">Active — visible to students and staff</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-white/40 hover:text-white transition-colors">Cancel</button>
              <button onClick={save}
                disabled={saving || !form.label.trim() || !form.bank_name || !form.account_number.trim() || !form.account_name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                {editing ? 'Update' : 'Save Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
