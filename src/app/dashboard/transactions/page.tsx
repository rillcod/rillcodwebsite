'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  CreditCardIcon, MagnifyingGlassIcon, ArrowPathIcon,
  CheckCircleIcon, ClockIcon, XCircleIcon, ArrowDownTrayIcon,
  BuildingOfficeIcon, UserIcon, BanknotesIcon, ChevronDownIcon, ChevronUpIcon,
} from '@/lib/icons';

type Transaction = {
  id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: string;
  transaction_reference: string;
  created_at: string;
  paid_at: string | null;
  school_id: string | null;
  portal_user_id: string | null;
  invoice_id: string | null;
  course_id: string | null;
  receipt_url: string | null;
  paystack_fees?: number;
  portal_users?: { full_name: string; email: string } | null;
  schools?: { name: string } | null;
  courses?: { title: string } | null;
  receipts?: { receipt_number: string; pdf_url: string }[] | null;
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  completed: { label: 'Completed', icon: CheckCircleIcon, className: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  success:   { label: 'Completed', icon: CheckCircleIcon, className: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  pending:   { label: 'Pending',   icon: ClockIcon,       className: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
  processing:{ label: 'Processing',icon: ClockIcon,       className: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
  failed:    { label: 'Failed',    icon: XCircleIcon,     className: 'bg-rose-500/10 border-rose-500/20 text-rose-400' },
  refunded:  { label: 'Refunded',  icon: ArrowPathIcon,   className: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  paystack: 'Paystack',
  stripe: 'Stripe',
  cash: 'Cash',
  pos: 'POS',
  cheque: 'Cheque',
  online: 'Online',
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 border text-[10px] font-black uppercase tracking-widest ${cfg.className}`}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
}

export default function TransactionsPage() {
  const { profile, loading: authLoading } = useAuth();
  const db = createClient();

  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const isStaff = isAdmin || isSchool || profile?.role === 'teacher';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    let q = db
      .from('payment_transactions')
      .select('*, portal_users(full_name, email), schools(name), courses(title), receipts(receipt_number, pdf_url)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (isSchool && profile.school_id) q = q.eq('school_id', profile.school_id);

    const { data, error } = await q;
    if (!error && data) setTransactions(data as any);
    setLoading(false);
  }, [profile]);

  useEffect(() => { if (!authLoading && profile) load(); }, [authLoading, profile, load]);

  const filtered = useMemo(() => {
    let list = transactions;
    if (statusFilter !== 'all') {
      list = list.filter(t => t.payment_status === statusFilter || (statusFilter === 'completed' && t.payment_status === 'success'));
    }
    if (methodFilter !== 'all') list = list.filter(t => t.payment_method === methodFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.transaction_reference?.toLowerCase().includes(q) ||
        t.portal_users?.full_name?.toLowerCase().includes(q) ||
        t.portal_users?.email?.toLowerCase().includes(q) ||
        t.schools?.name?.toLowerCase().includes(q) ||
        t.courses?.title?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [transactions, statusFilter, methodFilter, search]);

  // Summary stats
  const stats = useMemo(() => {
    const completed = transactions.filter(t => t.payment_status === 'completed' || t.payment_status === 'success');
    return {
      total: transactions.length,
      completed: completed.length,
      revenue: completed.reduce((s, t) => s + t.amount, 0),
      pending: transactions.filter(t => t.payment_status === 'pending' || t.payment_status === 'processing').length,
    };
  }, [transactions]);

  const handleApprove = async (txId: string) => {
    if (!isAdmin || !confirm('Approve this transaction as successful?')) return;
    setApproving(txId);
    try {
      const res = await fetch('/api/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: txId, status: 'success' }),
      });
      const json = await res.json();
      if (json.success) await load();
      else alert(json.error || 'Approval failed');
    } catch { alert('Approval failed'); } finally { setApproving(null); }
  };

  if (authLoading) return null;
  if (!isStaff) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Access restricted to staff accounts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">Transactions</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">All payment records and transaction history</p>
        </div>
        <button onClick={load} disabled={loading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground text-xs sm:text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 min-h-[44px] sm:min-h-0">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Transactions', value: stats.total, color: 'text-foreground' },
          { label: 'Gross Revenue', value: `₦${stats.revenue.toLocaleString()}`, color: 'text-emerald-400' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-400' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border p-3 sm:p-4">
            <p className={`text-lg sm:text-xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-full sm:max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or reference…"
            className="w-full pl-10 pr-4 py-3 sm:py-2.5 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors min-h-[44px] sm:min-h-0"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-3 sm:py-2.5 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors min-h-[44px] sm:min-h-0">
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
          className="px-4 py-3 sm:py-2.5 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors min-h-[44px] sm:min-h-0">
          <option value="all">All Methods</option>
          {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Transaction count */}
      {!loading && (
        <p className="text-xs text-muted-foreground">
          Showing <span className="font-black text-foreground">{filtered.length}</span> of <span className="font-black text-foreground">{transactions.length}</span> transactions
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="bg-card border border-border h-16 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center">
          <CreditCardIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No transactions found</p>
          <p className="text-xs text-muted-foreground mt-1">{search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Transactions will appear here once payments are made.'}</p>
        </div>
      ) : (
        <div className="bg-card border border-border divide-y divide-border">
          {filtered.map(tx => {
            const isExpanded = expanded === tx.id;
            const receipt = tx.receipts?.[0];
            return (
              <div key={tx.id}>
                <div
                  className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 hover:bg-white/5 transition-all cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : tx.id)}
                >
                  {/* Method icon */}
                  <div className={`w-9 h-9 flex items-center justify-center flex-shrink-0 border ${
                    tx.payment_status === 'completed' || tx.payment_status === 'success' ? 'bg-emerald-500/10 border-emerald-500/20' :
                    tx.payment_status === 'pending' || tx.payment_status === 'processing' ? 'bg-amber-500/10 border-amber-500/20' :
                    'bg-rose-500/10 border-rose-500/20'
                  }`}>
                    <CreditCardIcon className={`w-4 h-4 ${
                      tx.payment_status === 'completed' || tx.payment_status === 'success' ? 'text-emerald-400' :
                      tx.payment_status === 'pending' || tx.payment_status === 'processing' ? 'text-amber-400' : 'text-rose-400'
                    }`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-foreground">
                        {tx.portal_users?.full_name ?? tx.schools?.name ?? 'Unknown'}
                      </span>
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">
                        {METHOD_LABELS[tx.payment_method] ?? tx.payment_method}
                      </span>
                      {tx.courses?.title && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400">
                          {tx.courses.title}
                        </span>
                      )}
                      {tx.invoice_id && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400">
                          Invoice
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                        {tx.transaction_reference}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-black text-foreground">₦{tx.amount.toLocaleString()}</p>
                      {tx.paystack_fees ? <p className="text-[9px] text-muted-foreground">+₦{tx.paystack_fees} fee</p> : null}
                    </div>
                    <StatusBadge status={tx.payment_status} />
                    {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDownIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-4 bg-background/40 border-t border-border space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Amount</p>
                        <p className="text-sm font-bold text-foreground">₦{tx.amount.toLocaleString()} {tx.currency}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Method</p>
                        <p className="text-sm font-bold text-foreground">{METHOD_LABELS[tx.payment_method] ?? tx.payment_method}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                        <StatusBadge status={tx.payment_status} />
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Paid At</p>
                        <p className="text-sm font-bold text-foreground">
                          {tx.paid_at ? new Date(tx.paid_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </p>
                      </div>
                      {tx.portal_users && (
                        <div className="col-span-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Payer</p>
                          <p className="text-sm font-bold text-foreground">{tx.portal_users.full_name}</p>
                          <p className="text-xs text-muted-foreground">{tx.portal_users.email}</p>
                        </div>
                      )}
                      {tx.schools && (
                        <div className="col-span-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">School</p>
                          <p className="text-sm font-bold text-foreground">{tx.schools.name}</p>
                        </div>
                      )}
                      <div className="col-span-2 sm:col-span-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Reference</p>
                        <p className="text-xs font-mono text-foreground break-all">{tx.transaction_reference}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {receipt?.pdf_url && (
                        <a href={receipt.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:border-emerald-500 transition-all">
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Receipt — {receipt.receipt_number}
                        </a>
                      )}
                      {tx.receipt_url && !receipt?.pdf_url && (
                        <a href={tx.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:border-emerald-500 transition-all">
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Download Receipt
                        </a>
                      )}
                      {isAdmin && (tx.payment_status === 'pending' || tx.payment_status === 'processing') && (
                        <button onClick={() => handleApprove(tx.id)} disabled={approving === tx.id}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-all">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          {approving === tx.id ? 'Approving…' : 'Approve Payment'}
                        </button>
                      )}
                      {tx.invoice_id && (
                        <a href={`/dashboard/payments/invoices/${tx.invoice_id}/edit`}
                          className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground text-[10px] font-black uppercase tracking-widest hover:border-foreground/30 hover:text-foreground transition-all">
                          View Invoice
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
