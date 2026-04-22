'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  PlusIcon,
  ReceiptPercentIcon,
  TrashIcon,
} from '@/lib/icons';
import { buildReceiptHTML } from '@/lib/finance/templates/html/receipt-html';
import { ScaledIframePreview } from './ScaledIframePreview';

type PaymentMethod = 'bank_transfer' | 'cash' | 'pos' | 'cheque' | 'online';
type PayerType = 'school' | 'student' | 'other';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

interface PaymentAccount {
  id: string;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  owner_type: 'rillcod' | 'school';
}

interface SchoolOption {
  id: string;
  name: string;
}

const BLANK_FORM = {
  school_id: '',
  payer_name: '',
  payer_type: 'school' as PayerType,
  payment_method: 'bank_transfer' as PaymentMethod,
  payment_date: new Date().toISOString().split('T')[0],
  reference: '',
  notes: '',
  pay_to_account_id: '',
  received_by: '',
  items: [
    { description: 'STEM / AI / Coding Programme Fee', quantity: 1, unit_price: 0 },
  ] as LineItem[],
};

/**
 * ReceiptBuilderPanel
 *
 * Manual receipt builder — used for offline payments (cash, POS, cheque,
 * bank-transfer) that the gateway didn't process. Generates a rich HTML
 * receipt, shows a live iframe preview, prints via a new window and saves
 * a portal record via /api/receipts.
 *
 * This complements the automated PDF receipts issued by /api/payments/receipt
 * (which fire on successful online transactions via pdfmake templates).
 */
