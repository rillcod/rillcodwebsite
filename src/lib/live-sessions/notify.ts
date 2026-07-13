import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { sendPushNotification } from '@/lib/push';

type Recipient = { id: string; email: string; full_name: string };

// Resolve the students a live session targets: by programme enrolment, else by school.
// Shared by both the "scheduled" and "live" notifications so the audience logic lives once.
export async function resolveSessionStudents(session: { program_id?: string | null; school_id?: string | null }): Promise<Recipient[]> {
  const db = createAdminClient() as any;
  if (session.program_id) {
    const { data: enrollments } = await db
      .from('enrollments')
      .select('portal_users(id, email, full_name)')
      .eq('program_id', session.program_id)
      .eq('status', 'active');
    return (enrollments ?? [])
      .map((e: any) => (Array.isArray(e.portal_users) ? e.portal_users[0] : e.portal_users))
      .filter((u: any) => u?.id && u?.email);
  }
  if (session.school_id) {
    const { data: users } = await db
      .from('portal_users')
      .select('id, email, full_name')
      .eq('school_id', session.school_id)
      .eq('role', 'student')
      .eq('is_active', true);
    return (users ?? []).filter((u: any) => u?.id && u?.email);
  }
  return [];
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
    <p style="color:#333;font-size:11px;margin:0;">Rillcod Technologies · <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color:#444;">Dashboard</a></p>
  </div>
</div>
</body></html>`;
}

/**
 * Notify the targeted students (programme or school) that a live session has been
 * scheduled. Fire-and-forget — failures are logged, never thrown to the caller.
 */
export async function notifySessionScheduled(session: {
  title: string;
  scheduled_at: string;
  program_id?: string | null;
  school_id?: string | null;
}): Promise<void> {
  try {
    if (!session?.scheduled_at) return;
    const recipients = await resolveSessionStudents(session);
    if (recipients.length === 0) return;

    const when = new Date(session.scheduled_at).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const dashUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/live-sessions`;

    for (const user of recipients) {
      notificationsService.sendEmail(user.id, {
        to: user.email,
        subject: `📅 New Session Scheduled: ${session.title}`,
        html: buildScheduledEmail({ name: user.full_name, title: session.title, when, dashUrl }),
        fromName: 'Rillcod Technologies',
        fromEmail: 'support@rillcod.com',
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[live-session] notifySessionScheduled error:', e);
  }
}

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
    <p style="color:#333;font-size:11px;margin:0;">Rillcod Technologies · <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color:#444;">Dashboard</a></p>
  </div>
</div>
</body></html>`;
}

/**
 * Notify targeted students that a session has gone LIVE — in-app + push + email.
 * Fire-and-forget; failures are logged, never thrown.
 */
export async function notifySessionLive(session: {
  title: string;
  session_url?: string | null;
  program_id?: string | null;
  school_id?: string | null;
}): Promise<void> {
  try {
    const recipients = await resolveSessionStudents(session);
    if (recipients.length === 0) return;

    const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/live-sessions`;
    const sessionUrl = session.session_url || joinUrl;

    for (const user of recipients) {
      await notificationsService.logNotification(
        user.id,
        '🔴 Session is Live Now!',
        `"${session.title}" has started. Join now.`,
        'info',
      );
      await sendPushNotification(user.id, {
        title: '🔴 Session is Live Now!',
        body: `"${session.title}" has started. Tap to join.`,
        url: joinUrl,
      });
      notificationsService.sendEmail(user.id, {
        to: user.email,
        subject: `🔴 Live Now: ${session.title}`,
        html: buildLiveEmail({ name: user.full_name, title: session.title, joinUrl: sessionUrl }),
        fromName: 'Rillcod Technologies',
        fromEmail: 'support@rillcod.com',
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[live-session] notifySessionLive error:', e);
  }
}
