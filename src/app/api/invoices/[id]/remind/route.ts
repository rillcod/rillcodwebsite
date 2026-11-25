import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';
import { buildInvoiceReminderEmail, defaultInvoicePaymentUrl } from '@/lib/finance/invoice-email';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { logAudit } from '@/lib/audit/log';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { loadInvoicePaymentAccounts } from '@/lib/finance/invoice-payment-accounts';
import { invoiceOutstandingAmount } from '@/lib/finance/invoice-state';
import {
  analyzeInvoiceIntelligence,
  buildSmartFinanceWhatsAppText,
  buildWhatsAppShareHref,
  isDeliverableExternalEmail,
} from '@/lib/finance/smart-communication';
import { sendWhatsAppDetailed } from '@/lib/whatsapp/send';

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
  if (!profile || !roleHasCapability(profile.role, 'manage_finance')) return null;
  return profile;
}

// POST /api/invoices/[id]/remind
// Body: { reminder_number?: 1 | 2 | 3 | 'auto', recipientEmail?: string, recipientPhone?: string, customNote?: string, sendWhatsApp?: boolean }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: invoiceId } = await context.params;
  const body = await req.json().catch(() => ({}));

  const admin = adminClient();

  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select('*, portal_users!invoices_portal_user_id_fkey(id, full_name, email, school_id), schools(name)')
    .eq('id', invoiceId)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const diagnostics = analyzeInvoiceIntelligence(invoice);
  const requestedStage = Number(body.reminder_number);
  const reminderNumber: 1 | 2 | 3 =
    requestedStage === 1 || requestedStage === 2 || requestedStage === 3
      ? requestedStage
      : diagnostics.recommendedReminderStage;

  let billingContact: {
    representative_email?: string | null;
    representative_name?: string | null;
    representative_whatsapp?: string | null;
  } | null = null;
  if (invoice.school_id) {
    const { data } = await admin
      .from('billing_contacts')
      .select('representative_email, representative_name, representative_whatsapp')
      .eq('school_id', invoice.school_id)
      .maybeSingle();
    billingContact = data;
  } else if (invoice.portal_user_id) {
    const { data } = await admin
      .from('billing_contacts')
      .select('representative_email, representative_name, representative_whatsapp')
      .eq('owner_user_id', invoice.portal_user_id)
      .maybeSingle();
    billingContact = data;
  }

  const stream = String(invoice.stream || '').toLowerCase();
  const isSchool = stream === 'school' || (Boolean(invoice.school_id) && !invoice.portal_user_id);

  let resolvedEmail: string | null = null;
  let resolvedPhone: string | null = billingContact?.representative_whatsapp || null;
  let resolvedName: string = isSchool
    ? (billingContact?.representative_name || invoice.schools?.name || 'Partner School')
    : (billingContact?.representative_name || (invoice.portal_users as any)?.full_name || 'Client');
  let schoolPortalUserId: string | null = null;

  if (isSchool) {
    if (isDeliverableExternalEmail(billingContact?.representative_email)) {
      resolvedEmail = billingContact!.representative_email!.trim();
    }
    if (invoice.school_id) {
      const { data: schoolUser } = await admin
        .from('portal_users')
        .select('id, email, phone, full_name')
        .eq('school_id', invoice.school_id)
        .eq('role', 'school')
        .maybeSingle();
      schoolPortalUserId = schoolUser?.id ?? null;
      if (!resolvedEmail && isDeliverableExternalEmail(schoolUser?.email)) {
        resolvedEmail = schoolUser!.email!.trim();
      }
      if (!resolvedPhone && schoolUser?.phone) resolvedPhone = schoolUser.phone;
    }
  } else {
    if (isDeliverableExternalEmail(billingContact?.representative_email)) {
      resolvedEmail = billingContact!.representative_email!.trim();
    }
    if (invoice.portal_user_id) {
      const { data: stu } = await admin
        .from('students')
        .select('parent_name, parent_email, parent_phone, phone')
        .eq('user_id', invoice.portal_user_id)
        .maybeSingle();
      if (!resolvedEmail && isDeliverableExternalEmail(stu?.parent_email)) {
        resolvedEmail = stu!.parent_email!.trim();
      }
      if (!resolvedPhone) resolvedPhone = stu?.parent_phone || stu?.phone || null;
      if (stu?.parent_name) resolvedName = stu.parent_name;
    }
    if (!resolvedEmail && isDeliverableExternalEmail((invoice.portal_users as any)?.email)) {
      resolvedEmail = (invoice.portal_users as any).email.trim();
    }
  }

  const recipientEmail =
    typeof body.recipientEmail === 'string' && body.recipientEmail.trim()
      ? body.recipientEmail.trim()
      : resolvedEmail;
  const recipientPhone =
    typeof body.recipientPhone === 'string' && body.recipientPhone.trim()
      ? body.recipientPhone.trim()
      : resolvedPhone;

  const recipientUserId =
    (invoice.portal_users as any)?.id
    || schoolPortalUserId
    || caller.id;

  if (!recipientEmail) {
    return NextResponse.json(
      { error: 'Recipient email not found — enter an email address to send this reminder' },
      { status: 400 },
    );
  }

  let bankAccounts;
  try {
    bankAccounts = await loadInvoicePaymentAccounts(admin as any, invoice, 3);
  } catch {
    bankAccounts = undefined;
  }

  const paymentUrl = defaultInvoicePaymentUrl({ isSchool, invoiceId });
  const customNote = typeof body.customNote === 'string' ? body.customNote.trim() : undefined;

  const { html, subject, fromName } = buildInvoiceReminderEmail(
    { ...invoice, id: invoiceId },
    reminderNumber,
    {
      recipientName: resolvedName,
      customNote,
      paymentUrl,
      bankAccounts,
      isSchool,
    },
  );

  try {
    const sent = await notificationsService.sendEmail(String(recipientUserId), {
      to: recipientEmail,
      subject,
      html,
      fromName,
      fromEmail: SMTP_FROM_EMAIL,
    });
    if (sent === false) {
      return NextResponse.json({ error: 'Recipient has email notifications disabled' }, { status: 422 });
    }
  } catch (e: any) {
    console.error('[remind] email failed', e?.message);
    return NextResponse.json({ error: 'Failed to send reminder email', detail: e?.message }, { status: 500 });
  }

  // Persist newly supplied school contact details so future reminders work in 1 click
  if (isSchool && invoice.school_id && (recipientEmail || recipientPhone)) {
    try {
      if (!billingContact) {
        await admin.from('billing_contacts').insert({
          school_id: invoice.school_id,
          owner_type: 'school',
          representative_email: recipientEmail || null,
          representative_whatsapp: recipientPhone || null,
          representative_name: invoice.schools?.name || null,
          owner_user_id: caller.id,
        });
      } else {
        const patch: Record<string, any> = {};
        if (recipientEmail && recipientEmail !== billingContact.representative_email) {
          patch.representative_email = recipientEmail;
        }
        if (recipientPhone && recipientPhone !== billingContact.representative_whatsapp) {
          patch.representative_whatsapp = recipientPhone;
        }
        if (Object.keys(patch).length > 0) {
          await admin.from('billing_contacts').update(patch).eq('school_id', invoice.school_id);
        }
      }
    } catch { /* non-fatal */ }
  }

  // Send In-App notification to linked portal user if present
  const notifyTargetUserId = (invoice.portal_users as any)?.id || schoolPortalUserId;
  if (notifyTargetUserId) {
    try {
      const remAmt = invoiceOutstandingAmount(invoice);
      await notificationsService.logNotification(
        String(notifyTargetUserId),
        reminderNumber === 3
          ? `Overdue Invoice #${invoice.invoice_number}`
          : `Payment Reminder — Invoice #${invoice.invoice_number}`,
        `Outstanding balance of ${(invoice.currency || 'NGN')} ${remAmt.toLocaleString()} on Invoice #${invoice.invoice_number}.${customNote ? ` Note: ${customNote}` : ''}`,
        reminderNumber === 3 ? 'warning' : 'info',
      );
    } catch { /* non-fatal */ }
  }

  const termLabel =
    typeof invoice.metadata?.term_label === 'string'
      ? invoice.metadata.term_label
      : invoice.metadata?.term && invoice.metadata?.academic_year
        ? `${invoice.metadata.term} ${invoice.metadata.academic_year}`
        : null;

  const waText = buildSmartFinanceWhatsAppText({
    mode: reminderNumber === 3 ? 'reminder_3' : reminderNumber === 2 ? 'reminder_2' : 'reminder_1',
    recipientName: resolvedName,
    invoiceNumber: invoice.invoice_number || invoiceId.slice(0, 8).toUpperCase(),
    currency: invoice.currency || 'NGN',
    totalAmount: Number(invoice.original_amount ?? invoice.amount ?? 0),
    amountPaid: Number(invoice.amount_paid ?? 0),
    remainingAmount: invoiceOutstandingAmount(invoice),
    dueDate: invoice.due_date,
    termLabel,
    bankAccount: bankAccounts?.[0] ?? null,
    paymentUrl,
    customNote: customNote || null,
  });
  const whatsappShareUrl = buildWhatsAppShareHref(recipientPhone, waText);

  let whatsappDelivered = false;
  if (body.sendWhatsApp && recipientPhone) {
    try {
      const waRes = await sendWhatsAppDetailed({
        to: recipientPhone,
        message: waText,
        sourceType: 'invoice_reminder',
        sourceId: invoiceId,
        schoolId: invoice.school_id ?? null,
        recipientUserId: notifyTargetUserId ?? null,
      });
      whatsappDelivered = Boolean(waRes?.success);
    } catch { /* non-fatal */ }
  }

  const { error: reminderWriteError } = await admin
    .from('invoices')
    .update({
      [`reminder_${reminderNumber}_sent_at`]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(reminderNumber === 3
        && invoice.status !== 'paid'
        && invoice.due_date
        && new Date(invoice.due_date).getTime() < Date.now()
        ? { status: 'overdue' } : {}),
      ...(invoice.status === 'draft' ? { status: 'sent' } : {}),
    } as any)
    .eq('id', invoiceId);
  if (reminderWriteError) {
    return NextResponse.json({ success: false, error: 'Reminder delivered but audit state was not saved', code: 'audit_write_failed', detail: reminderWriteError.message }, { status: 500 });
  }

  await logAudit(admin as any, {
    action: 'invoice_reminder_sent',
    actorId: caller.id,
    resourceType: 'invoice',
    resourceId: invoiceId,
    tableName: 'invoices',
    newValue: `Reminder ${reminderNumber} → ${recipientEmail}`,
    newValues: {
      invoice_number: invoice.invoice_number ?? null,
      reminder_number: reminderNumber,
      sent_to: recipientEmail,
      amount: invoice.amount ?? null,
      remaining_amount: invoiceOutstandingAmount(invoice),
      whatsapp_delivered: whatsappDelivered,
    },
  });

  return NextResponse.json({
    success: true,
    message: `Reminder #${reminderNumber} sent to ${recipientEmail}`,
    reminder_number: reminderNumber,
    sent_to: recipientEmail,
    whatsappShareUrl,
    whatsappDelivered,
  });
}
