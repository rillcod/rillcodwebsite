import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { buildSupportTicketEmail } from '@/lib/email/rillcod-transactional-email';
import { recordCommunicationCaseEvent } from '@/lib/communication/cases';

const RESPONSE_STATUSES = ['reopened', 'in_progress', 'resolved', 'closed'] as const;
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

  const satisfactionScore = Number(body.satisfactionScore || 0);
  if (!responseText && !requestedStatus && !(satisfactionScore >= 1 && satisfactionScore <= 5)) {
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
  const isOwner = existing.user_id === actor.user.id;
  const isAssignedTeacher = actor.profile.role === 'teacher'
    && existing.assigned_to === actor.user.id
    && existing.type !== 'complaint';
  const ownerCanReopen = isOwner && requestedStatus === 'reopened' && ['resolved', 'closed'].includes(existing.status);
  const ownerCanRate = isOwner && satisfactionScore >= 1 && satisfactionScore <= 5 && ['resolved', 'closed'].includes(existing.status);
  if (!isAdmin && !isAssignedTeacher && !ownerCanReopen && !ownerCanRate) {
    return NextResponse.json({ error: 'Assigned staff access required' }, { status: 403 });
  }
  const status = requestedStatus
    ? requestedStatus as ResponseStatus
    : responseText ? 'resolved' : existing.status;
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { status, updated_at: now };
  if (responseText) {
    updates.admin_response = responseText;
    updates.responded_at = now;
    updates.responded_by = actor.user.id;
  }
  if (ownerCanReopen) {
    updates.reopened_count = Number(existing.reopened_count || 0) + 1;
    updates.reopened_at = now;
    updates.admin_response = existing.admin_response;
  }
  if (ownerCanRate) {
    updates.satisfaction_score = satisfactionScore;
    updates.outcome = typeof body.outcome === 'string' ? body.outcome.trim().slice(0, 1000) : null;
  }
  if ((status === 'resolved' || status === 'closed') && existing.created_at) {
    updates.resolution_minutes = Math.max(0, Math.round((Date.now() - new Date(existing.created_at).getTime()) / 60000));
  }

  const { data: updated, error: updateError } = await actor.admin
    .from('feedback')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (updateError) return NextResponse.json({ error: 'Unable to save the response.' }, { status: 500 });

  if (ownerCanReopen) {
    try {
      const caseId = await recordCommunicationCaseEvent(actor.admin, {
        requesterId: existing.user_id, requesterName: existing.user_name, requesterEmail: existing.user_email,
        subject: existing.subject, body: 'Customer reopened this request for further help.', category: existing.type,
        channel: 'feedback', direction: 'inbound', sourceType: 'feedback_reopened', sourceId: `${id}:${now}`,
        restrictedToAdmin: existing.type === 'complaint',
      });
      await actor.admin.from('communication_cases').update({
        status: 'reopened', reopened_count: Number(existing.reopened_count || 0) + 1,
        next_action: 'Review the customer reopening note and respond', next_action_due_at: new Date(Date.now() + 2 * 3600000).toISOString(),
        resolved_at: null, updated_at: now,
      }).eq('id', caseId);
    } catch (caseError) { console.error('[feedback] unable to reopen communication case:', caseError); }
  }
  if (ownerCanRate) {
    await actor.admin.from('customer_value_outcomes').insert({
      feedback_id: id, portal_user_id: existing.user_id,
      outcome_type: satisfactionScore >= 4 ? 'helpful' : 'not_helpful', score: satisfactionScore,
      comment: typeof body.outcome === 'string' ? body.outcome.trim().slice(0, 1000) : null,
    });
  }

  if (responseText) {
    try {
      const caseId = await recordCommunicationCaseEvent(actor.admin, {
        requesterId: existing.user_id,
        requesterName: existing.user_name,
        requesterEmail: existing.user_email,
        subject: existing.subject,
        body: responseText,
        category: existing.type,
        channel: 'feedback',
        direction: 'outbound',
        sourceType: 'feedback_response',
        sourceId: `${id}:${now}`,
        actorId: actor.user.id,
        assignedTo: existing.assigned_to ?? actor.user.id,
        restrictedToAdmin: existing.type === 'complaint',
      });

      if (status === 'resolved' || status === 'closed') {
        await actor.admin
          .from('communication_cases')
          .update({ status, resolved_at: now, updated_at: now })
          .eq('id', caseId);
      }
    } catch (caseError) {
      console.error('[feedback] unable to update communication case:', caseError);
    }
  }

  let inAppSent = false;
  let emailSent = false;
  if (responseText && existing.user_id) {
    const { error: notificationError } = await actor.admin.from('notifications').insert({
      user_id: existing.user_id,
      type: 'info',
      title: `Response to feedback FB-${id.slice(0, 8)}`,
      message: responseText.slice(0, 500),
      action_url: `/dashboard/feedback/${id}`,
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
        automated: false, eventType: 'staff_feedback_response', referenceId: id,
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
