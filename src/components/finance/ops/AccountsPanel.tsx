'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  BanknotesIcon,
  BuildingOfficeIcon,
  CheckBadgeIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
} from '@/lib/icons';

interface PaymentAccount {
  id: string;
  owner_type: 'rillcod' | 'school';
  school_id: string | null;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  account_type: 'checking' | 'savings' | null;
  payment_note: string | null;
  is_active: boolean;
  created_at: string;
  schools?: { name: string } | null;
}

interface SchoolOption {
  id: string;
  name: string;
}

interface AccountFormState {
  owner_type: 'rillcod' | 'school';
  school_id: string | null;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  account_type: 'checking' | 'savings';
  payment_note: string;
  is_active: boolean;
}

const BLANK: AccountFormState = {
  owner_type: 'rillcod',
  school_id: null,
  label: '',
  bank_name: '',
  account_number: '',
  account_name: '',
  account_type: 'checking',
  payment_note: '',
  is_active: true,
};

/**
 * AccountsPanel — manage the bank accounts where Rillcod (admin) and schools
 * collect payments. Replaces the "accounts" section of the legacy PaymentsHub.
 */
export function AccountsPanel() {
  const { profile } = useAuth();
  const db = createClient();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [form, setForm] = useState<AccountFormState>({ ...BLANK });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/payment-accounts');
    if (res.ok) {
      const json = await res.json();
      setAccounts(json.data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!profile) return;
    load();
    if (isAdmin) {
      db.from('schools')
        .select('id, name')
        .order('name')
        .then(({ data }) => {
          if (data) setSchools(data);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const openNew = () => {
    setEditing(null);
    setForm({
      ...BLANK,
      owner_type: isSchool ? 'school' : 'rillcod',
      school_id: isSchool ? profile?.school_id ?? null : null,
    });
    setShowForm(true);
  };

  const openEdit = (a: PaymentAccount) => {
    setEditing(a);
    setForm({
      owner_type: a.owner_type,
      school_id: a.school_id,
      label: a.label,
      bank_name: a.bank_name,
      account_number: a.account_number,
      account_name: a.account_name,
      account_type: a.account_type ?? 'checking',
      payment_note: a.payment_note ?? '',
      is_active: a.is_active,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.label.trim() || !form.bank_name || !form.account_number.trim() || !form.account_name.trim()) {
      toast.error('Label, bank, account number, and account name are required.');
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      payment_note: form.payment_note || null,
      school_id: form.owner_type === 'rillcod' ? null : form.school_id || null,
    };
    try {
      const res = editing
        ? await fetch(`/api/payment-accounts/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/payment-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error || 'Failed to save account');
        return;
      }
      toast.success(editing ? 'Account updated' : 'Account created');
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const del = async (acct: PaymentAccount) => {
    if (!confirm(`Remove the account "${acct.label}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/payment-accounts/${acct.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || 'Delete failed');
      return;
    }
    toast.success('Account removed');
    setAccounts((prev) => prev.filter((a) => a.id !== acct.id));
  };

  const rillcodAccounts = useMemo(() => accounts.filter((a) => a.owner_type === 'rillcod'), [accounts]);
  const schoolAccounts = useMemo(() => accounts.filter((a) => a.owner_type === 'school'), [accounts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-foreground flex items-center gap-2">
            <BanknotesIcon className="w-5 h-5 text-primary" />
            Bank accounts
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAdmin
              ? 'Rillcod corporate accounts plus partner-school collection accounts.'
              : 'Your school\u2019s collection accounts. These appear on invoices and receipts we issue to parents.'}
          </p>
        </div>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest rounded-md hover:bg-primary/90"
        >
          <PlusIcon className="w-4 h-4" /> Add account
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {isAdmin && (
            <AccountGroup
              title="Rillcod Technologies"
              icon={<BanknotesIcon className="w-4 h-4" />}
              accounts={rillcodAccounts}
              onEdit={openEdit}
              onDelete={del}
              accent="emerald"
            />
          )}
          <AccountGroup
            title={isSchool ? 'Your school accounts' : 'Partner schools'}
            icon={<BuildingOfficeIcon className="w-4 h-4" />}
            accounts={schoolAccounts}
            onEdit={openEdit}
            onDelete={del}
            accent="violet"
            emptyHint={
              isSchool
                ? 'Add your school\u2019s primary collection account so parents see correct payment details.'
                : 'No school accounts configured yet.'
            }
          />
        </>
      )}

      {showForm && (
        <AccountForm
          form={form}
          setForm={setForm}
          editing={editing}
          saving={saving}
          onSave={save}
          onClose={() => setShowForm(false)}
          isAdmin={isAdmin}
          isSchool={isSchool}
          schools={schools}
        />
      )}
    </div>
  );
}

function AccountGroup({
  title,
  icon,
  accounts,
  onEdit,
  onDelete,
  accent,
  emptyHint,
}: {
  title: string;
  icon: React.ReactNode;
  accounts: PaymentAccount[];
  onEdit: (a: PaymentAccount) => void;
  onDelete: (a: PaymentAccount) => void;
  accent: 'emerald' | 'violet';
  emptyHint?: string;
}) {
  const accentMap: Record<string, string> = {
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    violet: 'border-primary/30 bg-primary/5',
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-primary">{icon}</span>
        <h4 className="text-xs font-black uppercase tracking-widest text-foreground">{title}</h4>
        <span className="text-[10px] font-bold text-muted-foreground">({accounts.length})</span>
      </div>

      {accounts.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-6 text-center text-xs text-muted-foreground">
          {emptyHint || 'No accounts yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((a) => (
            <div
              key={a.id}
              className={`relative border rounded-xl p-4 ${accentMap[accent]} transition-colors`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-sm text-foreground truncate">{a.label}</p>
                  {a.schools?.name && (
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                      {a.schools.name}
                    </p>
                  )}
                </div>
                {a.is_active ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                    <CheckBadgeIcon className="w-3 h-3" /> Active
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Inactive
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-1 text-xs">
                <p className="text-foreground font-bold">{a.bank_name}</p>
                <p className="font-mono text-foreground">{a.account_number}</p>
                <p className="text-muted-foreground">{a.account_name}</p>
                {a.payment_note && (
                  <p className="text-[11px] text-muted-foreground italic border-t border-border pt-2 mt-2">
                    {a.payment_note}
                  </p>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => onEdit(a)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-background border border-border text-xs font-bold rounded-md hover:border-primary"
                >
                  <PencilIcon className="w-3 h-3" /> Edit
                </button>
                <button
                  onClick={() => onDelete(a)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold rounded-md hover:bg-rose-500/20"
                >
                  <TrashIcon className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AccountForm({
  form,
  setForm,
  editing,
  saving,
  onSave,
  onClose,
  isAdmin,
  isSchool,
  schools,
}: {
  form: AccountFormState;
  setForm: (f: AccountFormState) => void;
  editing: PaymentAccount | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  isAdmin: boolean;
  isSchool: boolean;
  schools: SchoolOption[];
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <p className="font-black text-foreground text-sm">
              {editing ? 'Edit account' : 'New collection account'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bank details that appear on invoices and receipts.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isAdmin && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                Owner
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['rillcod', 'school'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() =>
                      setForm({ ...form, owner_type: t, school_id: t === 'rillcod' ? null : form.school_id })
                    }
                    className={`px-3 py-2 text-xs font-black uppercase tracking-widest rounded-md border transition-colors ${
                      form.owner_type === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-border hover:border-primary'
                    }`}
                  >
                    {t === 'rillcod' ? 'Rillcod' : 'School'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isAdmin && form.owner_type === 'school' && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                School
              </label>
              <select
                value={form.school_id ?? ''}
                onChange={(e) => setForm({ ...form, school_id: e.target.value || null })}
                className="w-full text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary"
              >
                <option value="">Select school…</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isSchool && (
            <p className="text-[11px] bg-muted border border-border rounded-md px-3 py-2 text-muted-foreground">
              This account will be linked to your school automatically.
            </p>
          )}

          <Field
            label="Label"
            value={form.label}
            onChange={(v) => setForm({ ...form, label: v })}
            placeholder="Main GTB Collection"
          />
          <Field
            label="Bank name"
            value={form.bank_name}
            onChange={(v) => setForm({ ...form, bank_name: v })}
            placeholder="Guaranty Trust Bank"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Account number"
              value={form.account_number}
              onChange={(v) => setForm({ ...form, account_number: v.replace(/\s+/g, '') })}
              placeholder="0123456789"
              mono
            />
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                Type
              </label>
              <select
                value={form.account_type}
                onChange={(e) =>
                  setForm({ ...form, account_type: e.target.value as 'checking' | 'savings' })
                }
                className="w-full text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary"
              >
                <option value="checking">Checking / Current</option>
                <option value="savings">Savings</option>
              </select>
            </div>
          </div>
          <Field
            label="Account name"
            value={form.account_name}
            onChange={(v) => setForm({ ...form, account_name: v })}
            placeholder="Rillcod Technologies Ltd"
          />
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
              Payment note (optional)
            </label>
            <textarea
              value={form.payment_note}
              onChange={(e) => setForm({ ...form, payment_note: e.target.value })}
              placeholder="Please use your child's full name as reference."
              rows={2}
              className="w-full text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary"
            />
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-foreground">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />{' '}
            Active (show on invoices &amp; receipts)
          </label>
        </div>

        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest rounded-md disabled:opacity-50"
          >
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full text-sm border border-border bg-background px-3 py-2 rounded-md focus:outline-none focus:border-primary ${
          mono ? 'font-mono' : ''
        }`}
      />
    </div>
  );
}

export default AccountsPanel;
