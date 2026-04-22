import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { classifyInvoiceStream, splitSchoolAmount, DEFAULT_COMMISSION_RATE } from '@/lib/finance/streams';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getCallerAndInvoice(req: NextRequest, invoiceId: string) {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const admin = adminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  const { data: invoice } = await admin
    .from('invoices')
    .select('*, portal_users(id, full_name, email), schools(id, name, address, commission_rate)')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return null;

  // Access control: admin sees all, school sees own school, parent/student sees own
  if (profile.role === 'school' && invoice.school_id !== profile.school_id) return null;
  if (['parent', 'student'].includes(profile.role) && invoice.portal_user_id !== profile.id) return null;

  // For SCHOOL-stream invoices load the linked billing cycle so we
  // can render the term / retain / settlement breakdown.
  let cycle: any = null;
  if (invoice.billing_cycle_id) {
    const { data } = await admin
      .from('billing_cycles')
      .select('id, term_label, items, rillcod_retain_amount, school_settlement_amount, due_date, period_start, period_end')
      .eq('id', invoice.billing_cycle_id)
      .single();
    cycle = data;
  }

  return { profile, invoice, cycle };
}

// GET /api/invoices/[id]/pdf — returns printable HTML invoice page.
// Two distinct layouts depending on stream:
//   • SCHOOL — bold indigo header, term / cycle breakdown, retain
//     & settlement block, aggregate of student line items.
//   • INDIVIDUAL — clean neutral header, learner bill-to, single
//     payment prompt with bank-transfer proof upload hint.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await context.params;
  const ctx = await getCallerAndInvoice(req, invoiceId);
  if (!ctx) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });

  const { invoice, cycle } = ctx;
  const stream = classifyInvoiceStream(invoice);

  const html = stream === 'school'
    ? renderSchoolInvoiceHtml(invoice, cycle)
    : renderIndividualInvoiceHtml(invoice);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Invoice-Number': invoice.invoice_number ?? `INV-${invoiceId.slice(0, 8).toUpperCase()}`,
      'X-Invoice-Stream': stream,
    },
  });
}

