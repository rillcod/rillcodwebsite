// @refresh reset
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import SmartDocument from '@/components/finance/SmartDocument';
import { createClient } from '@/lib/supabase/client';
import {
  BanknotesIcon, PlusIcon, PencilIcon, TrashIcon,
  XMarkIcon, CheckIcon, BuildingOfficeIcon, ShieldCheckIcon,
  InformationCircleIcon, ClockIcon, CreditCardIcon, ArrowTrendingUpIcon,
  MagnifyingGlassIcon, DocumentTextIcon, ReceiptPercentIcon,
  ArrowPathIcon, EnvelopeIcon, ArrowDownTrayIcon, CheckBadgeIcon, UserGroupIcon,
} from '@/lib/icons';
import Link from 'next/link';

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
  schools?: { name: string; rillcod_quota_percent: number | null } | null;
};

type PaymentTransaction = {
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
  course_id: string | null;
  invoice_id: string | null;
  portal_users?: { full_name: string; email: string } | null;
  schools?: { name: string; rillcod_quota_percent: number | null } | null;
  courses?: { title: string } | null;
  paystack_fees?: number;
  receipt_url?: string | null;
  receipts?: { receipt_number: string; pdf_url: string }[] | null;
};

type Invoice = {
  id: string;
  invoice_number: string;
  school_id: string | null;
  portal_user_id: string | null;
  amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  due_date: string;
  items: any[];
  notes: string | null;
  created_at: string;
  portal_users?: { full_name: string; email: string } | null;
  schools?: { name: string } | null;
};

type ReceiptMeta = {
  payer_name?: string;
  payer_type?: string;
  payment_method?: string;
  payment_date?: string;
  reference?: string;
  received_by?: string;
  notes?: string;
  items?: { description: string; quantity: number; unit_price: number; total?: number }[];
  deposit_account?: { bank_name: string; account_number: string; account_name: string } | null;
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
    <div className={`bg-card shadow-sm border rounded-none p-5 space-y-3 ${isRillcod ? 'border-primary/30' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-none flex items-center justify-center flex-shrink-0 ${isRillcod ? 'bg-primary/20' : 'bg-muted'}`}>
            {isRillcod
              ? <ShieldCheckIcon className="w-5 h-5 text-primary" />
              : <BuildingOfficeIcon className="w-5 h-5 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <p className="font-black text-foreground text-sm truncate">{account.label}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
              {isRillcod ? 'Rillcod Technologies' : (account.schools?.name ?? 'School Account')}
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
                className="p-2 hover:bg-muted rounded-none transition-colors">
                <PencilIcon className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
              <button onClick={() => onDelete(account.id)}
                className="p-2 hover:bg-rose-500/20 rounded-none transition-colors">
                <TrashIcon className="w-4 h-4 text-rose-400/60 hover:text-rose-400" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-white/[0.03] border border-border rounded-none px-4 py-3">
          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Bank</p>
          <p className="font-bold text-foreground text-[13px]">{account.bank_name}</p>
        </div>
        <div className="bg-white/[0.03] border border-border rounded-none px-4 py-3">
          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Account Type</p>
          <p className="font-bold text-foreground text-[13px] capitalize">{account.account_type}</p>
        </div>
        <div className="col-span-2 bg-white/[0.03] border border-border rounded-none px-4 py-3">
          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Account Name</p>
          <p className="font-bold text-foreground text-[13px]">{account.account_name}</p>
        </div>
        <div className="col-span-2 bg-primary/10 border border-primary/20 rounded-none px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-primary/70 uppercase tracking-widest mb-1">Account Number</p>
            <p className="font-black text-white text-lg tracking-[0.15em]">{account.account_number}</p>
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(account.account_number)}
            className="text-[10px] font-bold text-primary/70 hover:text-primary transition-colors px-2 py-1 bg-primary/10 rounded-none"
          >
            Copy
          </button>
        </div>
      </div>

      {account.payment_note && (
        <div className="flex gap-2 bg-white/[0.04] border border-white/[0.08] rounded-none px-3 py-2">
          <InformationCircleIcon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400">{account.payment_note}</p>
        </div>
      )}
    </div>
  );
}


