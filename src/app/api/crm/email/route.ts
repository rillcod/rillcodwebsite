import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/crm/email
 * Sends a branded Rillcod Technologies email to a CRM contact via the canonical
 * notificationsService, logs the outbound email in crm_interactions, and optionally
 * schedules a follow-up task in crm_tasks so no lead or school falls through the cracks.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('id, role, full_name')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const to = String(body?.to || '').trim();
    const subject = String(body?.subject || '').trim();
    const message = String(body?.message || '').trim();
    const contactId = String(body?.contact_id || '').trim();
    const contactName = String(body?.contact_name || 'Partner').trim();
    const contactType = String(body?.contact_type || 'contact').trim();
    const followUpDays = Number(body?.follow_up_days ?? 0);

    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'A valid recipient email address is required.' }, { status: 400 });
    }
    if (subject.length < 2) {
      return NextResponse.json({ error: 'Please enter an email subject.' }, { status: 400 });
    }
    if (message.length < 5) {
      return NextResponse.json({ error: 'Please enter the email message.' }, { status: 400 });
    }

    const paragraphs = message
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#1f2937;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
      .join('');

    const html = buildRillcodTransactionalEmailHtml({
      eyebrow: 'Rillcod Technologies · Direct Outreach',
      title: subject,
      bodyHtml: paragraphs,
      footerNote: `Sent by ${caller.full_name || 'Rillcod Technologies Team'} · www.rillcod.com`,
    });

    const sent = await notificationsService.sendEmail(caller.id, {
      to,
      subject,
      html,
    });

    if (!sent) {
      return NextResponse.json(
        { error: 'Email could not be delivered (recipient address may be undeliverable or suppressed).' },
        { status: 422 },
      );
    }

    // Log outbound email into CRM interactions timeline
    if (contactId) {
      await (admin as any)
        .from('crm_interactions')
        .insert({
          contact_id: contactId,
          contact_type: contactType,
          type: 'email',
          direction: 'outbound',
          content: `Subject: ${subject}\n\n${message}`,
          staff_id: caller.id,
          staff_name: caller.full_name || 'Staff',
        })
        .catch(() => {});
    }

    // Optionally auto-schedule a follow-up task in CRM tasks
    let followUpCreated = false;
    if (contactId && Number.isFinite(followUpDays) && followUpDays > 0 && followUpDays <= 60) {
      const dueDate = new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000).toISOString();
      const { error: taskErr } = await (admin as any)
        .from('crm_tasks')
        .insert({
          contact_id: contactId,
          contact_type: contactType,
          contact_name: contactName,
          title: `Follow up on email: "${subject.slice(0, 80)}"`,
          due_at: dueDate,
          priority: 'normal',
          status: 'open',
          owner_id: caller.id,
          owner_name: caller.full_name || 'Staff',
        });
      followUpCreated = !taskErr;
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      follow_up_created: followUpCreated,
      message: followUpCreated
        ? `Email sent to ${to} & follow-up task scheduled in ${followUpDays} day${followUpDays === 1 ? '' : 's'}.`
        : `Email sent to ${to} and logged to CRM timeline.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Could not send email' }, { status: 500 });
  }
}
