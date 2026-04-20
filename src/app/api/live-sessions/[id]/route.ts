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
    let recipients: { id: string; email: string; full_name: string }[] = [];

    if (session.program_id) {
      const { data: enrollments } = await db
        .from('enrollments')
        .select('portal_users(id, email, full_name)')
        .eq('program_id', session.program_id)
        .eq('status', 'active');
      recipients = (enrollments ?? [])
        .map((e: any) => Array.isArray(e.portal_users) ? e.portal_users[0] : e.portal_users)
        .filter((u: any) => u?.id && u?.email);
    } else if (session.school_id) {
      const { data: users } = await db
        .from('portal_users')
        .select('id, email, full_name')
        .eq('school_id', session.school_id)
        .eq('role', 'student')
        .eq('is_active', true);
      recipients = (users ?? []).filter((u: any) => u?.email);
    }

    if (recipients.length === 0) return;

    const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/live-sessions`;
    const sessionUrl = session.session_url || joinUrl;

    for (const user of recipients) {
      // In-app notification
      await notificationsService.logNotification(
        user.id,
        '🔴 Session is Live Now!',
        `"${session.title}" has started. Join now.`,
        'info',
      );
      // Push notification
      await sendPushNotification(user.id, {
        title: '🔴 Session is Live Now!',
        body: `"${session.title}" has started. Tap to join.`,
        url: joinUrl,
      });
      // Email via SendPulse
      if (user.email) {
        notificationsService.sendEmail(user.id, {
          to: user.email,
          subject: `🔴 Live Now: ${session.title}`,
          html: buildLiveEmail({ name: user.full_name, title: session.title, joinUrl: sessionUrl }),
          fromName: 'Rillcod Academy',
          fromEmail: 'no-reply@rillcod.com',
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[live-session] notifySessionLive error:', e);
  }
}

// Notify students when a session is scheduled
async function notifySessionScheduled(session: any) {
  try {
    const db = createAdminClient() as any;
    let recipients: { id: string; email: string; full_name: string }[] = [];

    if (session.program_id) {
      const { data: enrollments } = await db
        .from('enrollments')
        .select('portal_users(id, email, full_name)')
        .eq('program_id', session.program_id)
        .eq('status', 'active');
      recipients = (enrollments ?? [])
        .map((e: any) => Array.isArray(e.portal_users) ? e.portal_users[0] : e.portal_users)
        .filter((u: any) => u?.id && u?.email);
    } else if (session.school_id) {
      const { data: users } = await db
        .from('portal_users')
        .select('id, email, full_name')
        .eq('school_id', session.school_id)
        .eq('role', 'student')
        .eq('is_active', true);
      recipients = (users ?? []).filter((u: any) => u?.email);
    }

    if (recipients.length === 0) return;

    const when = new Date(session.scheduled_at).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const dashUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/live-sessions`;

    for (const user of recipients) {
      if (user.email) {
        notificationsService.sendEmail(user.id, {
          to: user.email,
          subject: `📅 New Session Scheduled: ${session.title}`,
          html: buildScheduledEmail({ name: user.full_name, title: session.title, when, dashUrl }),
          fromName: 'Rillcod Academy',
          fromEmail: 'no-reply@rillcod.com',
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[live-session] notifySessionScheduled error:', e);
  }
}

// ── Email templates ───────────────────────────────────────────────────────────

function buildLiveEmail({ name, title, joinUrl }: { name: string; title: string; joinUrl: string }) {
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#111;border:1px solid #222;border-top:4px solid #10b981;">
  <div style="padding:32px;">
    <div style="display:inline-block;background:#10b98120;border:1px solid #10b98140;padding:6px 14px;border-radius:4px;margin-bottom:20px;">
      <span style="color:#10b981;font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">● Live Now</span>
    </div>
    <h1 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 8px;">${title}</h1>
    <p style="color:#888;font-size:14px;margin:0 0 28px;">Hi ${name}, your session is live right now. Join immediately.</p>
    <a href="${joinUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:14px 32px;font-size:12px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">
      Join Session Now →
    </a>
    <p style="color:#444;font-size:11px;margin:28px 0 0;">If the button doesn't work, copy this link: <a href="${joinUrl}" style="color:#10b981;">${joinUrl}</a></p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #222;">
    <p style="color:#333;font-size:11px;margin:0;">Rillcod Academy · <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color:#444;">Dashboard</a></p>
  </div>
</div>
</body></html>`;
}

function buildScheduledEmail({ name, title, when, dashUrl }: { name: string; title: string; when: string; dashUrl: string }) {
  return `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#111;border:1px solid #222;border-top:4px solid #ea580c;">
  <div style="padding:32px;">
    <div style="display:inline-block;background:#ea580c20;border:1px solid #ea580c40;padding:6px 14px;border-radius:4px;margin-bottom:20px;">
      <span style="color:#ea580c;font-size:11px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">📅 Session Scheduled</span>
    </div>
    <h1 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 8px;">${title}</h1>
    <p style="color:#888;font-size:14px;margin:0 0 8px;">Hi ${name}, a new live session has been scheduled for you.</p>
    <p style="color:#ea580c;font-size:16px;font-weight:700;margin:0 0 28px;">${when}</p>
    <a href="${dashUrl}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;padding:14px 32px;font-size:12px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">
      View Session →
    </a>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #222;">
    <p style="color:#333;font-size:11px;margin:0;">Rillcod Academy · <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color:#444;">Dashboard</a></p>
  </div>
</div>
</body></html>`;
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
