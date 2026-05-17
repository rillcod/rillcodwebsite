'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowPathIcon,
  CheckBadgeIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
} from '@/lib/icons';
import { buildSchoolInvoiceHTML } from '@/lib/finance/templates/html/school-invoice-html';
import { ScaledIframePreview } from './ScaledIframePreview';
import { DEFAULT_COMMISSION_RATE } from '@/lib/finance/streams';

interface SchoolRow {
  id: string;
  name: string;
  rillcod_quota_percent?: number | null;
  commission_rate?: number | null;
}

interface PaymentAccount {
  id: string;
  label: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  owner_type: 'rillcod' | 'school';
}

type PricingMode = 'per_student' | 'fixed_package' | 'tiered';
type Currency = 'NGN' | 'USD';

interface PricingTier {
  label: string;
  count: string;
  rate: string;
}

const CURRENT_YEAR = new Date().getFullYear();

type PaymentMode = 'bank_transfer' | 'cash' | 'pos' | 'cheque' | 'online';

const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  bank_transfer: 'Bank Transfer',
  cash: 'Cash Payment',
  pos: 'POS Terminal',
  cheque: 'Cheque',
  online: 'Online Payment',
};

const BLANK = {
  school_id: '',
  academic_year: String(CURRENT_YEAR),
  term_number: '1' as '1' | '2' | '3',
  pricing_mode: 'per_student' as PricingMode,
  rate_per_child: '',
  fixed_package_price: '',
  tiers: [{ label: '', count: '', rate: '' }] as PricingTier[],
  rillcod_quota_percent: '',
  currency: 'NGN' as Currency,
  payment_method: 'bank_transfer' as PaymentMode,
  notes: '',
  due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
  deposit_amount: '',
  pay_to_account_id: '',
  manual_student_count: '',
  show_revenue_share: true,
  show_whatsapp_option: true,
};

/**
 * SchoolInvoiceBuilderPanel (admin only)
 *
 * Specialised invoice builder for partner-school billing. Supports per-student
 * or fixed-package pricing, commission split (Rillcod % vs school %), deposit
 * offsets and a live HTML preview of the actual printable invoice.
 *
 * Saves into public.invoices with stream=school so it flows through the
 * finance_ledger, Money Hub and reconciliation dashboard seamlessly.
 */
interface SchoolInvoiceBuilderPanelProps {
  /** Pre-load an existing school invoice for editing (passed from OperationsHub via ?edit_invoice=) */
  editInvoiceId?: string;
}

