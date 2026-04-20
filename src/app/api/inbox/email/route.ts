import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase.from('portal_users')
    .select('id, role, full_name, email, school_name')
    .eq('id', user.id).single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  return { ...user, ...profile };
}

/**
 * POST /api/inbox/email
 * Send a real email via SendPulse from the unified inbox.
 * Body: { to: string, to_name?: string, subject: string, body: string, cc?: string }
 */
export async function POST(req: NextRequest) {
  const sender = await requireStaff();
  if (!sender) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { to, to_name, subject, body, cc } = await req.json();

  if (!to?.trim()) return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 });
  if (!subject?.trim()) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  if (!body?.trim()) return NextResponse.json({ error: 'Message body is required' }, { status: 400 });

  const senderName  = (sender as any).full_name || 'Rillcod Academy';
  const senderOrg   = (sender as any).school_name || 'Rillcod Academy';

  // Build branded HTML email
  const html = buildRillcodTransactionalEmailHtml({
    title:    subject,
    eyebrow:  senderOrg,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#e4e4e7;">
        <strong style="color:#fff;">From:</strong> ${escapeHtml(senderName)} via Rillcod Academy
      </p>
      <div style="background:#1a1a2e;border-left:3px solid #c0392b;padding:16px 20px;border-radius:0 8px 8px 0;margin:0 0 20px;">
        ${body.split('\n').map((line: string) =>
          `<p style="margin:0 0 8px;color:#d4d4d8;font-size:15px;line-height:1.6;">${escapeHtml(line) || '&nbsp;'}</p>`
        ).join('')}
      </div>
    `,
    footerNote: `<span style="color:#71717a;">Sent via Rillcod Academy Unified Inbox · Reply to this email to respond directly.</span>`,
  });

  try {
    await notificationsService.sendExternalEmail({
      to:        to.trim(),
      subject:   subject.trim(),
      html,
      fromName:  `${senderName} (Rillcod Academy)`,
      fromEmail: 'support@rillcod.com',
    });

    // Log to DB for history
    const supabase = await createClient();
    await supabase.from('notifications').insert({
      user_id:    sender.id,
      title:      `Email sent: ${subject}`,
      message:    `To: ${to_name ? `${to_name} <${to}>` : to} — ${body.slice(0, 120)}`,
      type:       'info',
      is_read:    true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).throwOnError();

    return NextResponse.json({ success: true, to, subject });
  } catch (err: any) {
    console.error('[inbox/email] SendPulse error:', err);
    return NextResponse.json({ error: err.message || 'Email delivery failed' }, { status: 500 });
  }
}
