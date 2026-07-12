'use client';

/**
 * SchoolBillingDocsPanel
 *
 * Generates two official billing documents for partner schools:
 *
 * 1. Payment Register â€” for schools where students pay to the school account
 *    and the school then pays Rillcod (e.g. Word of Faith). Shows per-student
 *    name, class, amount, receipt number, and date of payment.
 *
 * 2. Attendance Billing Roster â€” for schools billed based on attendance.
 *    Shows students who attended class sessions within a date range so the
 *    school can calculate and remit based on the agreed rate/percentage.
 *
 * After generating an Attendance Roster, the panel offers a one-click flow
 * to create a matching school invoice pre-filled with the computed total.
 * Recent documents are remembered in localStorage for quick reference.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  PrinterIcon, DocumentTextIcon, ArrowPathIcon, BuildingOfficeIcon,
  CheckCircleIcon, ClockIcon, PlusIcon, XMarkIcon,
} from '@/lib/icons';

type DocType = 'payment_register' | 'attendance_roster' | 'billing_statement';

interface School { id: string; name: string; }
interface StudentRow {
  id: string;
  full_name: string;
  section_class: string | null;
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
interface AttendanceRow {
  student_id: string | null;
  status: string;
  class_sessions?: { session_date?: string; classes?: { name?: string } | null } | null;
  portal_users?: { full_name?: string; section_class?: string | null } | null;
}

const TERM_LABELS = ['First Term', 'Second Term', 'Third Term'];
const CURRENT_YEAR = new Date().getFullYear();
const DOCS_STORAGE_KEY = 'rillcod_billing_docs_recent';

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
  const db = createClient();

  const [docType, setDocType] = useState<DocType>('payment_register');
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [termNumber, setTermNumber] = useState('1');
  const [academicYear, setAcademicYear] = useState(String(CURRENT_YEAR));
  const [flatRate, setFlatRate] = useState('');
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
        const { data: schData } = await db.from('schools').select('id, name').order('name');
        if (schData) setSchools(schData);
      } catch (e) {}

      try {
        const r = await fetch('/api/payment-accounts');
        const j = r.ok ? await r.json() : { data: [] };
        setBankAccounts((j.data ?? []).filter((a: any) => a.is_active && !a.school_id));
      } catch (e) {}

      try {
        const res = await fetch('/api/invoices?limit=200&stream=school&status=sent', { cache: 'no-store' });
        const j = res.ok ? await res.json() : { data: [] };
        const today = new Date().toISOString().split('T')[0];
        const rows: OverdueSchool[] = ((j.data ?? []) as any[])
          .filter((inv) => inv.due_date && inv.due_date < today)
          .slice(0, 8)
          .map((inv) => ({
            id: inv.school_id,
            name: inv.schools?.name ?? 'Unknown School',
            invoice_number: inv.invoice_number,
            amount: Number(inv.amount),
            currency: inv.currency ?? 'NGN',
            due_date: inv.due_date,
            daysOverdue: Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000),
          }));
        setOverdueSchools(rows);
      } catch (e) {}
    };
    init();
  }, []); // eslint-disable-line

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DOCS_STORAGE_KEY) ?? '[]');
      if (Array.isArray(saved)) setRecentDocs(saved);
    } catch { /* ignore */ }
  }, []);

  // Auto-lookup matching school invoice when school + term + year changes
  useEffect(() => {
    if (!schoolId || docType !== 'payment_register') { setLinkedInvoice(null); return; }
    setLookingUp(true);
    db.from('invoices')
      .select('id, invoice_number, amount, currency, status, items, metadata')
      .eq('school_id', schoolId)
      .eq('stream', 'school')
      .not('status', 'eq', 'cancelled')
      .filter('metadata->>academic_year', 'eq', academicYear)
      .filter('metadata->>term_number', 'eq', termNumber)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const inv = data as LinkedInvoice | null;
        setLinkedInvoice(inv);
        if (inv) {
          setCurrency(inv.currency ?? 'NGN');
          const items: any[] = Array.isArray(inv.items) ? inv.items : [];
          const progItem = items.find((it: any) =>
            !String(it.description ?? '').toLowerCase().includes('commission') &&
            !String(it.description ?? '').toLowerCase().includes('deposit')
          );
          if (progItem && (progItem.quantity ?? 0) > 1 && (progItem.unit_price ?? 0) > 0) {
            setFlatRate(String(progItem.unit_price));
          }
        }
        setLookingUp(false);
      }, () => setLookingUp(false));
  }, [schoolId, termNumber, academicYear, docType, db]);

  const saveRecentDoc = useCallback((entry: RecentDoc) => {
    setRecentDocs(prev => {
      const updated = [entry, ...prev.filter(d => d.ref !== entry.ref)].slice(0, 6);
      try { localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, []);

  const fmt = (n: number, cur = 'NGN') =>
    cur === 'USD'
      ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : `â‚¦${n.toLocaleString('en-NG')}`;

  const termLabel = `${TERM_LABELS[parseInt(termNumber) - 1]} ${academicYear}/${parseInt(academicYear) + 1}`;
  const school = schools.find(s => s.id === schoolId);

  // â”€â”€ Create school invoice from attendance roster total â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  }, [rosterResult, schoolId, currency, termNumber, academicYear, termLabel, dateFrom, dateTo, db]);

  // â”€â”€ Build and print Payment Register â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const generatePaymentRegister = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setRosterResult(null);
    setInvoiceCreated(null);
    try {
      const [stuRes, invRes, recRes] = await Promise.all([
        db.from('portal_users')
          .select('id, full_name, section_class, email')
          .eq('role', 'student')
          .eq('school_id', schoolId)
          .eq('is_active', true)
          .order('full_name'),
        db.from('invoices')
          .select('portal_user_id, amount, currency, status, due_date')
          .eq('school_id', schoolId)
          .not('portal_user_id', 'is', null),
        db.from('receipts')
          .select('id, receipt_number, amount, issued_at, portal_user_id, metadata')
          .eq('school_id', schoolId),
      ]);

      const students: StudentRow[] = (stuRes.data ?? []) as StudentRow[];
      const invoices: InvoiceRow[] = (invRes.data ?? []).map((i: any) => ({ ...i, currency: i.currency ?? 'NGN' })) as InvoiceRow[];
      const receipts: ReceiptRow[] = (recRes.data ?? []) as unknown as ReceiptRow[];

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
        const receiptNo = rec?.receipt_number ?? 'â€”';
        const datePaid = rec?.issued_at ? fmtDate(rec.issued_at) : 'â€”';
        const cls = s.section_class || 'â€”';
        return `<tr>
          <td style="text-align:center;color:#9ca3af">${i + 1}</td>
          <td style="font-weight:700">${s.full_name}</td>
          <td style="text-align:center">${cls}</td>
          <td style="text-align:right;font-weight:700">${amount ? fmt(amount, currency) : 'â€”'}</td>
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
<title>Payment Register â€” ${school?.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:22px 26px;font-size:12px}
@page{size:A4 landscape;margin:12mm 14mm}
@media print{body{padding:0}}
.header{display:flex;align-items:center;gap:14px;border-bottom:4px solid #7c3aed;padding-bottom:12px;margin-bottom:14px}
.logo{width:52px;height:52px;object-fit:contain}
.org-name{font-size:18px;font-weight:900;color:#7c3aed;letter-spacing:-0.3px}
.org-sub{font-size:9px;color:#6b7280;font-weight:600;margin-top:1px}
.doc-badge{margin-left:auto;text-align:right}
.doc-type{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.doc-ref{font-size:20px;font-weight:900;color:#4c1d95}
.meta{display:flex;gap:24px;margin-bottom:14px;padding:10px 14px;background:#f3f0ff;border-radius:8px;border:1px solid #7c3aed22}
.meta-item{display:flex;flex-direction:column;gap:2px}
.meta-lbl{font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px}
.meta-val{font-size:13px;font-weight:900;color:#4c1d95}
table{width:100%;border-collapse:collapse;font-size:11px}
thead tr{background:#4c1d95;color:#fff}
thead th{padding:8px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
tbody tr{border-bottom:1px solid #e5e7eb}
tbody tr:nth-child(even){background:#f9fafb}
tbody td{padding:7px 10px;color:#374151}
.summary{margin-top:16px;display:flex;gap:16px}
.sum-box{flex:1;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;text-align:center}
.sum-lbl{font-size:8px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.sum-val{font-size:18px;font-weight:900;color:#111}
.footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:12px;display:flex;justify-content:space-between;align-items:flex-end;font-size:9px;color:#9ca3af}
.sig-line{border-top:1px solid #374151;width:160px;padding-top:4px;color:#6b7280;margin-top:30px}
</style></head><body>
<div class="header">
  <img src="/logo.png" class="logo" onerror="this.style.display='none'" />
  <div>
    <div class="org-name">RILLCOD TECHNOLOGIES</div>
    <div class="org-sub">STEM, Robotics &amp; AI Education Partner Â· www.rillcod.com</div>
  </div>
  <div class="doc-badge">
    <div class="doc-type">Student Payment Register</div>
    <div class="doc-ref">${docRef}</div>
    <div style="font-size:9px;color:#6b7280;margin-top:2px">Printed: ${today}</div>
  </div>
</div>

<div class="meta">
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
  <th style="width:28%">Student Full Name</th>
  <th style="width:10%;text-align:center">Class / Grade</th>
  <th style="width:14%;text-align:right">Amount</th>
  <th style="width:16%;text-align:center">Receipt No.</th>
  <th style="width:14%;text-align:center">Date Paid</th>
  <th style="width:14%;text-align:center">Status</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>

<div class="summary">
  <div class="sum-box"><div class="sum-lbl">Total Students</div><div class="sum-val">${students.length}</div></div>
  <div class="sum-box" style="border-color:#059669;"><div class="sum-lbl" style="color:#059669">Paid</div><div class="sum-val" style="color:#059669">${paidCount}</div></div>
  <div class="sum-box" style="border-color:#d97706;"><div class="sum-lbl" style="color:#d97706">Outstanding</div><div class="sum-val" style="color:#d97706">${students.length - paidCount}</div></div>
  <div class="sum-box" style="border-color:#7c3aed;"><div class="sum-lbl" style="color:#7c3aed">Total Collected</div><div class="sum-val" style="color:#7c3aed">${fmt(totalCollected, currency)}</div></div>
</div>

<div class="footer">
  <div>
    <div class="sig-line">Prepared by: ${profile?.full_name ?? 'Staff'} &nbsp;Â·&nbsp; ${profile?.role ?? ''}</div>
  </div>
  <div style="text-align:center">
    <div class="sig-line">School Representative Signature</div>
  </div>
  <div style="text-align:right">
    <div>Ref: ${docRef} &nbsp;Â·&nbsp; rillcod.com/verify</div>
    <div>This document is confidential. For official use only.</div>
  </div>
</div>
<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script>
</body></html>`;

      const w = window.open('', '_blank', 'width=1100,height=820');
      if (!w) { alert('Pop-up blocked â€” please allow pop-ups.'); return; }
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
  }, [schoolId, termNumber, academicYear, flatRate, currency, school, profile, db, fmt, termLabel, linkedInvoice, saveRecentDoc]); // eslint-disable-line

  // â”€â”€ Build and print Attendance Roster â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const generateAttendanceRoster = useCallback(async () => {
    if (!schoolId || !dateFrom || !dateTo) return;
    setLoading(true);
    setRosterResult(null);
    setInvoiceCreated(null);
    try {
      const { data: records, error: attErr } = await db
        .from('attendance')
        .select(`
          student_id, status,
          class_sessions!inner(session_date, classes!inner(name, school_id)),
          portal_users!attendance_student_id_fkey(full_name, section_class, school_id)
        `)
        .eq('status', 'present')
        .eq('class_sessions.classes.school_id', schoolId)
        .gte('class_sessions.session_date', dateFrom)
        .lte('class_sessions.session_date', dateTo);
      if (attErr) throw new Error(attErr.message || 'Failed to load attendance');

      const attendance: AttendanceRow[] = ((records ?? []) as any[]).filter(
        (r: any) => r.portal_users && r.class_sessions && (r.portal_users.school_id == null || r.portal_users.school_id === schoolId),
      );

      type StudentAtt = { full_name: string; section_class: string; sessions: Set<string> };
      const byStudent: Record<string, StudentAtt> = {};
      attendance.forEach((r: any) => {
        const uid = r.student_id;
        if (!uid) return;
        if (!byStudent[uid]) {
          byStudent[uid] = {
            full_name: r.portal_users?.full_name ?? 'â€”',
            section_class: r.portal_users?.section_class ?? 'â€”',
            sessions: new Set(),
          };
        }
        const d = r.class_sessions?.session_date;
        if (d) byStudent[uid].sessions.add(d);
      });

      const students = Object.values(byStudent).sort((a, b) => a.full_name.localeCompare(b.full_name));
      const rate = parseFloat(flatRate) || null;
      const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const docRef = `AR-${Date.now().toString(36).toUpperCase().slice(-6)}`;

      const rows = students.map((s, i) => {
        const sessions = s.sessions.size;
        const amount = rate ? fmt(rate * sessions, currency) : `${sessions} sessions`;
        return `<tr>
          <td style="text-align:center;color:#9ca3af">${i + 1}</td>
          <td style="font-weight:700">${s.full_name}</td>
          <td style="text-align:center">${s.section_class}</td>
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
        term: `${fmtDate(dateFrom)} â€“ ${fmtDate(dateTo)}`,
        amount: totalOwed ?? undefined,
        currency,
        date: new Date().toISOString(),
      });

      // Scroll to result card
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Attendance Billing Roster â€” ${school?.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:22px 26px;font-size:12px}
@page{size:A4 portrait;margin:12mm 14mm}
@media print{body{padding:0}}
.header{display:flex;align-items:center;gap:14px;border-bottom:4px solid #0369a1;padding-bottom:12px;margin-bottom:14px}
.logo{width:52px;height:52px;object-fit:contain}
.org-name{font-size:18px;font-weight:900;color:#0369a1}
.org-sub{font-size:9px;color:#6b7280;font-weight:600;margin-top:1px}
.doc-badge{margin-left:auto;text-align:right}
.meta{display:flex;gap:20px;margin-bottom:14px;padding:10px 14px;background:#f0f9ff;border-radius:8px;border:1px solid #0369a122}
.meta-item{display:flex;flex-direction:column;gap:2px}
.meta-lbl{font-size:8px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.5px}
.meta-val{font-size:13px;font-weight:900;color:#0c4a6e}
table{width:100%;border-collapse:collapse;font-size:11px}
thead tr{background:#0369a1;color:#fff}
thead th{padding:8px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
tbody tr{border-bottom:1px solid #e5e7eb}
tbody tr:nth-child(even){background:#f0f9ff}
tbody td{padding:7px 10px;color:#374151}
.summary{margin-top:14px;display:flex;gap:14px}
.sum-box{flex:1;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;text-align:center}
.sum-lbl{font-size:8px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.sum-val{font-size:18px;font-weight:900;color:#111}
.footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:12px;display:flex;justify-content:space-between;align-items:flex-end;font-size:9px;color:#9ca3af}
.sig-line{border-top:1px solid #374151;width:160px;padding-top:4px;color:#6b7280;margin-top:30px}
.note{margin-top:12px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;font-size:10px;color:#92400e}
</style></head><body>
<div class="header">
  <img src="/logo.png" class="logo" onerror="this.style.display='none'" />
  <div>
    <div class="org-name">RILLCOD TECHNOLOGIES</div>
    <div class="org-sub">STEM, Robotics &amp; AI Education Partner Â· www.rillcod.com</div>
  </div>
  <div class="doc-badge">
    <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Attendance Billing Roster</div>
    <div style="font-size:20px;font-weight:900;color:#0c4a6e">${docRef}</div>
    <div style="font-size:9px;color:#6b7280;margin-top:2px">Printed: ${today}</div>
  </div>
</div>

<div class="meta">
  <div class="meta-item"><div class="meta-lbl">Partner School</div><div class="meta-val">${school?.name}</div></div>
  <div class="meta-item"><div class="meta-lbl">Period</div><div class="meta-val">${fmtDate(dateFrom)} â€“ ${fmtDate(dateTo)}</div></div>
  <div class="meta-item"><div class="meta-lbl">Students Present</div><div class="meta-val">${students.length}</div></div>
  <div class="meta-item"><div class="meta-lbl">Total Sessions</div><div class="meta-val">${totalSessions}</div></div>
  ${rate ? `<div class="meta-item"><div class="meta-lbl">Rate / Session</div><div class="meta-val">${fmt(rate, currency)}</div></div>` : ''}
  ${totalOwed ? `<div class="meta-item" style="background:#0c4a6e;padding:6px 12px;border-radius:6px"><div class="meta-lbl" style="color:#bae6fd">Amount Due</div><div class="meta-val" style="color:#fff">${fmt(totalOwed, currency)}</div></div>` : ''}
</div>

<table>
<thead><tr>
  <th style="width:5%;text-align:center">#</th>
  <th style="width:38%">Student Full Name</th>
  <th style="width:18%;text-align:center">Class / Grade</th>
  <th style="width:14%;text-align:center">Sessions Attended</th>
  <th style="width:16%;text-align:right">Amount</th>
  <th style="width:9%;text-align:center">Verified âœ“</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>

${totalOwed ? `
<div class="summary">
  <div class="sum-box"><div class="sum-lbl">Students</div><div class="sum-val">${students.length}</div></div>
  <div class="sum-box"><div class="sum-lbl">Sessions</div><div class="sum-val">${totalSessions}</div></div>
  <div class="sum-box" style="border-color:#0369a1"><div class="meta-lbl" style="color:#0369a1;margin-bottom:4px">Total Due</div><div class="sum-val" style="color:#0369a1">${fmt(totalOwed, currency)}</div></div>
</div>` : ''}

<div class="note">
  <strong>Note to ${school?.name}:</strong> This document confirms students who attended Rillcod STEM sessions during the stated period.
  Payment should be remitted to Rillcod Technologies within 14 days of receipt. Please sign and return one copy.
</div>

<div class="footer">
  <div><div class="sig-line">Prepared by: ${profile?.full_name ?? 'Staff'} &nbsp;Â·&nbsp; Rillcod Technologies</div></div>
  <div style="text-align:center"><div class="sig-line">School Representative Signature &amp; Stamp</div></div>
  <div style="text-align:right">
    <div>Ref: ${docRef} &nbsp;Â·&nbsp; rillcod.com/verify</div>
    <div>Confidential â€” For Official Use Only</div>
  </div>
</div>
<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script>
</body></html>`;

      const w = window.open('', '_blank', 'width=960,height=820');
      if (!w) { alert('Pop-up blocked â€” please allow pop-ups for printing. Your result is saved below â€” click "Create Invoice" to continue.'); return; }
      w.document.write(html);
      w.document.close();
    } catch (e: any) {
      alert(e.message ?? 'Failed to generate document');
    } finally {
      setLoading(false);
    }
  }, [schoolId, dateFrom, dateTo, flatRate, currency, school, profile, db, fmt, saveRecentDoc]); // eslint-disable-line

  // â”€â”€ Build and print unified School Billing Statement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const generateBillingStatement = useCallback(async () => {
    if (!schoolId) return;
    if (billStyle === 'attendance' && (!dateFrom || !dateTo)) return;
    setLoading(true);
    setRosterResult(null);
    setInvoiceCreated(null);
    setPreviewHtml(null);
    try {
      const rate = parseFloat(flatRate) || null;
      const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const docRef = `BS-${Date.now().toString(36).toUpperCase().slice(-6)}`;

      // â”€â”€ Collect student billing data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      let students: StudentBillingData[] = [];
      let totalAmount = 0;

      if (billStyle === 'payment') {
        const [stuRes, invRes, recRes] = await Promise.all([
          db.from('portal_users').select('id, full_name, section_class, email').eq('role', 'student').eq('school_id', schoolId).eq('is_active', true).order('full_name'),
          db.from('invoices').select('portal_user_id, amount, currency, status, due_date').eq('school_id', schoolId).not('portal_user_id', 'is', null),
          db.from('receipts').select('id, receipt_number, amount, issued_at, portal_user_id').eq('school_id', schoolId),
        ]);
        const rawStudents: StudentRow[] = (stuRes.data ?? []) as StudentRow[];
        const invoices: InvoiceRow[] = (invRes.data ?? []).map((i: any) => ({ ...i, currency: i.currency ?? 'NGN' })) as InvoiceRow[];
        const receipts: ReceiptRow[] = (recRes.data ?? []) as unknown as ReceiptRow[];
        const invMap: Record<string, InvoiceRow> = {};
        invoices.forEach(inv => { if (inv.portal_user_id && (!invMap[inv.portal_user_id] || inv.status === 'paid')) invMap[inv.portal_user_id] = inv; });
        const recMap: Record<string, ReceiptRow> = {};
        receipts.forEach(rec => { if (rec.portal_user_id && !recMap[rec.portal_user_id]) recMap[rec.portal_user_id] = rec; });
        students = rawStudents.map(s => {
          const inv = invMap[s.id]; const rec = recMap[s.id];
          const amt = rec?.amount ?? inv?.amount ?? (rate ?? null);
          if (amt) totalAmount += amt;
          const status = rec ? 'PAID' : inv ? inv.status.toUpperCase() : 'â€”';
          const col = rec || inv?.status === 'paid' ? '#059669' : inv?.status === 'sent' ? '#d97706' : '#6b7280';
          return { name: s.full_name, cls: s.section_class || 'â€”', amount: amt, receiptNumber: rec?.receipt_number ?? 'â€”', status, statusColor: col };
        });
      } else {
        const { data: records, error: attErr } = await db.from('attendance').select(`student_id, status, class_sessions!inner(session_date, classes!inner(name, school_id)), portal_users!attendance_student_id_fkey(full_name, section_class, school_id)`).eq('status', 'present').eq('class_sessions.classes.school_id', schoolId).gte('class_sessions.session_date', dateFrom).lte('class_sessions.session_date', dateTo);
        if (attErr) throw new Error(attErr.message || 'Failed to load attendance');
        const byStudent: Record<string, { full_name: string; section_class: string; sessions: Set<string> }> = {};
        ((records ?? []) as any[]).filter((r: any) => r.portal_users && r.class_sessions && (r.portal_users.school_id == null || r.portal_users.school_id === schoolId)).forEach((r: any) => {
          if (!r.student_id) return;
          if (!byStudent[r.student_id]) byStudent[r.student_id] = { full_name: r.portal_users?.full_name ?? 'â€”', section_class: r.portal_users?.section_class ?? 'â€”', sessions: new Set() };
          if (r.class_sessions?.session_date) byStudent[r.student_id].sessions.add(r.class_sessions.session_date);
        });
        Object.values(byStudent).sort((a, b) => a.full_name.localeCompare(b.full_name)).forEach(s => {
          const amt = rate ? rate * s.sessions.size : null;
          if (amt) totalAmount += amt;
          students.push({ name: s.full_name, cls: s.section_class, amount: amt, sessions: s.sessions.size, status: 'PENDING', statusColor: '#d97706' });
        });
      }

      // Snapshot students for CSV export
      setLastStudents(students);

      // Look up school invoice
      const { data: invData } = await db.from('invoices').select('id, invoice_number, amount, currency, status, due_date, payment_link, metadata').eq('school_id', schoolId).eq('stream', 'school').not('status', 'eq', 'cancelled').filter('metadata->>academic_year', 'eq', academicYear).filter('metadata->>term_number', 'eq', termNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const schoolInv = invData as (LinkedInvoice & { due_date?: string | null; payment_link?: string | null }) | null;
      const invoiceTotal = schoolInv ? Number(schoolInv.amount) : totalAmount;
      const invoiceRef = schoolInv?.invoice_number ?? docRef;
      const dueDate = schoolInv?.due_date ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const periodLabel = billStyle === 'payment' ? termLabel : `${fmtDate(dateFrom)} â€“ ${fmtDate(dateTo)}`;

      // Bank payment instructions
      const bankHtml = bankAccounts.length > 0
        ? bankAccounts.slice(0, 2).map(a => `<div style="padding:10px 14px;border:1px solid #e5e7eb;border-radius:6px;margin-top:8px"><div style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px">${a.label || a.bank_name}</div><div style="font-size:13px;font-weight:900;color:#4c1d95;font-family:monospace;margin:2px 0">${a.account_number}</div><div style="font-size:11px;color:#374151">${a.account_name} Â· ${a.bank_name}</div>${a.payment_note ? `<div style="font-size:9px;color:#6b7280;margin-top:2px">${a.payment_note}</div>` : ''}</div>`).join('')
        : '<p style="color:#6b7280;font-size:11px">Contact Rillcod for bank details.</p>';
      const payLinkHtml = (schoolInv as any)?.payment_link
        ? `<div style="margin-top:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px"><div style="font-size:9px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px">Online Payment</div><div style="font-size:11px;color:#065f46;margin-top:2px;word-break:break-all">${(schoolInv as any).payment_link}</div></div>`
        : '';

      // â”€â”€ HTML builder: combined table document â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const buildCombinedHtml = (autoprint: boolean) => {
        const colHeaders = billStyle === 'payment'
          ? '<th style="width:5%;text-align:center">#</th><th style="width:35%">Student Name</th><th style="width:12%;text-align:center">Class</th><th style="width:16%;text-align:right">Amount</th><th style="width:16%;text-align:center">Receipt No.</th><th style="width:16%;text-align:center">Status</th>'
          : '<th style="width:5%;text-align:center">#</th><th style="width:40%">Student Name</th><th style="width:15%;text-align:center">Class</th><th style="width:15%;text-align:center">Sessions</th><th style="width:25%;text-align:right">Amount</th>';
        const rows = students.map((s, i) => billStyle === 'payment'
          ? `<tr><td style="text-align:center;color:#9ca3af">${i + 1}</td><td style="font-weight:700">${s.name}</td><td style="text-align:center">${s.cls}</td><td style="text-align:right;font-weight:700">${s.amount ? fmt(s.amount, currency) : 'â€”'}</td><td style="text-align:center;font-family:monospace;font-size:10px">${s.receiptNumber ?? 'â€”'}</td><td style="text-align:center;font-weight:900;color:${s.statusColor}">${s.status}</td></tr>`
          : `<tr><td style="text-align:center;color:#9ca3af">${i + 1}</td><td style="font-weight:700">${s.name}</td><td style="text-align:center">${s.cls}</td><td style="text-align:center;font-weight:700">${s.sessions ?? 0}</td><td style="text-align:right;font-weight:700">${s.amount ? fmt(s.amount, currency) : `${s.sessions ?? 0} sessions`}</td></tr>`
        ).join('');
        const watermarkCss = autoprint ? '' : `body::before{content:'PREVIEW';position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:90px;font-weight:900;color:rgba(124,58,237,0.06);pointer-events:none;z-index:9999;letter-spacing:8px;white-space:nowrap;}`;
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>School Billing Statement â€” ${school?.name}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:22px 26px;font-size:12px}@page{size:A4 portrait;margin:12mm 14mm}@media print{body{padding:0}}${watermarkCss}.header{display:flex;align-items:center;gap:14px;border-bottom:4px solid #7c3aed;padding-bottom:12px;margin-bottom:14px}.logo{width:52px;height:52px;object-fit:contain}.org-name{font-size:18px;font-weight:900;color:#7c3aed}.org-sub{font-size:9px;color:#6b7280;font-weight:600;margin-top:1px}.doc-badge{margin-left:auto;text-align:right}.inv-block{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;padding:12px 14px;background:#f3f0ff;border-radius:8px;border:1px solid #7c3aed22}table{width:100%;border-collapse:collapse;font-size:11px}thead tr{background:#4c1d95;color:#fff}thead th{padding:7px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}tbody tr{border-bottom:1px solid #e5e7eb}tbody tr:nth-child(even){background:#f9fafb}tbody td{padding:6px 10px;color:#374151}.pay-section{margin-top:16px;padding:12px 14px;background:#faf5ff;border:1px solid #7c3aed22;border-radius:8px}.total-bar{margin-top:14px;display:flex;justify-content:flex-end}.total-box{padding:12px 20px;background:#4c1d95;color:#fff;border-radius:8px;text-align:right}.footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:12px;display:flex;justify-content:space-between;align-items:flex-end;font-size:9px;color:#9ca3af}.sig-line{border-top:1px solid #374151;width:160px;padding-top:4px;color:#6b7280;margin-top:30px}</style></head><body>
<div class="header">
  <img src="/logo.png" class="logo" onerror="this.style.display='none'" />
  <div><div class="org-name">RILLCOD TECHNOLOGIES</div><div class="org-sub">STEM, Robotics &amp; AI Education Partner Â· www.rillcod.com</div></div>
  <div class="doc-badge">
    <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">School Billing Statement</div>
    <div style="font-size:20px;font-weight:900;color:#4c1d95">${invoiceRef}</div>
    <div style="font-size:9px;color:#6b7280;margin-top:2px">Issued: ${today}</div>
  </div>
</div>
<div class="inv-block">
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
<div class="total-bar">
  <div class="total-box">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;opacity:0.8">Total Amount Due to Rillcod Technologies</div>
    <div style="font-size:22px;font-weight:900;margin-top:2px">${fmt(invoiceTotal, currency)}</div>
    <div style="font-size:9px;opacity:0.7;margin-top:2px">${students.length} students Â· ${periodLabel}</div>
  </div>
</div>
<div class="pay-section">
  <div style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Payment Instructions â€” Remit to Rillcod Technologies</div>
  ${bankHtml}
  ${payLinkHtml}
  <div style="font-size:10px;color:#6b7280;margin-top:10px">Please quote invoice reference <strong>${invoiceRef}</strong> in all payments. Contact accounts@rillcod.com for queries.</div>
</div>
<div class="footer">
  <div><div class="sig-line">Prepared by: ${profile?.full_name ?? 'Staff'} Â· Rillcod Technologies</div></div>
  <div style="text-align:center"><div class="sig-line">School Authorised Signatory &amp; Stamp</div></div>
  <div style="text-align:right"><div>Ref: ${docRef} Â· rillcod.com/verify</div><div>Confidential â€” For Official Use Only</div></div>
</div>
${autoprint ? '<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script>' : ''}
</body></html>`;
      };

      // â”€â”€ HTML builder: per-student slip pages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const buildIndividualHtml = () => {
        const firstBankAcc = bankAccounts[0];
        const paymentLink = (schoolInv as any)?.payment_link ?? null;
        const qrUrl = paymentLink
          ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(paymentLink)}&size=72x72&ecc=M&margin=2`
          : null;
        const slips = students.map((s, i) => {
          const isLast = i === students.length - 1;
          return `<div style="page-break-after:${isLast ? 'auto' : 'always'};padding:12mm 10mm;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="border:2px solid #7c3aed;border-radius:10px;padding:14px 16px;max-width:560px;margin:0 auto;">
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
      <div style="font-size:9px;color:#6b7280;">Class / Grade: <strong>${s.cls}</strong></div>
    </div>
    <div style="background:#4c1d95;color:#fff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div>
        <div style="font-size:8px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">Amount Due</div>
        <div style="font-size:20px;font-weight:900;">${s.amount ? fmt(s.amount, currency) : 'â€”'}</div>
        ${s.sessions !== undefined ? `<div style="font-size:9px;opacity:0.7;">${s.sessions} session${s.sessions !== 1 ? 's' : ''} attended</div>` : ''}
      </div>
      <div style="text-align:right;">
        <div style="font-size:8px;opacity:0.7;">Status</div>
        <div style="font-size:13px;font-weight:900;color:${s.statusColor === '#059669' ? '#4ade80' : s.statusColor === '#d97706' ? '#fbbf24' : '#d1d5db'};">${s.status}</div>
        ${s.receiptNumber && s.receiptNumber !== 'â€”' ? `<div style="font-size:8px;opacity:0.7;font-family:monospace;">Rcpt: ${s.receiptNumber}</div>` : ''}
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:10px;">
      ${firstBankAcc ? `<div style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;">
        <div style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;margin-bottom:4px;">Pay to Rillcod Technologies</div>
        <div style="font-size:11px;font-weight:700;color:#4c1d95;font-family:monospace;">${firstBankAcc.account_number}</div>
        <div style="font-size:9px;color:#374151;">${firstBankAcc.account_name} Â· ${firstBankAcc.bank_name}</div>
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
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Student Fee Slips â€” ${school?.name}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#fff;color:#111}@page{size:A4 portrait;margin:6mm}@media print{body{padding:0}}</style></head>
<body>${slips}<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script></body></html>`;
      };

      // â”€â”€ Output based on printMode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (printMode === 'individual') {
        const html = buildIndividualHtml();
        const w = window.open('', '_blank', 'width=960,height=820');
        if (!w) { alert('Pop-up blocked â€” please allow pop-ups for printing.'); } else { w.document.write(html); w.document.close(); }
      } else if (printMode === 'preview') {
        setPreviewHtml(buildCombinedHtml(false));
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
      } else {
        const html = buildCombinedHtml(true);
        const w = window.open('', '_blank', 'width=960,height=820');
        if (!w) { alert('Pop-up blocked â€” please allow pop-ups for printing.'); } else { w.document.write(html); w.document.close(); }
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
  }, [schoolId, billStyle, termNumber, academicYear, flatRate, currency, dateFrom, dateTo, school, profile, db, fmt, termLabel, bankAccounts, printMode, saveRecentDoc]); // eslint-disable-line

  // â”€â”€ CSV export of last generated student list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const downloadCsv = useCallback(() => {
    if (!lastStudents.length) return;
    const headers = ['#', 'Name', 'Class', 'Amount', 'Sessions', 'Receipt No.', 'Status'];
    const rows = lastStudents.map((s, i) =>
      [i + 1, `"${s.name.replace(/"/g, '""')}"`, `"${s.cls}"`, s.amount ?? '', s.sessions ?? '', `"${(s.receiptNumber ?? '').replace(/"/g, '""')}"`, s.status].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-${(school?.name ?? 'school').replace(/[^a-z0-9]/gi, '-')}-${(lastStatement?.period ?? 'export').replace(/[^a-z0-9]/gi, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [lastStudents, school, lastStatement]);

  // â”€â”€ Email billing statement to school â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">{children}</label>
  );
  const Input = ({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary" />
  );
  const Select = ({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary">
      {children}
    </select>
  );

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

      {/* â”€â”€ Overdue schools alert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {overdueSchools.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-red-400 text-sm">âš </span>
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
                    {ov.currency === 'USD' ? '$' : 'â‚¦'}{ov.amount.toLocaleString('en-NG')} Â· {ov.daysOverdue}d overdue
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

      {/* Step 1 â€” Document type */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Step 1 â€” Choose Document Type</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            {
              id: 'billing_statement',
              label: 'School Billing Statement',
              emoji: 'ðŸ«',
              sub: 'All-in-one: student list + invoice + payment instructions in one printable document. Send this to the school to collect payment.',
              badge: 'Recommended',
            },
            {
              id: 'payment_register',
              label: 'Payment Register',
              emoji: 'ðŸ“‹',
              sub: 'Student-by-student payment log with receipt numbers. For schools that collect fees and remit to Rillcod.',
            },
            {
              id: 'attendance_roster',
              label: 'Attendance Roster',
              emoji: 'ðŸ“…',
              sub: 'Sessions attended per student Ã— agreed rate. For schools billed based on attendance.',
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

      {/* Step 2 â€” Fill in details */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Step 2 â€” Fill in Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2 lg:col-span-2">
            <Lbl>Partner School</Lbl>
            <Select value={schoolId} onChange={e => setSchoolId(e.target.value)}>
              <option value="">â€” Select school â€”</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>

          <div>
            <Lbl>Currency</Lbl>
            <Select value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="NGN">NGN (â‚¦)</option>
              <option value="USD">USD ($)</option>
            </Select>
          </div>

          {docType === 'payment_register' && (
            <>
              <div>
                <Lbl>Academic Year</Lbl>
                <Select value={academicYear} onChange={e => setAcademicYear(e.target.value)}>
                  {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                    <option key={y} value={String(y)}>{y}/{y + 1}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Lbl>Term</Lbl>
                <Select value={termNumber} onChange={e => setTermNumber(e.target.value)}>
                  <option value="1">First Term</option>
                  <option value="2">Second Term</option>
                  <option value="3">Third Term</option>
                </Select>
              </div>
              <div>
                <Lbl>Flat Fee Per Student <span className="text-muted-foreground/60 normal-case font-normal">(optional â€” auto-filled from invoice)</span></Lbl>
                <Input type="number" min={0} placeholder="e.g. 15000" value={flatRate} onChange={e => setFlatRate(e.target.value)} />
              </div>
            </>
          )}

          {docType === 'attendance_roster' && (
            <>
              <div>
                <Lbl>Date From</Lbl>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Lbl>Date To</Lbl>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <div>
                <Lbl>Rate Per Session <span className="text-muted-foreground/60 normal-case font-normal">(optional)</span></Lbl>
                <Input type="number" min={0} placeholder="e.g. 5000" value={flatRate} onChange={e => setFlatRate(e.target.value)} />
              </div>
            </>
          )}

          {docType === 'billing_statement' && (
            <>
              <div>
                <Lbl>Academic Year</Lbl>
                <Select value={academicYear} onChange={e => setAcademicYear(e.target.value)}>
                  {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                    <option key={y} value={String(y)}>{y}/{y + 1}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Lbl>Term</Lbl>
                <Select value={termNumber} onChange={e => setTermNumber(e.target.value)}>
                  <option value="1">First Term</option>
                  <option value="2">Second Term</option>
                  <option value="3">Third Term</option>
                </Select>
              </div>
              <div>
                <Lbl>Billing Style</Lbl>
                <Select value={billStyle} onChange={e => setBillStyle(e.target.value as 'payment' | 'attendance')}>
                  <option value="payment">Student Payments (fee-based)</option>
                  <option value="attendance">Attendance-based</option>
                </Select>
              </div>
              <div>
                <Lbl>Rate <span className="text-muted-foreground/60 normal-case font-normal">(per student or per session)</span></Lbl>
                <Input type="number" min={0} placeholder="e.g. 15000" value={flatRate} onChange={e => setFlatRate(e.target.value)} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Lbl>Output Mode</Lbl>
                <div className="flex rounded-lg overflow-hidden border border-border text-[10px] font-black uppercase tracking-widest">
                  {([
                    { id: 'combined', label: 'ðŸ“„ Combined', tip: 'All students in one table document' },
                    { id: 'individual', label: 'ðŸ—‚ Individual Slips', tip: 'One printable slip per student â€” distribute physically' },
                    { id: 'preview', label: 'ðŸ‘ Inline Preview', tip: 'Preview inside this panel â€” print from here' },
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
                  {printMode === 'individual' && 'Opens individual fee slips â€” one page per student â€” for physical distribution.'}
                  {printMode === 'preview' && 'Shows the document inline below â€” inspect before printing with the Print button.'}
                </p>
              </div>
              {billStyle === 'attendance' && (
                <>
                  <div>
                    <Lbl>Date From</Lbl>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <Lbl>Date To</Lbl>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                  </div>
                </>
              )}
              {bankAccounts.length > 0 && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                    <span className="text-emerald-400 text-xs">âœ“</span>
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
                <ArrowPathIcon className="w-3 h-3 animate-spin" /> Looking up school invoiceâ€¦
              </p>
            ) : linkedInvoice ? (
              <div className="mt-1 space-y-0.5">
                <p className="text-[10px] text-emerald-400 font-black">
                  âœ“ Linked to invoice {linkedInvoice.invoice_number} Â· {linkedInvoice.status.toUpperCase()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {linkedInvoice.metadata?.term_label ?? termLabel} Â· Total â‚¦{Number(linkedInvoice.amount).toLocaleString('en-NG')}
                  {flatRate ? ` Â· Rate/student auto-filled: â‚¦${Number(flatRate).toLocaleString('en-NG')}` : ''}
                </p>
              </div>
            ) : (
              <p className="text-[10px] text-amber-400">No matching school invoice found for this term â€” will use manual rate if provided.</p>
            )}
          </div>
        </div>
      )}

      {/* Step 3 â€” Generate */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Step 3 â€” Generate &amp; Print</p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={docType === 'payment_register' ? generatePaymentRegister : docType === 'attendance_roster' ? generateAttendanceRoster : generateBillingStatement}
            disabled={!canGenerate || loading}
            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40 transition-all shadow-lg shadow-primary/20"
          >
            {loading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <PrinterIcon className="w-4 h-4" />}
            {loading ? 'Generatingâ€¦' : docType === 'billing_statement' ? 'Generate Billing Statement' : docType === 'payment_register' ? 'Generate Payment Register' : 'Generate Attendance Roster'}
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
            {!schoolId ? 'â†‘ Select a partner school to continue.' : 'Enter the date range to continue.'}
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
                {sendingEmail ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <span>âœ‰</span>}
                {sendingEmail ? 'Sendingâ€¦' : 'Email Statement'}
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
              Sends a branded email summary of ref <span className="font-mono">{lastStatement.invoiceRef}</span> Â· {lastStatement.period} to the school's billing contact.
            </p>
          </div>
        )}
      </div>

      {/* â”€â”€ Inline preview pane (billing_statement preview mode) â”€â”€â”€â”€â”€ */}
      {docType === 'billing_statement' && previewHtml && (
        <div ref={resultRef} className="rounded-xl border-2 border-primary/20 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/20">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4 text-primary" />
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Document Preview</p>
              <span className="text-[9px] text-muted-foreground">(scroll to inspect Â· use Print to output)</span>
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

      {/* â”€â”€ Roster result card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                {rosterResult.rate ? fmt(rosterResult.rate, currency) : 'â€”'}
              </p>
            </div>
            <div className={`rounded-lg p-3 text-center border ${rosterResult.total ? 'border-sky-500/30 bg-sky-500/10' : 'border-border bg-card'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Total Due</p>
              <p className="text-xl font-black text-sky-400">
                {rosterResult.total ? fmt(rosterResult.total, currency) : 'â€”'}
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
                {creatingInvoice ? 'Creating Invoiceâ€¦' : 'Create School Invoice from This Roster'}
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

      {/* â”€â”€ Invoice created success â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

      {/* â”€â”€ Recent Documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                  {doc.type === 'billing_statement' ? 'ðŸ«' : doc.type === 'payment_register' ? 'ðŸ“‹' : 'ðŸ“…'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-black text-foreground font-mono">{doc.ref}</p>
                    {doc.invoiceNumber && (
                      <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                        â†’ {doc.invoiceNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {doc.school} Â· {doc.term}
                    {doc.amount && doc.currency ? ` Â· ${doc.currency === 'USD' ? '$' : 'â‚¦'}${doc.amount.toLocaleString('en-NG')}` : ''}
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
