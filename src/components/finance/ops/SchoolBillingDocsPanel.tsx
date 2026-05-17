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
  const resultRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    db.from('schools').select('id, name').order('name').then(({ data }) => setSchools(data ?? []));
    // Fetch Rillcod bank accounts for payment instructions (used in billing statement)
    fetch('/api/payment-accounts')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setBankAccounts((j.data ?? []).filter((a: any) => a.is_active && !a.school_id)))
      .catch(() => { });
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
      : `₦${n.toLocaleString('en-NG')}`;

  const termLabel = `${TERM_LABELS[parseInt(termNumber) - 1]} ${academicYear}/${parseInt(academicYear) + 1}`;
  const school = schools.find(s => s.id === schoolId);

  // ── Create school invoice from attendance roster total ────────────
  const createInvoiceFromRoster = useCallback(async () => {
    if (!rosterResult?.total || !schoolId) return;
    setCreatingInvoice(true);
    setInvoiceCreated(null);
    try {
      const invoiceNumber = `SINV-${Date.now().toString(36).toUpperCase()}`;
      const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
      const dateRange = dateFrom && dateTo
        ? ` (${new Date(dateFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${new Date(dateTo).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})`
        : '';
      const { data, error } = await db
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          school_id: schoolId,
          stream: 'school',
          currency,
          amount: rosterResult.total,
          status: 'sent',
          due_date: dueDate,
          items: [{
            description: `Attendance-based STEM sessions${dateRange}`,
            quantity: rosterResult.studentCount,
            unit_price: rosterResult.rate ?? Math.round(rosterResult.total / rosterResult.studentCount),
            total: rosterResult.total,
          }],
          metadata: {
            term_number: parseInt(termNumber),
            academic_year: parseInt(academicYear),
            term_label: termLabel,
            payment_method: 'bank_transfer',
            attendance_doc_ref: rosterResult.docRef,
            date_from: dateFrom || null,
            date_to: dateTo || null,
          },
          notes: `Auto-generated from Attendance Billing Roster ${rosterResult.docRef}`,
        } as any)
        .select('id, invoice_number')
        .single();

      if (error) throw error;
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

  // ── Build and print Payment Register ─────────────────────────────
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
        const receiptNo = rec?.receipt_number ?? '—';
        const datePaid = rec?.issued_at ? fmtDate(rec.issued_at) : '—';
        const cls = s.section_class || '—';
        return `<tr>
          <td style="text-align:center;color:#9ca3af">${i + 1}</td>
          <td style="font-weight:700">${s.full_name}</td>
          <td style="text-align:center">${cls}</td>
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
    <div class="org-sub">STEM, Robotics &amp; AI Education Partner · www.rillcod.com</div>
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
  }, [schoolId, termNumber, academicYear, flatRate, currency, school, profile, db, fmt, termLabel, linkedInvoice, saveRecentDoc]); // eslint-disable-line

  // ── Build and print Attendance Roster ─────────────────────────────
  const generateAttendanceRoster = useCallback(async () => {
    if (!schoolId || !dateFrom || !dateTo) return;
    setLoading(true);
    setRosterResult(null);
    setInvoiceCreated(null);
    try {
      const { data: records } = await db
        .from('attendance')
        .select(`
          student_id, status,
          class_sessions(session_date, classes(name)),
          portal_users!attendance_student_id_fkey(full_name, section_class)
        `)
        .eq('status', 'present')
        .gte('class_sessions.session_date', dateFrom)
        .lte('class_sessions.session_date', dateTo);

      const attendance: AttendanceRow[] = ((records ?? []) as any[]).filter(
        (r: any) => r.portal_users && r.class_sessions,
      );

      type StudentAtt = { full_name: string; section_class: string; sessions: Set<string> };
      const byStudent: Record<string, StudentAtt> = {};
      attendance.forEach((r: any) => {
        const uid = r.student_id;
        if (!uid) return;
        if (!byStudent[uid]) {
          byStudent[uid] = {
            full_name: r.portal_users?.full_name ?? '—',
            section_class: r.portal_users?.section_class ?? '—',
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
    <div class="org-sub">STEM, Robotics &amp; AI Education Partner · www.rillcod.com</div>
  </div>
  <div class="doc-badge">
    <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Attendance Billing Roster</div>
    <div style="font-size:20px;font-weight:900;color:#0c4a6e">${docRef}</div>
    <div style="font-size:9px;color:#6b7280;margin-top:2px">Printed: ${today}</div>
  </div>
</div>

<div class="meta">
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
  <th style="width:38%">Student Full Name</th>
  <th style="width:18%;text-align:center">Class / Grade</th>
  <th style="width:14%;text-align:center">Sessions Attended</th>
  <th style="width:16%;text-align:right">Amount</th>
  <th style="width:9%;text-align:center">Verified ✓</th>
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
  <div><div class="sig-line">Prepared by: ${profile?.full_name ?? 'Staff'} &nbsp;·&nbsp; Rillcod Technologies</div></div>
  <div style="text-align:center"><div class="sig-line">School Representative Signature &amp; Stamp</div></div>
  <div style="text-align:right">
    <div>Ref: ${docRef} &nbsp;·&nbsp; rillcod.com/verify</div>
    <div>Confidential — For Official Use Only</div>
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
  }, [schoolId, dateFrom, dateTo, flatRate, currency, school, profile, db, fmt, saveRecentDoc]); // eslint-disable-line

  // ── Build and print unified School Billing Statement ──────────────
  const generateBillingStatement = useCallback(async () => {
    if (!schoolId) return;
    if (billStyle === 'attendance' && (!dateFrom || !dateTo)) return;
    setLoading(true);
    setRosterResult(null);
    setInvoiceCreated(null);
    try {
      const rate = parseFloat(flatRate) || null;
      const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      const docRef = `BS-${Date.now().toString(36).toUpperCase().slice(-6)}`;

      // Fetch students + payment data
      let totalAmount = 0;
      let studentRows: string[] = [];
      let studentCount = 0;

      if (billStyle === 'payment') {
        const [stuRes, invRes, recRes] = await Promise.all([
          db.from('portal_users').select('id, full_name, section_class, email').eq('role', 'student').eq('school_id', schoolId).eq('is_active', true).order('full_name'),
          db.from('invoices').select('portal_user_id, amount, currency, status, due_date').eq('school_id', schoolId).not('portal_user_id', 'is', null),
          db.from('receipts').select('id, receipt_number, amount, issued_at, portal_user_id').eq('school_id', schoolId),
        ]);
        const students: StudentRow[] = (stuRes.data ?? []) as StudentRow[];
        const invoices: InvoiceRow[] = (invRes.data ?? []).map((i: any) => ({ ...i, currency: i.currency ?? 'NGN' })) as InvoiceRow[];
        const receipts: ReceiptRow[] = (recRes.data ?? []) as unknown as ReceiptRow[];

        const invMap: Record<string, InvoiceRow> = {};
        invoices.forEach(inv => { if (inv.portal_user_id && (!invMap[inv.portal_user_id] || inv.status === 'paid')) invMap[inv.portal_user_id] = inv; });
        const recMap: Record<string, ReceiptRow> = {};
        receipts.forEach(rec => { if (rec.portal_user_id && !recMap[rec.portal_user_id]) recMap[rec.portal_user_id] = rec; });

        studentCount = students.length;
        studentRows = students.map((s, i) => {
          const inv = invMap[s.id]; const rec = recMap[s.id];
          const amt = rec?.amount ?? inv?.amount ?? (rate ?? 0);
          if (amt) totalAmount += amt;
          const status = rec ? 'PAID' : inv ? inv.status.toUpperCase() : '—';
          const col = rec || inv?.status === 'paid' ? '#059669' : inv?.status === 'sent' ? '#d97706' : '#6b7280';
          return `<tr><td style="text-align:center;color:#9ca3af">${i + 1}</td><td style="font-weight:700">${s.full_name}</td><td style="text-align:center">${s.section_class || '—'}</td><td style="text-align:right;font-weight:700">${amt ? fmt(amt, currency) : '—'}</td><td style="text-align:center;font-family:monospace;font-size:10px">${rec?.receipt_number ?? '—'}</td><td style="text-align:center;font-weight:900;color:${col}">${status}</td></tr>`;
        });
      } else {
        const { data: records } = await db.from('attendance').select(`student_id, status, class_sessions(session_date, classes(name)), portal_users!attendance_student_id_fkey(full_name, section_class)`).eq('status', 'present').gte('class_sessions.session_date', dateFrom).lte('class_sessions.session_date', dateTo);
        const byStudent: Record<string, { full_name: string; section_class: string; sessions: Set<string> }> = {};
        ((records ?? []) as any[]).filter((r: any) => r.portal_users && r.class_sessions).forEach((r: any) => {
          if (!r.student_id) return;
          if (!byStudent[r.student_id]) byStudent[r.student_id] = { full_name: r.portal_users?.full_name ?? '—', section_class: r.portal_users?.section_class ?? '—', sessions: new Set() };
          if (r.class_sessions?.session_date) byStudent[r.student_id].sessions.add(r.class_sessions.session_date);
        });
        const students = Object.values(byStudent).sort((a, b) => a.full_name.localeCompare(b.full_name));
        studentCount = students.length;
        students.forEach((s, i) => {
          const amt = rate ? rate * s.sessions.size : null;
          if (amt) totalAmount += amt;
          studentRows.push(`<tr><td style="text-align:center;color:#9ca3af">${i + 1}</td><td style="font-weight:700">${s.full_name}</td><td style="text-align:center">${s.section_class}</td><td style="text-align:center;font-weight:700">${s.sessions.size}</td><td style="text-align:right;font-weight:700">${amt ? fmt(amt, currency) : `${s.sessions.size} sessions`}</td></tr>`);
        });
      }

      // Look up school invoice
      const { data: invData } = await db.from('invoices').select('id, invoice_number, amount, currency, status, due_date, payment_link, metadata').eq('school_id', schoolId).eq('stream', 'school').not('status', 'eq', 'cancelled').filter('metadata->>academic_year', 'eq', academicYear).filter('metadata->>term_number', 'eq', termNumber).order('created_at', { ascending: false }).limit(1).maybeSingle();
      const schoolInv = invData as (LinkedInvoice & { due_date?: string | null; payment_link?: string | null }) | null;
      const invoiceTotal = schoolInv ? Number(schoolInv.amount) : totalAmount;
      const invoiceRef = schoolInv?.invoice_number ?? docRef;
      const dueDate = schoolInv?.due_date ?? new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

      // Payment instructions from bank accounts
      const bankHtml = bankAccounts.length > 0
        ? bankAccounts.slice(0, 2).map(a => `
          <div style="padding:10px 14px;border:1px solid #e5e7eb;border-radius:6px;margin-top:8px">
            <div style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px">${a.label || a.bank_name}</div>
            <div style="font-size:13px;font-weight:900;color:#4c1d95;font-family:monospace;margin:2px 0">${a.account_number}</div>
            <div style="font-size:11px;color:#374151">${a.account_name} · ${a.bank_name}</div>
            ${a.payment_note ? `<div style="font-size:9px;color:#6b7280;margin-top:2px">${a.payment_note}</div>` : ''}
          </div>`).join('')
        : '<p style="color:#6b7280;font-size:11px">Contact Rillcod for bank details.</p>';

      const payLinkHtml = (schoolInv as any)?.payment_link
        ? `<div style="margin-top:10px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px"><div style="font-size:9px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px">Online Payment</div><div style="font-size:11px;color:#065f46;margin-top:2px;word-break:break-all">${(schoolInv as any).payment_link}</div></div>`
        : '';

      const colHeaders = billStyle === 'payment'
        ? '<th style="width:5%;text-align:center">#</th><th style="width:35%">Student Name</th><th style="width:12%;text-align:center">Class</th><th style="width:16%;text-align:right">Amount</th><th style="width:16%;text-align:center">Receipt No.</th><th style="width:16%;text-align:center">Status</th>'
        : '<th style="width:5%;text-align:center">#</th><th style="width:40%">Student Name</th><th style="width:15%;text-align:center">Class</th><th style="width:15%;text-align:center">Sessions</th><th style="width:25%;text-align:right">Amount</th>';

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>School Billing Statement — ${school?.name}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:22px 26px;font-size:12px}@page{size:A4 portrait;margin:12mm 14mm}@media print{body{padding:0}}.header{display:flex;align-items:center;gap:14px;border-bottom:4px solid #7c3aed;padding-bottom:12px;margin-bottom:14px}.logo{width:52px;height:52px;object-fit:contain}.org-name{font-size:18px;font-weight:900;color:#7c3aed}.org-sub{font-size:9px;color:#6b7280;font-weight:600;margin-top:1px}.doc-badge{margin-left:auto;text-align:right}.inv-block{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;padding:12px 14px;background:#f3f0ff;border-radius:8px;border:1px solid #7c3aed22}.inv-left,.inv-right{}.inv-lbl{font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px}.inv-val{font-size:13px;font-weight:900;color:#4c1d95}.inv-right{text-align:right}.divider{border:none;border-top:1px solid #e5e7eb;margin:12px 0}table{width:100%;border-collapse:collapse;font-size:11px}thead tr{background:#4c1d95;color:#fff}thead th{padding:7px 10px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}tbody tr{border-bottom:1px solid #e5e7eb}tbody tr:nth-child(even){background:#f9fafb}tbody td{padding:6px 10px;color:#374151}.pay-section{margin-top:16px;padding:12px 14px;background:#faf5ff;border:1px solid #7c3aed22;border-radius:8px}.pay-title{font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}.total-bar{margin-top:14px;display:flex;justify-content:flex-end}.total-box{padding:12px 20px;background:#4c1d95;color:#fff;border-radius:8px;text-align:right}.total-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;opacity:0.8}.total-val{font-size:22px;font-weight:900;margin-top:2px}.footer{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:12px;display:flex;justify-content:space-between;align-items:flex-end;font-size:9px;color:#9ca3af}.sig-line{border-top:1px solid #374151;width:160px;padding-top:4px;color:#6b7280;margin-top:30px}</style></head><body>
<div class="header">
  <img src="/logo.png" class="logo" onerror="this.style.display='none'" />
  <div><div class="org-name">RILLCOD TECHNOLOGIES</div><div class="org-sub">STEM, Robotics &amp; AI Education Partner · www.rillcod.com</div></div>
  <div class="doc-badge">
    <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">School Billing Statement</div>
    <div style="font-size:20px;font-weight:900;color:#4c1d95">${invoiceRef}</div>
    <div style="font-size:9px;color:#6b7280;margin-top:2px">Issued: ${today}</div>
  </div>
</div>

<div class="inv-block">
  <div class="inv-left">
    <div class="inv-lbl">Billed To</div><div class="inv-val">${school?.name}</div>
    <div class="inv-lbl" style="margin-top:8px">Period</div><div class="inv-val" style="font-size:11px">${billStyle === 'payment' ? termLabel : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`}</div>
  </div>
  <div class="inv-right">
    <div class="inv-lbl">Invoice Ref</div><div class="inv-val" style="font-family:monospace">${invoiceRef}</div>
    <div class="inv-lbl" style="margin-top:8px">Due Date</div><div class="inv-val" style="font-size:11px;color:#d97706">${fmtDate(dueDate)}</div>
    ${schoolInv ? `<div class="inv-lbl" style="margin-top:6px">Status</div><div class="inv-val" style="font-size:10px;color:${schoolInv.status === 'paid' ? '#059669' : '#7c3aed'}">${schoolInv.status.toUpperCase()}</div>` : ''}
  </div>
