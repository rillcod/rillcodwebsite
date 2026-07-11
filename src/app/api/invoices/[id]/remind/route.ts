import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';
import { buildInvoiceReminderEmail } from '@/lib/finance/invoice-email';

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
    .select('*, portal_users(id, full_name, email, school_id), schools(name)')
    .eq('id', invoiceId)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (caller.role !== 'admin') {
    const studentSchoolId = (invoice.portal_users as any)?.school_id ?? null;
    const inTenant = !!caller.school_id
      && (invoice.school_id === caller.school_id || studentSchoolId === caller.school_id);
    if (!inTenant) {
      return NextResponse.json({ error: 'Forbidden: invoice belongs to a different school' }, { status: 403 });
    }
  }

  const student = invoice.portal_users as any;
  if (!student?.email) {
    return NextResponse.json({ error: 'Recipient email not found' }, { status: 400 });
  }

  const { html, subject, fromName } = buildInvoiceReminderEmail(
    { ...invoice, id: invoiceId },
    reminderNumber,
  );

  try {
    const sent = await notificationsService.sendEmail(student.id, {
      to: student.email,
      subject,
      html,
      fromName,
      fromEmail: 'support@rillcod.com',
    });
    if (sent === false) {
      return NextResponse.json({ error: 'Recipient has email notifications disabled' }, { status: 422 });
    }
  } catch (e: any) {
    console.error('[remind] email failed', e?.message);
    return NextResponse.json({ error: 'Failed to send reminder email', detail: e?.message }, { status: 500 });
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

  return NextResponse.json({
    success: true,
    message: `Reminder ${reminderNumber} sent to ${student.email}`,
    reminder_number: reminderNumber,
    sent_to: student.email,
  });
}