export function SchoolInvoiceBuilderPanel({ editInvoiceId }: SchoolInvoiceBuilderPanelProps = {}) {
  const { profile } = useAuth();
  const db = createClient();
  const isAdmin = profile?.role === 'admin';

  const [form, setForm] = useState({ ...BLANK });
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile || !isAdmin) return;
    db.from('schools')
      .select('id, name, rillcod_quota_percent, commission_rate')
      .order('name')
      .then(({ data }) => setSchools((data ?? []) as SchoolRow[]));
    fetch('/api/payment-accounts')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setAccounts((j.data ?? []).filter((a: PaymentAccount) => a.owner_type === 'rillcod')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isAdmin]);

  // Load existing invoice when editInvoiceId prop arrives
  useEffect(() => {
    if (!editInvoiceId || !isAdmin) return;
    setLoadingEdit(true);
    fetch(`/api/invoices/${editInvoiceId}`)
      .then(r => r.json())
      .then(j => {
        const inv = j.data;
        if (!inv) return;
        setEditingInvoiceId(inv.id);
        // Reverse-map invoice fields back to form state
        const mainItems: Array<{ description: string; quantity: number; unit_price: number }> =
          Array.isArray(inv.items)
            ? inv.items.filter((it: any) => (it.unit_price ?? 0) > 0 && (it.quantity ?? 0) > 1)
            : [];
        const hasMultipleItems = mainItems.length > 1;
        const firstItem = mainItems[0] ?? (Array.isArray(inv.items) ? inv.items.find((it: any) => (it.unit_price ?? 0) > 0) : null);
        const isFixed = !hasMultipleItems && (!firstItem?.quantity || firstItem.quantity === 1);
        const pricingMode: PricingMode = hasMultipleItems ? 'tiered' : isFixed ? 'fixed_package' : 'per_student';
        const restoredTiers: PricingTier[] = hasMultipleItems
          ? mainItems.map((it) => ({
              label: it.description.split('—')[0]?.trim().split('–')[0]?.trim() ?? 'Students',
              count: String(it.quantity),
              rate: String(it.unit_price),
            }))
          : [{ label: '', count: '', rate: '' }];
        const meta = inv.metadata ?? {};
        setForm(f => ({
          ...f,
          school_id: inv.school_id ?? '',
          academic_year: String(meta.academic_year ?? CURRENT_YEAR),
          term_number: (['1','2','3'].includes(String(meta.term_number)) ? String(meta.term_number) : '1') as '1'|'2'|'3',
          pricing_mode: pricingMode,
          rate_per_child: pricingMode === 'per_student' ? String(firstItem?.unit_price ?? '') : '',
          fixed_package_price: pricingMode === 'fixed_package' ? String(firstItem?.unit_price ?? '') : '',
          tiers: restoredTiers,
          currency: (inv.currency ?? 'NGN') as Currency,
          payment_method: (meta.payment_method ?? 'bank_transfer') as PaymentMode,
          due_date: inv.due_date ? inv.due_date.split('T')[0] : f.due_date,
          notes: inv.notes ?? '',
          deposit_amount: '',
        }));
      })
      .catch(() => toast.error('Failed to load invoice for editing'))
      .finally(() => setLoadingEdit(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editInvoiceId, isAdmin]);

  // Auto-load student count when school selected
  useEffect(() => {
    if (!form.school_id) {
      setStudentCount(null);
      return;
    }
    setLoadingCount(true);
    db.from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('is_active', true)
      .eq('school_id', form.school_id)
      .then(({ count }) => {
        setStudentCount(count ?? 0);
        setLoadingCount(false);
      });

    const sch = schools.find((s) => s.id === form.school_id);
    if (!form.rillcod_quota_percent) {
      const quotaVal = sch?.rillcod_quota_percent ?? sch?.commission_rate ?? DEFAULT_COMMISSION_RATE;
      setForm((f) => ({ ...f, rillcod_quota_percent: String(quotaVal) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.school_id]);

  const computed = useMemo(() => {
    const isFixed = form.pricing_mode === 'fixed_package';
    const isTiered = form.pricing_mode === 'tiered';
    const count = parseInt(form.manual_student_count) || studentCount || 0;
    const ratePerChild = parseFloat(form.rate_per_child) || 0;
    const fixedPrice = parseFloat(form.fixed_package_price) || 0;
    const quotaPct = parseFloat(form.rillcod_quota_percent) || 0;

    const computedTiers = isTiered
      ? form.tiers.map((t) => {
          const c = parseInt(t.count) || 0;
          const r = parseFloat(t.rate) || 0;
          return { label: t.label || 'Students', count: c, rate: r, total: c * r };
        })
      : [] as Array<{ label: string; count: number; rate: number; total: number }>;

    const subtotal = isTiered
      ? computedTiers.reduce((s, t) => s + t.total, 0)
      : isFixed ? fixedPrice : ratePerChild * count;

    const deposit = parseFloat(form.deposit_amount) || 0;
    const revenueShareOn = form.show_revenue_share && quotaPct > 0;
    const rillcodShare = Math.round(subtotal * (quotaPct / 100));
    const schoolShare = subtotal - rillcodShare;
    const balance = revenueShareOn
      ? Math.max(0, rillcodShare - deposit)
      : Math.max(0, subtotal - deposit);

    return {
      isFixed,
      isTiered,
      computedTiers,
      count,
      ratePerChild,
      fixedPrice,
      quotaPct,
      subtotal,
      deposit,
      revenueShareOn,
      rillcodShare,
      schoolShare,
      balance,
    };
  }, [form, studentCount]);

  const previewHtml = useMemo(() => {
    const sch = schools.find((s) => s.id === form.school_id);
    if (!sch) {
      return `<html><body style="font-family:sans-serif;padding:32px;color:#9ca3af;background:#fff"><p style="font-size:14px">Select a school to see the live preview</p></body></html>`;
    }
    const payToAcc = accounts.find((a) => a.id === form.pay_to_account_id);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const dueStr = form.due_date
      ? new Date(form.due_date).toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '\u2014';

    return buildSchoolInvoiceHTML({
      sch,
      isFixed: computed.isFixed,
      isTiered: computed.isTiered,
      tiers: computed.computedTiers.length > 0 ? computed.computedTiers : undefined,
      count: computed.count,
      ratePerChild: computed.ratePerChild,
      fixedPrice: computed.fixedPrice,
      quotaPct: computed.quotaPct,
      subtotal: computed.subtotal,
      deposit: computed.deposit,
      rillcodShare: computed.rillcodShare,
      schoolShare: computed.schoolShare,
      balance: computed.balance,
      revenueShareOn: computed.revenueShareOn,
      dateStr,
      dueStr,
      docRef: editingInvoiceId ? `EDIT-${editingInvoiceId.slice(0, 8)}` : 'PREVIEW',
      payToAcc,
      showRevenueShare: form.show_revenue_share,
      showWhatsapp: form.show_whatsapp_option,
      paymentMethod: form.payment_method,
      notes: [
        `${['First','Second','Third'][parseInt(form.term_number)-1]} Term ${form.academic_year}/${parseInt(form.academic_year)+1}`,
        form.notes,
      ].filter(Boolean).join(' · '),
      currency: form.currency,
    });
  }, [form, computed, schools, accounts, editingInvoiceId]);

  const canProceed =
    !!form.school_id &&
    (form.pricing_mode === 'per_student'
      ? computed.ratePerChild > 0
      : form.pricing_mode === 'tiered'
      ? computed.subtotal > 0
      : computed.fixedPrice > 0);

  const handlePrint = () => {
    if (!canProceed) {
      toast.error(
        form.pricing_mode === 'per_student'
          ? 'Enter a rate per child first.'
          : 'Enter a fixed package price first.',
      );
      return;
    }
    const docRef = `SINV-${Date.now().toString(36).toUpperCase()}`;
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
    void handleSave({ silent: true, docRef });
  };

  const handleSave = async (opts?: { silent?: boolean; docRef?: string }) => {
    if (!canProceed) {
      if (!opts?.silent) toast.error('Complete required fields before saving.');
      return;
    }
    const sch = schools.find((s) => s.id === form.school_id);
    if (!sch) return;

    setSaving(true);
    try {
      const items = computed.isTiered
        ? computed.computedTiers.map((t) => ({
            description: `${t.label} \u2014 ${sch.name}`,
            quantity: t.count,
            unit_price: t.rate,
            total: t.total,
          }))
        : computed.isFixed
        ? [
            {
              description:
                'STEM Programme \u2014 School Package (All Students) \u00b7 Fixed Pricing',
              quantity: 1,
              unit_price: computed.subtotal,
              total: computed.subtotal,
            },
          ]
        : [
            {
              description: `STEM / AI / Coding Programme \u2014 ${sch.name}`,
              quantity: computed.count,
              unit_price: computed.ratePerChild,
              total: computed.subtotal,
            },
          ];

      const termLabel = `${['First','Second','Third'][parseInt(form.term_number) - 1]} Term ${form.academic_year}`;
      const dueISO =
        form.due_date ||
        new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

      const invPayload = {
        amount: computed.balance,
        currency: form.currency,
        status: 'sent' as const,
        due_date: dueISO,
        metadata: {
          academic_year: parseInt(form.academic_year),
          term_number: parseInt(form.term_number),
          term_label: termLabel,
          payment_method: form.payment_method,
          commission_rate: parseFloat(form.rillcod_quota_percent) || DEFAULT_COMMISSION_RATE,
        },
        items: computed.revenueShareOn
          ? [
              ...items,
              {
                description: `School Commission / Share (${100 - computed.quotaPct}%)`,
                quantity: 1,
                unit_price: -computed.schoolShare,
                total: -computed.schoolShare,
              },
              ...(computed.deposit > 0
                ? [
                    {
                      description: 'Less Previous Deposit / Payment',
                      quantity: 1,
                      unit_price: -computed.deposit,
                      total: -computed.deposit,
                    },
                  ]
                : []),
            ]
          : [
              ...items,
              ...(computed.deposit > 0
                ? [
                    {
                      description: 'Less Previous Deposit / Payment',
                      quantity: 1,
                      unit_price: -computed.deposit,
                      total: -computed.deposit,
                    },
                  ]
                : []),
            ],
        notes: form.notes || null,
      };

      if (editingInvoiceId) {
        const { error } = await db.from('invoices').update(invPayload).eq('id', editingInvoiceId);
        if (error) throw error;
        if (!opts?.silent) toast.success('Invoice updated.');
      } else {
        // Hard duplicate guard: block same school + same term + same year
        const { data: termDupes } = await db
          .from('invoices')
          .select('id, invoice_number, amount, status')
          .eq('school_id', form.school_id)
          .eq('stream', 'school')
          .not('status', 'eq', 'cancelled')
          .filter('metadata->>academic_year', 'eq', form.academic_year)
          .filter('metadata->>term_number', 'eq', form.term_number)
          .limit(5);

        if (!opts?.silent && termDupes && termDupes.length > 0) {
          const list = termDupes
            .map(i => `\u2022 ${i.invoice_number} \u2014 \u20a6${Number(i.amount).toLocaleString()} \u2014 ${(i.status ?? '').toUpperCase()}`)
            .join('\n');
          toast.error(
            `Invoice already exists for ${sch.name} \u2014 ${termLabel}:\n${list}\n\nEdit or delete the existing invoice instead.`,
            { duration: 8000 }
          );
          setSaving(false);
          return;
        }

        const docRef = opts?.docRef || `SINV-${Date.now().toString(36).toUpperCase()}`;
        const insertPayload = {
          ...invPayload,
          invoice_number: docRef,
          school_id: form.school_id,
          stream: 'school',
        };
        const { error } = await db
          .from('invoices')
          .insert(insertPayload);
        if (error) throw error;
        if (!opts?.silent) toast.success(`Invoice ${docRef} saved.`);
      }

      setEditingInvoiceId(null);
      if (!opts?.silent) setForm({ ...BLANK });
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="border border-dashed border-border rounded-xl p-10 text-center">
        <p className="text-sm font-bold text-foreground">Admin-only area</p>
        <p className="text-xs text-muted-foreground mt-1">
          School invoice building requires Rillcod admin access.
        </p>
      </div>
    );
  }

  if (loadingEdit) {
    return (
      <div className="flex items-center justify-center py-16 gap-3">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Loading invoice…</p>
      </div>
    );
  }

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-2xl overflow-hidden">
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-primary/20">
        <p className="text-xs font-black text-primary uppercase tracking-widest mb-0.5">
          {editingInvoiceId ? 'Edit School Invoice' : 'School Invoice Builder'}
        </p>
        <p className="text-foreground font-bold text-sm">
          {editingInvoiceId
            ? 'Update this partner-school invoice — adjust figures and click Update.'
            : 'Build a rich partner-school invoice with revenue-share split and live preview.'}
        </p>
        {editingInvoiceId && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest">
            Editing existing invoice
            <button
              onClick={() => { setEditingInvoiceId(null); setForm({ ...BLANK }); }}
              className="ml-1 hover:text-amber-200 transition-colors"
              title="Discard and start a new invoice"
            >✕</button>
          </div>
        )}
        {!editingInvoiceId && (
          <p className="text-[11px] text-muted-foreground mt-1">
            For term-based cohort billing prefer <b>Billing Cycles</b>. Use this for bespoke school
            packages or ad-hoc invoicing.
          </p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 p-4 sm:p-6 space-y-5">
          {/* School + pricing mode */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <Lbl>School</Lbl>
              <select
                value={form.school_id}
                onChange={(e) => setForm((f) => ({ ...f, school_id: e.target.value }))}
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
              >
                <option value="">— Select partner school —</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Lbl>Academic Year</Lbl>
              <select
                value={form.academic_year}
                onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))}
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
              >
                {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
                  <option key={y} value={String(y)}>{y}/{y + 1}</option>
                ))}
              </select>
            </div>

            <div>
              <Lbl>Term</Lbl>
              <div className="grid grid-cols-3 gap-1 border border-border rounded-md overflow-hidden">
                {(['1', '2', '3'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, term_number: t }))}
                    className={`py-2 text-[10px] font-black uppercase tracking-widest ${
                      form.term_number === t
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t === '1' ? '1st' : t === '2' ? '2nd' : '3rd'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Lbl>Pricing Mode</Lbl>
              <div className="grid grid-cols-3 gap-1 border border-border rounded-md overflow-hidden">
                {(['per_student', 'tiered', 'fixed_package'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, pricing_mode: m }))}
                    className={`py-2 text-[10px] font-black uppercase tracking-widest ${
                      form.pricing_mode === m
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m === 'per_student' ? 'Per student' : m === 'tiered' ? 'Tiered' : 'Fixed'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Lbl>Currency</Lbl>
              <select
                value={form.currency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currency: e.target.value as Currency }))
                }
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
              >
                <option value="NGN">NGN (₦)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>

            {form.pricing_mode === 'per_student' && (
              <>
                <div>
                  <Lbl>Student Count {studentCount != null ? `(auto: ${studentCount})` : ''}</Lbl>
                  <input
                    type="number"
                    min={0}
                    placeholder={studentCount != null ? String(studentCount) : 'auto-count'}
                    value={form.manual_student_count}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, manual_student_count: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <Lbl>Rate per Child (₦)</Lbl>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 5000"
                    value={form.rate_per_child}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, rate_per_child: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
                  />
                </div>
              </>
            )}

            {form.pricing_mode === 'fixed_package' && (
              <div className="sm:col-span-2">
                <Lbl>Fixed Package Price (₦)</Lbl>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 150000"
                  value={form.fixed_package_price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, fixed_package_price: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-primary/10 border border-primary/30 text-sm rounded-md focus:outline-none focus:border-primary font-bold"
                />
              </div>
            )}

            {form.pricing_mode === 'tiered' && (
              <div className="sm:col-span-2 lg:col-span-4 space-y-3">
                <Lbl>Student Tiers (group label · count · rate per student)</Lbl>
                <div className="space-y-2">
                  {form.tiers.map((tier, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        placeholder="e.g. Basic Students"
                        value={tier.label}
                        onChange={(e) =>
                          setForm((f) => {
                            const tiers = f.tiers.map((t, i) =>
                              i === idx ? { ...t, label: e.target.value } : t,
                            );
                            return { ...f, tiers };
                          })
                        }
                        className="flex-1 min-w-0 px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Count"
                        value={tier.count}
                        onChange={(e) =>
                          setForm((f) => {
                            const tiers = f.tiers.map((t, i) =>
                              i === idx ? { ...t, count: e.target.value } : t,
                            );
                            return { ...f, tiers };
                          })
                        }
                        className="w-20 px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary text-center"
                      />
                      <input
                        type="number"
                        min={0}
                        placeholder="Rate ₦"
                        value={tier.rate}
                        onChange={(e) =>
                          setForm((f) => {
                            const tiers = f.tiers.map((t, i) =>
                              i === idx ? { ...t, rate: e.target.value } : t,
                            );
                            return { ...f, tiers };
                          })
                        }
                        className="w-28 px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, tiers: f.tiers.filter((_, i) => i !== idx) }))
                        }
                        disabled={form.tiers.length === 1}
                        className="p-2 text-muted-foreground hover:text-red-400 disabled:opacity-25 transition-colors shrink-0"
                        title="Remove tier"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      tiers: [...f.tiers, { label: '', count: '', rate: '' }],
                    }))
                  }
                  className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                >
                  + Add tier
                </button>
              </div>
            )}

            <div>
              <Lbl>Rillcod Commission % (default: {DEFAULT_COMMISSION_RATE}%)</Lbl>
              <input
                type="number"
                min={0}
                max={100}
                placeholder={`default ${DEFAULT_COMMISSION_RATE}`}
                value={form.rillcod_quota_percent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rillcod_quota_percent: e.target.value }))
                }
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <Lbl>Due Date</Lbl>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <Lbl>Payment Mode</Lbl>
              <select
                value={form.payment_method}
                onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value as PaymentMode }))}
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
              >
                {(Object.entries(PAYMENT_MODE_LABELS) as [PaymentMode, string][]).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <Lbl>Deposit Made (₦)</Lbl>
              <input
                type="number"
                min={0}
                placeholder="Amount already paid"
                value={form.deposit_amount}
                onChange={(e) => setForm((f) => ({ ...f, deposit_amount: e.target.value }))}
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary font-bold"
              />
            </div>

            <div className="lg:col-span-2">
              <Lbl>Pay To (Rillcod Account)</Lbl>
              <select
                value={form.pay_to_account_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pay_to_account_id: e.target.value }))
                }
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
              >
                <option value="">— Select payment account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} ({a.bank_name})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <Lbl>Notes (optional)</Lbl>
              <input
                type="text"
                placeholder="e.g. First term 2025/2026 session"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-5 py-1">
              <Toggle
                checked={form.show_revenue_share}
                onChange={(v) => setForm((f) => ({ ...f, show_revenue_share: v }))}
                label="Revenue Share"
                activeClass="bg-primary"
              />
              <Toggle
                checked={form.show_whatsapp_option}
                onChange={(v) => setForm((f) => ({ ...f, show_whatsapp_option: v }))}
                label="WhatsApp Receipt"
                activeClass="bg-emerald-600"
              />
            </div>
          </div>

          {/* Computation summary */}
          {form.school_id && (
            <div className="bg-card border border-border rounded-xl p-4">
              {loadingCount ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <ArrowPathIcon className="w-4 h-4 animate-spin" /> Counting students…
                </div>
              ) : (
                <div className="flex flex-wrap gap-5 items-center">
                  {computed.isTiered ? (
                    computed.computedTiers.map((t, i) => (
                      <Stat
                        key={i}
                        label={`${t.label} (${t.count}×)`}
                        value={`₦${t.total.toLocaleString()}`}
                        tone="primary"
                      />
                    ))
                  ) : (
                    <>
                      <Stat label="Students" value={String(computed.count)} tone="primary" />
                      {!computed.isFixed && (
                        <Stat
                          label="Rate / Child"
                          value={`₦${computed.ratePerChild.toLocaleString()}`}
                        />
                      )}
                      {computed.isFixed && (
                        <Stat
                          label="Fixed Package"
                          value={`₦${computed.fixedPrice.toLocaleString()}`}
                          tone="primary"
                        />
                      )}
                    </>
                  )}
                  <Stat
                    label="Invoice Total"
                    value={`₦${computed.subtotal.toLocaleString()}`}
                  />
                  {computed.revenueShareOn && (
                    <>
                      <Stat
                        label={`Rillcod ${computed.quotaPct}%`}
                        value={`₦${computed.rillcodShare.toLocaleString()}`}
                        tone="primary"
                      />
                      <Stat
                        label={`School ${100 - computed.quotaPct}%`}
                        value={`₦${computed.schoolShare.toLocaleString()}`}
                      />
                    </>
                  )}
                  {computed.deposit > 0 && (
                    <Stat
                      label="Less Deposit"
                      value={`−₦${computed.deposit.toLocaleString()}`}
                      tone="emerald"
                    />
                  )}
                  <div className="bg-primary/10 px-4 py-2 rounded-md border border-primary/20">
                    <p className="text-[9px] font-black text-primary uppercase tracking-widest">
                      {computed.revenueShareOn ? 'Rillcod Outstanding' : 'Total Outstanding'}
                    </p>
                    <p className="text-2xl font-black text-foreground">
                      ₦{computed.balance.toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={!canProceed || saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-primary/40 hover:bg-primary/10 disabled:opacity-40 text-primary font-black text-[10px] uppercase tracking-widest rounded-md"
            >
              {saving ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheckIcon className="w-4 h-4" />
              )}
              {editingInvoiceId ? 'Update record only' : 'Generate & save record'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!canProceed || saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-black text-[10px] uppercase tracking-widest rounded-md shadow"
            >
              <DocumentTextIcon className="w-4 h-4" />
              {editingInvoiceId ? 'Update & print' : 'Generate & print invoice'}
            </button>
            {editingInvoiceId && (
              <button
                type="button"
                onClick={() => {
                  setEditingInvoiceId(null);
                  setForm({ ...BLANK });
                }}
                className="inline-flex items-center gap-1 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Cancel edit
              </button>
            )}
            {!editingInvoiceId && computed.balance > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-400">
                <CheckBadgeIcon className="w-3 h-3" />
                {computed.revenueShareOn
                  ? `Rillcod will collect ₦${computed.balance.toLocaleString()}`
                  : `Total due ₦${computed.balance.toLocaleString()}`}
              </span>
            )}
          </div>
        </div>

        {/* Live preview */}
        <div className="w-full lg:w-[460px] lg:flex-shrink-0 border-t lg:border-t-0 lg:border-l border-primary/20 bg-white/[0.02] p-4 sm:p-5 lg:self-start lg:sticky lg:top-6">
          <ScaledIframePreview html={previewHtml} label="Live Invoice Preview" />
        </div>
      </div>
    </div>
  );
}

// ── UI primitives ────────────────────────────────────────────────────

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
      {children}
    </label>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'primary' | 'emerald';
}) {
  const valueColor =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'emerald'
      ? 'text-emerald-400'
      : 'text-foreground';
  return (
    <div>
      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">
        {label}
      </p>
      <p className={`text-xl font-black ${valueColor}`}>{value}</p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  activeClass,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  activeClass: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-all flex items-center px-1 ${
          checked ? activeClass : 'bg-muted'
        }`}
        aria-pressed={checked}
      >
        <div
          className={`w-4 h-4 rounded-full bg-card transition-all ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition-colors">
        {label}
      </span>
    </label>
  );
}

export default SchoolInvoiceBuilderPanel;
