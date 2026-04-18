'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  BanknotesIcon, CalendarDaysIcon, CheckCircleIcon,
  ClockIcon, ExclamationTriangleIcon, ArrowPathIcon,
  BuildingOfficeIcon, CreditCardIcon, InformationCircleIcon,
} from '@/lib/icons';

function fmt(amount: number, currency = 'NGN') {
  const c = (currency || 'NGN').toUpperCase();
  const n = Number(amount) || 0;
  if (c === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  return `₦${n.toLocaleString('en-NG')}`;
}

function relDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  due:         { label: 'Due',       color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',    icon: ClockIcon },
  past_due:    { label: 'Past Due',  color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',       icon: ExclamationTriangleIcon },
  paid:        { label: 'Paid',      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircleIcon },
  cancelled:   { label: 'Cancelled', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',       icon: InformationCircleIcon },
  rolled_over: { label: 'Rolled Over', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',    icon: ArrowPathIcon },
};

export default function SchoolBillingPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [cycles, setCycles] = useState<any[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<any[]>([]);
  const [billingContact, setBillingContact] = useState<any>(null);
  const [school, setSchool] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && profile?.role !== 'school') {
      router.replace('/dashboard');
    }
  }, [authLoading, profile?.role, router]);

  useEffect(() => {
    if (!profile?.school_id) return;
    loadData();
  }, [profile?.school_id]); // eslint-disable-line

  const loadData = async () => {
    setLoading(true);
    const schoolId = profile?.school_id!;

    const [cyclesRes, accountsRes, contactRes, schoolRes] = await Promise.all([
      supabase
        .from('billing_cycles')
        .select('id, term_label, term_start_date, due_date, amount_due, currency, status, created_at')
        .eq('owner_school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(10),
      (supabase as any)
        .from('payment_accounts')
        .select('id, label, bank_name, account_number, account_name, payment_note, is_active')
        .or(`owner_type.eq.rillcod,and(owner_type.eq.school,school_id.eq.${schoolId})`)
        .eq('is_active', true),
      supabase
        .from('billing_contacts')
        .select('representative_name, representative_email, representative_whatsapp, notes')
        .eq('school_id', schoolId)
        .maybeSingle(),
      supabase
        .from('schools')
        .select('name, email, phone, commission_rate')
        .eq('id', schoolId)
        .maybeSingle(),
    ]);

    setCycles(cyclesRes.data ?? []);
    setPaymentAccounts(accountsRes.data ?? []);
    setBillingContact(contactRes.data ?? null);
    setSchool(schoolRes.data ?? null);
    setLoading(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-border border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  const activeCycle = cycles.find(c => c.status === 'due' || c.status === 'past_due');
  const totalOwed = cycles.filter(c => c.status === 'due' || c.status === 'past_due')
    .reduce((s, c) => s + Number(c.amount_due || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">My Billing</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {school?.name} — billing cycle and payment setup
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-bold rounded-none border border-border transition-colors"
        >
          <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-none p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Current Balance Due</p>
          <p className={`text-2xl font-black ${totalOwed > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {fmt(totalOwed)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {totalOwed > 0 ? 'Outstanding payment required' : 'All cycles settled'}
          </p>
        </div>
        <div className="bg-card border border-border rounded-none p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Active Cycle</p>
          <p className="text-lg font-black text-foreground truncate">{activeCycle?.term_label || '—'}</p>
          {activeCycle && (
            <p className="text-[11px] text-muted-foreground mt-1">Due {relDate(activeCycle.due_date)}</p>
          )}
        </div>
        <div className="bg-card border border-border rounded-none p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">School Contact</p>
          <p className="text-sm font-bold text-foreground truncate">{school?.email || '—'}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{school?.phone || 'No phone on file'}</p>
        </div>
      </div>

      {/* Billing Cycles */}
      <div className="bg-card border border-border rounded-none overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <CalendarDaysIcon className="w-4 h-4 text-orange-400" />
            <h2 className="font-black text-sm text-foreground">Billing Cycles</h2>
          </div>
        </div>
        {cycles.length === 0 ? (
          <div className="text-center py-12">
            <BanknotesIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No billing cycles found for your school.</p>
            <p className="text-muted-foreground text-xs mt-1">Contact support@rillcod.com if you believe this is an error.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {cycles.map(cycle => {
              const cfg = STATUS_CONFIG[cycle.status] ?? STATUS_CONFIG['due'];
              const Icon = cfg.icon;
              return (
                <div key={cycle.id} className="flex items-center gap-4 px-5 py-4">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-black ${cfg.color} shrink-0`}>
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-foreground truncate">{cycle.term_label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Due: {relDate(cycle.due_date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black ${cycle.status === 'paid' ? 'text-emerald-400' : cycle.status === 'past_due' ? 'text-rose-400' : 'text-foreground'}`}>
                      {fmt(cycle.amount_due, cycle.currency)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{cycle.currency || 'NGN'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment Instructions */}
      <div className="bg-card border border-border rounded-none overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <CreditCardIcon className="w-4 h-4 text-orange-400" />
            <h2 className="font-black text-sm text-foreground">Payment Accounts</h2>
          </div>
        </div>
        {paymentAccounts.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground text-sm">No payment accounts configured. Contact support@rillcod.com.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {paymentAccounts.map((acct: any) => (
              <div key={acct.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-black text-sm text-foreground">{acct.label}</p>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded-full">{acct.bank_name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">Account Number</p>
                    <p className="font-black text-foreground tracking-widest">{acct.account_number}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-0.5">Account Name</p>
                    <p className="font-bold text-foreground">{acct.account_name}</p>
                  </div>
                </div>
                {acct.payment_note && (
                  <p className="mt-3 text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-none border border-border">
                    {acct.payment_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Billing Contact */}
      {billingContact && (
        <div className="bg-card border border-border rounded-none overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <BuildingOfficeIcon className="w-4 h-4 text-orange-400" />
              <h2 className="font-black text-sm text-foreground">Billing Contact on File</h2>
            </div>
          </div>
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Name</p>
              <p className="font-bold text-foreground">{billingContact.representative_name || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">Email</p>
              <p className="font-bold text-foreground">{billingContact.representative_email || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">WhatsApp</p>
              <p className="font-bold text-foreground">{billingContact.representative_whatsapp || '—'}</p>
            </div>
          </div>
          {billingContact.notes && (
            <div className="px-5 pb-4">
              <p className="text-xs text-muted-foreground">{billingContact.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Footer note */}
      <div className="flex items-start gap-3 bg-muted/30 border border-border rounded-none p-4">
        <InformationCircleIcon className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          To update your billing contact or dispute a cycle, email{' '}
          <a href="mailto:support@rillcod.com" className="text-orange-400 font-bold hover:underline">support@rillcod.com</a>{' '}
          with your school name and billing reference.
        </p>
      </div>
    </div>
  );
}
