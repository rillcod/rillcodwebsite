import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';
import { sendWhatsApp } from '@/lib/whatsapp/send';

export const dynamic = 'force-dynamic';

// POST /api/students/send-credentials
// Sends the student's (and parent's) EXISTING login to the parent by WhatsApp + email.
// It deliberately does NOT reset any password — the previously generated password still
// stands. Use the "Resend" action instead when you actually want to reset it.
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('portal_users').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { studentEmail, studentPassword, parentEmail, parentPassword, fullName, schoolName } = await req.json();
    if (!studentPassword && !parentPassword) {
      return NextResponse.json(
        { error: 'No stored password to send. Use "Resend" to set a fresh one first.' },
        { status: 400 },
      );
    }

    // Resolve the parent phone from the student record — never resets anything.
    let phone: string | null = null;
    let parentName: string = fullName ? `${fullName}'s parent/guardian` : 'Parent/Guardian';
    let row: { parent_phone?: string | null; parent_name?: string | null } | null = null;
    if (studentEmail) {
      const { data } = await admin.from('students')
        .select('parent_phone, parent_name').eq('student_email', studentEmail).limit(1).maybeSingle();
      row = data as any;
    }
    if (!row && parentEmail) {
      const { data } = await admin.from('students')
        .select('parent_phone, parent_name').eq('parent_email', parentEmail).limit(1).maybeSingle();
      row = data as any;
    }
    if (row) {
      phone = row.parent_phone ?? null;
      if (row.parent_name) parentName = row.parent_name;
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://academy.rillcod.com').replace(/\/$/, '');

    const lines: string[] = [
      `Hello ${parentName}, here are the Rillcod login details${schoolName ? ` for ${schoolName}` : ''}:`,
      '',
    ];
    if (studentEmail && studentPassword) {
      lines.push('STUDENT LOGIN', `Email: ${studentEmail}`, `Password: ${studentPassword}`, '');
    }
    if (parentEmail && parentPassword) {
      lines.push('PARENT LOGIN', `Email: ${parentEmail}`, `Password: ${parentPassword}`, '');
    }
    lines.push(`Sign in here: ${appUrl}/login`, '', 'Please keep these safe. You can change the password after signing in.');
    const message = lines.join('\n');

    // WhatsApp (the requested channel) — best-effort; no-ops if unconfigured/no phone.
    let whatsappSent = false;
    if (phone) whatsappSent = await sendWhatsApp(phone, message);

    // Email the parent's real inbox as a second channel.
    let emailSent = false;
    if (parentEmail) {
      try {
        await notificationsService.sendExternalEmail({
          to: parentEmail,
          subject: `Your Rillcod Login Details${schoolName ? ` — ${schoolName}` : ''}`,
          html: `<pre style="font-family:Arial,Helvetica,sans-serif;font-size:14px;white-space:pre-wrap;line-height:1.6;">${message.replace(/</g, '&lt;')}</pre>`,
          fromName: schoolName ? `${schoolName} via Rillcod Technologies` : 'Rillcod Technologies',
          fromEmail: 'support@rillcod.com',
        });
        emailSent = true;
      } catch (e) {
        console.error('[students/send-credentials] email failed:', e);
      }
    }

    if (!whatsappSent && !emailSent) {
      return NextResponse.json(
        { error: 'Could not send by WhatsApp or email — check the parent phone/email on the student record.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, whatsapp: whatsappSent, email: emailSent, hadPhone: !!phone });
  } catch (err: any) {
    console.error('[students/send-credentials] error:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to send credentials' }, { status: 500 });
  }
}