export function ReceiptBuilderPanel() {
  const { profile } = useAuth();
  const db = createClient();
  const canManage = ['admin', 'school'].includes(profile?.role || '');
  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({ ...BLANK_FORM });
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    fetch('/api/payment-accounts')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setAccounts(j.data ?? []));
    if (isAdmin) {
      db.from('schools')
        .select('id, name')
        .order('name')
        .then(({ data }) => setSchools(data ?? []));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const totalAmount = useMemo(
    () => form.items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
    [form.items],
  );

  const previewHtml = useMemo(() => {
    const sch = form.school_id ? schools.find((s) => s.id === form.school_id) : null;
    const payToAcc = form.pay_to_account_id
      ? accounts.find((a) => a.id === form.pay_to_account_id)
      : null;
    const items = form.items.filter((i) => i.description && i.unit_price > 0);
    const payerLabel = form.payer_name || sch?.name || '\u2014 Enter payer name \u2014';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const payDateStr = form.payment_date
      ? new Date(form.payment_date).toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : dateStr;

    return buildReceiptHTML({
      docRef: form.reference || 'PREVIEW',
      dateStr,
      payDateStr,
      payerLabel,
      payerType: form.payer_type,
      paymentMethod: form.payment_method,
      receivedBy: form.received_by || 'Rillcod Technologies Representative',
      items: items.length > 0 ? items : form.items,
      totalAmount,
      payToAcc,
      notes: form.notes,
    });
  }, [form, schools, accounts, totalAmount]);

  const addItem = () =>
    setForm((f) => ({
      ...f,
      items: [...f.items, { description: '', quantity: 1, unit_price: 0 }],
    }));
  const removeItem = (i: number) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, patch: Partial<LineItem>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
    }));

  const handlePrint = () => {
    const items = form.items.filter((i) => i.description && i.unit_price > 0);
    if (items.length === 0) {
      toast.error('Add at least one line item with an amount.');
      return;
    }
    const docRef = form.reference || `RCPT-${Date.now().toString(36).toUpperCase()}`;
    const finalHtml = previewHtml.replace('PREVIEW', docRef);
    const w = window.open('', '_blank', 'width=900,height=800');
    if (!w) {
      toast.error('Pop-up blocked \u2014 please allow pop-ups to print.');
      return;
    }
    w.document.write(finalHtml);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 700);
    void handleSave({ silentDocRef: docRef });
  };

  const handleSave = async (opts?: { silentDocRef?: string }) => {
    const items = form.items.filter((i) => i.description && i.unit_price > 0);
    if (items.length === 0) {
      if (!opts?.silentDocRef) toast.error('Add at least one line item with an amount.');
      return;
    }
    const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const sch = form.school_id ? schools.find((s) => s.id === form.school_id) : null;
    const docRef =
      opts?.silentDocRef || form.reference || `RCPT-${Date.now().toString(36).toUpperCase()}`;
    const payToAcc = form.pay_to_account_id
      ? accounts.find((a) => a.id === form.pay_to_account_id)
      : null;

    setSaving(true);
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: form.school_id || null,
          amount: total,
          currency: 'NGN',
          metadata: {
            payer_name: form.payer_name || sch?.name,
            payer_type: form.payer_type,
            payment_method: form.payment_method,
            payment_date: form.payment_date,
            reference: docRef,
            received_by: form.received_by,
            notes: form.notes,
            items,
            deposit_account: payToAcc
              ? {
                  bank_name: payToAcc.bank_name,
                  account_number: payToAcc.account_number,
                  account_name: payToAcc.account_name,
                }
              : null,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to save receipt');
      }
      if (!opts?.silentDocRef) toast.success(`Receipt ${docRef} saved to portal.`);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to save receipt');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="border border-dashed border-border rounded-xl p-10 text-center">
        <p className="text-sm font-bold text-foreground">Staff-only area</p>
      </div>
    );
  }

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-primary/20">
        <p className="text-xs font-black text-primary uppercase tracking-widest mb-0.5">
          Receipt Builder
        </p>
        <p className="text-foreground font-bold text-sm">
          Build and print an official payment receipt for a school or student.
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Use this for offline payments (cash, POS, cheque, off-gateway transfers). Online Paystack
          receipts are issued automatically.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Form */}
        <div className="flex-1 min-w-0 p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Received From (Payer)"
              value={form.payer_name}
              onChange={(v) => setForm((f) => ({ ...f, payer_name: v }))}
              placeholder="School name, student name, or organisation"
            />
            <div>
              <Lbl>Payer Type</Lbl>
              <Select
                value={form.payer_type}
                onChange={(v) => setForm((f) => ({ ...f, payer_type: v as PayerType }))}
                options={[
                  { v: 'school', l: 'School / Institution' },
                  { v: 'student', l: 'Student / Parent' },
                  { v: 'other', l: 'Other' },
                ]}
              />
            </div>
            {isAdmin && (
              <div>
                <Lbl>Link to School (optional)</Lbl>
                <Select
                  value={form.school_id}
                  onChange={(v) => setForm((f) => ({ ...f, school_id: v }))}
                  options={[
                    { v: '', l: '\u2014 No school link \u2014' },
                    ...schools.map((s) => ({ v: s.id, l: s.name })),
                  ]}
                />
              </div>
            )}
            <div>
              <Lbl>Payment Method</Lbl>
              <Select
                value={form.payment_method}
                onChange={(v) => setForm((f) => ({ ...f, payment_method: v as PaymentMethod }))}
                options={[
                  { v: 'bank_transfer', l: 'Bank Transfer' },
                  { v: 'cash', l: 'Cash' },
                  { v: 'pos', l: 'POS Terminal' },
                  { v: 'cheque', l: 'Cheque' },
                  { v: 'online', l: 'Online Payment' },
                ]}
              />
            </div>
            <div>
              <Lbl>Payment Date</Lbl>
              <input
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
              />
            </div>
            <Field
              label="Receipt Reference (auto if blank)"
              value={form.reference}
              onChange={(v) => setForm((f) => ({ ...f, reference: v }))}
              placeholder="e.g. RCPT-2026-001"
            />
            <Field
              label="Received By / Signatory"
              value={form.received_by}
              onChange={(v) => setForm((f) => ({ ...f, received_by: v }))}
              placeholder="e.g. Admin, Finance Officer"
            />
            <div>
              <Lbl>Deposited To (Account)</Lbl>
              <Select
                value={form.pay_to_account_id}
                onChange={(v) => setForm((f) => ({ ...f, pay_to_account_id: v }))}
                options={[
                  { v: '', l: '\u2014 Select account \u2014' },
                  ...accounts.map((a) => ({
                    v: a.id,
                    l: `${a.label} \u2014 ${a.bank_name}`,
                  })),
                ]}
              />
            </div>
            <div className="sm:col-span-2">
              <Field
                label="Notes (optional)"
                value={form.notes}
                onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder="e.g. First term 2025/2026 coding club payment"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Lbl>Line Items</Lbl>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1 text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest"
              >
                <PlusIcon className="w-3 h-3" /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    className="flex-1 px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(idx, { quantity: parseInt(e.target.value) || 1 })
                      }
                      className="w-16 px-2 py-2 bg-card border border-border text-sm text-center rounded-md focus:outline-none focus:border-primary"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Unit ₦"
                      value={item.unit_price || ''}
                      onChange={(e) =>
                        updateItem(idx, { unit_price: parseFloat(e.target.value) || 0 })
                      }
                      className="w-28 px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
                    />
                    <span className="text-sm font-black text-emerald-400 w-24 text-right flex-shrink-0">
                      ₦{(item.quantity * item.unit_price).toLocaleString()}
                    </span>
                    {form.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-rose-400 hover:text-rose-300"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2">
              <div className="bg-emerald-500/10 border border-emerald-500/20 px-5 py-2 rounded-md">
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  Total:{' '}
                </span>
                <span className="text-lg font-black text-emerald-300">
                  ₦{totalAmount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              onClick={handlePrint}
              disabled={
                !form.payer_name || form.items.every((i) => i.unit_price === 0) || saving
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-widest rounded-md shadow"
            >
              <ReceiptPercentIcon className="w-4 h-4" /> Print Receipt
            </button>
            <button
              onClick={() => handleSave()}
              disabled={
                saving || !form.payer_name || form.items.every((i) => i.unit_price === 0)
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black text-xs uppercase tracking-widest rounded-md shadow"
            >
              {saving ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowDownTrayIcon className="w-4 h-4" />
              )}
              Save to Portal
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="w-full lg:w-[460px] lg:flex-shrink-0 border-t lg:border-t-0 lg:border-l border-primary/20 bg-white/[0.02] p-4 sm:p-5 lg:self-start lg:sticky lg:top-6">
          <ScaledIframePreview html={previewHtml} label="Live Receipt Preview" />
        </div>
      </div>
    </div>
  );
}

// ── Tiny UI primitives ────────────────────────────────────────────────

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
      {children}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Lbl>{label}</Lbl>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
      />
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

export default ReceiptBuilderPanel;
