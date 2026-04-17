import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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
    .select('*, portal_users(id, full_name, email), schools(id, name, address)')
    .eq('id', invoiceId)
    .single();

  if (!invoice) return null;

  // Access control: admin sees all, school sees own school, parent/student sees own
  if (profile.role === 'school' && invoice.school_id !== profile.school_id) return null;
  if (['parent', 'student'].includes(profile.role) && invoice.portal_user_id !== profile.id) return null;

  return { profile, invoice };
}

// GET /api/invoices/[id]/pdf — returns printable HTML invoice page
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: invoiceId } = await context.params;
  const ctx = await getCallerAndInvoice(req, invoiceId);
  if (!ctx) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 });

  const { invoice } = ctx;
  const student = invoice.portal_users as any;
  const school = invoice.schools as any;
  const currencySymbol = invoice.currency === 'NGN' ? '₦' : (invoice.currency ?? '₦');
  const invoiceNumber = invoice.invoice_number ?? `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
  const schoolName = school?.name ?? 'Rillcod Technologies';
  const amount = Number(invoice.amount);
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';
  const issuedDate = invoice.created_at
    ? new Date(invoice.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  const statusColors: Record<string, string> = {
    paid:      '#15803d',
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

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Invoice-Number': invoiceNumber,
    },
  });
}
