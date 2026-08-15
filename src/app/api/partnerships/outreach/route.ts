/**
 * POST /api/partnerships/outreach — send tailored cold / warm follow-up emails to schools.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { notificationsService } from '@/services/notifications.service';
import { buildPartnershipFollowUpEmail } from '@/lib/email/rillcod-transactional-email';
import { brandContact } from '@/config/brand';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const { data: profile } = await db
    .from('portal_users')
    .select('role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.is_deleted || profile.is_active === false || !['admin', 'teacher'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const schoolId = String(body.school_id ?? '').trim();
  const angle = (body.angle as 'cold_pitch' | 'check_in' | 'free_demo' | 'resumption_slot') || 'cold_pitch';
  const customTo = String(body.to ?? '').trim();

  if (!schoolId) {
    return NextResponse.json({ error: 'school_id is required.' }, { status: 400 });
  }

  const { data: school } = await db
    .from('schools')
    .select('id, name, email, contact_person, student_count')
    .eq('id', schoolId)
    .maybeSingle();

  if (!school) {
    return NextResponse.json({ error: 'School not found.' }, { status: 404 });
  }

  const to = customTo || String(school.email ?? '').trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json(
      { error: `No valid email address for ${school.name}. Please provide a recipient email.` },
      { status: 400 },
    );
  }

  // Find latest proposal or mou share link if one exists
  const { data: latestDoc } = await db
    .from('partnership_agreements')
    .select('id, reference, share_token')
    .eq('school_id', schoolId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || brandContact.siteUrl).replace(/\/$/, '');
  const shareUrl = latestDoc?.share_token ? `${appUrl}/p/${latestDoc.share_token}` : null;

  const { subject, html } = buildPartnershipFollowUpEmail({
    schoolName: school.name,
    contactName: school.contact_person || null,
    reference: latestDoc?.reference || null,
    angle,
    shareUrl,
    appUrl,
  });

  const sent = await notificationsService.sendEmail('system', {
    to,
    subject,
    html,
    templateKey: 'partnership_followup',
    referenceId: latestDoc?.reference || `OUTREACH-${school.id.slice(0, 8)}`,
  });

  if (!sent) {
    return NextResponse.json(
      { error: 'Email service could not dispatch message. Check email delivery status.' },
      { status: 502 },
    );
  }

  await logAudit(db as any, {
    action: 'send_partnership_outreach',
    actorId: user.id,
    resourceType: 'schools',
    resourceId: school.id,
    tableName: 'schools',
    newValue: `Sent ${angle} email outreach to ${to} (${school.name})`,
    newValues: {
      school_id: school.id,
      to,
      angle,
      subject,
      reference: latestDoc?.reference || null,
    },
  });

  return NextResponse.json({
    ok: true,
    sent: true,
    to,
    subject,
    angle,
  });
}
