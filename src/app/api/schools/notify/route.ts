import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { notificationsService } from '@/services/notifications.service';
import { buildAnnouncementEmail, buildWelcomeEmail } from '@/lib/email/rillcod-transactional-email';
import { SMTP_FROM_EMAIL, brandContact } from '@/config/brand';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role').eq('id', user.id).single();
    if (!caller || caller.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const email     = body?.email     as string | undefined;
    const status    = body?.status    as 'approved' | 'rejected' | undefined;
    const schoolName = body?.schoolName as string | undefined;

    if (!email || !status) {
      return NextResponse.json({ error: 'Email and status are required' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';

    let subject: string;
    let html: string;

    if (status === 'approved') {
      subject = `School Registration Approved — Rillcod Technologies`;
      html = buildWelcomeEmail({
        recipientName: schoolName || 'School Administrator',
        role:          'school',
        schoolName,
        loginUrl:      `${appUrl}/login`,
        appUrl,
      });
    } else {
      subject = `School Registration Update — Rillcod Technologies`;
      html = buildAnnouncementEmail({
        recipientName:     schoolName || 'School Administrator',
        schoolName:        schoolName || 'Your School',
        announcementTitle: 'School Registration Update',
        body:              `Thank you for registering with Rillcod Technologies.\n\nAfter reviewing your application, we are unable to approve it at this time.\n\nIf you believe this is a mistake or would like to provide additional information, please reply to this email or contact us at ${brandContact.email}.\n\nWe appreciate your interest in the Rillcod platform.`,
        urgency:           'normal',
        portalUrl:         `${appUrl}/contact`,
        appUrl,
      });
    }

    await notificationsService.sendExternalEmail({
      to:        email,
      subject,
      html,
      fromName:  'Rillcod Technologies',
      fromEmail: SMTP_FROM_EMAIL,
    });

    return NextResponse.json({ message: 'Notification sent' });
  } catch (error) {
    console.error('Failed to send school approval notification:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
