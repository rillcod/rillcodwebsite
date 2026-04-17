import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const admin = adminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id, full_name, email')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'school', 'teacher'].includes(profile.role)) return null;
  return profile;
}

// POST /api/invoices/[id]/remind
// Body: { reminder_number: 1 | 2 | 3 }
// reminder_number 1 = initial send (invoice issued)
// reminder_number 2 = follow-up reminder
// reminder_number 3 = final warning / overdue
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: invoiceId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const reminderNumber: 1 | 2 | 3 = body.reminder_number ?? 2;

  const admin = adminClient();

  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select('*, portal_users(id, full_name, email), schools(name)')
    .eq('id', invoiceId)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const student = invoice.portal_users as any;
  if (!student?.email) {
    return NextResponse.json({ error: 'Recipient email not found' }, { status: 400 });
  }

  const schoolName: string = (invoice.schools as any)?.name ?? 'Rillcod Technologies';
  const currencySymbol = invoice.currency === 'NGN' ? '₦' : (invoice.currency ?? '₦');
  const amount = Number(invoice.amount).toLocaleString();
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';
  const invoiceNumber = invoice.invoice_number ?? `INV-${invoiceId.slice(0, 8).toUpperCase()}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com';
  const paymentLink = `${appUrl}/dashboard/parent-invoices`;

  const REMINDER_SUBJECTS: Record<number, string> = {
    1: `Invoice ${invoiceNumber} from ${schoolName} — Payment Due ${dueDate}`,
    2: `Reminder: Invoice ${invoiceNumber} is Due Soon — ${dueDate}`,
    3: `FINAL REMINDER: Invoice ${invoiceNumber} is Overdue — Action Required`,
  };

  const REMINDER_INTRO: Record<number, string> = {
    1: `Please find your invoice from <strong>${schoolName}</strong> below. Payment is due by <strong>${dueDate}</strong>.`,
    2: `This is a friendly reminder that your invoice from <strong>${schoolName}</strong> is due on <strong>${dueDate}</strong>. Please make payment at your earliest convenience.`,
    3: `This is a <strong style="color:#dc2626;">final reminder</strong> that your invoice from <strong>${schoolName}</strong> was due on <strong>${dueDate}</strong> and is now <strong>overdue</strong>. Please settle this immediately to avoid service interruption.`,
  };

  const urgencyColor: Record<number, string> = { 1: '#2563eb', 2: '#d97706', 3: '#dc2626' };
  const color = urgencyColor[reminderNumber] ?? '#2563eb';
  const badgeText: Record<number, string> = { 1: 'INVOICE', 2: 'REMINDER', 3: 'FINAL REMINDER' };

  const itemsHtml = (invoice.items as any[] ?? []).map((item: any) => `
    <tr>
      <td style="padding:10px 12px; border-bottom:1px solid #f3f4f6;">${item.description ?? ''}</td>
      <td style="padding:10px 12px; text-align:right; border-bottom:1px solid #f3f4f6; font-family:monospace;">${currencySymbol}${Number(item.unit_price ?? 0).toLocaleString()}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:'Segoe UI',system-ui,sans-serif; max-width:600px; margin:0 auto; background:#fff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
      <!-- Header -->
      <div style="background:${color}; padding:24px 28px; display:flex; align-items:center; justify-content:space-between;">
        <div>
          <div style="color:rgba(255,255,255,0.8); font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:2px;">${schoolName}</div>
          <div style="color:#fff; font-size:22px; font-weight:900; margin-top:4px;">${invoiceNumber}</div>
        </div>
        <div style="background:rgba(255,255,255,0.15); color:#fff; padding:6px 14px; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1px; border-radius:4px;">${badgeText[reminderNumber]}</div>
      </div>

      <!-- Body -->
      <div style="padding:28px;">
        <p style="color:#374151; font-size:15px; margin:0 0 8px;">Hello <strong>${student.full_name}</strong>,</p>
        <p style="color:#6b7280; font-size:14px; margin:0 0 20px; line-height:1.6;">${REMINDER_INTRO[reminderNumber]}</p>

        <!-- Summary box -->
        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px 20px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <div style="font-size:11px; color:#9ca3af; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Total Due</div>
            <div style="font-size:28px; font-weight:900; color:#111827; font-family:monospace;">${currencySymbol}${amount}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px; color:#9ca3af; font-weight:700; text-transform:uppercase; letter-spacing:1px;">Due Date</div>
            <div style="font-size:16px; font-weight:700; color:${reminderNumber === 3 ? '#dc2626' : '#374151'};">${dueDate}</div>
          </div>
        </div>

        <!-- Items table -->
        ${itemsHtml ? `
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px; text-align:left; font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #e5e7eb;">Description</th>
              <th style="padding:10px 12px; text-align:right; font-size:11px; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; border-bottom:1px solid #e5e7eb;">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr>
              <td style="padding:12px; font-weight:900; font-size:15px; color:#111827; border-top:2px solid #e5e7eb;">TOTAL</td>
              <td style="padding:12px; text-align:right; font-weight:900; font-size:18px; color:${color}; font-family:monospace; border-top:2px solid #e5e7eb;">${currencySymbol}${amount}</td>
            </tr>
          </tfoot>
        </table>` : ''}

        ${invoice.notes ? `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:12px 16px; margin-bottom:20px; font-size:13px; color:#92400e;">${invoice.notes}</div>` : ''}

        <!-- CTA -->
        <div style="text-align:center; margin:24px 0;">
          <a href="${paymentLink}" style="display:inline-block; background:${color}; color:#fff; padding:14px 32px; text-decoration:none; border-radius:8px; font-weight:900; font-size:14px; text-transform:uppercase; letter-spacing:1px;">View & Pay Invoice</a>
        </div>

        <!-- Upload proof note -->
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:12px 16px; margin-bottom:20px; font-size:13px; color:#166534;">
          <strong>Paid by bank transfer?</strong> Upload your payment evidence (screenshot or receipt) directly from your dashboard, or reply to this email with your proof of payment.
        </div>

        <p style="font-size:12px; color:#9ca3af; margin-top:20px; line-height:1.6;">
          Questions? Contact us at <a href="mailto:support@rillcod.com" style="color:${color};">support@rillcod.com</a> — include your invoice number <strong>${invoiceNumber}</strong> in your message.
        </p>
      </div>

      <!-- Footer -->
      <div style="background:#f9fafb; padding:16px 28px; border-top:1px solid #e5e7eb; font-size:11px; color:#9ca3af; text-align:center;">
        Rillcod Technologies · <a href="${appUrl}" style="color:#9ca3af;">${appUrl.replace('https://', '')}</a>
      </div>
    </div>
  `;

  try {
    await notificationsService.sendEmail(student.id, {
      to: student.email,
      subject: REMINDER_SUBJECTS[reminderNumber],
      html,
      fromName: schoolName,
      fromEmail: 'support@rillcod.com',
    });
  } catch (e: any) {
    console.error('[remind] email failed', e?.message);
    return NextResponse.json({ error: 'Failed to send reminder email', detail: e?.message }, { status: 500 });
  }

  // Track the reminder on the invoice
  const reminderCountField = `reminder_${reminderNumber}_sent_at`;
  await admin
    .from('invoices')
    .update({
      [`reminder_${reminderNumber}_sent_at`]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Mark as 'sent' if was draft, mark as 'overdue' if reminder 3
      ...(reminderNumber === 3 && invoice.status !== 'paid' ? { status: 'overdue' } : {}),
      ...(invoice.status === 'draft' ? { status: 'sent' } : {}),
    } as any)
    .eq('id', invoiceId);

  return NextResponse.json({
    success: true,
    message: `Reminder ${reminderNumber} sent to ${student.email}`,
    reminder_number: reminderNumber,
    sent_to: student.email,
  });
}
