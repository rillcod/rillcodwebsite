import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { buildWelcomeEmail } from '@/lib/email/rillcod-transactional-email';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email, full_name, password, school_name, phone } = await req.json();
    if (!email || !full_name || !password) {
      return NextResponse.json({ error: 'email, full_name and password are required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://academy.rillcod.com').replace(/\/$/, '');
    const loginUrl = `${appUrl}/login?type=parent&email=${encodeURIComponent(cleanEmail)}`;

    const html = buildWelcomeEmail({
      recipientName: full_name,
      role: 'parent',
      schoolName: school_name ?? undefined,
      loginUrl,
      appUrl,
    });

    // Append credentials block after the welcome email body by injecting before </body>
    const credentialsBlock = `
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#141618;border:1px solid #2a2d33;border-radius:8px;overflow:hidden;margin:0 0 20px;">
  <tr><td style="background:#1c1e22;border-bottom:1px solid #2a2d33;padding:10px 16px;">
    <p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Your Login Credentials</p>
  </td></tr>
  <tr><td style="padding:14px 16px;border-bottom:1px solid #2a2d33;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-size:12px;color:#71717a;font-weight:700;width:35%;">Email / Username</td>
        <td style="font-size:13px;color:#ffffff;font-weight:800;text-align:right;font-family:monospace,Arial;">${email.trim().toLowerCase()}</td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:14px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-size:12px;color:#71717a;font-weight:700;width:35%;">Password</td>
        <td style="font-size:13px;color:#f59e0b;font-weight:800;text-align:right;font-family:monospace,Arial;">${password}</td>
      </tr>
    </table>
  </td></tr>
</table>
<p style="font-size:12px;color:#71717a;margin:0 0 20px;">
  After signing in, you can change your password from your account settings. Keep these credentials safe and do not share them.
</p>`;

    const finalHtml = html.replace('</body>', `${credentialsBlock}</body>`);

    // Attempt both channels independently so one failing never blocks the other —
    // the whole point is that the parent (our target) actually receives their login.
    let emailSent = false;
    try {
      await notificationsService.sendExternalEmail({
        to: cleanEmail,
        subject: `Your Rillcod Parent Portal Access${school_name ? ` — ${school_name}` : ''}`,
        html: finalHtml,
        fromName: school_name ? `${school_name} via Rillcod Technologies` : 'Rillcod Technologies',
        fromEmail: SMTP_FROM_EMAIL,
      });
      emailSent = true;
    } catch (e) {
      console.error('[parents/send-credentials] email failed:', e);
    }

    // WhatsApp fallback — best-effort; sendWhatsApp() no-ops safely if unconfigured.
    let whatsappSent = false;
    if (phone) {
      const waMessage =
        `Hello ${full_name}, here is your Rillcod parent portal login` +
        `${school_name ? ` for ${school_name}` : ''}:\n\n` +
        `Username (email): ${cleanEmail}\n` +
        `Password: ${password}\n\n` +
        `Sign in here: ${loginUrl}\n\n` +
        `Please keep this safe. You can change your password after signing in.`;
      whatsappSent = await sendWhatsApp(phone, waMessage);
    }

    if (!emailSent && !whatsappSent) {
      return NextResponse.json(
        { error: 'Could not deliver the login by email or WhatsApp. Check the address/phone and try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, email: emailSent, whatsapp: whatsappSent });
  } catch (err: any) {
    console.error('[parents/send-credentials] error:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to send credentials' }, { status: 500 });
  }
}