// ── Scaled iframe preview (shows actual document HTML, mobile-responsive) ──
function ScaledIframePreview({ html, label }: { html: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.48);
  const [height, setHeight] = useState(1100);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / 900);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{label}</p>
      <div ref={containerRef} className="w-full overflow-hidden rounded-sm bg-white" style={{ height: height * scale }}>
        <div style={{ width: 900, transformOrigin: 'top left', transform: `scale(${scale})` }}>
          <iframe
            srcDoc={html}
            style={{ width: 900, height, border: 'none', display: 'block' }}
            onLoad={e => {
              try {
                const h = (e.target as HTMLIFrameElement).contentDocument?.body?.scrollHeight;
                if (h && h > 100) setHeight(h + 32);
              } catch { /**/ }
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── School Invoice HTML builder ─────────────────────────────────────────────
function buildSchoolInvHTML(p: {
  sch: { name: string }; isFixed: boolean; count: number; ratePerChild: number;
  fixedPrice: number; quotaPct: number; subtotal: number; deposit: number;
  rillcodShare: number; schoolShare: number; balance: number; revenueShareOn: boolean;
  dateStr: string; dueStr: string; docRef: string;
  payToAcc?: { bank_name: string; account_number: string; account_name: string } | null;
  showRevenueShare: boolean; showWhatsapp: boolean; notes: string;
}): string {
  const { sch, isFixed, count, ratePerChild, fixedPrice, quotaPct, subtotal, deposit,
    rillcodShare, schoolShare, balance, revenueShareOn, dateStr, dueStr, docRef,
    payToAcc, showRevenueShare, showWhatsapp, notes } = p;
  const fmtNGN = (n: number) => `₦${n.toLocaleString('en-NG')}`;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>School Invoice — ${sch.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:22px 24px}
@page{size:A4;margin:14mm 15mm}
@media print{body{padding:0}}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:4px solid #7c3aed;padding-bottom:14px;margin-bottom:18px}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-img{width:56px;height:56px;object-fit:contain}
.org-name{font-size:22px;font-weight:900;color:#7c3aed;letter-spacing:-0.4px}
.org-sub{font-size:10px;color:#6b7280;margin-top:1px;font-weight:600}
.inv-badge{text-align:right}
.inv-label{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.inv-number{font-size:24px;font-weight:900;color:#4c1d95;letter-spacing:-0.5px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}
.party-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
.party-label{font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.party-name{font-size:15px;font-weight:900;color:#111827}
.party-sub{font-size:11px;color:#6b7280;margin-top:2px;line-height:1.4}
.meta-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.meta-cell{flex:1;min-width:120px;background:#f3f0ff;border:1px solid #7c3aed22;border-radius:8px;padding:10px 12px;text-align:center}
.meta-label{font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.meta-val{font-size:15px;font-weight:900;color:#4c1d95}
table{width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden}
thead tr{background:#4c1d95;color:white}
thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
tbody tr{border-bottom:1px solid #e5e7eb}
tbody tr:nth-child(even){background:#f9fafb}
tbody td{padding:8px 12px;font-size:12px;color:#374151}
.totals-box{background:#f3f0ff;border:1px solid #7c3aed22;border-radius:8px;padding:16px;margin-bottom:12px;display:flex;flex-direction:column;gap:6px}
.totals-row{display:flex;justify-content:space-between;align-items:center}
.totals-label{font-size:11px;color:#6b7280}
.totals-val{font-size:12px;font-weight:700;color:#374151}
.totals-grand-label{font-size:14px;font-weight:900;color:#4c1d95}
.totals-grand-val{font-size:20px;font-weight:900;color:#4c1d95}
.balance-box{background:#fff7ed;border:2px solid #ea580c;padding:12px 16px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.balance-label{font-size:12px;font-weight:900;color:#9a3412;text-transform:uppercase;letter-spacing:1px}
.balance-val{font-size:22px;font-weight:950;color:#ea580c}
.revenue-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.split-box{border-radius:8px;padding:12px 16px;text-align:center}
.split-rillcod{background:linear-gradient(135deg,#7c3aed11,#4f46e511);border:1px solid #7c3aed44}
.split-school{background:linear-gradient(135deg,#05966911,#059669aa11);border:1px solid #05966944}
.split-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.split-pct{font-size:14px;font-weight:900}
.split-amount{font-size:18px;font-weight:900;margin-top:2px}
.split-sub{font-size:9px;color:#9ca3af;margin-top:2px}
.bank-box{background:#f8fafc;border:1px solid #33415522;border-radius:8px;padding:14px;margin-bottom:18px}
.bank-title{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bank-cell{font-size:11px}
.bank-label{color:#94a3b8;font-weight:700;display:block;margin-bottom:1px;font-size:9px}
.bank-val{color:#334155;font-weight:800}
.notes-box{background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:11px;color:#92400e}
.footer{border-top:1px solid #e5e7eb;padding-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:8px}
.sig-box{text-align:center}
.sig-line{border-bottom:1px solid #374151;height:34px;margin-bottom:5px}
.sig-label{font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}
.watermark{text-align:center;margin-top:12px;font-size:8px;color:#9ca3af}
.status-paid{color:#059669;background:#d1fae5;padding:2px 10px;border-radius:20px;font-weight:800;font-size:11px}
.status-due{color:#d97706;background:#fef3c7;padding:2px 10px;border-radius:20px;font-weight:800;font-size:11px}
hr{border:none;border-top:1px solid #7c3aed22;margin:8px 0}
</style></head><body>
<div class="header">
  <div class="logo-block">
    <img src="/logo.png" class="logo-img" />
    <div>
      <div class="org-name">RILLCOD TECHNOLOGIES</div>
      <div class="org-sub">STEM, Robotics &amp; AI Education Partner</div>
      <div style="font-size:9px;color:#7c3aed;margin-top:2px;font-weight:700">www.rillcod.com · support@rillcod.com · 08116600091</div>
    </div>
  </div>
  <div class="inv-badge">
    <div class="inv-label">School Invoice</div>
    <div class="inv-number">${docRef}</div>
    <div style="font-size:10px;color:#6b7280;margin-top:4px"><b>Date:</b> ${dateStr}</div>
    <div style="font-size:10px;color:#6b7280"><b>Due:</b> ${dueStr}</div>
    <div style="margin-top:6px"><span class="${balance <= 0 ? 'status-paid' : 'status-due'}">${balance <= 0 ? 'Fully Paid' : 'Awaiting Payment'}</span></div>
  </div>
</div>
<div class="parties">
  <div class="party-box">
    <div class="party-label">From (Billed By)</div>
    <div class="party-name">RILLCOD TECHNOLOGIES</div>
    <div class="party-sub">STEM, Robotics &amp; AI Education Provider<br/>Technology &amp; Innovation Specialists</div>
  </div>
  <div class="party-box">
    <div class="party-label">To (Bill To)</div>
    <div class="party-name">${sch.name}</div>
    <div class="party-sub">School Partner — Academic Session Invoice<br/>Payment due by ${dueStr}</div>
  </div>
</div>
<div class="meta-row">
  ${isFixed
    ? `<div class="meta-cell" style="background:#fff7ed;border-color:#ea580c33"><div class="meta-label" style="color:#ea580c">Pricing</div><div class="meta-val" style="color:#ea580c;font-size:11px">Fixed Package</div></div>`
    : `<div class="meta-cell"><div class="meta-label">Students</div><div class="meta-val">${count}</div></div>
       <div class="meta-cell"><div class="meta-label">Rate / Child</div><div class="meta-val">${fmtNGN(ratePerChild)}</div></div>`
  }
  <div class="meta-cell"><div class="meta-label">Package Price</div><div class="meta-val">${fmtNGN(subtotal)}</div></div>
  ${showRevenueShare ? `
  <div class="meta-cell"><div class="meta-label">Rillcod %</div><div class="meta-val">${quotaPct}%</div></div>
  <div class="meta-cell"><div class="meta-label">School %</div><div class="meta-val">${100 - quotaPct}%</div></div>
  ` : ''}
</div>
<table>
<thead><tr>
  <th>Description</th>
  ${isFixed ? '' : '<th style="text-align:center">Students</th><th style="text-align:right">Rate / Child</th>'}
  <th style="text-align:right">Amount</th>
</tr></thead>
<tbody>
  <tr>
    <td>
      <b>${isFixed ? 'STEM / AI / Coding — Fixed School Package' : 'STEM / AI / Coding Programme Fee'}</b>
      <br><span style="font-size:10px;color:#9ca3af">${sch.name} · ${isFixed ? 'All students included — compulsory school programme' : 'Academic Term'}</span>
    </td>
    ${isFixed ? '' : `<td style="text-align:center;font-weight:700">${count}</td><td style="text-align:right">${fmtNGN(ratePerChild)}</td>`}
    <td style="text-align:right;font-weight:700">${fmtNGN(subtotal)}</td>
  </tr>
</tbody>
</table>
<div class="totals-box">
  <div class="totals-row">
    <span class="totals-label">${isFixed ? `Fixed Package Price` : `Total Fee (${count} students × ${fmtNGN(ratePerChild)})`}</span>
    <span class="totals-val">${fmtNGN(subtotal)}</span>
  </div>
  ${revenueShareOn ? `
  <div class="totals-row">
    <span class="totals-label">Less School Commission / Share (${100 - quotaPct}%)</span>
    <span class="totals-val" style="color:#f43f5e">(${fmtNGN(schoolShare)})</span>
  </div>
  ` : ''}
  <div class="totals-row"><span class="totals-label">Less Deposit / Previous Payment</span><span class="totals-val" style="color:#059669">(${fmtNGN(deposit)})</span></div>
  <hr/>
  <div class="totals-row"><span class="totals-grand-label">Total Payable Amount</span><span class="totals-grand-val">${fmtNGN(balance)}</span></div>
</div>

${balance > 0 ? `
<div class="balance-box">
  <div class="balance-label">${revenueShareOn ? 'Net Rillcod Balance' : 'Outstanding Balance'}</div>
  <div class="balance-val">${fmtNGN(balance)}</div>
</div>
` : ''}

${revenueShareOn ? `
<div style="font-size:11px;font-weight:800;color:#4c1d95;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Revenue Allocation &amp; Split</div>
<div class="revenue-split">
  <div class="split-box split-rillcod">
    <div class="split-label" style="color:#7c3aed">RILLCOD TECHNOLOGIES</div>
    <div class="split-pct" style="color:#7c3aed">${quotaPct}% Share</div>
    <div class="split-amount" style="color:#4c1d95">${fmtNGN(rillcodShare)}</div>
    ${deposit > 0 ? `<div style="font-size:9px; color:#7c3aed; margin-top:2px">Less Deposit: ${fmtNGN(deposit)}</div>
    <div style="font-size:11px; font-weight:900; margin-top:4px; padding-top:4px; border-top:1px solid #7c3aed22">Net: ${fmtNGN(balance)}</div>` : ''}
    <div class="split-sub" style="margin-top:6px">Final amount to be remitted</div>
  </div>
  <div class="split-box split-school">
    <div class="split-label" style="color:#059669">${sch.name}</div>
    <div class="split-pct" style="color:#059669">${100 - quotaPct}% Share</div>
    <div class="split-amount" style="color:#065f46">${fmtNGN(schoolShare)}</div>
    <div class="split-sub" style="margin-top:6px">School's retained portion</div>
  </div>
</div>
` : ''}

${payToAcc ? `
<div class="bank-box">
  <div class="bank-title">Payment Instructions (Pay To)</div>
  <div class="bank-grid">
    <div class="bank-cell"><span class="bank-label">Bank Name</span><span class="bank-val">${payToAcc.bank_name}</span></div>
    <div class="bank-cell"><span class="bank-label">Account Number</span><span class="bank-val" style="font-size:14px;letter-spacing:1px">${payToAcc.account_number}</span></div>
    <div class="bank-cell" style="grid-column: span 2"><span class="bank-label">Account Name</span><span class="bank-val">${payToAcc.account_name}</span></div>
  </div>
</div>
` : ''}

${showWhatsapp ? `
<div style="background:#dcfce7; border:1px solid #16a34a33; border-radius:8px; padding:10px 14px; margin-bottom:18px; font-size:11px; color:#166534; display:flex; align-items:center; gap:8px">
  <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.393 0 12.03c0 2.12.554 4.189 1.604 6.046L0 24l6.109-1.603a11.803 11.803 0 005.937 1.597h.005c6.632 0 12.029-5.392 12.032-12.029a11.77 11.77 0 00-3.517-8.482z"/></svg>
  <span><b>WhatsApp Receipt:</b> Digital confirmation should be forwarded to the Tech Hub Admin or Director (08116600091) upon payment.</span>
</div>
` : ''}

${notes ? `<div class="notes-box"><b>Notes:</b> ${notes}</div>` : ''}
<div class="footer">
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">School Principal / Authority</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Rillcod Technologies Representative</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Finance Officer / Stamp</div></div>
</div>
<div class="watermark">This is a computer-generated invoice from Rillcod Technologies · Reference: ${docRef} · ${dateStr}</div>
</body></html>`;
  return html;
}

// ── Receipt HTML builder ────────────────────────────────────────────────────
function buildReceiptHTML(p: {
  docRef: string; dateStr: string; payDateStr: string;
  payerLabel: string; payerType: string; paymentMethod: string;
  receivedBy: string; items: { description: string; quantity: number; unit_price: number }[];
  totalAmount: number;
  payToAcc?: { bank_name: string; account_number: string; account_name: string } | null;
  notes: string;
}): string {
  const { docRef, dateStr, payDateStr, payerLabel, payerType, paymentMethod,
    receivedBy, items, totalAmount, payToAcc, notes } = p;
  const fmtNGN = (n: number) => `₦${n.toLocaleString('en-NG')}`;
  const methodLabels: Record<string, string> = {
    bank_transfer: 'Bank Transfer', cash: 'Cash', pos: 'POS Terminal', cheque: 'Cheque', online: 'Online Payment',
  };
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Payment Receipt — ${payerLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:22px 24px}
@page{size:A4;margin:14mm 15mm}
@media print{body{padding:0}.no-print{display:none}}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:4px solid #059669;padding-bottom:14px;margin-bottom:18px}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-img{width:56px;height:56px;object-fit:contain}
.org-name{font-size:22px;font-weight:900;color:#059669;letter-spacing:-0.4px}
.org-sub{font-size:10px;color:#6b7280;margin-top:1px;font-weight:600}
.rcpt-badge{text-align:right}
.rcpt-label{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.rcpt-number{font-size:24px;font-weight:900;color:#065f46;letter-spacing:-0.5px}
.paid-stamp{display:inline-block;border:3px solid #059669;color:#059669;font-weight:900;font-size:18px;text-transform:uppercase;letter-spacing:3px;padding:4px 14px;border-radius:6px;transform:rotate(-5deg);margin-top:6px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}
.party-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
.party-label{font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.party-name{font-size:15px;font-weight:900;color:#111827}
.party-sub{font-size:11px;color:#6b7280;margin-top:2px;line-height:1.4}
.meta-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.meta-cell{flex:1;min-width:120px;background:#f0fdf4;border:1px solid #05966922;border-radius:8px;padding:10px 12px;text-align:center}
.meta-label{font-size:8px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.meta-val{font-size:14px;font-weight:900;color:#065f46}
table{width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden}
thead tr{background:#065f46;color:white}
thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
tbody tr{border-bottom:1px solid #e5e7eb}
tbody tr:nth-child(even){background:#f9fafb}
tbody td{padding:8px 12px;font-size:12px;color:#374151}
.totals-box{background:#f0fdf4;border:1px solid #05966922;border-radius:8px;padding:16px;margin-bottom:20px}
.totals-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.totals-label{font-size:11px;color:#6b7280}
.totals-val{font-size:12px;font-weight:700;color:#374151}
.totals-grand-label{font-size:14px;font-weight:900;color:#065f46}
.totals-grand-val{font-size:22px;font-weight:900;color:#059669}
.bank-box{background:#f8fafc;border:1px solid #33415522;border-radius:8px;padding:14px;margin-bottom:18px}
.bank-title{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bank-cell{font-size:11px}
.bank-label{color:#94a3b8;font-weight:700;display:block;margin-bottom:1px;font-size:9px}
.bank-val{color:#334155;font-weight:800}
.notes-box{background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:11px;color:#92400e}
.footer{border-top:1px solid #e5e7eb;padding-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:8px}
.sig-box{text-align:center}
.sig-line{border-bottom:1px solid #374151;height:34px;margin-bottom:5px}
.sig-label{font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}
.watermark{text-align:center;margin-top:12px;font-size:8px;color:#9ca3af}
hr{border:none;border-top:1px solid #05966922;margin:8px 0}
</style></head><body>
<div class="header">
  <div class="logo-block">
    <img src="/logo.png" class="logo-img" onerror="this.style.display='none'" />
    <div>
      <div class="org-name">RILLCOD TECHNOLOGIES</div>
      <div class="org-sub">STEM, Robotics &amp; AI Education Partner</div>
      <div style="font-size:9px;color:#059669;margin-top:2px;font-weight:700">www.rillcod.com · support@rillcod.com · 08116600091</div>
    </div>
  </div>
  <div class="rcpt-badge">
    <div class="rcpt-label">Official Receipt</div>
    <div class="rcpt-number">${docRef}</div>
    <div style="font-size:10px;color:#6b7280;margin-top:4px"><b>Issued:</b> ${dateStr}</div>
    <div style="font-size:10px;color:#6b7280"><b>Payment Date:</b> ${payDateStr}</div>
    <div class="paid-stamp">PAID</div>
  </div>
</div>

<div class="parties">
  <div class="party-box">
    <div class="party-label">Received By</div>
    <div class="party-name">RILLCOD TECHNOLOGIES</div>
    <div class="party-sub">STEM, Robotics &amp; AI Education Provider<br/>Technology &amp; Innovation Specialists</div>
  </div>
  <div class="party-box">
    <div class="party-label">Received From</div>
    <div class="party-name">${payerLabel}</div>
    <div class="party-sub">${payerType === 'school' ? 'School Partner' : payerType === 'student' ? 'Enrolled Student' : 'Client'}<br/>Payment Method: <b>${methodLabels[paymentMethod] || paymentMethod}</b></div>
  </div>
</div>

<div class="meta-row">
  <div class="meta-cell"><div class="meta-label">Amount Paid</div><div class="meta-val">${fmtNGN(totalAmount)}</div></div>
  <div class="meta-cell"><div class="meta-label">Payment Method</div><div class="meta-val" style="font-size:11px">${methodLabels[paymentMethod] || ''}</div></div>
  <div class="meta-cell"><div class="meta-label">Payment Date</div><div class="meta-val" style="font-size:11px">${payDateStr}</div></div>
  <div class="meta-cell"><div class="meta-label">Reference</div><div class="meta-val" style="font-size:11px">${docRef}</div></div>
</div>

<table>
<thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>
  ${items.map(item => `<tr>
    <td><b>${item.description}</b></td>
    <td style="text-align:center">${item.quantity}</td>
    <td style="text-align:right">${fmtNGN(item.unit_price)}</td>
    <td style="text-align:right;font-weight:700">${fmtNGN(item.quantity * item.unit_price)}</td>
  </tr>`).join('')}
</tbody>
</table>

<div class="totals-box">
  ${items.length > 1 ? items.map(i => `<div class="totals-row"><span class="totals-label">${i.description}</span><span class="totals-val">${fmtNGN(i.quantity * i.unit_price)}</span></div>`).join('') : ''}
  <hr/>
  <div class="totals-row"><span class="totals-grand-label">Total Amount Received</span><span class="totals-grand-val">${fmtNGN(totalAmount)}</span></div>
</div>

${payToAcc ? `
<div class="bank-box">
  <div class="bank-title">Deposited To / Payment Account</div>
  <div class="bank-grid">
    <div class="bank-cell"><span class="bank-label">Bank Name</span><span class="bank-val">${payToAcc.bank_name}</span></div>
    <div class="bank-cell"><span class="bank-label">Account Number</span><span class="bank-val" style="font-size:14px;letter-spacing:1px">${payToAcc.account_number}</span></div>
    <div class="bank-cell" style="grid-column:span 2"><span class="bank-label">Account Name</span><span class="bank-val">${payToAcc.account_name}</span></div>
  </div>
</div>` : ''}

${notes ? `<div class="notes-box"><b>Notes:</b> ${notes}</div>` : ''}

<div class="footer">
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">${payerType === 'school' ? 'School Principal / Authority' : 'Payer Signature'}</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">${receivedBy}</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Finance Officer / Stamp</div></div>
</div>
<div class="watermark">Official payment receipt from Rillcod Technologies · Reference: ${docRef} · ${dateStr}</div>
<div style="text-align:center;margin-top:10px">
  <button class="no-print" onclick="window.print()" style="padding:10px 28px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:13px;cursor:pointer;letter-spacing:1px">🖨 Print Receipt</button>
</div>
</body></html>`;
  return html;
}

export default function PaymentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';
  const canManage = isAdmin || isSchool;

  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [savedReceipts, setSavedReceipts] = useState<{
    id: string; receipt_number: string; amount: number; currency: string; issued_at: string;
    metadata: ReceiptMeta | null;
    portal_users?: { full_name: string; email: string } | null;
    schools?: { name: string } | null;
  }[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string; rillcod_quota_percent: number | null }[]>([]);
  const [allStudents, setAllStudents] = useState<{ id: string; full_name: string; email: string; school_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [view, setView] = useState<'accounts' | 'monitoring' | 'billing'>('accounts');
  const [searchTx, setSearchTx] = useState('');
  const [searchInv, setSearchInv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [viewDoc, setViewDoc] = useState<{ type: 'invoice' | 'receipt', data: any } | null>(null);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [form, setForm] = useState<Omit<PaymentAccount, 'id' | 'schools'>>({ ...BLANK });
  const [invForm, setInvForm] = useState({
    student_id: '',
    amount: '',
    notes: '',
    items: [{ description: 'Coding Club Fee', quantity: 1, unit_price: 0, total: 0 }],
    due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  });
  const [saving, setSaving] = useState(false);
  const [filterInvStatus, setFilterInvStatus] = useState<'all' | 'sent' | 'paid' | 'overdue' | 'draft'>('all');
  const [editingInv, setEditingInv] = useState<Invoice | null>(null);
  const [editInvForm, setEditInvForm] = useState<{
    due_date: string;
    notes: string;
    status: Invoice['status'];
    portal_user_id: string; // Added to match Create form
    items: { description: string; quantity: number; unit_price: number; total: number }[];
  }>({ due_date: '', notes: '', status: 'sent', portal_user_id: '', items: [] });

  // School Invoice Builder state
  const [showSchoolInvoice, setShowSchoolInvoice] = useState(false);
  const [editingSchoolInvId, setEditingSchoolInvId] = useState<string | null>(null);
  const [schoolInvForm, setSchoolInvForm] = useState({
    school_id: '',
    pricing_mode: 'per_student' as 'per_student' | 'fixed_package',
    rate_per_child: '',
    fixed_package_price: '',
    rillcod_quota_percent: '',
    notes: '',
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    deposit_amount: '',
    pay_to_account_id: '',
    manual_student_count: '',
    show_revenue_share: true,
    show_whatsapp_option: true,
  });
  const [schoolInvStudentCount, setSchoolInvStudentCount] = useState<number | null>(null);
  const [loadingSchoolCount, setLoadingSchoolCount] = useState(false);
  const [showFixedStudentCount, setShowFixedStudentCount] = useState(false);

  // Receipt Builder state
  const [showReceiptBuilder, setShowReceiptBuilder] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    school_id: '',
    payer_name: '',
    payer_type: 'school' as 'school' | 'student' | 'other',
    payment_method: 'bank_transfer' as 'bank_transfer' | 'cash' | 'pos' | 'cheque' | 'online',
    payment_date: new Date().toISOString().split('T')[0],
    reference: '',
    notes: '',
    pay_to_account_id: '',
    received_by: '',
    items: [{ description: 'STEM / AI / Coding Programme Fee', quantity: 1, unit_price: 0 }] as { description: string; quantity: number; unit_price: number }[],
  });

  const db = createClient();

  async function load() {
    setLoading(true); setError(null);
    const { data, error: err } = await db.from('payment_accounts')
      .select('*, schools(name)')
      .order('owner_type', { ascending: true }).order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setAccounts((data ?? []) as unknown as PaymentAccount[]);
    setLoading(false);
  }

  async function loadTransactions() {
    setLoadingTx(true);
    const txBase = db.from('payment_transactions')
      .select('*, portal_users(full_name, email), schools(name, rillcod_quota_percent), courses(title), receipts(receipt_number, pdf_url)')
      .order('created_at', { ascending: false });
    const { data, error: err } = await (
      isSchool && profile?.school_id
        ? txBase.eq('school_id', profile.school_id).limit(100)
        : txBase.limit(100)
    );
    if (!err) setTransactions((data ?? []) as unknown as PaymentTransaction[]);

    // Also load invoices
    const invBase = db.from('invoices')
      .select('*, portal_users(full_name, email), schools(name)')
      .order('created_at', { ascending: false });
    const { data: dInv } = await (
      isSchool && profile?.school_id
        ? invBase.eq('school_id', profile.school_id).limit(50)
        : invBase.limit(50)
    );
    if (dInv) setInvoices(dInv as unknown as Invoice[]);

    setLoadingTx(false);
  }

  async function loadStudents() {
    let q = db.from('portal_users').select('id, full_name, email, school_id').eq('role', 'student').eq('is_active', true);
    if (isSchool && profile?.school_id) q = q.eq('school_id', profile.school_id as string);
    const { data } = await q.order('full_name');
    if (data) setAllStudents(data);
  }

  async function approveTransaction(id: string) {
    if (!isAdmin || !confirm('Mark this transaction as successful?')) return;
    setLoadingTx(true);
    try {
      const res = await fetch('/api/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: id, status: 'success' })
      });
      const result = await res.json();
      if (result.success) {
        await loadTransactions();
      } else {
        throw new Error(result.error || 'Approval failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingTx(false);
    }
  }

  async function loadReceipts() {
    const res = await fetch('/api/receipts?limit=50');
    if (res.ok) {
      const json = await res.json();
      setSavedReceipts(json.data ?? []);
    }
  }

  async function handleSaveReceipt(schoolId?: string) {
    const items = receiptForm.items.filter(i => i.description && i.unit_price > 0);
    const totalAmount = items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
    if (totalAmount === 0) { alert('Add at least one line item with an amount.'); return; }
    const sch = receiptForm.school_id ? schools.find(s => s.id === receiptForm.school_id) : null;
    const docRef = receiptForm.reference || `RCPT-${Date.now().toString(36).toUpperCase()}`;
    const payToAcc = receiptForm.pay_to_account_id ? accounts.find(a => a.id === receiptForm.pay_to_account_id) : null;
    setLoadingTx(true);
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: receiptForm.school_id || null,
          amount: totalAmount,
          currency: 'NGN',
          metadata: {
            payer_name: receiptForm.payer_name || sch?.name,
            payer_type: receiptForm.payer_type,
            payment_method: receiptForm.payment_method,
            payment_date: receiptForm.payment_date,
            reference: docRef,
            received_by: receiptForm.received_by,
            notes: receiptForm.notes,
            items,
            deposit_account: payToAcc ? {
              bank_name: payToAcc.bank_name,
              account_number: payToAcc.account_number,
              account_name: payToAcc.account_name,
            } : null,
          },
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error || 'Failed to save receipt');
      } else {
        await loadReceipts();
        alert(`Receipt ${docRef} saved to portal successfully.`);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingTx(false);
    }
  }

  async function handleMarkInvoicePaid(invoiceId: string) {
    if (!confirm('Mark this invoice as paid?')) return;
    setLoadingTx(true);
    const { error: err } = await db.from('invoices').update({ status: 'paid' }).eq('id', invoiceId);
    if (err) setError(err.message);
    else {
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: 'paid' } : inv));
      if (viewDoc?.type === 'invoice') {
        setViewDoc(prev => prev ? { ...prev, data: { ...prev.data, status: 'paid' } } : null);
      }
    }
    setLoadingTx(false);
  }

  function openEditInvoice(inv: Invoice, e: React.MouseEvent) {
    e.stopPropagation();
    
    // If it's a school invoice (has school_id and no portal_user_id), use the specialized builder
    if (isAdmin && inv.school_id && !inv.portal_user_id) {
      const items = Array.isArray(inv.items) ? inv.items : [];
      const mainItem = items[0] || {};
      const isFixed = String(mainItem.description || '').includes('Fixed Pricing');

      // Try to parse out the metadata from line items
      const shareItem = items.find(it => String(it.description || '').includes('School Commission / Share'));
      const depositItem = items.find(it => String(it.description || '').includes('Deposit'));

      let quota = '';
      if (shareItem) {
        const match = String(shareItem.description).match(/\((\d+)%\)/);
        if (match) {
          quota = String(100 - parseInt(match[1]));
        }
      }

      setSchoolInvForm({
        school_id: inv.school_id,
        pricing_mode: isFixed ? 'fixed_package' : 'per_student',
        rate_per_child: isFixed ? '' : String(mainItem.unit_price || ''),
        fixed_package_price: isFixed ? String(mainItem.unit_price || '') : '',
        rillcod_quota_percent: quota,
        notes: inv.notes || '',
        due_date: inv.due_date?.split('T')[0] ?? '',
        deposit_amount: depositItem ? String(Math.abs(Number(depositItem.unit_price || 0))) : '',
        pay_to_account_id: '', // Not stored in DB, user will have to re-select
        manual_student_count: String(mainItem.quantity || 1),
        show_revenue_share: !!shareItem,
        show_whatsapp_option: true,
      });

      setEditingSchoolInvId(inv.id);
      setShowSchoolInvoice(true);
      setShowReceiptBuilder(false);
      return;
    }

    // Standard Invoice (Student) logic
    const rawItems: any[] = Array.isArray(inv.items) ? inv.items : [];
    const items = rawItems.map(it => ({
      description: String(it.description ?? ''),
      quantity: Number(it.quantity ?? 1),
      unit_price: Number(it.unit_price ?? 0),
      total: Number(it.total ?? it.unit_price ?? 0),
    }));
    setEditingInv(inv);
    setEditInvForm({
      due_date: inv.due_date?.split('T')[0] ?? '',
      notes: inv.notes ?? '',
      status: inv.status,
      portal_user_id: inv.portal_user_id || '',
      items: items.length > 0 ? items : [{ description: '', quantity: 1, unit_price: 0, total: 0 }],
    });
  }

  async function handleUpdateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!editingInv) return;
    
    // Validation
    const validItems = editInvForm.items.filter(it => it.description.trim() !== '' && it.unit_price > 0);
    if (validItems.length === 0) {
      alert('Please add at least one valid line item with a description and price.');
      return;
    }

    setLoadingTx(true);
    try {
      const recalcItems = validItems.map(it => ({
        ...it,
        total: Number((it.quantity * it.unit_price).toFixed(2)),
      }));
      const newAmount = recalcItems.reduce((sum, it) => sum + it.total, 0);
      
      const { error: err } = await db.from('invoices')
        .update({
          due_date: editInvForm.due_date,
          notes: editInvForm.notes,
          status: editInvForm.status,
          portal_user_id: editInvForm.portal_user_id || null,
          items: recalcItems,
          amount: newAmount,
        })
        .eq('id', editingInv.id);

      if (err) throw err;

      // Update local state robustly - find the student info if it changed
      const updatedStudent = allStudents.find(s => s.id === editInvForm.portal_user_id);
      
      setInvoices(prev => prev.map(inv => inv.id === editingInv.id
        ? { 
            ...inv, 
            due_date: editInvForm.due_date, 
            notes: editInvForm.notes, 
            status: editInvForm.status, 
            items: recalcItems, 
            amount: newAmount,
            portal_user_id: editInvForm.portal_user_id || null,
            portal_users: updatedStudent ? { full_name: updatedStudent.full_name, email: updatedStudent.email } : inv.portal_users
          }
        : inv));
      
      setEditingInv(null);
      // Optional: show success toast/alert if you have one, or just silent success
    } catch (err: any) {
      console.error('Update failed:', err);
      setError(err.message || 'Failed to update invoice');
    } finally {
      setLoadingTx(false);
    }
  }

  async function handleDeleteInvoice(invoiceId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    setLoadingTx(true);
    const { error: err } = await db.from('invoices').delete().eq('id', invoiceId);
    if (err) setError(err.message);
    else setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    setLoadingTx(false);
  }

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invForm.student_id) return;
    setLoadingTx(true);
    const selectedStudent = allStudents.find(s => s.id === invForm.student_id);
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: isSchool ? profile?.school_id : (selectedStudent?.school_id || null),
        portal_user_id: invForm.student_id,
        amount: invForm.items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
        notes: invForm.notes,
        due_date: invForm.due_date,
        items: invForm.items.filter(i => i.description && i.unit_price > 0),
        status: 'sent',
      }),
    });
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Failed to create invoice');
    else {
      setShowInvoiceForm(false);
      setInvForm({
        student_id: '', amount: '', notes: '',
        items: [{ description: 'Coding Club Fee', quantity: 1, unit_price: 0, total: 0 }],
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      });
      loadTransactions();
    }
    setLoadingTx(false);
  }

  async function handlePayWithPaystack(invoice: Invoice) {
    setLoadingTx(true);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoice.id,
          amount: invoice.amount,
          payment_method: 'paystack'
        })
      });
      const result = await res.json();
      if (result.success && result.data?.url) {
        window.location.href = result.data.url;
      } else {
        throw new Error(result.message || 'Payment initiation failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingTx(false);
    }
  }

  async function handleSendInvoiceEmail(invoiceId: string) {
    setLoadingTx(true);
    try {
      const res = await fetch('/api/payments/invoices/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId })
      });
      const result = await res.json();
      if (result.success) {
        alert('Invoice email sent successfully!');
      } else {
        throw new Error(result.message || 'Failed to send email');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingTx(false);
    }
  }

  // Auto-fetch student count when school is selected for school invoice
  async function fetchSchoolStudentCount(schoolId: string) {
    if (!schoolId) { setSchoolInvStudentCount(null); return; }
    setLoadingSchoolCount(true);
    const { count } = await db.from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('school_id', schoolId)
      .eq('is_active', true);
    setSchoolInvStudentCount(count ?? 0);
    setSchoolInvForm(prev => ({ ...prev, manual_student_count: String(count ?? 0) }));
    // Pre-fill quota percent from school record
    const sch = schools.find(s => s.id === schoolId);
    if (sch?.rillcod_quota_percent != null) {
      setSchoolInvForm(prev => ({ ...prev, rillcod_quota_percent: String(sch.rillcod_quota_percent) }));
    }
    setLoadingSchoolCount(false);
  }

  function handlePrintSchoolInvoice() {
    const sch = schools.find(s => s.id === schoolInvForm.school_id);
    if (!sch) { alert('Select a school first.'); return; }
    const isFixed = schoolInvForm.pricing_mode === 'fixed_package';
    const count = parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0;
    const ratePerChild = parseFloat(schoolInvForm.rate_per_child) || 0;
    const fixedPrice = parseFloat(schoolInvForm.fixed_package_price) || 0;
    const quotaPct = parseFloat(schoolInvForm.rillcod_quota_percent) || 0;
    const subtotal = isFixed ? fixedPrice : ratePerChild * count;

    if (subtotal === 0) { alert(isFixed ? 'Enter a fixed package price first.' : 'Enter a rate per child first.'); return; }

    const deposit = parseFloat(schoolInvForm.deposit_amount) || 0;
    const revenueShareOn = schoolInvForm.show_revenue_share && quotaPct > 0;
    
    const rillcodShare = Math.round(subtotal * (quotaPct / 100));
    const schoolShare = subtotal - rillcodShare;

    // Fix: Outstanding should be the figure after deducting school's share (commission)
    const balance = revenueShareOn ? Math.max(0, rillcodShare - deposit) : Math.max(0, subtotal - deposit);
    
    const payToAcc = accounts.find(a => a.id === schoolInvForm.pay_to_account_id);

    const docRef = `SINV-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const dueStr = schoolInvForm.due_date
      ? new Date(schoolInvForm.due_date).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    const fmtNGN = (n: number) => `₦${n.toLocaleString('en-NG')}`;

    const html = buildSchoolInvHTML({ sch: sch!, isFixed, count, ratePerChild, fixedPrice, quotaPct, subtotal, deposit, rillcodShare, schoolShare, balance, revenueShareOn, dateStr, dueStr, docRef, payToAcc, showRevenueShare: schoolInvForm.show_revenue_share, showWhatsapp: schoolInvForm.show_whatsapp_option, notes: schoolInvForm.notes || '' });

    const w = window.open('', '_blank', 'width=900,height=800');
    if (!w) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 700);

    // Robust Save/Update logic
    handleSaveSchoolInvoice(false); // Silent save
  }

  async function handleSaveSchoolInvoice(showFeedback = true) {
    const sch = schools.find(s => s.id === schoolInvForm.school_id);
    if (!sch) { if (showFeedback) alert('Select a school first.'); return; }
    
    const isFixed = schoolInvForm.pricing_mode === 'fixed_package';
    const count = parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0;
    const ratePerChild = parseFloat(schoolInvForm.rate_per_child) || 0;
    const fixedPrice = parseFloat(schoolInvForm.fixed_package_price) || 0;
    const subtotal = isFixed ? fixedPrice : ratePerChild * count;
    const quotaPct = parseFloat(schoolInvForm.rillcod_quota_percent) || 0;
    const deposit = parseFloat(schoolInvForm.deposit_amount) || 0;
    const revenueShareOn = schoolInvForm.show_revenue_share && quotaPct > 0;
    const rillcodShare = Math.round(subtotal * (quotaPct / 100));
    const schoolShare = subtotal - rillcodShare;
    const balance = revenueShareOn ? Math.max(0, rillcodShare - deposit) : Math.max(0, subtotal - deposit);

    if (showFeedback) setLoadingTx(true);
    
    try {
      const items = isFixed
        ? [{ description: `STEM Programme — School Package (All Students) · Fixed Pricing`, quantity: 1, unit_price: subtotal, total: subtotal }]
        : [{ description: `STEM / AI / Coding Programme — ${sch.name}`, quantity: count, unit_price: ratePerChild, total: subtotal }];
      
      const dueISO = schoolInvForm.due_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      
      const invPayload = {
        amount: balance,
        currency: 'NGN',
        status: 'sent' as const,
        due_date: dueISO,
        items: revenueShareOn ? [
          ...items,
          { description: `School Commission / Share (${100 - quotaPct}%)`, quantity: 1, unit_price: -schoolShare, total: -schoolShare },
          ...(deposit > 0 ? [{ description: `Less Previous Deposit / Payment`, quantity: 1, unit_price: -deposit, total: -deposit }] : [])
        ] : [
          ...items,
          ...(deposit > 0 ? [{ description: `Less Previous Deposit / Payment`, quantity: 1, unit_price: -deposit, total: -deposit }] : [])
        ],
        notes: schoolInvForm.notes || null,
      };

      if (editingSchoolInvId) {
        const { error: err } = await db.from('invoices').update(invPayload).eq('id', editingSchoolInvId);
        if (err) throw err;
        if (showFeedback) alert('Invoice updated successfully.');
      } else {
        // ── Duplicate check: warn if school already has an open invoice ──
        const { data: existing } = await db
          .from('invoices')
          .select('id, invoice_number, amount, status, due_date, created_at')
          .eq('school_id', schoolInvForm.school_id)
          .in('status', ['sent', 'overdue', 'draft'])
          .order('created_at', { ascending: false })
          .limit(3);

        if (existing && existing.length > 0) {
          const list = existing.map(inv =>
            `• ${inv.invoice_number} — ₦${Number(inv.amount).toLocaleString()} — ${(inv.status ?? '').toUpperCase()} (due ${inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-NG') : '—'})`
          ).join('\n');
          const proceed = confirm(
            `⚠️ This school already has ${existing.length} open invoice(s):\n\n${list}\n\nCreate another invoice anyway?`
          );
          if (!proceed) { if (showFeedback) setLoadingTx(false); return; }
        }

        const docRef = `SINV-${Date.now().toString(36).toUpperCase()}`;
        const { error: err } = await db.from('invoices').insert({
          ...invPayload,
          invoice_number: docRef,
          school_id: schoolInvForm.school_id
        });
        if (err) throw err;
        if (showFeedback) alert('New invoice generated and saved.');
      }

      setEditingSchoolInvId(null);
      setShowSchoolInvoice(false);
      await loadTransactions();
    } catch (err: any) {
      console.error('School Invoice Save Error:', err);
      setError(err.message || 'Failed to save school invoice');
      if (showFeedback) alert('Error: ' + (err.message || 'Failed to save'));
    } finally {
      if (showFeedback) setLoadingTx(false);
    }
  }

  function handlePrintReceipt() {
    const sch = receiptForm.school_id ? schools.find(s => s.id === receiptForm.school_id) : null;
    const payToAcc = accounts.find(a => a.id === receiptForm.pay_to_account_id);
    const items = receiptForm.items.filter(i => i.description && i.unit_price > 0);
    const totalAmount = items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
    if (totalAmount === 0 && items.length === 0) { alert('Add at least one line item with an amount.'); return; }

    const docRef = receiptForm.reference || `RCPT-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const payDateStr = receiptForm.payment_date
      ? new Date(receiptForm.payment_date).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
      : dateStr;
    const fmtNGN = (n: number) => `₦${n.toLocaleString('en-NG')}`;
    const payerLabel = receiptForm.payer_name || sch?.name || 'Client';
    const methodLabels: Record<string, string> = {
      bank_transfer: 'Bank Transfer', cash: 'Cash', pos: 'POS Terminal', cheque: 'Cheque', online: 'Online Payment',
    };

    const html = buildReceiptHTML({ docRef, dateStr, payDateStr, payerLabel, payerType: receiptForm.payer_type, paymentMethod: receiptForm.payment_method, receivedBy: receiptForm.received_by || 'Rillcod Technologies Representative', items, totalAmount, payToAcc, notes: receiptForm.notes || '' });

    const w = window.open('', '_blank', 'width=900,height=800');
    if (!w) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 700);

    // Auto-save receipt to portal (fire-and-forget — school can view it on their dashboard)
    fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        school_id: receiptForm.school_id || null,
        amount: totalAmount,
        currency: 'NGN',
        metadata: {
          payer_name: payerLabel,
          payer_type: receiptForm.payer_type,
          payment_method: receiptForm.payment_method,
          payment_date: receiptForm.payment_date,
          reference: docRef,
          received_by: receiptForm.received_by,
          notes: receiptForm.notes,
          items,
          deposit_account: payToAcc ? {
            bank_name: payToAcc.bank_name,
            account_number: payToAcc.account_number,
            account_name: payToAcc.account_name,
          } : null,
        },
      }),
    }).then(() => loadReceipts()).catch(() => {/* silent */});
  }

  function calculateTotalWithFees(target: number) {
    const targetWithBuffer = target + 50; 
    const rate = 0.016; // 1.6% total
    const divisor = 1 - rate; // 0.984
    
    if (targetWithBuffer < 2500 * divisor) return Math.ceil(targetWithBuffer / divisor);
    if (targetWithBuffer < 125000) return Math.ceil((targetWithBuffer + 100) / divisor);
    return Math.ceil(targetWithBuffer + 2000);
  }

  // Redirect school users away from billing tab if they somehow land on it
  useEffect(() => {
    if (isSchool && view === 'billing') setView('accounts');
  }, [isSchool, view]);

  useEffect(() => {
    if (authLoading || !profile) return;
    load();
    loadTransactions();
    loadStudents();
    loadReceipts();
    if (isAdmin) {
      db.from('schools').select('id, name, rillcod_quota_percent').order('name')
        .then(({ data }) => {
          if (data) setSchools(data as { id: string; name: string; rillcod_quota_percent: number | null }[]);
        });
    }
  }, [profile?.id, authLoading]); // eslint-disable-line

  const openNew = () => {
    setEditing(null);
    setForm({
      ...BLANK,
      owner_type: isSchool ? 'school' : 'rillcod',
      school_id: isSchool ? (profile?.school_id ?? null) : null,
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
    };
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
    const j = await res.json();
    if (!res.ok) setError(j.error || 'Failed to save');
    else { await load(); setShowForm(false); }
    setSaving(false);
  };

  const del = async (id: string) => {
    if (!confirm('Remove this payment account?')) return;
    await fetch(`/api/payment-accounts/${id}`, { method: 'DELETE' });
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  const rillcodAccounts = accounts.filter(a => a.owner_type === 'rillcod');
  const schoolAccounts  = accounts.filter(a => a.owner_type === 'school');

  // ── Live preview HTML for School Invoice Builder ──
  const schoolInvPreviewHTML = useMemo(() => {
    const sch = schools.find(s => s.id === schoolInvForm.school_id);
    if (!sch) return '<html><body style="font-family:sans-serif;padding:32px;color:#9ca3af;background:#fff"><p style="font-size:14px">Select a school to see the preview</p></body></html>';
    const isFixed = schoolInvForm.pricing_mode === 'fixed_package';
    const count = parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0;
    const ratePerChild = parseFloat(schoolInvForm.rate_per_child) || 0;
    const fixedPrice = parseFloat(schoolInvForm.fixed_package_price) || 0;
    const quotaPct = parseFloat(schoolInvForm.rillcod_quota_percent) || 0;
    const subtotal = isFixed ? fixedPrice : ratePerChild * count;
    const deposit = parseFloat(schoolInvForm.deposit_amount) || 0;
    const revenueShareOn = schoolInvForm.show_revenue_share && quotaPct > 0;
    const rillcodShare = Math.round(subtotal * (quotaPct / 100));
    const schoolShare = subtotal - rillcodShare;
    const balance = revenueShareOn ? Math.max(0, rillcodShare - deposit) : Math.max(0, subtotal - deposit);
    const payToAcc = accounts.find(a => a.id === schoolInvForm.pay_to_account_id);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const dueStr = schoolInvForm.due_date
      ? new Date(schoolInvForm.due_date).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
      : '—';
    return buildSchoolInvHTML({
      sch, isFixed, count, ratePerChild, fixedPrice, quotaPct, subtotal, deposit,
      rillcodShare, schoolShare, balance, revenueShareOn, dateStr, dueStr,
      docRef: 'PREVIEW', payToAcc,
      showRevenueShare: schoolInvForm.show_revenue_share,
      showWhatsapp: schoolInvForm.show_whatsapp_option,
      notes: schoolInvForm.notes || '',
    });
  }, [schoolInvForm, schoolInvStudentCount, schools, accounts]);

  // ── Live preview HTML for Receipt Builder ──
  const receiptPreviewHTML = useMemo(() => {
    const sch = receiptForm.school_id ? schools.find(s => s.id === receiptForm.school_id) : null;
    const payToAcc = receiptForm.pay_to_account_id ? accounts.find(a => a.id === receiptForm.pay_to_account_id) : null;
    const items = receiptForm.items.filter(i => i.description && i.unit_price > 0);
    const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const payerLabel = receiptForm.payer_name || sch?.name || '— Enter payer name —';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const payDateStr = receiptForm.payment_date
      ? new Date(receiptForm.payment_date).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
      : dateStr;
    return buildReceiptHTML({
      docRef: 'PREVIEW', dateStr, payDateStr, payerLabel,
      payerType: receiptForm.payer_type, paymentMethod: receiptForm.payment_method,
      receivedBy: receiptForm.received_by || 'Rillcod Technologies Representative',
      items, totalAmount, payToAcc, notes: receiptForm.notes || '',
    });
  }, [receiptForm, schools, accounts]);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BanknotesIcon className="w-5 h-5 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Finance</span>
            </div>
            <h1 className="text-3xl font-extrabold">Payments & Finance</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isAdmin ? 'Financial monitoring, revenue tracking, and account management' :
                isSchool ? 'Your school\'s payment monitoring and collection accounts' :
                  'Payment details and transaction history'}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="bg-card shadow-sm p-1 rounded-none flex border border-border">
              {(['accounts', 'monitoring', ...(!isSchool ? ['billing' as const] : [])] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-2 rounded-none font-bold text-[10px] uppercase tracking-widest transition-all ${view === v ? 'bg-primary text-black shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}>
                  {v}
                </button>
              ))}
            </div>
            {canManage && view === 'accounts' && (
              <button onClick={openNew}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-black font-bold text-sm rounded-none transition-all hover:scale-105 shadow-lg shadow-primary/20">
                <PlusIcon className="w-4 h-4" /> Add Account
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-none p-4 text-rose-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)}><XMarkIcon className="w-4 h-4" /></button>
          </div>
        )}

        {view === 'accounts' ? (
          <>
            {/* Rillcod Technologies Accounts */}
            {(isAdmin || rillcodAccounts.length > 0) && (
              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <ShieldCheckIcon className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-primary">Rillcod Technologies Accounts</h2>
                  <div className="h-px flex-1 bg-primary/20" />
                  {isAdmin && (
                    <button
                      onClick={() => { setForm({ ...BLANK, owner_type: 'rillcod', school_id: null }); setEditing(null); setShowForm(true); }}
                      className="text-[10px] font-black text-primary/70 hover:text-primary flex items-center gap-1">
                      <PlusIcon className="w-3 h-3" /> Add
                    </button>
                  )}
                </div>
                {rillcodAccounts.length === 0 ? (
                  <div className="text-center py-10 bg-card shadow-sm border border-dashed border-primary/20 rounded-none">
                    <p className="text-muted-foreground text-sm">No Rillcod payment accounts set up yet.</p>
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
                <BuildingOfficeIcon className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  {isSchool ? 'Your School Account' : 'Partner School Accounts'}
                </h2>
                <div className="h-px flex-1 bg-muted" />
                {isSchool && (
                  <button
                    onClick={() => { setForm({ ...BLANK, owner_type: 'school', school_id: profile?.school_id ?? null }); setEditing(null); setShowForm(true); }}
                    className="text-[10px] font-black text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <PlusIcon className="w-3 h-3" /> Add
                  </button>
                )}
              </div>
              {schoolAccounts.length === 0 ? (
                <div className="text-center py-10 bg-card shadow-sm border border-dashed border-border rounded-none">
                  <BuildingOfficeIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-sm">
                    {isSchool ? 'Add your school\'s bank account for fee collection.' : 'No school payment accounts set up yet.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {schoolAccounts.map(a => (
                    <AccountCard key={a.id} account={a} onEdit={openEdit} onDelete={del}
                      canManage={isAdmin || (isSchool && a.school_id === profile?.school_id)} />
                  ))}
                </div>
              )}
            </section>

            {/* ── School: My Invoices & Receipts ── */}
            {isSchool && (
              <div className="space-y-8">
                {/* Invoices for this school */}
                {invoices.length > 0 && (
                  <section className="space-y-4">
                    <div className="flex items-center gap-3">
                      <DocumentTextIcon className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-black uppercase tracking-widest text-primary">Invoices</h2>
                      <div className="h-px flex-1 bg-primary/20" />
                      <span className="text-[10px] font-black text-muted-foreground uppercase">{invoices.length} total</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {invoices.map(inv => (
                        <div key={inv.id}
                          className="bg-card border border-border rounded-none p-5 flex flex-col gap-3 hover:border-primary/30 transition-all cursor-pointer group"
                          onClick={() => {
                            setViewDoc({
                              type: 'invoice',
                              data: {
                                number: inv.invoice_number,
                                date: new Date(inv.created_at).toLocaleDateString(),
                                dueDate: new Date(inv.due_date).toLocaleDateString(),
                                status: inv.status,
                                amount: inv.amount,
                                currency: inv.currency,
                                items: inv.items,
                                studentName: inv.portal_users?.full_name || inv.schools?.name || 'School',
                                studentEmail: inv.portal_users?.email,
                                notes: inv.notes,
                                schoolName: inv.schools?.name || 'Rillcod Technologies',
                              }
                            });
                          }}>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[10px] font-black text-primary uppercase tracking-widest">{inv.invoice_number}</p>
                              <p className="text-sm font-black text-foreground group-hover:text-primary transition-colors">
                                {new Date(inv.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              inv.status === 'paid' ? 'bg-green-500/10 text-green-400' :
                              inv.status === 'overdue' ? 'bg-rose-500/10 text-rose-400' :
                              'bg-primary/10 text-primary'
                            }`}>{inv.status}</span>
                          </div>
                          <div className="flex justify-between items-end">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Amount</p>
                              <p className="text-xl font-black text-foreground">₦{inv.amount.toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Due</p>
                              <p className="text-xs font-bold text-muted-foreground">{new Date(inv.due_date).toLocaleDateString()}</p>
                            </div>
                          </div>
                          {canManage && (
                            <div className="flex gap-2 pt-1 border-t border-white/[0.05]" onClick={e => e.stopPropagation()}>
                              {inv.status !== 'paid' && (
                                <button
                                  onClick={() => handleMarkInvoicePaid(inv.id)}
                                  className="flex-1 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 text-[9px] font-black uppercase tracking-widest hover:bg-green-500/20 transition-all"
                                >
                                  Mark Paid
                                </button>
                              )}
                              <button
                                onClick={e => openEditInvoice(inv, e)}
                                className="flex-1 py-1.5 bg-white/[0.04] border border-white/[0.08] text-slate-400 text-[9px] font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all flex items-center justify-center gap-1"
                              >
                                <PencilIcon className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={(e) => handleDeleteInvoice(inv.id, e)}
                                className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-black uppercase hover:bg-rose-500/20 transition-all flex items-center justify-center"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Receipts for this school */}
                {savedReceipts.length > 0 && (
                  <section className="space-y-4">
                    <div className="flex items-center gap-3">
                      <ReceiptPercentIcon className="w-4 h-4 text-primary" />
                      <h2 className="text-sm font-black uppercase tracking-widest text-primary">Receipts</h2>
                      <div className="h-px flex-1 bg-primary/20" />
                      <span className="text-[10px] font-black text-muted-foreground uppercase">{savedReceipts.length} records</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {savedReceipts.map(rcpt => {
                        const meta = rcpt.metadata || {};
                        return (
                          <div key={rcpt.id}
                            className="bg-card border border-border rounded-none p-5 flex flex-col gap-3 hover:border-primary/30 transition-all cursor-pointer group"
                            onClick={() => setViewDoc({
                              type: 'receipt',
                              data: {
                                number: rcpt.receipt_number,
                                date: new Date(rcpt.issued_at).toLocaleDateString(),
                                status: 'paid',
                                items: (meta.items && meta.items.length > 0
                                  ? meta.items.map((it: any) => ({
                                      description: String(it.description ?? 'Payment'),
                                      quantity: Number(it.quantity ?? 1),
                                      unit_price: Number(it.unit_price ?? 0),
                                      total: Number(it.total ?? (Number(it.quantity ?? 1) * Number(it.unit_price ?? 0))),
                                    }))
                                  : [{ description: 'Payment', quantity: 1, unit_price: rcpt.amount, total: rcpt.amount }]),
                                amount: rcpt.amount,
                                currency: rcpt.currency || 'NGN',
                                studentName: meta.payer_name || rcpt.portal_users?.full_name || rcpt.schools?.name || 'Client',
                                studentEmail: rcpt.portal_users?.email,
                                schoolName: 'RILLCOD TECHNOLOGIES',
                                notes: meta.notes,
                                transactionRef: meta.reference || rcpt.receipt_number,
                                instructorName: meta.received_by || 'Accounts Department',
                                paymentMethod: meta.payment_method,
                                receivedBy: meta.received_by,
                                depositAccount: meta.deposit_account,
                              }
                            })}>
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest">{rcpt.receipt_number}</p>
                                <p className="text-sm font-black text-foreground group-hover:text-primary transition-colors">
                                  {meta.payer_name || rcpt.schools?.name || 'Payment'}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded-full uppercase">PAID</span>
                            </div>
                            <div className="flex justify-between items-end">
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Amount</p>
                                <p className="text-xl font-black text-foreground">₦{rcpt.amount.toLocaleString()}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Issued</p>
                                <p className="text-xs font-bold text-muted-foreground">{new Date(rcpt.issued_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {invoices.length === 0 && savedReceipts.length === 0 && (
                  <div className="text-center py-16 bg-card border border-dashed border-border">
                    <DocumentTextIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground text-sm">No invoices or receipts issued to your school yet.</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : view === 'monitoring' ? (
          /* ── Financial Monitoring View ── */
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(() => {
                const completed = transactions.filter(t => t.payment_status === 'completed' || t.payment_status === 'success');
                const totalRevenue = completed.reduce((sum, t) => sum + t.amount, 0);
                const totalQuota = completed.reduce((sum, t) => {
                  const pct = t.schools?.rillcod_quota_percent || 0;
                  return sum + (t.amount * (Number(pct) / 100));
                }, 0);

                return (
                  <>
                    <div className="bg-card shadow-sm border border-border rounded-none p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Gross Revenue</p>
                        <ArrowTrendingUpIcon className="w-4 h-4 text-emerald-400" />
                      </div>
                      <p className="text-2xl font-black text-foreground">₦{totalRevenue.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{completed.length} total payments</p>
                    </div>
                    {isAdmin && (
                      <div className="bg-primary/5 border border-primary/20 rounded-none p-6">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-black text-primary uppercase tracking-widest">Rillcod Quota</p>
                          <ShieldCheckIcon className="w-4 h-4 text-primary" />
                        </div>
                        <p className="text-2xl font-black text-foreground">₦{totalQuota.toLocaleString()}</p>
                        <p className="text-[10px] text-primary/40 mt-1">Calculated from school split %</p>
                      </div>
                    )}
                    <div className="bg-card shadow-sm border border-border rounded-none p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Active Transactions</p>
                        <ClockIcon className="w-4 h-4 text-amber-400" />
                      </div>
                      <p className="text-2xl font-black text-foreground">{transactions.length}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Pending & Completed</p>
                    </div>
                    {!isAdmin && (
                      <div className="bg-card shadow-sm border border-border rounded-none p-6">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">School Share</p>
                          <BuildingOfficeIcon className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="text-2xl font-black text-foreground">₦{(totalRevenue - totalQuota).toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Net after service fee</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Transactions List */}
            <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden min-h-[400px]">
              <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CreditCardIcon className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-extrabold text-foreground">Recent Transactions</h3>
                </div>
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input 
                    type="search" 
                    placeholder="Search transactions..."
                    value={searchTx}
                    onChange={e => setSearchTx(e.target.value)}
                    className="bg-card shadow-sm border border-border rounded-none pl-9 pr-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary w-full sm:w-64"
                  />
                </div>
              </div>

              {loadingTx ? (
                <div className="p-20 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground uppercase font-black tracking-widest">Fetching records...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-20 text-center">
                  <p className="text-muted-foreground text-sm">No transactions found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Recipient / Student</th>
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Amount</th>
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Method</th>
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {transactions.filter(t => 
                        !searchTx || 
                        t.portal_users?.full_name?.toLowerCase().includes(searchTx.toLowerCase()) ||
                        t.transaction_reference?.toLowerCase().includes(searchTx.toLowerCase())
                      ).map(t => {
                        const isSuccess = t.payment_status === 'completed' || t.payment_status === 'success';
                        const isPending = t.payment_status === 'pending';
                        return (
                          <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                              <p className="text-[13px] font-bold text-foreground group-hover:text-primary transition-colors">
                                {t.portal_users?.full_name || 'Anonymous Student'}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t.schools?.name || 'Individual'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-sm font-black text-foreground tracking-tight">₦{t.amount.toLocaleString()}</p>
                              <p className="text-[9px] text-muted-foreground font-mono">
                                {t.receipts?.[0]?.receipt_number || t.transaction_reference}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                isSuccess ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                isPending ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                                'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              }`}>
                                {t.payment_status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t.payment_method}</p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <p className="text-xs font-bold text-muted-foreground">
                                  {new Date(t.created_at).toLocaleDateString()}
                                </p>
                                <div className="flex items-center gap-2">
                                  {isAdmin && isPending && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); approveTransaction(t.id); }}
                                      className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase rounded-full border border-emerald-500/20 transition-all">
                                      Approve
                                    </button>
                                  )}
                                  {isSuccess && (
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setViewDoc({ 
                                          type: 'receipt', 
                                          data: {
                                            number: t.transaction_reference,
                                            date: new Date(t.paid_at || t.created_at).toLocaleDateString(),
                                            status: 'paid',
                                            amount: t.amount,
                                            currency: t.currency || 'NGN',
                                            items: [{ description: t.courses?.title || (t.invoice_id ? 'Invoice Payment' : 'Enrolment Fee'), quantity: 1, unit_price: t.amount, total: t.amount }],
                                            studentName: t.portal_users?.full_name || 'Student',
                                            studentEmail: t.portal_users?.email,
                                            schoolName: t.schools?.name || 'Rillcod Technologies',
                                            transactionRef: t.transaction_reference,
                                            processingFee: t.paystack_fees || 0
                                          }
                                        }); 
                                      }}
                                      className="px-2 py-0.5 bg-primary/10 hover:bg-primary/20 text-primary text-[9px] font-black uppercase rounded-full border border-primary/20 transition-all">
                                      Receipt
                                    </button>
                                  )}
                                  <p className="text-[9px] text-muted-foreground uppercase">
                                    {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                  {(t.receipt_url || (t.receipts && t.receipts[0]?.pdf_url)) && (
                                    <a href={t.receipts?.[0]?.pdf_url || t.receipt_url || '#'} target="_blank" rel="noreferrer"
                                      className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-none transition-all" title="Download Official Receipt">
                                      <ArrowDownTrayIcon className="w-4 h-4" />
                                    </a>
                                  )}
                                </div>
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
        ) : (
          /* ── Billing & Invoices View ── */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <DocumentTextIcon className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold text-primary uppercase tracking-widest">Financial Records</span>
                </div>
                <h2 className="text-2xl font-black">Billing & Invoices</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {isAdmin && schools.length > 0 && (
                  <button
                    onClick={() => { setShowSchoolInvoice(v => !v); setShowReceiptBuilder(false); if (showSchoolInvoice) setEditingSchoolInvId(null); }}
                    className={`px-5 py-2.5 font-black text-xs uppercase tracking-widest rounded-none transition-all shadow-lg hover:scale-105 active:scale-95 ${showSchoolInvoice ? 'bg-primary text-black shadow-primary/30' : 'bg-primary/10 border border-primary/20 text-primary'}`}>
                    {showSchoolInvoice ? '✕ Close' : 'School Invoice'}
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={() => { setShowReceiptBuilder(v => !v); setShowSchoolInvoice(false); }}
                    className={`px-5 py-2.5 font-black text-xs uppercase tracking-widest rounded-none transition-all shadow-lg hover:scale-105 active:scale-95 ${showReceiptBuilder ? 'bg-white/10 text-white' : 'bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-white'}`}>
                    {showReceiptBuilder ? '✕ Close' : 'Build Receipt'}
                  </button>
                )}
                {canManage && (
                  <button
                    onClick={() => setShowInvoiceForm(true)}
                    className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-black font-black text-xs uppercase tracking-widest rounded-none transition-all shadow-lg shadow-primary/20 hover:scale-105 active:scale-95">
                    + New Invoice
                  </button>
                )}
                {canManage && (
                  <Link href="/dashboard/payments/bulk"
                    className="px-5 py-2.5 bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-white hover:border-white/20 font-black text-xs uppercase tracking-widest rounded-none transition-all flex items-center gap-2">
                    <UserGroupIcon className="w-4 h-4" /> Bulk Generate
                  </Link>
                )}
              </div>
            </div>
            
            {/* ── School Invoice Builder ── */}
            {showSchoolInvoice && isAdmin && (
              <div className="bg-primary/5 border border-primary/20 rounded-none">
                {/* Header */}
                <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-primary/20">
                  <p className="text-xs font-black text-primary uppercase tracking-widest mb-0.5">School Invoice Builder</p>
                  <p className="text-foreground font-bold text-sm">Generate a school invoice — per-student rate or fixed package deal</p>
                </div>
                {/* Split-view: form left + preview right */}
                <div className="flex flex-col lg:flex-row">
                {/* Form column */}
                <div className="flex-1 min-w-0 p-4 sm:p-6 space-y-5">

                {/* Pricing mode toggle */}
                <div className="flex items-center gap-2 p-1 bg-card shadow-sm border border-border rounded-none w-fit">
                  {(['per_student', 'fixed_package'] as const).map(mode => (
                    <button key={mode} type="button"
                      onClick={() => setSchoolInvForm(prev => ({ ...prev, pricing_mode: mode }))}
                      className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-none transition-all ${schoolInvForm.pricing_mode === mode ? 'bg-primary text-black' : 'text-muted-foreground hover:text-foreground'}`}>
                      {mode === 'per_student' ? '👤 Per Student (Rate × Count)' : '🏫 Fixed School Package'}
                    </button>
                  ))}
                </div>
                {schoolInvForm.pricing_mode === 'fixed_package' && (
                  <div className="bg-white/[0.04] border border-white/[0.08] rounded-none px-4 py-2.5 text-xs text-muted-foreground font-semibold">
                    Fixed Package: the school pays one flat price regardless of student count — e.g. when the school has made the programme compulsory and negotiated a deal.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="lg:col-span-2">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Select School</label>
                    <select
                      value={schoolInvForm.school_id}
                      onChange={e => {
                        const sid = e.target.value;
                        setSchoolInvForm(prev => ({ ...prev, school_id: sid }));
                        fetchSchoolStudentCount(sid);
                      }}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="">— Choose school —</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                        Student Count {schoolInvForm.pricing_mode === 'fixed_package' ? '(Informational)' : 'Override'}
                      </label>
                      {schoolInvForm.pricing_mode === 'fixed_package' && (
                        <button
                          type="button"
                          onClick={() => setShowFixedStudentCount(v => !v)}
                          className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border transition-colors ${
                            showFixedStudentCount
                              ? 'border-primary/40 text-primary bg-primary/5'
                              : 'border-border text-muted-foreground/40 hover:text-muted-foreground'
                          }`}
                        >
                          {showFixedStudentCount ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </div>
                    {(schoolInvForm.pricing_mode !== 'fixed_package' || showFixedStudentCount) && (
                      <input
                        type="number"
                        min="0"
                        placeholder="Manual count"
                        value={schoolInvForm.manual_student_count}
                        onChange={e => setSchoolInvForm(prev => ({ ...prev, manual_student_count: e.target.value }))}
                        className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50 font-bold"
                      />
                    )}
                  </div>
                  {schoolInvForm.pricing_mode === 'per_student' ? (
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Rate per Child (₦)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 5000"
                      value={schoolInvForm.rate_per_child}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, rate_per_child: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  ) : (
                  <div>
                    <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5">Fixed Package Price (₦)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 150000"
                      value={schoolInvForm.fixed_package_price}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, fixed_package_price: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-primary/10 border border-primary/30 rounded-none text-sm text-foreground focus:outline-none focus:border-primary font-bold"
                    />
                  </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">
                      Rillcod % Share
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="e.g. 60"
                      value={schoolInvForm.rillcod_quota_percent}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, rillcod_quota_percent: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Due Date</label>
                    <input
                      type="date"
                      value={schoolInvForm.due_date}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, due_date: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Notes (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. First term 2025/2026 session"
                      value={schoolInvForm.notes}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Deposit Made (₦)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Amount already paid"
                      value={schoolInvForm.deposit_amount}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, deposit_amount: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50 font-bold"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Pay To (Rillcod Account)</label>
                    <select
                      value={schoolInvForm.pay_to_account_id}
                      onChange={e => setSchoolInvForm(prev => ({ ...prev, pay_to_account_id: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50"
                    >
                      <option value="">— Select Payment Account —</option>
                      {rillcodAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.label} ({a.bank_name})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-4 py-2">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div 
                        onClick={() => setSchoolInvForm(prev => ({ ...prev, show_revenue_share: !prev.show_revenue_share }))}
                        className={`w-10 h-6 rounded-full transition-all flex items-center px-1 ${schoolInvForm.show_revenue_share ? 'bg-primary' : 'bg-muted'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-all ${schoolInvForm.show_revenue_share ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition-colors">Revenue Share</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div 
                        onClick={() => setSchoolInvForm(prev => ({ ...prev, show_whatsapp_option: !prev.show_whatsapp_option }))}
                        className={`w-10 h-6 rounded-full transition-all flex items-center px-1 ${schoolInvForm.show_whatsapp_option ? 'bg-emerald-600' : 'bg-muted'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-all ${schoolInvForm.show_whatsapp_option ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition-colors">WhatsApp Receipt</span>
                    </label>
                  </div>
                </div>

                {/* Live computation preview */}
                {schoolInvForm.school_id && (
                  <div className="bg-card shadow-sm border border-border rounded-none p-4">
                    {loadingSchoolCount ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Counting students…
                      </div>
                    ) : (() => {
                      const isFixed = schoolInvForm.pricing_mode === 'fixed_package';
                      const count = parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0;
                      const ratePerChild = parseFloat(schoolInvForm.rate_per_child) || 0;
                      const fixedPrice = parseFloat(schoolInvForm.fixed_package_price) || 0;
                      const subtotal = isFixed ? fixedPrice : ratePerChild * count;
                      const deposit = parseFloat(schoolInvForm.deposit_amount) || 0;
                      const quotaPct = parseFloat(schoolInvForm.rillcod_quota_percent) || 0;
                      const revenueShareOn = schoolInvForm.show_revenue_share && quotaPct > 0;
                      const rillcodShare = Math.round(subtotal * (quotaPct / 100));
                      const schoolShare = subtotal - rillcodShare;
                      const outstanding = revenueShareOn ? Math.max(0, rillcodShare - deposit) : Math.max(0, subtotal - deposit);
                      return (
                        <div className="flex flex-wrap gap-6 items-center">
                          <div>
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Students</p>
                            <p className="text-2xl font-black text-primary">{count}</p>
                          </div>
                          {!isFixed && (
                            <div>
                              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Rate / Child</p>
                              <p className="text-2xl font-black text-foreground">₦{ratePerChild.toLocaleString()}</p>
                            </div>
                          )}
                          {isFixed && (
                            <div className="bg-primary/10 border border-primary/30 px-4 py-2 rounded-none">
                              <p className="text-[9px] font-black text-primary uppercase tracking-widest">Fixed Package</p>
                              <p className="text-2xl font-black text-foreground">₦{fixedPrice.toLocaleString()}</p>
                            </div>
                          )}
                          <div className="flex-1">
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Invoice Total</p>
                            <p className="text-2xl font-black text-foreground">₦{subtotal.toLocaleString()}</p>
                          </div>
                          {revenueShareOn && (
                            <>
                              <div>
                                <p className="text-[9px] font-black text-primary/70 uppercase tracking-widest">Rillcod {quotaPct}%</p>
                                <p className="text-lg font-black text-primary">₦{rillcodShare.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest">School {100 - quotaPct}%</p>
                                <p className="text-lg font-black text-foreground">₦{schoolShare.toLocaleString()}</p>
                              </div>
                            </>
                          )}
                          {deposit > 0 && (
                            <div>
                              <p className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest">Less Deposit</p>
                              <p className="text-lg font-black text-emerald-400">−₦{deposit.toLocaleString()}</p>
                            </div>
                          )}
                          <div className="bg-primary/10 px-4 py-2 rounded-none border border-primary/20">
                            <p className="text-[9px] font-black text-primary uppercase tracking-widest">
                              {revenueShareOn ? `Rillcod Outstanding` : `Total Outstanding`}
                            </p>
                            <p className="text-2xl font-black text-foreground">₦{outstanding.toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => handleSaveSchoolInvoice(true)}
                    disabled={!schoolInvForm.school_id || (schoolInvForm.pricing_mode === 'per_student' ? !(parseFloat(schoolInvForm.rate_per_child) > 0) : !(parseFloat(schoolInvForm.fixed_package_price) > 0)) || loadingTx}
                    className="flex items-center gap-2 px-6 py-3 border border-primary/40 hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed text-primary font-black text-[10px] uppercase tracking-widest rounded-none transition-all"
                  >
                    {loadingTx ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ShieldCheckIcon className="w-4 h-4" />}
                    {editingSchoolInvId ? 'Update Record Only' : 'Generate & Save Record'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintSchoolInvoice}
                    disabled={!schoolInvForm.school_id || (schoolInvForm.pricing_mode === 'per_student' ? !(parseFloat(schoolInvForm.rate_per_child) > 0) : !(parseFloat(schoolInvForm.fixed_package_price) > 0)) || loadingTx}
                    className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-black font-black text-[10px] uppercase tracking-widest rounded-none transition-all shadow-lg shadow-primary/20"
                  >
                    <DocumentTextIcon className="w-4 h-4" /> 
                    {editingSchoolInvId ? 'Update & Print Invoice' : 'Generate & Print Invoice'}
                  </button>
                </div>
                </div>{/* end form column */}
                {/* Preview column */}
                {/* Preview column */}
                <div className="w-full lg:w-[460px] lg:flex-shrink-0 border-t lg:border-t-0 lg:border-l border-primary/20 bg-white/[0.02] p-4 sm:p-5 lg:self-start lg:sticky lg:top-6">
                  <ScaledIframePreview html={schoolInvPreviewHTML} label="Live Invoice Preview" />
                </div>
                </div>{/* end flex row */}
              </div>
            )}

            {/* ── Receipt Builder ── */}
            {showReceiptBuilder && canManage && (
              <div className="bg-primary/5 border border-primary/20 rounded-none">
                {/* Header */}
                <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-primary/20">
                  <p className="text-xs font-black text-primary uppercase tracking-widest mb-0.5">Receipt Builder</p>
                  <p className="text-foreground font-bold text-sm">Build and print an official payment receipt for a school or student</p>
                </div>
                {/* Split-view: form left + preview right */}
                <div className="flex flex-col lg:flex-row">
                {/* Form column */}
                <div className="flex-1 min-w-0 p-4 sm:p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                  {/* Payer */}
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Received From (Payer)</label>
                    <input
                      type="text"
                      placeholder="School name, student name, or organisation"
                      value={receiptForm.payer_name}
                      onChange={e => setReceiptForm(prev => ({ ...prev, payer_name: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Payer Type</label>
                    <select value={receiptForm.payer_type} onChange={e => setReceiptForm(prev => ({ ...prev, payer_type: e.target.value as 'school' | 'student' | 'other' }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary">
                      <option value="school">School / Institution</option>
                      <option value="student">Student / Parent</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Link to School (optional)</label>
                    <select value={receiptForm.school_id} onChange={e => setReceiptForm(prev => ({ ...prev, school_id: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary">
                      <option value="">— No school link —</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Payment Method</label>
                    <select value={receiptForm.payment_method} onChange={e => setReceiptForm(prev => ({ ...prev, payment_method: e.target.value as 'bank_transfer' | 'cash' | 'pos' | 'cheque' | 'online' }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary">
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cash">Cash</option>
                      <option value="pos">POS Terminal</option>
                      <option value="cheque">Cheque</option>
                      <option value="online">Online Payment</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Payment Date</label>
                    <input type="date" value={receiptForm.payment_date}
                      onChange={e => setReceiptForm(prev => ({ ...prev, payment_date: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Receipt Reference (auto if blank)</label>
                    <input type="text" placeholder="e.g. RCPT-2025-001" value={receiptForm.reference}
                      onChange={e => setReceiptForm(prev => ({ ...prev, reference: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Received By / Signatory</label>
                    <input type="text" placeholder="e.g. Admin, Finance Officer" value={receiptForm.received_by}
                      onChange={e => setReceiptForm(prev => ({ ...prev, received_by: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Deposited To (Account)</label>
                    <select value={receiptForm.pay_to_account_id} onChange={e => setReceiptForm(prev => ({ ...prev, pay_to_account_id: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary">
                      <option value="">— Select account —</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.label} — {a.bank_name}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Notes (optional)</label>
                    <input type="text" placeholder="e.g. First term 2025/2026 coding club payment" value={receiptForm.notes}
                      onChange={e => setReceiptForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                  </div>
                </div>

                {/* Line items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">Line Items</label>
                    <button type="button" onClick={() => setReceiptForm(prev => ({ ...prev, items: [...prev.items, { description: '', quantity: 1, unit_price: 0 }] }))}
                      className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest transition-colors">+ Add Line</button>
                  </div>
                  <div className="space-y-2">
                    {receiptForm.items.map((item, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row gap-2">
                        <input type="text" placeholder="Description" value={item.description}
                          onChange={e => setReceiptForm(prev => { const it = [...prev.items]; it[idx] = { ...it[idx], description: e.target.value }; return { ...prev, items: it }; })}
                          className="flex-1 px-3 py-2 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                        <div className="flex gap-2 items-center">
                          <input type="number" placeholder="Qty" min="1" value={item.quantity}
                            onChange={e => setReceiptForm(prev => { const it = [...prev.items]; it[idx] = { ...it[idx], quantity: parseInt(e.target.value) || 1 }; return { ...prev, items: it }; })}
                            className="w-16 px-3 py-2 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary text-center" />
                          <input type="number" placeholder="Unit ₦" min="0" value={item.unit_price || ''}
                            onChange={e => setReceiptForm(prev => { const it = [...prev.items]; it[idx] = { ...it[idx], unit_price: parseFloat(e.target.value) || 0 }; return { ...prev, items: it }; })}
                            className="w-28 px-3 py-2 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                          <span className="text-sm font-black text-emerald-400 w-24 text-right flex-shrink-0">
                            ₦{(item.quantity * item.unit_price).toLocaleString()}
                          </span>
                          {receiptForm.items.length > 1 && (
                            <button type="button" onClick={() => setReceiptForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))}
                              className="text-rose-400 hover:text-rose-300 font-black text-xs flex-shrink-0">✕</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-2">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 px-5 py-2 rounded-none">
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Total: </span>
                      <span className="text-lg font-black text-emerald-300">
                        ₦{receiptForm.items.reduce((s, i) => s + i.quantity * i.unit_price, 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    onClick={handlePrintReceipt}
                    disabled={!receiptForm.payer_name || receiptForm.items.every(i => i.unit_price === 0)}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-foreground font-black text-xs uppercase tracking-widest rounded-none transition-all shadow-lg shadow-emerald-900/40"
                  >
                    <ReceiptPercentIcon className="w-4 h-4" /> Print Receipt
                  </button>
                  <button
                    onClick={() => handleSaveReceipt()}
                    disabled={loadingTx || !receiptForm.payer_name || receiptForm.items.every(i => i.unit_price === 0)}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-foreground font-black text-xs uppercase tracking-widest rounded-none transition-all shadow-lg shadow-blue-900/40"
                  >
                    {loadingTx ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowDownTrayIcon className="w-4 h-4" />}
                    Save to Portal
                  </button>
                </div>
                </div>{/* end form column */}
                {/* Preview column */}
                {/* Preview column */}
                <div className="w-full lg:w-[460px] lg:flex-shrink-0 border-t lg:border-t-0 lg:border-l border-primary/20 bg-white/[0.02] p-4 sm:p-5 lg:self-start lg:sticky lg:top-6">
                  <ScaledIframePreview html={receiptPreviewHTML} label="Live Receipt Preview" />
                </div>
                </div>{/* end flex row */}
              </div>
            )}

            {/* Invoice Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(() => {
                const pending = invoices.filter(i => i.status === 'sent' || i.status === 'overdue');
                const totalOutstanding = pending.reduce((sum, i) => sum + i.amount, 0);
                const paidCount = invoices.filter(i => i.status === 'paid').length;
                
                return (
                  <>
                    <div className="bg-card shadow-sm border border-border rounded-none p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Outstanding</p>
                        <ClockIcon className="w-4 h-4 text-amber-400" />
                      </div>
                      <p className="text-2xl font-black text-foreground">₦{totalOutstanding.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{pending.length} pending invoices</p>
                    </div>
                    <div className="bg-card shadow-sm border border-border rounded-none p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Settled</p>
                        <CheckBadgeIcon className="w-4 h-4 text-emerald-400" />
                      </div>
                      <p className="text-2xl font-black text-foreground">{paidCount}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Invoices fully paid</p>
                    </div>
                    <div className="bg-card shadow-sm border border-border rounded-none p-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Overdue</p>
                        <InformationCircleIcon className="w-4 h-4 text-rose-400" />
                      </div>
                      <p className="text-2xl font-black text-foreground">{invoices.filter(i => i.status === 'overdue').length}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Requiring immediate attention</p>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card shadow-sm border border-border p-4 rounded-none">
              <div className="flex items-center gap-3">
                <DocumentTextIcon className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-extrabold text-foreground">Invoice Records</h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex gap-1 flex-wrap">
                  {(['all', 'sent', 'paid', 'overdue', 'draft'] as const).map(s => (
                    <button key={s} onClick={() => setFilterInvStatus(s)}
                      className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-none transition-all border ${
                        filterInvStatus === s
                          ? s === 'paid' ? 'bg-green-600 border-green-600 text-white'
                          : s === 'overdue' ? 'bg-rose-600 border-rose-600 text-white'
                          : 'bg-primary border-primary text-black'
                          : 'bg-transparent border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >{s}</button>
                  ))}
                </div>
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="Search invoices..."
                    value={searchInv}
                    onChange={e => setSearchInv(e.target.value)}
                    className="bg-card shadow-sm border border-border rounded-none pl-9 pr-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 w-full sm:w-52"
                  />
                </div>
              </div>
            </div>

            {(() => {
              const filteredInvoices = invoices.filter(inv => {
                const matchSearch = !searchInv ||
                  inv.invoice_number?.toLowerCase().includes(searchInv.toLowerCase()) ||
                  inv.portal_users?.full_name?.toLowerCase().includes(searchInv.toLowerCase());
                const matchStatus = filterInvStatus === 'all' || inv.status === filterInvStatus;
                return matchSearch && matchStatus;
              });
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredInvoices.length === 0 ? (
                    <div className="col-span-full py-20 text-center bg-card shadow-sm border border-dashed border-border rounded-none">
                      <DocumentTextIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground text-sm">No invoices found matching your criteria.</p>
                    </div>
                  ) : (
                    filteredInvoices.map(inv => (
                      <div key={inv.id} className="bg-card shadow-sm border border-border rounded-none flex flex-col hover:border-primary/30 transition-all group">
                        {/* Clickable body */}
                        <div
                          className="p-5 flex-1 cursor-pointer space-y-4"
                          onClick={() => {
                            const total = calculateTotalWithFees(inv.amount);
                            setViewDoc({
                              type: 'invoice',
                              data: {
                                number: inv.invoice_number,
                                date: new Date(inv.created_at).toLocaleDateString(),
                                dueDate: new Date(inv.due_date).toLocaleDateString(),
                                status: inv.status,
                                amount: inv.amount,
                                processingFee: total - inv.amount,
                                currency: inv.currency,
                                items: inv.items,
                                studentName: inv.portal_users?.full_name || inv.schools?.name || 'Student',
                                studentEmail: inv.portal_users?.email,
                                notes: inv.notes,
                                schoolName: inv.schools?.name || 'Rillcod Technologies',
                              }
                            });
                          }}
                        >
                          {/* Top row: ref + status badge */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-0.5">{inv.invoice_number}</p>
                              <p className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors leading-tight truncate">
                                {inv.portal_users?.full_name || inv.schools?.name || 'Student'}
                              </p>
                              {inv.portal_users?.email && (
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{inv.portal_users.email}</p>
                              )}
                              {inv.schools?.name && !inv.portal_users && (
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{inv.schools.name}</p>
                              )}
                            </div>
                            <span className={`flex-shrink-0 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border ${
                              inv.status === 'paid'      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                              inv.status === 'overdue'   ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                              inv.status === 'cancelled' ? 'bg-slate-500/10 border-slate-500/20 text-slate-400' :
                              inv.status === 'draft'     ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                                           'bg-primary/10 border-primary/20 text-primary'
                            }`}>
                              {inv.status}
                            </span>
                          </div>

                          {/* Bottom row: amount + due date */}
                          <div className="flex items-end justify-between pt-1 border-t border-border/50">
                            <div>
                              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">
                                {inv.status === 'paid' ? 'Paid' : 'Due'}
                              </p>
                              <p className="text-xl font-black text-foreground tabular-nums">₦{inv.amount.toLocaleString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Due Date</p>
                              <p className={`text-xs font-bold ${
                                inv.status === 'overdue' ? 'text-rose-400' : 'text-muted-foreground'
                              }`}>
                                {new Date(inv.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Action bar */}
                        {canManage && (
                          <div className="flex border-t border-border divide-x divide-border" onClick={e => e.stopPropagation()}>
                            {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                              <button
                                onClick={() => handleMarkInvoicePaid(inv.id)}
                                disabled={loadingTx}
                                className="flex-1 py-2.5 flex items-center justify-center gap-1 text-[9px] font-black text-emerald-400 hover:bg-emerald-500/10 transition-colors uppercase tracking-widest disabled:opacity-40"
                              >
                                <CheckIcon className="w-3 h-3" /> Paid
                              </button>
                            )}
                            <button
                              onClick={e => openEditInvoice(inv, e)}
                              className="flex-1 py-2.5 flex items-center justify-center gap-1 text-[9px] font-black text-muted-foreground hover:text-foreground hover:bg-muted transition-colors uppercase tracking-widest"
                            >
                              <PencilIcon className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={(e) => {
                                const invRow = invoices.find(i => i.invoice_number === inv.invoice_number);
                                if (invRow) handleSendInvoiceEmail(invRow.id);
                              }}
                              disabled={loadingTx}
                              className="flex-1 py-2.5 flex items-center justify-center gap-1 text-[9px] font-black text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors uppercase tracking-widest disabled:opacity-40"
                              title="Send email to student"
                            >
                              <EnvelopeIcon className="w-3 h-3" /> Send
                            </button>
                            <button
                              onClick={(e) => handleDeleteInvoice(inv.id, e)}
                              disabled={loadingTx}
                              className="px-3.5 py-2.5 flex items-center justify-center text-[9px] font-black text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                              title="Delete invoice"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              );
            })()}

            {/* ── Saved Receipts ── */}
            {savedReceipts.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-card border border-border p-4">
                  <ReceiptPercentIcon className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-extrabold text-foreground">Issued Receipts</h3>
                  <span className="ml-auto text-[10px] font-black text-muted-foreground uppercase tracking-widest">{savedReceipts.length} records</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedReceipts.map(rcpt => {
                    const meta = rcpt.metadata || {};
                    return (
                      <div key={rcpt.id} className="bg-card border border-border rounded-none p-5 flex flex-col gap-3 hover:border-primary/30 transition-all cursor-pointer group"
                        onClick={() => setViewDoc({
                          type: 'receipt',
                          data: {
                            number: rcpt.receipt_number,
                            date: new Date(rcpt.issued_at).toLocaleDateString(),
                            status: 'paid',
                            items: (meta.items && meta.items.length > 0
                              ? meta.items.map((it: any) => ({
                                  description: String(it.description ?? 'Payment'),
                                  quantity: Number(it.quantity ?? 1),
                                  unit_price: Number(it.unit_price ?? 0),
                                  total: Number(it.total ?? (Number(it.quantity ?? 1) * Number(it.unit_price ?? 0))),
                                }))
                              : [{ description: 'Payment', quantity: 1, unit_price: rcpt.amount, total: rcpt.amount }]),
                            amount: rcpt.amount,
                            currency: rcpt.currency || 'NGN',
                            studentName: meta.payer_name || rcpt.portal_users?.full_name || rcpt.schools?.name || 'Client',
                            studentEmail: rcpt.portal_users?.email,
                            schoolName: 'RILLCOD TECHNOLOGIES',
                            notes: meta.notes,
                            transactionRef: meta.reference || rcpt.receipt_number,
                            instructorName: meta.received_by || 'Accounts Department',
                            paymentMethod: meta.payment_method,
                            receivedBy: meta.received_by,
                            depositAccount: meta.deposit_account,
                          }
                        })}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-[10px] font-black text-primary uppercase tracking-widest">{rcpt.receipt_number}</p>
                            <p className="text-sm font-black text-foreground group-hover:text-primary transition-colors">
                              {meta.payer_name || rcpt.portal_users?.full_name || rcpt.schools?.name || 'Client'}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded-full uppercase">PAID</span>
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Amount</p>
                            <p className="text-xl font-black text-foreground">₦{rcpt.amount.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Issued</p>
                            <p className="text-xs font-bold text-muted-foreground">{new Date(rcpt.issued_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        {meta.payment_method && (
                          <p className="text-[10px] text-muted-foreground capitalize">
                            via {meta.payment_method!.replace('_', ' ')}
                            {rcpt.schools?.name ? ` • ${rcpt.schools.name}` : ''}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Document Viewer Overlay ── */}
      {viewDoc && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md overflow-y-auto pt-20 pb-20 px-0 sm:px-4">
          <div className="relative max-w-[850px] mx-auto">
            <div className="fixed top-4 right-4 flex flex-wrap items-center gap-2 z-[110]">
              {viewDoc.type === 'invoice' && viewDoc.data.status !== 'paid' && 
                (profile?.role === 'student' || profile?.role === 'school') && (
                <button 
                  onClick={() => {
                    const inv = invoices.find(i => i.invoice_number === viewDoc!.data.number);
                    if (inv) handlePayWithPaystack(inv);
                  }}
                  disabled={loadingTx}
                  className="px-6 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-sm font-black uppercase tracking-widest rounded-none transition-all shadow-xl hover:scale-105 active:scale-95 flex flex-col items-center"
                >
                  <div className="flex items-center gap-2">
                    {loadingTx ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CreditCardIcon className="w-5 h-5" />}
                    <span>Pay ₦{calculateTotalWithFees(viewDoc.data.amount).toLocaleString()}</span>
                  </div>
                  <span className="text-[8px] opacity-60 mt-0.5 whitespace-nowrap">Includes Paystack Admin Fee</span>
                </button>
              )}
              {viewDoc.type === 'invoice' && canManage && viewDoc.data.status !== 'paid' && (
                <button
                  onClick={() => {
                    const inv = invoices.find(i => i.invoice_number === viewDoc!.data.number);
                    if (inv) handleMarkInvoicePaid(inv.id);
                  }}
                  disabled={loadingTx}
                  className="px-6 py-3 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-black uppercase tracking-widest rounded-none transition-all shadow-xl shadow-emerald-900/40 hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                  {loadingTx ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckBadgeIcon className="w-5 h-5" />}
                  Mark as Paid
                </button>
              )}
              {viewDoc.type === 'invoice' && canManage && (
                <button
                  onClick={() => {
                    const inv = invoices.find(i => i.invoice_number === viewDoc!.data.number);
                    if (inv) handleSendInvoiceEmail(inv.id);
                  }}
                  disabled={loadingTx}
                  className="px-6 py-3 bg-card border border-border hover:bg-muted disabled:opacity-50 text-foreground text-sm font-black uppercase tracking-widest rounded-none transition-all shadow-xl hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                  {loadingTx ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <EnvelopeIcon className="w-5 h-5" />}
                  Send via Email
                </button>
              )}
              <button 
                onClick={() => setViewDoc(null)}
                className="p-3 bg-muted hover:bg-muted text-foreground rounded-full transition-all hover:scale-110 active:scale-90"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="mt-4">
              <SmartDocument type={viewDoc.type} data={viewDoc.data} />
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice Creation Modal ── */}
      {showInvoiceForm && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-background border border-border rounded-none w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-extrabold text-foreground">Create Invoice</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Invoice will be sent to the student immediately</p>
              </div>
              <button onClick={() => setShowInvoiceForm(false)} className="p-2 hover:bg-card rounded-none text-muted-foreground hover:text-foreground transition-all">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateInvoice} className="p-6 overflow-y-auto space-y-5">

              {/* Student + Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Student <span className="text-rose-400">*</span></label>
                  <select
                    required
                    value={invForm.student_id}
                    onChange={e => setInvForm({ ...invForm, student_id: e.target.value })}
                    className="w-full px-4 py-3 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary appearance-none">
                    <option value="">— Choose Student —</option>
                    {allStudents.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Due Date <span className="text-rose-400">*</span></label>
                  <input
                    type="date" required
                    value={invForm.due_date}
                    onChange={e => setInvForm({ ...invForm, due_date: e.target.value })}
                    className="w-full px-4 py-3 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Line Items <span className="text-rose-400">*</span></label>
                  <button type="button"
                    onClick={() => setInvForm(prev => ({ ...prev, items: [...prev.items, { description: '', quantity: 1, unit_price: 0, total: 0 }] }))}
                    className="text-[10px] font-black text-primary hover:text-primary/80 uppercase tracking-widest">+ Add Line</button>
                </div>
                <div className="space-y-2">
                  {invForm.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text" placeholder="Description (e.g. Coding Club Fee Q1)"
                        value={item.description} required
                        onChange={e => setInvForm(prev => {
                          const items = [...prev.items];
                          items[idx] = { ...items[idx], description: e.target.value };
                          return { ...prev, items };
                        })}
                        className="flex-1 px-3 py-2.5 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                      <input
                        type="number" placeholder="Qty" min="1"
                        value={item.quantity}
                        onChange={e => setInvForm(prev => {
                          const items = [...prev.items];
                          const qty = parseInt(e.target.value) || 1;
                          items[idx] = { ...items[idx], quantity: qty, total: qty * items[idx].unit_price };
                          return { ...prev, items };
                        })}
                        className="w-14 px-2 py-2.5 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary text-center" />
                      <input
                        type="number" placeholder="₦" min="0"
                        value={item.unit_price || ''}
                        onChange={e => setInvForm(prev => {
                          const items = [...prev.items];
                          const price = parseFloat(e.target.value) || 0;
                          items[idx] = { ...items[idx], unit_price: price, total: items[idx].quantity * price };
                          const total = items.reduce((s, i) => s + i.total, 0);
                          return { ...prev, items, amount: String(total) };
                        })}
                        className="w-28 px-3 py-2.5 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary" />
                      <span className="text-sm font-black text-foreground w-24 text-right flex-shrink-0">
                        ₦{(item.quantity * item.unit_price).toLocaleString()}
                      </span>
                      {invForm.items.length > 1 && (
                        <button type="button"
                          onClick={() => setInvForm(prev => {
                            const items = prev.items.filter((_, i) => i !== idx);
                            const total = items.reduce((s, i) => s + i.total, 0);
                            return { ...prev, items, amount: String(total) };
                          })}
                          className="text-rose-400 hover:text-rose-300 font-black text-xs flex-shrink-0">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-3">
                  <div className="bg-primary/10 border border-primary/20 px-5 py-2">
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">Total: </span>
                    <span className="text-lg font-black text-foreground">
                      ₦{invForm.items.reduce((s, i) => s + i.quantity * i.unit_price, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Notes (Optional)</label>
                <textarea
                  value={invForm.notes}
                  onChange={e => setInvForm({ ...invForm, notes: e.target.value })}
                  placeholder="e.g. First term 2025/2026 fee. Payment due before resumption."
                  className="w-full px-4 py-3 bg-card border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary h-20 resize-none" />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button"
                  disabled={!invForm.student_id || invForm.items.every(i => i.unit_price === 0)}
                  onClick={() => {
                    const items = invForm.items.filter(i => i.description && i.unit_price > 0);
                    const total = items.reduce((s, i) => s + i.total, 0);
                    const selectedStudent = allStudents.find(s => s.id === invForm.student_id);
                    const docRef = `INV-${Date.now().toString(36).toUpperCase()}`;
                    setViewDoc({
                      type: 'invoice',
                      data: {
                        number: docRef,
                        date: new Date().toLocaleDateString(),
                        dueDate: new Date(invForm.due_date).toLocaleDateString(),
                        status: 'sent',
                        items,
                        amount: total,
                        currency: 'NGN',
                        studentName: selectedStudent?.full_name || 'Student',
                        studentEmail: selectedStudent?.email,
                        notes: invForm.notes,
                        schoolName: 'RILLCOD TECHNOLOGIES',
                      }
                    });
                  }}
                  className="flex items-center gap-2 px-5 py-3 bg-card border border-border hover:border-primary/50 text-foreground font-black text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  <DocumentTextIcon className="w-4 h-4" /> Preview
                </button>
                <button
                  type="submit"
                  disabled={loadingTx || !invForm.student_id || invForm.items.every(i => i.unit_price === 0)}
                  className="flex-1 py-3 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm uppercase tracking-widest transition-all shadow-lg">
                  {loadingTx ? 'Generating...' : 'Issue Invoice & Notify →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-background border border-border rounded-none p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold text-foreground">{editing ? 'Edit Account' : 'Add Payment Account'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 text-muted-foreground hover:text-foreground rounded-none hover:bg-muted">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Owner type (admin only) */}
              {isAdmin && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account Owner</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['rillcod', 'school'] as const).map(t => (
                      <button key={t} type="button"
                        onClick={() => setForm(f => ({ ...f, owner_type: t, school_id: t === 'rillcod' ? null : f.school_id }))}
                        className={`py-2.5 rounded-none text-sm font-bold border transition-all ${form.owner_type === t ? 'bg-primary border-primary text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:text-foreground'}`}>
                        {t === 'rillcod' ? 'Rillcod Technologies' : 'Partner School'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* School selector (admin, school type) */}
              {isAdmin && form.owner_type === 'school' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Partner School <span className="text-rose-400">*</span></label>
                  <select value={form.school_id ?? ''} onChange={e => setForm(f => ({ ...f, school_id: e.target.value || null }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
                    <option value="">— Select school —</option>
                    {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {/* Label */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account Label <span className="text-rose-400">*</span></label>
                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Main Collection Account, School Fees Account"
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>

              {/* Bank + Account type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bank Name <span className="text-rose-400">*</span></label>
                  <select value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
                    <option value="">— Select bank —</option>
                    {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account Number <span className="text-rose-400">*</span></label>
                  <input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    placeholder="10 digits" maxLength={10}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 font-mono tracking-widest" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account Type</label>
                  <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value as 'savings' | 'current' }))}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
                    <option value="savings">Savings</option>
                    <option value="current">Current</option>
                  </select>
                </div>
              </div>

              {/* Account name */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account Name <span className="text-rose-400">*</span></label>
                <input value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
                  placeholder="Exact name on the bank account"
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>

              {/* Payment note */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment Note / Instructions</label>
                <textarea value={form.payment_note ?? ''} onChange={e => setForm(f => ({ ...f, payment_note: e.target.value }))}
                  placeholder="e.g. Use student name and class as payment reference. Send proof to school admin."
                  rows={3}
                  className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 resize-none" />
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${form.is_active ? 'bg-primary' : 'bg-muted'}`}
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
                  <div className={`w-5 h-5 bg-white rounded-full mt-0.5 transition-transform shadow ${form.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-muted-foreground font-semibold">Active — visible to students and staff</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={save}
                disabled={saving || !form.label.trim() || !form.bank_name || !form.account_number.trim() || !form.account_name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-black font-bold text-sm rounded-none transition-all">
                {saving ? <div className="w-4 h-4 border-2 border-border border-t-transparent rounded-full animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                {editing ? 'Update' : 'Save Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Invoice Modal ─────────────────────────────────────────── */}
      {editingInv && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-8 bg-black/70 backdrop-blur-md overflow-y-auto">
          <div className="bg-background border border-border w-full max-w-2xl shadow-2xl flex flex-col mb-8">

            {/* Header */}
            <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4 bg-card">
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Edit Invoice</p>
                <h3 className="text-lg font-extrabold text-foreground leading-none">{editingInv.invoice_number}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {editingInv.schools?.name
                    ? <span className="text-violet-400 font-bold">{editingInv.schools.name}</span>
                    : editingInv.portal_users?.full_name
                      ? <span className="text-blue-400 font-bold">{editingInv.portal_users.full_name}</span>
                      : '—'}
                </p>
              </div>
              <button onClick={() => setEditingInv(null)} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-all flex-shrink-0">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateInvoice} className="flex flex-col">

              {/* ── Status ─────────────────────────────────────────────── */}
              <div className="px-6 pt-5 pb-4 border-b border-border space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Status</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setEditInvForm(f => ({ ...f, status: s }))}
                      className={`py-2 text-[9px] font-black uppercase tracking-wider border transition-all ${
                        editInvForm.status === s
                          ? s === 'paid' ? 'bg-emerald-600 border-emerald-600 text-white'
                          : s === 'overdue' ? 'bg-rose-600 border-rose-600 text-white'
                          : s === 'cancelled' ? 'bg-slate-600 border-slate-600 text-white'
                          : 'bg-primary border-primary text-black'
                          : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Student Selection (Optional for reassignment) ─────────────── */}
              {editInvForm.portal_user_id && (
                <div className="px-6 pt-5 pb-4 border-b border-border space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Assign to Student</label>
                  <select
                    value={editInvForm.portal_user_id}
                    onChange={e => setEditInvForm(f => ({ ...f, portal_user_id: e.target.value }))}
                    className="w-full px-3 py-2 bg-card border border-border text-foreground text-xs rounded-none focus:outline-none focus:border-primary/50"
                  >
                    <option value="">— Choose Student —</option>
                    {allStudents.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>)}
                  </select>
                </div>
              )}

              {/* ── Line Items ─────────────────────────────────────────── */}
              <div className="px-6 pt-5 pb-4 border-b border-border space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Line Items</label>
                  <button type="button"
                    onClick={() => setEditInvForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, unit_price: 0, total: 0 }] }))}
                    className="text-[9px] font-black uppercase tracking-wider text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
                    <PlusIcon className="w-3 h-3" /> Add Line
                  </button>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-12 gap-1.5 text-[8px] font-black text-muted-foreground uppercase tracking-widest px-1">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Unit Price</div>
                  <div className="col-span-2 text-right">Total</div>
                  <div className="col-span-1" />
                </div>

                <div className="space-y-1.5">
                  {editInvForm.items.map((item, idx) => {
                    const lineTotal = item.quantity * item.unit_price;
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
                        <input
                          className="col-span-5 px-2 py-1.5 bg-card border border-border text-foreground text-xs rounded-none focus:outline-none focus:border-primary/50"
                          placeholder="Description"
                          value={item.description}
                          onChange={e => setEditInvForm(f => {
                            const items = [...f.items];
                            items[idx] = { ...items[idx], description: e.target.value };
                            return { ...f, items };
                          })}
                        />
                        <input
                          type="number" min="0" step="1"
                          className="col-span-2 px-2 py-1.5 bg-card border border-border text-foreground text-xs text-right rounded-none focus:outline-none focus:border-primary/50"
                          value={item.quantity}
                          onChange={e => setEditInvForm(f => {
                            const items = [...f.items];
                            const qty = Number(e.target.value) || 0;
                            items[idx] = { ...items[idx], quantity: qty, total: qty * items[idx].unit_price };
                            return { ...f, items };
                          })}
                        />
                        <input
                          type="number" min="0" step="0.01"
                          className="col-span-2 px-2 py-1.5 bg-card border border-border text-foreground text-xs text-right rounded-none focus:outline-none focus:border-primary/50"
                          value={item.unit_price}
                          onChange={e => setEditInvForm(f => {
                            const items = [...f.items];
                            const up = Number(e.target.value) || 0;
                            items[idx] = { ...items[idx], unit_price: up, total: items[idx].quantity * up };
                            return { ...f, items };
                          })}
                        />
                        <div className="col-span-2 text-right text-xs font-bold text-foreground tabular-nums pr-1">
                          {lineTotal < 0 ? '-' : ''}₦{Math.abs(lineTotal).toLocaleString()}
                        </div>
                        <button type="button"
                          disabled={editInvForm.items.length === 1}
                          onClick={() => setEditInvForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
                          className="col-span-1 flex items-center justify-center text-muted-foreground hover:text-rose-400 transition-colors disabled:opacity-20">
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Total row */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total</span>
                  <span className="text-lg font-black text-primary tabular-nums">
                    ₦{editInvForm.items.reduce((s, it) => s + it.quantity * it.unit_price, 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* ── Due Date + Notes ────────────────────────────────────── */}
              <div className="px-6 pt-5 pb-4 border-b border-border grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Due Date</label>
                  <input type="date" value={editInvForm.due_date}
                    onChange={e => setEditInvForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-card border border-border text-foreground text-sm rounded-none focus:outline-none focus:border-primary/50 transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Notes</label>
                  <textarea value={editInvForm.notes}
                    onChange={e => setEditInvForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2} placeholder="Payment instructions, notes…"
                    className="w-full px-4 py-2.5 bg-card border border-border text-foreground text-sm rounded-none focus:outline-none focus:border-primary/50 resize-none transition-colors placeholder-muted-foreground/50" />
                </div>
              </div>

              {/* ── Actions ────────────────────────────────────────────── */}
              <div className="px-6 py-4 flex gap-3">
                <button type="button" onClick={() => {
                  const items = editInvForm.items.filter(i => i.description && i.unit_price > 0);
                  const total = items.reduce((s, i) => s + i.total, 0);
                  const selectedStudent = allStudents.find(s => s.id === editInvForm.portal_user_id);
                  setViewDoc({
                    type: 'invoice',
                    data: {
                      number: editingInv.invoice_number,
                      date: new Date(editingInv.created_at).toLocaleDateString(),
                      dueDate: new Date(editInvForm.due_date).toLocaleDateString(),
                      status: editInvForm.status,
                      items,
                      amount: total,
                      currency: 'NGN',
                      studentName: selectedStudent?.full_name || editingInv.portal_users?.full_name || 'Student',
                      studentEmail: selectedStudent?.email || editingInv.portal_users?.email,
                      notes: editInvForm.notes,
                      schoolName: 'RILLCOD TECHNOLOGIES',
                    }
                  });
                }}
                  className="px-5 py-2.5 border border-border text-muted-foreground text-[11px] font-black uppercase tracking-widest hover:text-foreground hover:border-foreground/20 transition-all flex items-center justify-center gap-2">
                  <DocumentTextIcon className="w-3.5 h-3.5" /> Preview
                </button>
                <div className="flex-1" />
                <button type="button" onClick={() => setEditingInv(null)}
                  className="px-5 py-2.5 border border-border text-muted-foreground text-[11px] font-black uppercase tracking-widest hover:text-foreground hover:border-foreground/20 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={loadingTx}
                  className="px-8 py-2.5 bg-primary hover:bg-primary/90 text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
                  {loadingTx
                    ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                    : <CheckIcon className="w-3.5 h-3.5" />}
                  Save Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
