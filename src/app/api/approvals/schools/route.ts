import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { sendSchoolPartnershipActivation } from '@/lib/registration/school-activation';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

// POST /api/approvals/schools
// Body: { id: string; action: 'approved' | 'rejected'; password?: string }
export async function POST(request: Request) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id, action, password: suppliedPassword } = await request.json();
  if (!id || !['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const admin = adminClient();

  const { data: school, error: fetchErr } = await admin
    .from('schools')
    .select('id, name, email, contact_person, status')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  await admin.from('schools').update({
    status: action,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  if (action === 'rejected') {
    if (school.email) {
      try {
        const { notificationsService } = await import('@/services/notifications.service');
        const { buildAnnouncementEmail } = await import('@/lib/email/rillcod-transactional-email');
        const { SMTP_FROM_EMAIL, brandContact } = await import('@/config/brand');
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
        await notificationsService.sendExternalEmail({
          to: school.email.trim().toLowerCase(),
          subject: 'School Registration Update — Rillcod Technologies',
          fromName: 'Rillcod Technologies',
          fromEmail: SMTP_FROM_EMAIL,
          html: buildAnnouncementEmail({
            recipientName: school.contact_person || school.name,
            schoolName: school.name,
            announcementTitle: 'School Registration Update',
            body: `Thank you for registering with Rillcod Technologies.\n\nAfter reviewing your application, we are unable to approve it at this time.\n\nContact us at ${brandContact.email} if you have questions.`,
            urgency: 'normal',
            portalUrl: `${appUrl}/contact`,
            appUrl,
          }),
        });
      } catch (mailErr) {
        console.error('[approvals/schools] rejection email failed:', mailErr);
      }
    }
    return NextResponse.json({ success: true });
  }

  if (!school.email) {
    return NextResponse.json({
      success: true,
      warning: 'School approved but no email on record — portal account not created',
    });
  }

  const password = (suppliedPassword && suppliedPassword.length >= 8)
    ? suppliedPassword
    : crypto.randomBytes(8).toString('base64url').slice(0, 10);

  const normalizedEmail = school.email.trim().toLowerCase();
  let portalUserId: string | null = null;
  let credentialsPassword: string | null = password;

  const { data: existingPortal } = await admin
    .from('portal_users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingPortal) {
    portalUserId = existingPortal.id;
    const { error: updateErr } = await admin.from('portal_users').update({
      role: 'school',
      school_id: school.id,
      school_name: school.name,
      full_name: school.contact_person || school.name,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('id', existingPortal.id);

    if (updateErr) {
      return NextResponse.json({ error: `Failed to link portal account: ${updateErr.message}` }, { status: 500 });
    }

    if (suppliedPassword && suppliedPassword.length >= 8) {
      await admin.auth.admin.updateUserById(existingPortal.id, {
        password: suppliedPassword,
        user_metadata: { full_name: school.contact_person || school.name, role: 'school' },
      });
      credentialsPassword = suppliedPassword;
    } else {
      credentialsPassword = null;
    }
  } else {
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: school.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: school.contact_person || school.name,
        role: 'school',
      },
    });

    if (authErr) {
      if (!authErr.message.includes('already been registered') && !authErr.message.includes('already exists')) {
        return NextResponse.json({ error: `Auth creation failed: ${authErr.message}` }, { status: 500 });
      }
      const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = listData?.users?.find(
        (u) => u.email?.trim().toLowerCase() === normalizedEmail,
      );
      if (existing) {
        portalUserId = existing.id;
        await admin.auth.admin.updateUserById(portalUserId, {
          password,
          user_metadata: { full_name: school.contact_person || school.name, role: 'school' },
        });
        credentialsPassword = password;
      }
    } else {
      portalUserId = authData?.user?.id ?? null;
    }

    if (!portalUserId) {
      return NextResponse.json({ error: 'Could not resolve auth user ID' }, { status: 500 });
    }

    const { error: portalErr } = await admin.from('portal_users').upsert({
      id: portalUserId,
      email: normalizedEmail,
      full_name: school.contact_person || school.name,
      role: 'school',
      school_name: school.name,
      school_id: school.id,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (portalErr) {
      return NextResponse.json({ error: `Portal account synchronization failed: ${portalErr.message}` }, { status: 500 });
    }
  }

  let activation = { email: false };
  if (portalUserId) {
    try {
      activation = await sendSchoolPartnershipActivation(admin, {
        schoolId: school.id,
        schoolName: school.name,
        contactName: school.contact_person || school.name,
        email: school.email,
        portalUserId,
        tempPassword: credentialsPassword || password,
        force: true,
      });
    } catch (mailErr) {
      console.error('[approvals/schools] activation email failed:', mailErr);
    }
  }

  return NextResponse.json({
    success: true,
    message: activation.email
      ? 'School approved and portal login emailed to the administrator.'
      : 'School approved. Portal account is ready — resend login details if email delivery failed.',
    activation,
    credentials: credentialsPassword
      ? { email: school.email, password: credentialsPassword }
      : { email: school.email },
  });
}
