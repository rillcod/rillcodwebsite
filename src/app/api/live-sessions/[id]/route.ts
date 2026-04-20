import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotification, buildNotificationUrl } from '@/lib/push';
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
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, full_name')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role === 'student' || profile.role === 'school') return null;
  return profile;
}

// Notify all relevant students when a session goes live
async function notifySessionLive(session: any) {
  try {
    const db = createAdminClient() as any;
    let recipientIds: string[] = [];

    if (session.program_id) {
      const { data: enrollments } = await db
        .from('enrollments')
        .select('user_id')
        .eq('program_id', session.program_id)
        .eq('status', 'active');
      recipientIds = (enrollments ?? []).map((e: any) => e.user_id).filter(Boolean);
    } else if (session.school_id) {
      const { data: users } = await db
        .from('portal_users')
        .select('id')
        .eq('school_id', session.school_id)
        .eq('role', 'student')
        .eq('is_active', true);
      recipientIds = (users ?? []).map((u: any) => u.id);
    }

    if (recipientIds.length === 0) return;

    const url = buildNotificationUrl('live_session', session.id);
    for (const userId of recipientIds) {
      // In-app notification
      await notificationsService.logNotification(
        userId,
        '🔴 Session is Live Now!',
        `"${session.title}" has started. Join now.`,
        'info',
      );
      // Push notification
      await sendPushNotification(userId, {
        title: '🔴 Session is Live Now!',
        body: `"${session.title}" has started. Tap to join.`,
        url,
      });
    }
  } catch (e) {
    console.error('[live-session] notifySessionLive error:', e);
  }
}

// Auto-log a completed session to CRM interactions for the school and attendees
async function autoLogCRM(session: any, staffName: string) {
  try {
    const db = createAdminClient() as any;
    const when = new Date(session.scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const content = `Live session "${session.title}" completed (${session.duration_minutes} min, ${when})${session.recording_url ? '. Recording available.' : ''}`;

    // Log for school if scoped to one
    if (session.school_id) {
      const { data: school } = await db.from('schools').select('id, name').eq('id', session.school_id).single();
      if (school) {
        await db.from('crm_interactions').insert({
          contact_id: school.id, contact_type: 'school', contact_name: school.name,
          type: 'meeting', direction: 'outbound', content,
          staff_name: staffName,
        });
      }
    }

    // Log for attendees (live_session_attendance)
    const { data: attendees } = await db
      .from('live_session_attendance')
      .select('portal_user_id, portal_users(full_name, role)')
      .eq('session_id', session.id);

    const seen = new Set<string>();
    for (const row of (attendees || [])) {
      const uid = row.portal_user_id;
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const name = row.portal_users?.full_name || 'Unknown';
      await db.from('crm_interactions').insert({
        contact_id: uid, contact_type: 'portal_user', contact_name: name,
        type: 'meeting', direction: 'outbound', content,
        staff_name: staffName,
      });
    }
  } catch (e) {
    console.error('[CRM auto-log]', e);
  }
}

// PATCH /api/live-sessions/[id] — update session
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json();

  const allowed: Record<string, any> = { updated_at: new Date().toISOString() };
  const fields = ['title', 'description', 'platform', 'session_url', 'scheduled_at',
    'duration_minutes', 'school_id', 'program_id', 'status', 'recording_url', 'notes'];
  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f];
  }

  const admin = adminClient();

  // Get current session to detect status change → completed
  const { data: before } = await admin.from('live_sessions').select('*').eq('id', id).single();

  const { data, error } = await admin
    .from('live_sessions')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-log to CRM when a session is marked completed
  if (before?.status !== 'completed' && data?.status === 'completed') {
    autoLogCRM(data, (caller as any).full_name || 'Staff').catch(() => {});
  }

  // Push + in-app notification when session goes live
  if (before?.status !== 'live' && data?.status === 'live') {
    notifySessionLive(data).catch(() => {});
  }

  return NextResponse.json({ data });
}

// DELETE /api/live-sessions/[id] — delete session
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();
  const { error } = await admin.from('live_sessions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
