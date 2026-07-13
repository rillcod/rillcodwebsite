'use client';

/**
 * SchoolBillingDocsPanel
 *
 * Generates two official billing documents for partner schools:
 *
 * 1. Payment Register — for schools where students pay to the school account
 *    and the school then pays Rillcod (e.g. Word of Faith). Shows per-student
 *    name, class, amount, receipt number, and date of payment.
 *
 * 2. Attendance Billing Roster — for schools billed based on attendance.
 *    Shows students who attended class sessions within a date range so the
 *    school can calculate and remit based on the agreed rate/percentage.
 *
 * After generating an Attendance Roster, the panel offers a one-click flow
 * to create a matching school invoice pre-filled with the computed total.
 * Recent documents are archived server-side (localStorage is offline fallback).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  PrinterIcon, DocumentTextIcon, ArrowPathIcon, BuildingOfficeIcon,
  CheckCircleIcon, ClockIcon, PlusIcon, XMarkIcon,
} from '@/lib/icons';
import { deriveSchoolPricingFromInvoice } from '@/lib/billing/derive-school-pricing';

type DocType = 'payment_register' | 'attendance_roster' | 'billing_statement';

interface School { id: string; name: string; }
interface StudentRow {
  id: string;
  full_name: string;
  section_class: string | null;
  grade: string | null;
  email: string | null;
}
interface InvoiceRow {
  portal_user_id: string | null;
  amount: number;
  currency: string;
  status: string;
  due_date: string | null;
}
interface ReceiptRow {
  id: string;
  receipt_number: string;
  amount: number;
  issued_at: string;
  portal_user_id: string | null;
  metadata?: { payment_method?: string } | null;
}
const TERM_LABELS = ['First Term', 'Second Term', 'Third Term'];
const CURRENT_YEAR = new Date().getFullYear();
const DOCS_STORAGE_KEY = 'rillcod_billing_docs_recent';

/**
 * Shared print CSS so rows/blocks never split mid-way across pages.
 * `accent` tints header underline / thead (hex without #).
 */
