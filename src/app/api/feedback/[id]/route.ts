import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { buildSupportTicketEmail } from '@/lib/email/rillcod-transactional-email';

const RESPONSE_STATUSES = ['in_progress', 'resolved', 'closed'] as const;
type ResponseStatus = typeof RESPONSE_STATUSES[number];

async function currentActor() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return null;
  return { user, profile, admin };
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const { data: feedback, error } = await actor.admin
    .from('feedback')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Unable to load feedback.' }, { status: 500 });
  if (!feedback) return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });

  const isAdmin = actor.profile.role === 'admin';
  const isOwner = feedback.user_id === actor.user.id;
  const isAssignedTeacher = actor.profile.role === 'teacher' && feedback.assigned_to === actor.user.id && feedback.type !== 'complaint';
  if (!isAdmin && !isOwner && !isAssignedTeacher) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ data: feedback, canRespond: isAdmin || isAssignedTeacher });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const responseText = typeof body.response === 'string' ? body.response.trim() : '';
  const requestedStatus = typeof body.status === 'string' ? body.status : '';

  if (!responseText && !requestedStatus) {
    return NextResponse.json({ error: 'A response or status update is required.' }, { status: 400 });
  }
  if (responseText.length > 5000) {
    return NextResponse.json({ error: 'Response must be 5,000 characters or fewer.' }, { status: 400 });
  }
  if (requestedStatus && !RESPONSE_STATUSES.includes(requestedStatus as ResponseStatus)) {
    return NextResponse.json({ error: 'Invalid feedback status.' }, { status: 400 });
  }

  const { id } = await context.params;
  const { data: existing, error: loadError } = await actor.admin
    .from('feedback')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: 'Unable to load feedback.' }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });


  const isAdmin = actor.profile.role === 'admin';
  const isAssignedTeacher = actor.profile.role === 'teacher'
    && existing.assigned_to === actor.user.id
    && existing.type !== 'complaint';
  if (!isAdmin && !isAssignedTeacher) {
    return NextResponse.json({ error: 'Assigned staff access required' }, { status: 403 });
  }
  const status: ResponseStatus = requestedStatus
    ? requestedStatus as ResponseStatus
    : responseText ? 'resolved' : 'in_progress';
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status, updated_at: now };
  if (responseText) {
    updates.admin_response = responseText;
    updates.responded_at = now;
    updates.responded_by = actor.user.id;
  }

  const { data: updated, error: updateError } = await actor.admin
    .from('feedback')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (updateError) return NextResponse.json({ error: 'Unable to save the response.' }, { status: 500 });

  let inAppSent = false;
  let emailSent = false;
  if (responseText && existing.user_id) {
    const { error: notificationError } = await actor.admin.from('notifications').insert({
      user_id: existing.user_id,
      type: 'info',
      title: `Response to feedback FB-${id.slice(0, 8)}`,
      message: responseText.slice(0, 500),
      link: `/dashboard/feedback/${id}`,
      is_read: false,
      created_at: now,
      updated_at: now,
    });
    inAppSent = !notificationError;
  }

  if (responseText && existing.user_email) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com';
      const html = buildSupportTicketEmail({
        recipientName: existing.user_name || 'there',
        ticketId: `FB-${id.slice(0, 8)}`,
        subject: existing.subject,
        category: existing.type,
        status,
        message: existing.message,
        staffNote: responseText,
        portalUrl: `${appUrl}/dashboard/feedback/${id}`,
        appUrl,
      });
      await notificationsService.sendExternalEmail({
        to: existing.user_email,
        subject: `Rillcod response - FB-${id.slice(0, 8)}`,
        html,
      });
      emailSent = true;
    } catch (error) {
      console.error('[feedback] response email failed:', error);
    }
  }

  return NextResponse.json({
    success: true,
    data: updated,
    delivery: { in_app: inAppSent, email: emailSent },
  });
}