</div>

<p style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">
  ${billStyle === 'payment' ? 'Student Payment Breakdown' : 'Student Attendance Breakdown'}
</p>
<table><thead><tr>${colHeaders}</tr></thead><tbody>${studentRows.join('')}</tbody></table>

<div class="total-bar">
  <div class="total-box">
    <div class="total-lbl">Total Amount Due to Rillcod Technologies</div>
    <div class="total-val">${fmt(invoiceTotal, currency)}</div>
    <div style="font-size:9px;opacity:0.7;margin-top:2px">${studentCount} students · ${billStyle === 'payment' ? termLabel : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`}</div>
  </div>
</div>

<div class="pay-section">
  <div class="pay-title">Payment Instructions — Remit to Rillcod Technologies</div>
  ${bankHtml}
  ${payLinkHtml}
  <div style="font-size:10px;color:#6b7280;margin-top:10px">Please quote invoice reference <strong>${invoiceRef}</strong> in all payments. Contact accounts@rillcod.com for queries.</div>
</div>

<div class="footer">
  <div><div class="sig-line">Prepared by: ${profile?.full_name ?? 'Staff'} · Rillcod Technologies</div></div>
  <div style="text-align:center"><div class="sig-line">School Authorised Signatory &amp; Stamp</div></div>
  <div style="text-align:right"><div>Ref: ${docRef} · rillcod.com/verify</div><div>Confidential — For Official Use Only</div></div>
</div>
<script>window.onload = () => { setTimeout(() => window.print(), 500); }</script>
</body></html>`;

      const w = window.open('', '_blank', 'width=960,height=820');
      if (!w) { alert('Pop-up blocked — please allow pop-ups for printing.'); return; }
      w.document.write(html);
      w.document.close();

      saveRecentDoc({
        ref: docRef, type: 'billing_statement',
        school: school?.name ?? schoolId,
        term: billStyle === 'payment' ? termLabel : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`,
        amount: invoiceTotal, currency,
        invoiceNumber: invoiceRef,
        date: new Date().toISOString(),
      });
    } catch (e: any) {
      alert(e.message ?? 'Failed to generate billing statement');
    } finally {
      setLoading(false);
    }
  }, [schoolId, billStyle, termNumber, academicYear, flatRate, currency, dateFrom, dateTo, school, profile, db, fmt, termLabel, bankAccounts, saveRecentDoc]); // eslint-disable-line

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
              onClick={() => { setDocType(opt.id); setRosterResult(null); setInvoiceCreated(null); if (opt.id !== 'billing_statement') setBillStyle('payment'); }}>
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
            <Lbl>Partner School</Lbl>
            <Select value={schoolId} onChange={e => setSchoolId(e.target.value)}>
              <option value="">— Select school —</option>
              {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>

          <div>
            <Lbl>Currency</Lbl>
            <Select value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="NGN">NGN (₦)</option>
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
                <Lbl>Flat Fee Per Student <span className="text-muted-foreground/60 normal-case font-normal">(optional — auto-filled from invoice)</span></Lbl>
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
            {loading
              ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
              : <PrinterIcon className="w-4 h-4" />}
            {loading
              ? 'Generating…'
              : docType === 'billing_statement' ? 'Generate Billing Statement'
            : docType === 'payment_register' ? 'Generate Payment Register'
            : 'Generate Attendance Roster'}
          </button>
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
            {!schoolId
              ? '↑ Select a partner school to continue.'
              : 'Enter the date range to continue.'}
          </p>
        )}
      </div>

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
                <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs ${doc.type === 'payment_register' ? 'bg-primary/10 text-primary' : 'bg-sky-500/10 text-sky-400'}`}>
                  {doc.type === 'payment_register' ? '📋' : '📅'}
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