function printDocCss(opts: {
  accent: string;
  accentSoft?: string;
  pageSize?: 'A4 portrait' | 'A4 landscape';
  watermark?: string;
}) {
  const accent = opts.accent.replace(/^#/, '');
  const soft = (opts.accentSoft || `${accent}22`).replace(/^#/, '');
  const pageSize = opts.pageSize || 'A4 portrait';
  return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:auto}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:18px 22px;font-size:11.5px;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:${pageSize};margin:10mm 11mm}
@media print{
  body{padding:0 !important}
  .no-print{display:none !important}
  .keep{break-inside:avoid !important;page-break-inside:avoid !important}
  .header,.meta,.inv-block,.summary,.footer,.note,.pay-section,.total-bar,.total-box{break-inside:avoid !important;page-break-inside:avoid !important}
  thead{display:table-header-group}
  tfoot{display:table-footer-group}
  /* Keep each student row whole — never split a name/amount across pages */
  tr{break-inside:avoid !important;page-break-inside:avoid !important}
  td,th{break-inside:avoid !important;page-break-inside:avoid !important}
  table{break-inside:auto;page-break-inside:auto;border-collapse:collapse}
  .after-table{break-before:avoid;page-break-before:avoid}
  tbody td{padding:5px 7px !important}
  thead th{padding:6px 7px !important}
}
.header{display:flex;align-items:center;gap:14px;border-bottom:4px solid #${accent};padding-bottom:12px;margin-bottom:12px}
.logo{width:48px;height:48px;object-fit:contain;flex-shrink:0}
.org-name{font-size:17px;font-weight:900;color:#${accent};letter-spacing:-0.3px}
.org-sub{font-size:9px;color:#6b7280;font-weight:600;margin-top:1px}
.doc-badge{margin-left:auto;text-align:right}
.doc-type,.badge-lbl{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.doc-ref{font-size:18px;font-weight:900;color:#${accent}}
.meta{display:flex;flex-wrap:wrap;gap:14px 20px;margin-bottom:12px;padding:10px 14px;background:#${soft};border-radius:8px;border:1px solid #${accent}33}
.meta-item{display:flex;flex-direction:column;gap:2px;min-width:110px}
.meta-lbl{font-size:8px;font-weight:700;color:#${accent};text-transform:uppercase;letter-spacing:0.5px}
.meta-val{font-size:12px;font-weight:900;color:#111}
table{width:100%;border-collapse:collapse;font-size:10.5px;table-layout:fixed}
thead tr{background:#${accent};color:#fff}
thead th{padding:7px 8px;text-align:left;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;vertical-align:middle}
tbody tr{border-bottom:1px solid #e5e7eb}
tbody tr:nth-child(even){background:#f8fafc}
tbody td{padding:6px 8px;color:#374151;vertical-align:middle;word-wrap:break-word;overflow-wrap:anywhere}
.summary{margin-top:14px;display:flex;flex-wrap:wrap;gap:12px}
.sum-box{flex:1;min-width:120px;padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;text-align:center}
.sum-lbl{font-size:8px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.sum-val{font-size:16px;font-weight:900;color:#111}
.footer{margin-top:18px;border-top:1px solid #e5e7eb;padding-top:12px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;font-size:9px;color:#9ca3af}
.sig-line{border-top:1px solid #374151;width:150px;padding-top:4px;color:#6b7280;margin-top:28px}
.note{margin-top:12px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;font-size:10px;color:#92400e}
${opts.watermark || ''}
`.trim();
}

function DocsLbl({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">
      {children}
    </label>
  );
}

function DocsInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
    />
  );
}

function DocsSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary"
    >
      {children}
    </select>
  );
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  account_type: string;
  label: string;
  payment_note: string | null;
}

interface LinkedInvoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  items: Array<{ description?: string; quantity?: number; unit_price?: number; total?: number }>;
  metadata?: { term_label?: string; academic_year?: number; term_number?: number; payment_method?: string } | null;
}

interface RosterResult {
  total: number | null;
  studentCount: number;
  docRef: string;
  rate: number | null;
}

interface RecentDoc {
  ref: string;
  type: DocType;
  school: string;
  term: string;
  amount?: number;
  currency?: string;
  invoiceNumber?: string;
  date: string;
}

interface StudentBillingData {
  name: string;
  grade: string;
  cls: string;
  amount: number | null;
  sessions?: number;
  receiptNumber?: string;
  status: string;
  statusColor: string;
}

interface OverdueSchool {
  id: string;
  name: string;
  invoice_number: string;
  amount: number;
  currency: string;
  due_date: string;
  daysOverdue: number;
}

interface LastStatement {
  docRef: string;
  invoiceRef: string;
  amount: number;
  studentCount: number;
  period: string;
  dueDate: string;
  currency: string;
}

export function SchoolBillingDocsPanel() {
  const { profile } = useAuth();

  const [docType, setDocType] = useState<DocType>('payment_register');
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [termNumber, setTermNumber] = useState('1');
  const [academicYear, setAcademicYear] = useState(String(CURRENT_YEAR));
  const [flatRate, setFlatRate] = useState('');
  /** Separate from flatRate so payment-register auto-fill does not fight attendance rate typing. */
  const [sessionRate, setSessionRate] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkedInvoice, setLinkedInvoice] = useState<LinkedInvoice | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [billStyle, setBillStyle] = useState<'payment' | 'attendance'>('payment');
  const [printMode, setPrintMode] = useState<'combined' | 'individual' | 'preview'>('combined');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [rosterResult, setRosterResult] = useState<RosterResult | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [invoiceCreated, setInvoiceCreated] = useState<{ id: string; invoice_number: string } | null>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [overdueSchools, setOverdueSchools] = useState<OverdueSchool[]>([]);
  const [lastStatement, setLastStatement] = useState<LastStatement | null>(null);
  const [lastStudents, setLastStudents] = useState<StudentBillingData[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const r = await fetch('/api/billing/docs/data?bootstrap=1', { cache: 'no-store' });
        const j = r.ok ? await r.json() : { data: {} };
        setSchools(j.data?.schools ?? []);
        setBankAccounts((j.data?.bankAccounts ?? []).filter((a: any) => a.is_active !== false));
        setOverdueSchools(j.data?.overdueSchools ?? []);
      } catch { /* ignore */ }

      try {
        const r = await fetch('/api/billing/docs/archive?limit=12', { cache: 'no-store' });
        const j = r.ok ? await r.json() : { data: [] };
        const rows = (j.data ?? []).map((d: any) => ({
          ref: d.doc_ref,
          type: d.doc_type,
          school: d.school_name ?? '',
          term: d.term_label ?? d.period_label ?? '',
          amount: d.amount != null ? Number(d.amount) : undefined,
          currency: d.currency ?? 'NGN',
          invoiceNumber: d.invoice_number ?? undefined,
          date: d.created_at,
        }));
        if (rows.length) {
          setRecentDocs(rows);
          return;
        }
      } catch { /* fall through to localStorage */ }

      try {
        const saved = JSON.parse(localStorage.getItem(DOCS_STORAGE_KEY) ?? '[]');
        if (Array.isArray(saved)) setRecentDocs(saved);
      } catch { /* ignore */ }
    };
    init();
  }, []); // eslint-disable-line

  // Auto-lookup matching school invoice when school + term + year changes
  useEffect(() => {
    if (!schoolId || docType !== 'payment_register') { setLinkedInvoice(null); return; }
    setLookingUp(true);
    fetch(`/api/billing/docs/data?mode=linked&schoolId=${encodeURIComponent(schoolId)}&academicYear=${encodeURIComponent(academicYear)}&termNumber=${encodeURIComponent(termNumber)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { data: { invoice: null } }))
      .then((j) => {
        const inv = (j.data?.invoice ?? null) as LinkedInvoice | null;
        setLinkedInvoice(inv);
        if (inv) {
          setCurrency(inv.currency ?? 'NGN');
          const pricing = deriveSchoolPricingFromInvoice(inv);
          if (pricing?.flat_rate) setFlatRate(pricing.flat_rate);
          else if (pricing?.rate_per_child) setFlatRate(pricing.rate_per_child);
        }
        setLookingUp(false);
      })
      .catch(() => setLookingUp(false));
  }, [schoolId, termNumber, academicYear, docType]);

  const saveRecentDoc = useCallback((entry: RecentDoc & { schoolId?: string; studentCount?: number; dueDate?: string; period?: string }) => {
    setRecentDocs(prev => {
      const updated = [entry, ...prev.filter(d => d.ref !== entry.ref)].slice(0, 12);
      try { localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
    void fetch('/api/billing/docs/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_ref: entry.ref,
        doc_type: entry.type,
        school_id: entry.schoolId || schoolId || null,
        school_name: entry.school,
        term_label: entry.term,
        amount: entry.amount,
        currency: entry.currency,
        invoice_number: entry.invoiceNumber,
        student_count: entry.studentCount,
        period_label: entry.period || entry.term,
        due_date: entry.dueDate || null,
      }),
    }).catch(() => { /* archive is best-effort until migration applied */ });
  }, [schoolId]);

  const fmt = (n: number, cur = 'NGN') =>
    cur === 'USD'
      ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : `₦${n.toLocaleString('en-NG')}`;

  const termLabel = `${TERM_LABELS[parseInt(termNumber) - 1]} ${academicYear}/${parseInt(academicYear) + 1}`;
  const school = schools.find(s => s.id === schoolId);

  // ── Create school invoice from attendance roster total ────────────
  const createInvoiceFromRoster = useCallback(async () => {
    if (!rosterResult?.total || !schoolId) return;
    setCreatingInvoice(true);
    setInvoiceCreated(null);
    try {
      const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const dateRange = dateFrom && dateTo
        ? ` (${new Date(dateFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${new Date(dateTo).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})`
        : '';
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId, stream: 'school', currency, amount: rosterResult.total, status: 'sent', due_date: dueDate,
          items: [{
            description: `Attendance-based STEM sessions${dateRange}`,
            quantity: rosterResult.studentCount,
            unit_price: rosterResult.rate ?? Math.round(rosterResult.total / rosterResult.studentCount),
            total: rosterResult.total,
          }],
          metadata: {
            term_number: parseInt(termNumber), academic_year: parseInt(academicYear), term_label: termLabel,
            payment_method: 'bank_transfer', attendance_doc_ref: rosterResult.docRef,
            date_from: dateFrom || null, date_to: dateTo || null,
          },
          notes: `Auto-generated from Attendance Billing Roster ${rosterResult.docRef}`,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to create roster invoice');
      const data = result.data;
      setInvoiceCreated({ id: data.id, invoice_number: data.invoice_number });
      setRosterResult(null);
      // Update the recent doc entry with the invoice number
      setRecentDocs(prev => {
        const updated = prev.map(d =>
          d.ref === rosterResult.docRef ? { ...d, invoiceNumber: data.invoice_number } : d
        );
        try { localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
        return updated;
      });
    } catch (e: any) {
      alert(e.message ?? 'Failed to create invoice');
    } finally {
      setCreatingInvoice(false);
    }
  }, [rosterResult, schoolId, currency, termNumber, academicYear, termLabel, dateFrom, dateTo]);

  // ── Build and print Payment Register ─────────────────────────────
  const generatePaymentRegister = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setRosterResult(null);
    setInvoiceCreated(null);
    try {
      const regRes = await fetch(`/api/billing/docs/data?mode=register&schoolId=${encodeURIComponent(schoolId)}`, { cache: 'no-store' });
      const regJson = await regRes.json().catch(() => ({}));
      if (!regRes.ok) throw new Error(regJson.error || 'Failed to load payment register data');
      const students: StudentRow[] = (regJson.data?.students ?? []) as StudentRow[];
      const invoices: InvoiceRow[] = (regJson.data?.invoices ?? []) as InvoiceRow[];
      const receipts: ReceiptRow[] = (regJson.data?.receipts ?? []) as ReceiptRow[];

      const invMap: Record<string, InvoiceRow> = {};
      invoices.forEach(inv => {
        if (!inv.portal_user_id) return;
        const ex = invMap[inv.portal_user_id];
        if (!ex || inv.status === 'paid') invMap[inv.portal_user_id] = inv;
      });
      const recMap: Record<string, ReceiptRow> = {};
      receipts.forEach(rec => {
        if (!rec.portal_user_id) return;
        if (!recMap[rec.portal_user_id]) recMap[rec.portal_user_id] = rec;
      });

      const rate = parseFloat(flatRate) || null;
      const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const docRef = `PR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const invRef = linkedInvoice?.invoice_number ?? null;

      const rows = students.map((s, i) => {
        const inv = invMap[s.id];
        const rec = recMap[s.id];
        const amount = rec?.amount ?? inv?.amount ?? (rate ?? 0);
        const status = rec ? 'PAID' : inv ? inv.status.toUpperCase() : 'NO RECORD';
        const statusColor = rec || inv?.status === 'paid'
          ? '#059669' : inv?.status === 'sent' ? '#d97706' : '#6b7280';
        const receiptNo = rec?.receipt_number ?? '—';
        const datePaid = rec?.issued_at ? fmtDate(rec.issued_at) : '—';
        const grade = s.grade || '—';
        const cls = s.section_class || '—';
        return `<tr>
          <td style="text-align:center;color:#9ca3af">${i + 1}</td>
          <td style="font-weight:700">${s.full_name}</td>
          <td style="text-align:center;font-weight:700">${grade}</td>
          <td style="text-align:center;font-size:10px">${cls}</td>
          <td style="text-align:right;font-weight:700">${amount ? fmt(amount, currency) : '—'}</td>
          <td style="text-align:center;font-family:monospace;font-size:10px">${receiptNo}</td>
          <td style="text-align:center">${datePaid}</td>
          <td style="text-align:center;font-weight:900;color:${statusColor}">${status}</td>
        </tr>`;
      }).join('');

      const paidCount = students.filter(s => recMap[s.id] || invMap[s.id]?.status === 'paid').length;
      const totalCollected = students.reduce((sum, s) => {
        const rec = recMap[s.id];
        const inv = invMap[s.id];
        return sum + (rec?.amount ?? (inv?.status === 'paid' ? inv.amount : 0) ?? 0);
      }, 0);

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Payment Register — ${school?.name}</title>
<style>
${printDocCss({ accent: '4c1d95', accentSoft: 'f3f0ff', pageSize: 'A4 landscape' })}
</style></head><body>
<div class="header keep">
  <img src="/logo.png" class="logo" onerror="this.style.display='none'" />
  <div>
    <div class="org-name">RILLCOD TECHNOLOGIES</div>
    <div class="org-sub">STEM, Robotics &amp; AI Education Partner · www.rillcod.com</div>
  </div>
  <div class="doc-badge">
    <div class="doc-type">Student Payment Register</div>
    <div class="doc-ref">${docRef}</div>
    <div style="font-size:9px;color:#6b7280;margin-top:2px">Printed: ${today}</div>
  </div>
</div>

<div class="meta keep">
  <div class="meta-item"><div class="meta-lbl">Partner School</div><div class="meta-val">${school?.name}</div></div>
  <div class="meta-item"><div class="meta-lbl">Term / Period</div><div class="meta-val">${termLabel}</div></div>
  ${invRef ? `<div class="meta-item" style="background:#fff;border:1px solid #7c3aed44;padding:6px 10px;border-radius:6px"><div class="meta-lbl">School Invoice Ref</div><div class="meta-val" style="font-size:11px;font-family:monospace">${invRef}</div></div>` : ''}
  ${rate ? `<div class="meta-item"><div class="meta-lbl">Fee Per Student</div><div class="meta-val">${fmt(rate, currency)}</div></div>` : ''}
  <div class="meta-item"><div class="meta-lbl">Total Students</div><div class="meta-val">${students.length}</div></div>
  <div class="meta-item"><div class="meta-lbl">Paid</div><div class="meta-val" style="color:#059669">${paidCount}</div></div>
  <div class="meta-item"><div class="meta-lbl">Outstanding</div><div class="meta-val" style="color:#d97706">${students.length - paidCount}</div></div>
</div>

<table>
<thead><tr>
  <th style="width:4%;text-align:center">#</th>
  <th style="width:24%">Student Full Name</th>
  <th style="width:10%;text-align:center">Grade</th>
  <th style="width:16%;text-align:center">Class</th>
  <th style="width:12%;text-align:right">Amount</th>
  <th style="width:14%;text-align:center">Receipt No.</th>
  <th style="width:10%;text-align:center">Date Paid</th>
  <th style="width:10%;text-align:center">Status</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>

<div class="after-table keep">
<div class="summary">
  <div class="sum-box"><div class="sum-lbl">Total Students</div><div class="sum-val">${students.length}</div></div>
  <div class="sum-box" style="border-color:#059669;"><div class="sum-lbl" style="color:#059669">Paid</div><div class="sum-val" style="color:#059669">${paidCount}</div></div>
  <div class="sum-box" style="border-color:#d97706;"><div class="sum-lbl" style="color:#d97706">Outstanding</div><div class="sum-val" style="color:#d97706">${students.length - paidCount}</div></div>
  <div class="sum-box" style="border-color:#7c3aed;"><div class="sum-lbl" style="color:#7c3aed">Total Collected</div><div class="sum-val" style="color:#7c3aed">${fmt(totalCollected, currency)}</div></div>
</div>

<div class="footer">
  <div>
    <div class="sig-line">Prepared by: ${profile?.full_name ?? 'Staff'} &nbsp;·&nbsp; ${profile?.role ?? ''}</div>
  </div>
  <div style="text-align:center">
    <div class="sig-line">School Representative Signature</div>
  </div>
  <div style="text-align:right">
    <div>Ref: ${docRef} &nbsp;·&nbsp; rillcod.com/verify</div>
    <div>This document is confidential. For official use only.</div>
  </div>
</div>
</div>
<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script>
</body></html>`;

      const w = window.open('', '_blank', 'width=1100,height=820');
      if (!w) { alert('Pop-up blocked — please allow pop-ups.'); return; }
      w.document.write(html);
      w.document.close();

      saveRecentDoc({
        ref: docRef,
        type: 'payment_register',
        school: school?.name ?? schoolId,
        term: termLabel,
        amount: totalCollected,
        currency,
        date: new Date().toISOString(),
      });
    } catch (e: any) {
      alert(e.message ?? 'Failed to generate document');
    } finally {
      setLoading(false);
    }
  }, [schoolId, termNumber, academicYear, flatRate, currency, school, profile, fmt, termLabel, linkedInvoice, saveRecentDoc]); // eslint-disable-line

  // ── Build and print Attendance Roster ─────────────────────────────
  const generateAttendanceRoster = useCallback(async () => {
    if (!schoolId || !dateFrom || !dateTo) return;
    setLoading(true);
    setRosterResult(null);
    setInvoiceCreated(null);
    try {
      const attRes = await fetch(
        `/api/billing/docs/data?mode=attendance&schoolId=${encodeURIComponent(schoolId)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
        { cache: 'no-store' },
      );
      const attJson = await attRes.json().catch(() => ({}));
      if (!attRes.ok) throw new Error(attJson.error || 'Failed to load attendance');
      const students = ((attJson.data?.students ?? []) as Array<{ full_name: string; section_class: string; grade?: string; sessions: string[] }>).map((row) => ({
        full_name: row.full_name,
        section_class: row.section_class,
        grade: row.grade || '—',
        sessions: new Set(row.sessions || []),
      }));
      const rate = parseFloat(sessionRate) || null;
      const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const docRef = `AR-${Date.now().toString(36).toUpperCase().slice(-6)}`;

      const rows = students.map((s, i) => {
        const sessions = s.sessions.size;
        const amount = rate ? fmt(rate * sessions, currency) : `${sessions} sessions`;
        return `<tr>
          <td style="text-align:center;color:#9ca3af">${i + 1}</td>
          <td style="font-weight:700">${s.full_name}</td>
          <td style="text-align:center;font-weight:700">${s.grade}</td>
          <td style="text-align:center;font-size:10px">${s.section_class}</td>
          <td style="text-align:center;font-weight:700">${sessions}</td>
          <td style="text-align:right;font-weight:700">${amount}</td>
          <td style="text-align:center"></td>
        </tr>`;
      }).join('');

      const totalSessions = students.reduce((sum, s) => sum + s.sessions.size, 0);
      const totalOwed = rate ? students.reduce((sum, s) => sum + rate * s.sessions.size, 0) : null;

      // Save result before opening window so it's available even if popup is blocked
      setRosterResult({ total: totalOwed, studentCount: students.length, docRef, rate });
      saveRecentDoc({
        ref: docRef,
        type: 'attendance_roster',
        school: school?.name ?? schoolId,
        term: `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`,
        amount: totalOwed ?? undefined,
        currency,
        date: new Date().toISOString(),
      });

      // Scroll to result card
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Attendance Billing Roster — ${school?.name}</title>
<style>
${printDocCss({ accent: '0369a1', accentSoft: 'f0f9ff', pageSize: 'A4 portrait' })}
</style></head><body>
<div class="header keep">
  <img src="/logo.png" class="logo" onerror="this.style.display='none'" />
  <div>
    <div class="org-name">RILLCOD TECHNOLOGIES</div>
    <div class="org-sub">STEM, Robotics &amp; AI Education Partner · www.rillcod.com</div>
  </div>
  <div class="doc-badge">
    <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Attendance Billing Roster</div>
    <div class="doc-ref">${docRef}</div>
    <div style="font-size:9px;color:#6b7280;margin-top:2px">Printed: ${today}</div>
  </div>
</div>

<div class="meta keep">
  <div class="meta-item"><div class="meta-lbl">Partner School</div><div class="meta-val">${school?.name}</div></div>
  <div class="meta-item"><div class="meta-lbl">Period</div><div class="meta-val">${fmtDate(dateFrom)} – ${fmtDate(dateTo)}</div></div>
  <div class="meta-item"><div class="meta-lbl">Students Present</div><div class="meta-val">${students.length}</div></div>
  <div class="meta-item"><div class="meta-lbl">Total Sessions</div><div class="meta-val">${totalSessions}</div></div>
  ${rate ? `<div class="meta-item"><div class="meta-lbl">Rate / Session</div><div class="meta-val">${fmt(rate, currency)}</div></div>` : ''}
  ${totalOwed ? `<div class="meta-item" style="background:#0c4a6e;padding:6px 12px;border-radius:6px"><div class="meta-lbl" style="color:#bae6fd">Amount Due</div><div class="meta-val" style="color:#fff">${fmt(totalOwed, currency)}</div></div>` : ''}
</div>

<table>
<thead><tr>
  <th style="width:5%;text-align:center">#</th>
  <th style="width:28%">Student Full Name</th>
  <th style="width:12%;text-align:center">Grade</th>
  <th style="width:16%;text-align:center">Class</th>
  <th style="width:12%;text-align:center">Sessions Attended</th>
  <th style="width:14%;text-align:right">Amount</th>
  <th style="width:8%;text-align:center">Verified ✓</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>

<div class="after-table keep">
${totalOwed ? `
<div class="summary">
  <div class="sum-box"><div class="sum-lbl">Students</div><div class="sum-val">${students.length}</div></div>
  <div class="sum-box"><div class="sum-lbl">Sessions</div><div class="sum-val">${totalSessions}</div></div>
  <div class="sum-box" style="border-color:#0369a1"><div class="sum-lbl" style="color:#0369a1">Total Due</div><div class="sum-val" style="color:#0369a1">${fmt(totalOwed, currency)}</div></div>
</div>` : ''}

<div class="note">
  <strong>Note to ${school?.name}:</strong> This document confirms students who attended Rillcod STEM sessions during the stated period.
  Payment should be remitted to Rillcod Technologies within 14 days of receipt. Please sign and return one copy.
</div>

<div class="footer">
  <div><div class="sig-line">Prepared by: ${profile?.full_name ?? 'Staff'} &nbsp;·&nbsp; Rillcod Technologies</div></div>
  <div style="text-align:center"><div class="sig-line">School Representative Signature &amp; Stamp</div></div>
  <div style="text-align:right">
    <div>Ref: ${docRef} &nbsp;·&nbsp; rillcod.com/verify</div>
    <div>Confidential — For Official Use Only</div>
  </div>
</div>
</div>
<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script>
</body></html>`;

      const w = window.open('', '_blank', 'width=960,height=820');
      if (!w) { alert('Pop-up blocked — please allow pop-ups for printing. Your result is saved below — click "Create Invoice" to continue.'); return; }
      w.document.write(html);
      w.document.close();
    } catch (e: any) {
      alert(e.message ?? 'Failed to generate document');
    } finally {
      setLoading(false);
    }
  }, [schoolId, dateFrom, dateTo, sessionRate, currency, school, profile, fmt, saveRecentDoc]); // eslint-disable-line

  // ── Build and print unified School Billing Statement ──────────────
  const generateBillingStatement = useCallback(async () => {
    if (!schoolId) return;
    if (billStyle === 'attendance' && (!dateFrom || !dateTo)) return;
    setLoading(true);
    setRosterResult(null);
    setInvoiceCreated(null);
    setPreviewHtml(null);
    try {
      const rate = parseFloat(billStyle === 'attendance' ? sessionRate : flatRate) || null;

      // ── Collect student billing data ────────────────────────────────
      let students: StudentBillingData[] = [];
      let totalAmount = 0;

      if (billStyle === 'payment') {
        const stmtRegRes = await fetch(`/api/billing/docs/data?mode=register&schoolId=${encodeURIComponent(schoolId)}`, { cache: 'no-store' });
        const stmtRegJson = await stmtRegRes.json().catch(() => ({}));
        if (!stmtRegRes.ok) throw new Error(stmtRegJson.error || 'Failed to load billing statement data');
        const rawStudents: StudentRow[] = (stmtRegJson.data?.students ?? []) as StudentRow[];
        const invoices: InvoiceRow[] = (stmtRegJson.data?.invoices ?? []) as InvoiceRow[];
        const receipts: ReceiptRow[] = (stmtRegJson.data?.receipts ?? []) as ReceiptRow[];
        const invMap: Record<string, InvoiceRow> = {};
        invoices.forEach(inv => { if (inv.portal_user_id && (!invMap[inv.portal_user_id] || inv.status === 'paid')) invMap[inv.portal_user_id] = inv; });
        const recMap: Record<string, ReceiptRow> = {};
        receipts.forEach(rec => { if (rec.portal_user_id && !recMap[rec.portal_user_id]) recMap[rec.portal_user_id] = rec; });
        students = rawStudents.map(s => {
          const inv = invMap[s.id]; const rec = recMap[s.id];
          const amt = rec?.amount ?? inv?.amount ?? (rate ?? null);
          if (amt) totalAmount += amt;
          const status = rec ? 'PAID' : inv ? inv.status.toUpperCase() : '—';
          const col = rec || inv?.status === 'paid' ? '#059669' : inv?.status === 'sent' ? '#d97706' : '#6b7280';
          return { name: s.full_name, grade: s.grade || '—', cls: s.section_class || '—', amount: amt, receiptNumber: rec?.receipt_number ?? '—', status, statusColor: col };
        });
      } else {
        const stmtAttRes = await fetch('/api/billing/docs/data?mode=attendance&schoolId=' + encodeURIComponent(schoolId) + '&dateFrom=' + encodeURIComponent(dateFrom) + '&dateTo=' + encodeURIComponent(dateTo), { cache: 'no-store' });
        const stmtAttJson = await stmtAttRes.json().catch(() => ({}));
        if (!stmtAttRes.ok) throw new Error(stmtAttJson.error || 'Failed to load attendance');
        ((stmtAttJson.data?.students ?? []) as Array<{ full_name: string; section_class: string; grade?: string; sessions: string[] }>).forEach((row) => {
          const sessionCount = (row.sessions || []).length;
          const amt = rate ? rate * sessionCount : null;
          if (amt) totalAmount += amt;
          students.push({ name: row.full_name, grade: row.grade || '—', cls: row.section_class || '—', amount: amt, sessions: sessionCount, status: 'PENDING', statusColor: '#d97706' });
        });
      }

      // Snapshot students for CSV export
      setLastStudents(students);

      const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const docRef = `BS-${Date.now().toString(36).toUpperCase().slice(-6)}`;

      // Look up school invoice
      const linkedRes = await fetch('/api/billing/docs/data?mode=linked&schoolId=' + encodeURIComponent(schoolId) + '&academicYear=' + encodeURIComponent(academicYear) + '&termNumber=' + encodeURIComponent(termNumber), { cache: 'no-store' });
      const linkedJson = await linkedRes.json().catch(() => ({}));
      const schoolInv = (linkedJson.data?.invoice ?? null) as (LinkedInvoice & { due_date?: string | null; payment_link?: string | null }) | null;
      const invoiceTotal = schoolInv ? Number(schoolInv.amount) : totalAmount;
      const invoiceRef = schoolInv?.invoice_number ?? docRef;
      const dueDate = schoolInv?.due_date ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const periodLabel = billStyle === 'payment' ? termLabel : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;

      // Bank payment instructions
      const bankHtml = bankAccounts.length > 0
        ? bankAccounts.slice(0, 2).map(a => `<div style="padding:10px 14px;border:1px solid #e5e7eb;border-radius:6px;margin-top:8px"><div style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px">${a.label || a.bank_name}</div><div style="font-size:13px;font-weight:900;color:#4c1d95;font-family:monospace;margin:2px 0">${a.account_number}</div><div style="font-size:11px;color:#374151">${a.account_name} · ${a.bank_name}</div>${a.payment_note ? `<div style="font-size:9px;color:#6b7280;margin-top:2px">${a.payment_note}</div>` : ''}</div>`).join('')
        : '<p style="color:#6b7280;font-size:11px">Contact Rillcod for bank details.</p>';
      const payLinkHtml = (schoolInv as any)?.payment_link
        ? `<div style="margin-top:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px"><div style="font-size:9px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px">Online Payment</div><div style="font-size:11px;color:#065f46;margin-top:2px;word-break:break-all">${(schoolInv as any).payment_link}</div></div>`
        : '';

      // ── HTML builder: combined table document ───────────────────────
      const buildCombinedHtml = (autoprint: boolean) => {
        const colHeaders = billStyle === 'payment'
          ? '<th style="width:4%;text-align:center">#</th><th style="width:28%">Student Name</th><th style="width:10%;text-align:center">Grade</th><th style="width:14%;text-align:center">Class</th><th style="width:14%;text-align:right">Amount</th><th style="width:14%;text-align:center">Receipt No.</th><th style="width:16%;text-align:center">Status</th>'
          : '<th style="width:4%;text-align:center">#</th><th style="width:28%">Student Name</th><th style="width:10%;text-align:center">Grade</th><th style="width:16%;text-align:center">Class</th><th style="width:12%;text-align:center">Sessions</th><th style="width:20%;text-align:right">Amount</th>';
        const rows = students.map((s, i) => billStyle === 'payment'
          ? `<tr><td style="text-align:center;color:#9ca3af">${i + 1}</td><td style="font-weight:700">${s.name}</td><td style="text-align:center;font-weight:700">${s.grade}</td><td style="text-align:center;font-size:10px">${s.cls}</td><td style="text-align:right;font-weight:700">${s.amount ? fmt(s.amount, currency) : '—'}</td><td style="text-align:center;font-family:monospace;font-size:10px">${s.receiptNumber ?? '—'}</td><td style="text-align:center;font-weight:900;color:${s.statusColor}">${s.status}</td></tr>`
          : `<tr><td style="text-align:center;color:#9ca3af">${i + 1}</td><td style="font-weight:700">${s.name}</td><td style="text-align:center;font-weight:700">${s.grade}</td><td style="text-align:center;font-size:10px">${s.cls}</td><td style="text-align:center;font-weight:700">${s.sessions ?? 0}</td><td style="text-align:right;font-weight:700">${s.amount ? fmt(s.amount, currency) : `${s.sessions ?? 0} sessions`}</td></tr>`
        ).join('');
        const watermarkCss = autoprint ? '' : `body::before{content:'PREVIEW';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:90px;font-weight:900;color:rgba(124,58,237,0.06);pointer-events:none;z-index:9999;letter-spacing:8px;white-space:nowrap;}`;
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>School Billing Statement — ${school?.name}</title>
<style>
${printDocCss({
          accent: '4c1d95',
          accentSoft: 'f3f0ff',
          pageSize: 'A4 portrait',
          watermark: watermarkCss,
        })}
.inv-block{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;padding:12px 14px;background:#f3f0ff;border-radius:8px;border:1px solid #7c3aed22}
.pay-section{margin-top:16px;padding:12px 14px;background:#faf5ff;border:1px solid #7c3aed22;border-radius:8px}
.total-bar{margin-top:14px;display:flex;justify-content:flex-end}
.total-box{padding:12px 20px;background:#4c1d95;color:#fff;border-radius:8px;text-align:right}
</style></head><body>
<div class="header keep">
  <img src="/logo.png" class="logo" onerror="this.style.display='none'" />
  <div><div class="org-name">RILLCOD TECHNOLOGIES</div><div class="org-sub">STEM, Robotics &amp; AI Education Partner · www.rillcod.com</div></div>
  <div class="doc-badge">
    <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">School Billing Statement</div>
    <div class="doc-ref">${invoiceRef}</div>
    <div style="font-size:9px;color:#6b7280;margin-top:2px">Issued: ${today}</div>
  </div>
</div>
<div class="inv-block keep">
  <div>
    <div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Billed To</div><div style="font-size:13px;font-weight:900;color:#4c1d95">${school?.name}</div>
    <div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-top:8px;margin-bottom:2px">Period</div><div style="font-size:11px;font-weight:900;color:#4c1d95">${periodLabel}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Invoice Ref</div><div style="font-size:13px;font-weight:900;color:#4c1d95;font-family:monospace">${invoiceRef}</div>
    <div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-top:8px;margin-bottom:2px">Due Date</div><div style="font-size:11px;font-weight:900;color:#d97706">${fmtDate(dueDate)}</div>
    ${schoolInv ? `<div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-top:6px;margin-bottom:2px">Status</div><div style="font-size:10px;font-weight:900;color:${schoolInv.status === 'paid' ? '#059669' : '#7c3aed'}">${schoolInv.status.toUpperCase()}</div>` : ''}
  </div>
</div>
<p style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">${billStyle === 'payment' ? 'Student Payment Breakdown' : 'Student Attendance Breakdown'}</p>
<table><thead><tr>${colHeaders}</tr></thead><tbody>${rows}</tbody></table>
<div class="after-table keep">
<div class="total-bar">
  <div class="total-box">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;opacity:0.8">Total Amount Due to Rillcod Technologies</div>
    <div style="font-size:22px;font-weight:900;margin-top:2px">${fmt(invoiceTotal, currency)}</div>
    <div style="font-size:9px;opacity:0.7;margin-top:2px">${students.length} students · ${periodLabel}</div>
  </div>
</div>
<div class="pay-section">
  <div style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Payment Instructions — Remit to Rillcod Technologies</div>
  ${bankHtml}
  ${payLinkHtml}
  <div style="font-size:10px;color:#6b7280;margin-top:10px">Please quote invoice reference <strong>${invoiceRef}</strong> in all payments. Contact accounts@rillcod.com for queries.</div>
</div>
<div class="footer">
  <div><div class="sig-line">Prepared by: ${profile?.full_name ?? 'Staff'} · Rillcod Technologies</div></div>
  <div style="text-align:center"><div class="sig-line">School Authorised Signatory &amp; Stamp</div></div>
  <div style="text-align:right"><div>Ref: ${docRef} · rillcod.com/verify</div><div>Confidential — For Official Use Only</div></div>
</div>
</div>
${autoprint ? '<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script>' : ''}
</body></html>`;
      };

      // ── HTML builder: per-student slip pages ────────────────────────
      const buildIndividualHtml = () => {
        const firstBankAcc = bankAccounts[0];
        const paymentLink = (schoolInv as any)?.payment_link ?? null;
        const qrUrl = paymentLink
          ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(paymentLink)}&size=72x72&ecc=M&margin=2`
          : null;
        const slips = students.map((s, i) => {
          const isLast = i === students.length - 1;
          return `<div class="slip" style="break-after:${isLast ? 'auto' : 'page'};page-break-after:${isLast ? 'auto' : 'always'};break-inside:avoid;page-break-inside:avoid;padding:10mm 8mm;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="border:2px solid #7c3aed;border-radius:10px;padding:14px 16px;max-width:560px;margin:0 auto;break-inside:avoid;page-break-inside:avoid;">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #7c3aed;padding-bottom:8px;margin-bottom:10px">
      <div>
        <div style="font-size:13px;font-weight:900;color:#7c3aed;">RILLCOD TECHNOLOGIES</div>
        <div style="font-size:8px;color:#6b7280;">STEM, Robotics &amp; AI Education Partner</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Student Fee Slip</div>
        <div style="font-size:11px;font-weight:900;font-family:monospace;color:#4c1d95;">${invoiceRef}</div>
        <div style="font-size:8px;color:#6b7280;">${today}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
      <div><div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;">School</div><div style="font-size:11px;font-weight:900;">${school?.name}</div></div>
      <div><div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;">Period</div><div style="font-size:11px;font-weight:900;">${periodLabel}</div></div>
    </div>
    <div style="background:#f3f0ff;border:1px solid #7c3aed22;border-radius:6px;padding:8px 12px;margin-bottom:10px;">
      <div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;">Student</div>
      <div style="font-size:16px;font-weight:900;color:#4c1d95;">${s.name}</div>
      <div style="font-size:9px;color:#6b7280;">Grade: <strong>${s.grade}</strong> · Class: <strong>${s.cls}</strong></div>
    </div>
    <div style="background:#4c1d95;color:#fff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div>
        <div style="font-size:8px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">Amount Due</div>
        <div style="font-size:20px;font-weight:900;">${s.amount ? fmt(s.amount, currency) : '—'}</div>
        ${s.sessions !== undefined ? `<div style="font-size:9px;opacity:0.7;">${s.sessions} session${s.sessions !== 1 ? 's' : ''} attended</div>` : ''}
      </div>
      <div style="text-align:right;">
        <div style="font-size:8px;opacity:0.7;">Status</div>
        <div style="font-size:13px;font-weight:900;color:${s.statusColor === '#059669' ? '#4ade80' : s.statusColor === '#d97706' ? '#fbbf24' : '#d1d5db'};">${s.status}</div>
        ${s.receiptNumber && s.receiptNumber !== '—' ? `<div style="font-size:8px;opacity:0.7;font-family:monospace;">Rcpt: ${s.receiptNumber}</div>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:10px;">
      ${firstBankAcc ? `<div style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;">
        <div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;margin-bottom:4px;">Pay to Rillcod Technologies</div>
        <div style="font-size:11px;font-weight:700;color:#4c1d95;font-family:monospace;">${firstBankAcc.account_number}</div>
        <div style="font-size:9px;color:#374151;">${firstBankAcc.account_name} · ${firstBankAcc.bank_name}</div>
        <div style="font-size:8px;color:#6b7280;margin-top:2px;">Ref: <strong>${invoiceRef}</strong></div>
      </div>` : ''}
      ${qrUrl ? `<div style="border:1px solid #e5e7eb;border-radius:6px;padding:6px;text-align:center;min-width:84px;">
        <img src="${qrUrl}" width="72" height="72" alt="Scan to pay" style="display:block;margin:0 auto 3px;" />
        <div style="font-size:7px;color:#6b7280;">Scan to pay</div>
      </div>` : ''}
    </div>
    <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #e5e7eb;">
      <div style="border-top:1px solid #374151;width:140px;padding-top:4px;font-size:8px;color:#6b7280;margin-top:24px;">Parent/Guardian Signature</div>
      <div style="border-top:1px solid #374151;width:140px;padding-top:4px;font-size:8px;color:#6b7280;text-align:right;margin-top:24px;">School Rep. Signature</div>
    </div>
  </div>
</div>`;
        }).join('');
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Student Fee Slips — ${school?.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4 portrait;margin:8mm}
@media print{
  body{padding:0}
  .slip{break-inside:avoid !important;page-break-inside:avoid !important;break-after:page;page-break-after:always}
  .slip:last-child{break-after:auto;page-break-after:auto}
}
</style></head>
<body>${slips}<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script></body></html>`;
      };

      // ── Output based on printMode ───────────────────────────────────
      if (printMode === 'individual') {
        const html = buildIndividualHtml();
        const w = window.open('', '_blank', 'width=960,height=820');
        if (!w) { alert('Pop-up blocked — please allow pop-ups for printing.'); } else { w.document.write(html); w.document.close(); }
      } else if (printMode === 'preview') {
        setPreviewHtml(buildCombinedHtml(false));
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      } else {
        const html = buildCombinedHtml(true);
        const w = window.open('', '_blank', 'width=960,height=820');
        if (!w) { alert('Pop-up blocked — please allow pop-ups for printing.'); } else { w.document.write(html); w.document.close(); }
      }

      setLastStatement({ docRef, invoiceRef, amount: invoiceTotal, studentCount: students.length, period: periodLabel, dueDate, currency });
      setEmailSent(null);
      setEmailError(null);

      saveRecentDoc({
        ref: docRef, type: 'billing_statement',
        school: school?.name ?? schoolId,
        term: periodLabel,
        amount: invoiceTotal, currency,
        invoiceNumber: invoiceRef,
        date: new Date().toISOString(),
      });
    } catch (e: any) {
      alert(e.message ?? 'Failed to generate billing statement');
    } finally {
      setLoading(false);
    }
  }, [schoolId, billStyle, termNumber, academicYear, flatRate, sessionRate, currency, dateFrom, dateTo, school, profile, fmt, termLabel, bankAccounts, printMode, saveRecentDoc]); // eslint-disable-line

  // ── CSV export of last generated student list ─────────────────────
  const downloadCsv = useCallback(() => {
    if (!lastStudents.length) return;
    const headers = ['#', 'Name', 'Grade', 'Class', 'Amount', 'Sessions', 'Receipt No.', 'Status'];
    const rows = lastStudents.map((s, i) =>
      [i + 1, `"${s.name.replace(/"/g, '""')}"`, `"${(s.grade || '').replace(/"/g, '""')}"`, `"${(s.cls || '').replace(/"/g, '""')}"`, s.amount ?? '', s.sessions ?? '', `"${(s.receiptNumber ?? '').replace(/"/g, '""')}"`, s.status].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-${(school?.name ?? 'school').replace(/[^a-z0-9]/gi, '-')}-${(lastStatement?.period ?? 'export').replace(/[^a-z0-9]/gi, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [lastStudents, school, lastStatement]);

  // ── Email billing statement to school ────────────────────────────
  const sendToSchool = useCallback(async () => {
    if (!lastStatement || !schoolId) return;
    setSendingEmail(true);
    setEmailSent(null);
    setEmailError(null);
    try {
      const res = await fetch('/api/billing/email-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId, ...lastStatement, recipientEmail: recipientEmail.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message ?? 'Failed to send');
      setEmailSent(j.message);
    } catch (e: any) {
      setEmailError(e.message ?? 'Failed to send email');
    } finally {
      setSendingEmail(false);
    }
  }, [lastStatement, schoolId, recipientEmail]);

  const canGenerate = docType === 'payment_register'
    ? !!schoolId
    : docType === 'billing_statement'
    ? !!schoolId && (billStyle === 'payment' || (!!dateFrom && !!dateTo))
    : !!schoolId && !!dateFrom && !!dateTo;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-border">
        <DocumentTextIcon className="w-5 h-5 text-primary" />
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-foreground">School Billing Documents</p>
          <p className="text-[11px] text-muted-foreground">Generate official payment registers and attendance billing rosters for partner schools.</p>
        </div>
      </div>

      {/* ── Overdue schools alert ──────────────────────────────────── */}
      {overdueSchools.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-red-400 text-sm">⚠ </span>
            <p className="text-[10px] font-black uppercase tracking-widest text-red-400">
              {overdueSchools.length} School{overdueSchools.length !== 1 ? 's' : ''} with Overdue Invoice{overdueSchools.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="space-y-2">
            {overdueSchools.map(ov => (
              <div key={ov.invoice_number} className="flex items-center gap-3 px-3 py-2 bg-card border border-border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-black text-foreground truncate">{ov.name}</p>
                    <span className="text-[9px] font-mono text-muted-foreground">{ov.invoice_number}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {ov.currency === 'USD' ? '$' : '₦'}{ov.amount.toLocaleString('en-NG')} · {ov.daysOverdue}d overdue
                  </p>
                </div>
                <button
                  onClick={() => { setSchoolId(ov.id); setDocType('billing_statement'); }}
                  className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  Generate Statement
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 1 — Document type */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Step 1 — Choose Document Type</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            {
              id: 'billing_statement',
              label: 'School Billing Statement',
              emoji: '🏫',
              sub: 'All-in-one: student list + invoice + payment instructions in one printable document. Send this to the school to collect payment.',
              badge: 'Recommended',
            },
            {
              id: 'payment_register',
              label: 'Payment Register',
              emoji: '📋',
              sub: 'Student-by-student payment log with receipt numbers. For schools that collect fees and remit to Rillcod.',
            },
            {
              id: 'attendance_roster',
              label: 'Attendance Roster',
              emoji: '📅',
              sub: 'Sessions attended per student × agreed rate. For schools billed based on attendance.',
            },
          ] as const).map(opt => (
            <button key={opt.id}
              className={`text-left p-4 rounded-xl border-2 transition-all ${docType === opt.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              onClick={() => { setDocType(opt.id); setRosterResult(null); setInvoiceCreated(null); setPreviewHtml(null); if (opt.id !== 'billing_statement') setBillStyle('payment'); }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{opt.emoji}</span>
                {(opt as any).badge && (
                  <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                    {(opt as any).badge}
                  </span>
                )}
              </div>
              <p className={`text-xs font-black uppercase tracking-widest ${docType === opt.id ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{opt.sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 — Fill in details */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Step 2 — Fill in Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-2">
            <DocsLbl>Partner School</DocsLbl>
            <DocsSelect value={schoolId} onChange={e => setSchoolId(e.target.value)}>
              <option value="">— Select school —</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </DocsSelect>
          </div>

          <div>
            <DocsLbl>Currency</DocsLbl>
            <DocsSelect value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="NGN">NGN (₦)</option>
              <option value="USD">USD ($)</option>
            </DocsSelect>
          </div>

          {docType === 'payment_register' && (
            <>
              <div>
                <DocsLbl>Academic Year</DocsLbl>
                <DocsSelect value={academicYear} onChange={e => setAcademicYear(e.target.value)}>
                  {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                    <option key={y} value={String(y)}>{y}/{y + 1}</option>
                  ))}
                </DocsSelect>
              </div>
              <div>
                <DocsLbl>Term</DocsLbl>
                <DocsSelect value={termNumber} onChange={e => setTermNumber(e.target.value)}>
                  <option value="1">First Term</option>
                  <option value="2">Second Term</option>
                  <option value="3">Third Term</option>
                </DocsSelect>
              </div>
              <div>
                <DocsLbl>Flat Fee Per Student <span className="text-muted-foreground/60 normal-case font-normal">(optional — auto-filled from invoice)</span></DocsLbl>
                <DocsInput type="number" min={0} placeholder="e.g. 15000" value={flatRate} onChange={e => setFlatRate(e.target.value)} />
              </div>
            </>
          )}

          {docType === 'attendance_roster' && (
            <>
              <div>
                <DocsLbl>Date From</DocsLbl>
                <DocsInput type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <DocsLbl>Date To</DocsLbl>
                <DocsInput type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <div>
                <DocsLbl>Rate Per Session <span className="text-muted-foreground/60 normal-case font-normal">(₦ per attended session)</span></DocsLbl>
                <DocsInput type="number" min={0} step="100" placeholder="e.g. 5000" value={sessionRate} onChange={e => setSessionRate(e.target.value)} />
              </div>
            </>
          )}

          {docType === 'billing_statement' && (
            <>
              <div>
                <DocsLbl>Academic Year</DocsLbl>
                <DocsSelect value={academicYear} onChange={e => setAcademicYear(e.target.value)}>
                  {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                    <option key={y} value={String(y)}>{y}/{y + 1}</option>
                  ))}
                </DocsSelect>
              </div>
              <div>
                <DocsLbl>Term</DocsLbl>
                <DocsSelect value={termNumber} onChange={e => setTermNumber(e.target.value)}>
                  <option value="1">First Term</option>
                  <option value="2">Second Term</option>
                  <option value="3">Third Term</option>
                </DocsSelect>
              </div>
              <div>
                <DocsLbl>Billing Style</DocsLbl>
                <DocsSelect value={billStyle} onChange={e => setBillStyle(e.target.value as 'payment' | 'attendance')}>
                  <option value="payment">Student Payments (fee-based)</option>
                  <option value="attendance">Attendance-based</option>
                </DocsSelect>
              </div>
              <div>
                <DocsLbl>Rate <span className="text-muted-foreground/60 normal-case font-normal">(per student or per session)</span></DocsLbl>
                <DocsInput
                  type="number"
                  min={0}
                  step="100"
                  placeholder="e.g. 15000"
                  value={billStyle === 'attendance' ? sessionRate : flatRate}
                  onChange={(e) => (billStyle === 'attendance' ? setSessionRate(e.target.value) : setFlatRate(e.target.value))}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <DocsLbl>Output Mode</DocsLbl>
                <div className="flex rounded-lg overflow-hidden border border-border text-[10px] font-black uppercase tracking-widest">
                  {([
                    { id: 'combined', label: '📄 Combined', tip: 'All students in one table document' },
                    { id: 'individual', label: '🗂 Individual Slips', tip: 'One printable slip per student — distribute physically' },
                    { id: 'preview', label: '👁 Inline Preview', tip: 'Preview inside this panel — print from here' },
                  ] as const).map((m, i) => (
                    <button
                      key={m.id}
                      title={m.tip}
                      onClick={() => { setPrintMode(m.id); setPreviewHtml(null); }}
                      className={`flex-1 px-3 py-2.5 transition-colors ${i > 0 ? 'border-l border-border' : ''} ${printMode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-primary/5'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">
                  {printMode === 'combined' && 'Opens a full-page printable billing statement with all students listed.'}
                  {printMode === 'individual' && 'Opens individual fee slips — one page per student — for physical distribution.'}
                  {printMode === 'preview' && 'Shows the document inline below — inspect before printing with the Print button.'}
                </p>
              </div>
              {billStyle === 'attendance' && (
                <>
                  <div>
                    <DocsLbl>Date From</DocsLbl>
                    <DocsInput type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <DocsLbl>Date To</DocsLbl>
                    <DocsInput type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                </>
              )}
              {bankAccounts.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                    <span className="text-emerald-400 text-xs">✓</span>
                    <p className="text-[10px] text-emerald-400 font-black">
                      {bankAccounts.length} Rillcod bank account{bankAccounts.length !== 1 ? 's' : ''} will be included as payment instructions
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Linked invoice callout (payment_register only) */}
      {docType === 'payment_register' && school && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${linkedInvoice ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-card border-border'}`}>
          <BuildingOfficeIcon className={`w-4 h-4 shrink-0 mt-0.5 ${linkedInvoice ? 'text-emerald-400' : 'text-primary'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-foreground">{school.name}</p>
            {lookingUp ? (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ArrowPathIcon className="w-3 h-3 animate-spin" /> Looking up school invoice…
              </p>
            ) : linkedInvoice ? (
              <div className="mt-1 space-y-0.5">
                <p className="text-[10px] text-emerald-400 font-black">
                  ✓ Linked to invoice {linkedInvoice.invoice_number} · {linkedInvoice.status.toUpperCase()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {linkedInvoice.metadata?.term_label ?? termLabel} · Total ₦{Number(linkedInvoice.amount).toLocaleString('en-NG')}
                  {flatRate ? ` · Rate/student auto-filled: ₦${Number(flatRate).toLocaleString('en-NG')}` : ''}
                </p>
              </div>
            ) : (
              <p className="text-[10px] text-amber-400">No matching school invoice found for this term — will use manual rate if provided.</p>
            )}
          </div>
        </div>
      )}

      {/* Step 3 — Generate */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Step 3 — Generate &amp; Print</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={docType === 'payment_register' ? generatePaymentRegister : docType === 'attendance_roster' ? generateAttendanceRoster : generateBillingStatement}
            disabled={!canGenerate || loading}
            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40 transition-all shadow-lg shadow-primary/20"
          >
            {loading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <PrinterIcon className="w-4 h-4" />}
            {loading ? 'Generating…' : docType === 'billing_statement' ? 'Generate Billing Statement' : docType === 'payment_register' ? 'Generate Payment Register' : 'Generate Attendance Roster'}
          </button>
          {lastStudents.length > 0 && docType === 'billing_statement' && (
            <button
              onClick={downloadCsv}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-border text-muted-foreground text-[10px] font-black uppercase tracking-widest hover:text-foreground hover:border-primary/40 transition-colors"
              title="Download student list as CSV"
            >
              <DocumentTextIcon className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
          {(rosterResult || invoiceCreated) && (
            <button
              onClick={() => { setRosterResult(null); setInvoiceCreated(null); }}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-border text-muted-foreground text-[10px] font-black uppercase tracking-widest hover:text-foreground transition-colors"
            >
              <XMarkIcon className="w-3.5 h-3.5" /> Clear Result
            </button>
          )}
        </div>
        {!canGenerate && (
          <p className="text-[10px] text-muted-foreground mt-2">
            {!schoolId ? '↑ Select a partner school to continue.' : 'Enter the date range to continue.'}
          </p>
        )}

        {/* Send to school email section */}
        {lastStatement && docType === 'billing_statement' && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Send Statement to School</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="email"
                placeholder="school@email.com (leave blank to auto-resolve)"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                className="flex-1 min-w-48 px-3 py-2.5 bg-card border border-border text-sm rounded-xl focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
              />
              <button
                onClick={sendToSchool}
                disabled={sendingEmail}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-colors"
              >
                {sendingEmail ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <span>✉</span>}
                {sendingEmail ? 'Sending…' : 'Email Statement'}
              </button>
            </div>
            {emailSent && (
              <p className="text-[10px] text-emerald-400 font-black mt-2 flex items-center gap-1">
                <CheckCircleIcon className="w-3.5 h-3.5" /> {emailSent}
              </p>
            )}
            {emailError && (
              <p className="text-[10px] text-red-400 mt-2">{emailError}</p>
            )}
            <p className="text-[9px] text-muted-foreground mt-1.5">
              Sends a branded email summary of ref <span className="font-mono">{lastStatement.invoiceRef}</span> · {lastStatement.period} to the school's billing contact.
            </p>
          </div>
        )}
      </div>

      {/* ── Inline preview pane (billing_statement preview mode) ───── */}
      {docType === 'billing_statement' && previewHtml && (
        <div ref={resultRef} className="rounded-xl border-2 border-primary/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/20">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4 text-primary" />
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Document Preview</p>
              <span className="text-[9px] text-muted-foreground">(scroll to inspect · use Print to output)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => iframeRef.current?.contentWindow?.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors shadow-sm shadow-primary/20"
              >
                <PrinterIcon className="w-3 h-3" /> Print
              </button>
              <button
                onClick={() => setPreviewHtml(null)}
                className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                title="Close preview"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <iframe
            ref={iframeRef}
            srcDoc={previewHtml}
            title="Billing Statement Preview"
            className="w-full"
            style={{ height: '620px', border: 'none', background: '#fff' }}
          />
        </div>
      )}

      {/* ── Roster result card ─────────────────────────────────────── */}
      {rosterResult && (
        <div ref={resultRef} className="rounded-xl border-2 border-sky-500/30 bg-sky-500/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-black text-foreground">Attendance Roster Generated</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Ref: <span className="font-mono">{rosterResult.docRef}</span></p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-card rounded-lg p-3 text-center border border-border">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Students</p>
              <p className="text-xl font-black text-foreground">{rosterResult.studentCount}</p>
            </div>
            <div className="bg-card rounded-lg p-3 text-center border border-border">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Rate / Session</p>
              <p className="text-xl font-black text-foreground">
                {rosterResult.rate ? fmt(rosterResult.rate, currency) : '—'}
              </p>
            </div>
            <div className={`rounded-lg p-3 text-center border ${rosterResult.total ? 'border-sky-500/30 bg-sky-500/10' : 'border-border bg-card'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Due</p>
              <p className="text-xl font-black text-sky-400">
                {rosterResult.total ? fmt(rosterResult.total, currency) : '—'}
              </p>
            </div>
          </div>
          {rosterResult.total ? (
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={createInvoiceFromRoster}
                disabled={creatingInvoice}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-colors"
              >
                {creatingInvoice
                  ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                  : <PlusIcon className="w-3.5 h-3.5" />}
                {creatingInvoice ? 'Creating Invoice…' : 'Create School Invoice from This Roster'}
              </button>
              <p className="text-[10px] text-muted-foreground">
                Creates a pre-filled school invoice sent directly to {school?.name}
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-amber-400">
              Enter a rate per session above to enable invoice creation from this roster.
            </p>
          )}
        </div>
      )}

      {/* ── Invoice created success ─────────────────────────────────── */}
      {invoiceCreated && (
        <div ref={resultRef} className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
          <CheckCircleIcon className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-black text-emerald-400">School Invoice Created!</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Invoice <span className="font-mono font-black text-foreground">{invoiceCreated.invoice_number}</span> has been created and marked as <span className="text-sky-400 font-black">SENT</span>.
              Go to the Invoices tab to view, email or download the PDF.
            </p>
          </div>
        </div>
      )}

      {/* ── Recent Documents ───────────────────────────────────────── */}
      {recentDocs.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-3">
            <ClockIcon className="w-4 h-4 text-muted-foreground" />
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recent Documents</p>
            <button
              onClick={() => {
                setRecentDocs([]);
                try { localStorage.removeItem(DOCS_STORAGE_KEY); } catch { /* ignore */ }
              }}
              className="ml-auto text-[9px] text-muted-foreground hover:text-foreground uppercase tracking-widest"
            >
              Clear
            </button>
          </div>
          <div className="space-y-2">
            {recentDocs.map(doc => (
              <div key={doc.ref} className="flex items-center gap-3 px-3 py-2.5 bg-card border border-border rounded-lg">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs ${doc.type === 'billing_statement' ? 'bg-violet-500/10' : doc.type === 'payment_register' ? 'bg-primary/10' : 'bg-sky-500/10'}`}>
                  {doc.type === 'billing_statement' ? '🏫' : doc.type === 'payment_register' ? '📋' : '📅'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-black text-foreground font-mono">{doc.ref}</p>
                    {doc.invoiceNumber && (
                      <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                        → {doc.invoiceNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {doc.school} · {doc.term}
                    {doc.amount && doc.currency ? ` · ${doc.currency === 'USD' ? '$' : '₦'}${doc.amount.toLocaleString('en-NG')}` : ''}
                  </p>
                </div>
                <p className="text-[9px] text-muted-foreground shrink-0">
                  {new Date(doc.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SchoolBillingDocsPanel;