// ──────────────────────────────────────────────────────────────
// INDIVIDUAL TEMPLATE
// ──────────────────────────────────────────────────────────────
function renderIndividualInvoiceHtml(invoice: any): string {
  const student = invoice.portal_users as any;
  const school = invoice.schools as any;
  const currencySymbol = invoice.currency === 'NGN' ? '₦' : (invoice.currency ?? '₦');
  const invoiceNumber = invoice.invoice_number ?? `INV-${String(invoice.id).slice(0, 8).toUpperCase()}`;
  const schoolName = 'Rillcod Academy';
  const amount = Number(invoice.amount);
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';
  const issuedDate = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  const statusColors: Record<string, string> = {
    paid:      '#047857',
    sent:      '#2563eb',
    draft:     '#6b7280',
    overdue:   '#dc2626',
    cancelled: '#6b7280',
  };
  const statusColor = statusColors[invoice.status] ?? '#374151';

  const itemsHtml = (invoice.items as any[] ?? []).map((item: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
      <td style="padding:10px 14px; font-size:13px; color:#374151;">${item.description ?? ''}</td>
      <td style="padding:10px 14px; text-align:center; font-size:12px; color:#6b7280;">${item.quantity ?? 1}</td>
      <td style="padding:10px 14px; text-align:right; font-size:13px; font-family:monospace; color:#374151;">${currencySymbol}${Number(item.unit_price ?? 0).toLocaleString()}</td>
      <td style="padding:10px 14px; text-align:right; font-size:13px; font-family:monospace; font-weight:700; color:#111827;">${currencySymbol}${Number((item.quantity ?? 1) * (item.unit_price ?? 0)).toLocaleString()}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${invoiceNumber}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; color: #111827; font-size: 14px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { max-width: 780px; margin: 0 auto; padding: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding: 0 0 24px; border-bottom: 3px solid #111827; margin-bottom: 24px; }
    .brand { }
    .brand-name { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #111827; }
    .brand-sub { font-size: 11px; color: #6b7280; margin-top: 3px; }
    .invoice-badge { text-align: right; }
    .invoice-title { font-size: 28px; font-weight: 900; color: #111827; text-transform: uppercase; letter-spacing: 2px; }
    .invoice-number { font-size: 14px; font-family: monospace; color: #6b7280; margin-top: 4px; }
    .status-badge { display: inline-block; background: ${statusColor}; color: #fff; padding: 4px 12px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-radius: 3px; margin-top: 8px; }
    .meta-row { display: flex; gap: 20px; margin-bottom: 24px; flex-wrap: wrap; }
    .meta-box { flex: 1; min-width: 160px; background: #f9fafb; border: 1px solid #e5e7eb; padding: 14px 16px; }
    .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 4px; }
    .meta-value { font-size: 14px; font-weight: 700; color: #111827; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
    .party { }
    .party-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 6px; }
    .party-name { font-size: 16px; font-weight: 900; color: #111827; }
    .party-detail { font-size: 12px; color: #6b7280; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
    .items-header th { background: #111827; color: #fff; padding: 10px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .items-header th:last-child, .items-header th:nth-last-child(2) { text-align: right; }
    .items-header th:nth-child(2) { text-align: center; }
    .total-row { background: #f9fafb; border-top: 2px solid #111827; }
    .total-row td { padding: 14px; font-weight: 900; font-size: 15px; }
    .total-amount { text-align: right; font-family: monospace; font-size: 20px; color: #111827; }
    .notes { margin-top: 24px; background: #fffbeb; border: 1px solid #fde68a; padding: 14px 16px; font-size: 13px; color: #92400e; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-start; font-size: 11px; color: #9ca3af; }
    .footer-left { line-height: 1.7; }
    .footer-right { text-align: right; }
    .proof-note { margin-top: 20px; background: #eff6ff; border: 1px solid #bfdbfe; padding: 14px 16px; font-size: 12px; color: #1e40af; }
    @media print { .no-print { display: none !important; } body { background: #fff; } }
  </style>
</head>
<body>
<div class="page">

  <!-- Print button (hidden on print) -->
  <div class="no-print" style="text-align:right; padding:16px 0 20px; display:flex; gap:12px; justify-content:flex-end;">
    <button onclick="window.print()" style="background:#111827; color:#fff; border:none; padding:10px 24px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; cursor:pointer; border-radius:4px;">Print / Save PDF</button>
    <button onclick="window.close()" style="background:#f9fafb; color:#374151; border:1px solid #e5e7eb; padding:10px 24px; font-size:12px; font-weight:700; cursor:pointer; border-radius:4px;">Close</button>
  </div>

  <!-- Header -->
  <div class="header">
    <div class="brand">
      <div class="brand-name">${schoolName}</div>
      <div class="brand-sub">www.rillcod.com · support@rillcod.com</div>
    </div>
    <div class="invoice-badge">
      <div class="invoice-title">Invoice</div>
      <div class="invoice-number">${invoiceNumber}</div>
      <div><span class="status-badge">${invoice.status?.toUpperCase() ?? 'ISSUED'}</span></div>
    </div>
  </div>

  <!-- Meta row -->
  <div class="meta-row">
    <div class="meta-box">
      <div class="meta-label">Issue Date</div>
      <div class="meta-value">${issuedDate}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Due Date</div>
      <div class="meta-value" style="color:${invoice.status === 'overdue' ? '#dc2626' : '#111827'};">${dueDate}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Invoice No.</div>
      <div class="meta-value" style="font-family:monospace;">${invoiceNumber}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Amount Due</div>
      <div class="meta-value" style="font-family:monospace; font-size:18px; color:#111827;">${currencySymbol}${amount.toLocaleString()}</div>
    </div>
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="party">
      <div class="party-label">From</div>
      <div class="party-name">${schoolName}</div>
      <div class="party-detail">support@rillcod.com</div>
      ${school?.address ? `<div class="party-detail">${school.address}</div>` : ''}
    </div>
    <div class="party">
      <div class="party-label">Bill To</div>
      <div class="party-name">${student?.full_name ?? 'Student'}</div>
      <div class="party-detail">${student?.email ?? ''}</div>
    </div>
  </div>

  <!-- Items table -->
  <table>
    <thead class="items-header">
      <tr>
        <th style="text-align:left; width:50%;">Description</th>
        <th style="width:10%;">Qty</th>
        <th style="width:20%;">Unit Price</th>
        <th style="width:20%;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml || `<tr><td colspan="4" style="padding:16px; text-align:center; color:#9ca3af; font-style:italic;">Service fee</td></tr>`}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3" style="padding:14px; font-size:14px; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:#111827;">Total Amount Due</td>
        <td class="total-amount" style="padding:14px;">${currencySymbol}${amount.toLocaleString()}</td>
      </tr>
    </tfoot>
  </table>

  ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}

  <!-- Proof of payment note -->
  <div class="proof-note">
    <strong>Paid via bank transfer?</strong> Log in to your Rillcod dashboard and upload your payment receipt or evidence under <em>Invoices &amp; Payments</em>. Our team will verify and confirm within 24 hours. You may also reply to support@rillcod.com with your proof and include invoice number <strong>${invoiceNumber}</strong>.
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      Rillcod Technologies · www.rillcod.com<br/>
      support@rillcod.com<br/>
      This invoice was generated automatically.
    </div>
    <div class="footer-right">
      ${invoiceNumber}<br/>
      Generated: ${new Date().toLocaleDateString('en-GB')}<br/>
      Status: ${invoice.status?.toUpperCase() ?? 'ISSUED'}
    </div>
  </div>

</div>
</body>
</html>`;

  return html;
}

// ──────────────────────────────────────────────────────────────
// SCHOOL TEMPLATE
// ──────────────────────────────────────────────────────────────
// A deliberately different document: indigo accent, term headline,
// aggregated student line items, and a commission / settlement
// breakdown the school accountant can tie back to the payout.
function renderSchoolInvoiceHtml(invoice: any, cycle: any): string {
  const school = invoice.schools as any;
  const currencySymbol = invoice.currency === 'NGN' ? '₦' : (invoice.currency ?? '₦');
  const invoiceNumber = invoice.invoice_number ?? `INV-SCH-${String(invoice.id).slice(0, 8).toUpperCase()}`;
  const amount = Number(invoice.amount);
  const dueDate = (cycle?.due_date || invoice.due_date)
    ? new Date(cycle?.due_date || invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Before next term';
  const issuedDate = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';
  const term = cycle?.term_label || invoice.metadata?.term_label || 'Current term';

  const commissionRate = Number(school?.commission_rate ?? DEFAULT_COMMISSION_RATE);
  const retain = cycle?.rillcod_retain_amount != null
    ? Number(cycle.rillcod_retain_amount)
    : splitSchoolAmount(amount, commissionRate).rillcodRetain;
  const settle = cycle?.school_settlement_amount != null
    ? Number(cycle.school_settlement_amount)
    : splitSchoolAmount(amount, commissionRate).schoolSettlement;

  const cycleItems: any[] = Array.isArray(cycle?.items) ? cycle.items : Array.isArray(invoice.items) ? invoice.items : [];
  const itemsHtml = cycleItems.map((item: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f5f7ff'};">
      <td style="padding:10px 14px; font-size:12px; color:#1e1b4b; font-weight:600;">${item.student_name ?? item.description ?? 'Student'}</td>
      <td style="padding:10px 14px; font-size:12px; color:#4338ca; font-family:monospace;">${item.invoice_number ?? ''}</td>
      <td style="padding:10px 14px; font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px;">${item.status ?? 'pending'}</td>
      <td style="padding:10px 14px; text-align:right; font-family:monospace; font-size:13px; font-weight:700; color:#1e1b4b;">${currencySymbol}${Number(item.amount ?? 0).toLocaleString()}</td>
    </tr>
  `).join('');

  const statusColor = invoice.status === 'paid' ? '#047857'
    : invoice.status === 'overdue' ? '#dc2626'
    : '#4338ca';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>School Invoice ${invoiceNumber}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; color: #111827; font-size: 14px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { max-width: 780px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding: 0 0 24px; border-bottom: 4px solid #4338ca; margin-bottom: 24px; }
    .brand-name { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #4338ca; }
    .brand-sub { font-size: 11px; color: #6b7280; margin-top: 3px; }
    .doc-title { font-size: 24px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 1.5px; }
    .doc-stream { font-size: 10px; font-weight: 900; color: #4338ca; letter-spacing: 2px; margin-top: 4px; }
    .doc-number { font-size: 13px; font-family: monospace; color: #6b7280; margin-top: 6px; }
    .status-pill { display: inline-block; background: ${statusColor}; color: #fff; padding: 4px 12px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-radius: 3px; margin-top: 8px; }
    .term-banner { background: linear-gradient(135deg, #4338ca 0%, #6366f1 100%); color: #fff; padding: 18px 20px; border-radius: 4px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .term-label { font-size: 10px; font-weight: 700; letter-spacing: 2px; opacity: 0.85; margin-bottom: 4px; }
    .term-value { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
    .term-amount { font-size: 22px; font-weight: 900; font-family: monospace; }
    .meta-row { display: flex; gap: 12px; margin-bottom: 22px; flex-wrap: wrap; }
    .meta-box { flex: 1; min-width: 140px; background: #eef2ff; border: 1px solid #c7d2fe; padding: 12px 14px; border-radius: 3px; }
    .meta-label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #4338ca; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 700; color: #0f172a; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 26px; }
    .party-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 6px; }
    .party-name { font-size: 16px; font-weight: 900; color: #0f172a; }
    .party-detail { font-size: 12px; color: #6b7280; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    .items-header th { background: #1e1b4b; color: #c7d2fe; padding: 10px 14px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; text-align: left; }
    .items-header th:last-child { text-align: right; }
    .breakdown { margin-top: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 18px 20px; }
    .breakdown h4 { font-size: 10px; font-weight: 900; color: #334155; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 14px; }
    .breakdown-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; color: #334155; border-bottom: 1px dashed #e2e8f0; }
    .breakdown-row:last-child { border-bottom: none; }
    .breakdown-row.total { font-size: 16px; font-weight: 900; color: #4338ca; margin-top: 8px; padding-top: 12px; border-top: 2px solid #4338ca; border-bottom: none; }
    .notes { margin-top: 24px; background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px 16px; font-size: 13px; color: #92400e; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: flex-start; font-size: 11px; color: #9ca3af; }
    @media print { .no-print { display: none !important; } body { background: #fff; } }
  </style>
</head>
<body>
<div class="page">

  <div class="no-print" style="text-align:right; padding:16px 0 20px; display:flex; gap:12px; justify-content:flex-end;">
    <button onclick="window.print()" style="background:#4338ca; color:#fff; border:none; padding:10px 24px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; cursor:pointer; border-radius:4px;">Print / Save PDF</button>
    <button onclick="window.close()" style="background:#f9fafb; color:#374151; border:1px solid #e5e7eb; padding:10px 24px; font-size:12px; font-weight:700; cursor:pointer; border-radius:4px;">Close</button>
  </div>

  <div class="header">
    <div>
      <div class="brand-name">Rillcod Technologies</div>
      <div class="brand-sub">School Partnerships Division · RC: 1892341</div>
    </div>
    <div style="text-align:right;">
      <div class="doc-title">School Invoice</div>
      <div class="doc-stream">· BILLING CYCLE ·</div>
      <div class="doc-number">${invoiceNumber}</div>
      <span class="status-pill">${invoice.status?.toUpperCase() ?? 'ISSUED'}</span>
    </div>
  </div>

  <div class="term-banner">
    <div>
      <div class="term-label">BILLING CYCLE</div>
      <div class="term-value">${term}</div>
    </div>
    <div style="text-align:right;">
      <div class="term-label">CYCLE TOTAL</div>
      <div class="term-amount">${currencySymbol}${amount.toLocaleString()}</div>
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-box">
      <div class="meta-label">Issue Date</div>
      <div class="meta-value">${issuedDate}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Due Date</div>
      <div class="meta-value">${dueDate}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Students Billed</div>
      <div class="meta-value">${cycleItems.length || '—'}</div>
    </div>
    <div class="meta-box">
      <div class="meta-label">Invoice No.</div>
      <div class="meta-value" style="font-family:monospace;">${invoiceNumber}</div>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="party-label">Issued By</div>
      <div class="party-name">Rillcod Technologies</div>
      <div class="party-detail">partners@rillcod.com</div>
      <div class="party-detail">12 Digital Learning Hub, Benin City, Nigeria</div>
    </div>
    <div>
      <div class="party-label">Billed To</div>
      <div class="party-name">${school?.name ?? 'Partner School'}</div>
      <div class="party-detail">${school?.address ?? ''}</div>
    </div>
  </div>

  <table>
    <thead class="items-header">
      <tr>
        <th style="width:40%;">Student / Description</th>
        <th style="width:20%;">Invoice #</th>
        <th style="width:15%;">Status</th>
        <th style="width:25%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml || `<tr><td colspan="4" style="padding:16px; text-align:center; color:#9ca3af; font-style:italic;">No line items captured for this cycle.</td></tr>`}
    </tbody>
  </table>

  <div class="breakdown">
    <h4>Commission & Settlement Breakdown</h4>
    <div class="breakdown-row">
      <span>Gross cycle amount</span>
      <span style="font-family:monospace;">${currencySymbol}${amount.toLocaleString()}</span>
    </div>
    <div class="breakdown-row">
      <span>Rillcod commission (${commissionRate}%)</span>
      <span style="font-family:monospace; color:#b91c1c;">– ${currencySymbol}${retain.toLocaleString()}</span>
    </div>
    <div class="breakdown-row total">
      <span>Settlement to School</span>
      <span style="font-family:monospace;">${currencySymbol}${settle.toLocaleString()}</span>
    </div>
  </div>

  ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}

  <div class="footer">
    <div>
      Rillcod Technologies · www.rillcod.com · partners@rillcod.com<br/>
      Settlement queries: accounts@rillcod.com
    </div>
    <div style="text-align:right;">
      ${invoiceNumber}<br/>
      Generated ${new Date().toLocaleDateString('en-GB')}<br/>
      Status: ${invoice.status?.toUpperCase() ?? 'ISSUED'}
    </div>
  </div>

</div>
</body>
</html>`;
}
