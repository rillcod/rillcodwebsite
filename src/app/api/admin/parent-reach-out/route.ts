import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PARENT_TEMPLATE_ARCHIVE } from '@/lib/communication/parent-template-archive';
import { renderCommunicationTemplate } from '@/lib/communication/template-registry';
import { notificationsService } from '@/services/notifications.service';
import {
  buildRillcodTransactionalEmailHtml,
  escapeHtml,
} from '@/lib/email/rillcod-transactional-email';
import { getParentsForStudentPortalId } from '@/lib/parents/links';
import { SMTP_FROM_EMAIL, SMTP_FROM_NAME } from '@/config/brand';
import { env } from '@/config/env';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

export type ReachOutRecipient = {
  studentPortalId?: string;
  parentEmail?: string;
  parentPhone?: string;
  parentName?: string;
  studentName?: string;
  className?: string;
};

type ResolvedParentTarget = {
  email: string;
  parentName: string;
  parentPhone: string;
  studentName: string;
  className: string;
  studentPortalId?: string;
};

function plainBodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) => {
      const lines = escapeHtml(para).replace(/\n/g, '<br/>');
      return `<p style="margin:0 0 12px;color:#d4d4d8;font-size:15px;line-height:1.65;white-space:pre-wrap;">${lines || '&nbsp;'}</p>`;
    })
    .join('');
}

async function requireStaff() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: caller } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (caller?.role !== 'admin' && caller?.role !== 'teacher') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, caller };
}

/**
 * Resolve parent contact for a student portal user id.
 * Prefer students.parent_* then linked portal parents.
 */
async function resolveParentsForStudent(
  db: ReturnType<typeof createAdminClient>,
  studentPortalId: string,
): Promise<Array<{ email: string; name: string; phone: string }>> {
  const byEmail = new Map<string, { email: string; name: string; phone: string }>();

  const { data: studentRow } = await db
    .from('students')
    .select('parent_email, parent_name, parent_phone')
    .eq('user_id', studentPortalId)
    .maybeSingle();

  const denormEmail = studentRow?.parent_email?.trim().toLowerCase();
  if (denormEmail) {
    byEmail.set(denormEmail, {
      email: denormEmail,
      name: studentRow?.parent_name?.trim() || 'Parent / Guardian',
      phone: studentRow?.parent_phone?.trim() || '',
    });
  }

  const portalParents = await getParentsForStudentPortalId(db as any, studentPortalId);
  for (const p of portalParents) {
    const email = p.email?.trim().toLowerCase();
    if (!email) continue;
    const existing = byEmail.get(email);
    byEmail.set(email, {
      email,
      name: p.full_name?.trim() || existing?.name || 'Parent / Guardian',
      phone: p.phone?.trim() || existing?.phone || '',
    });
  }

  return [...byEmail.values()];
}

async function expandRecipient(
  db: ReturnType<typeof createAdminClient>,
  target: ReachOutRecipient,
): Promise<{ targets: ResolvedParentTarget[]; skipReason?: string }> {
  const studentName = target.studentName || 'Student';
  const className = target.className || 'Class';
  const explicitEmail = target.parentEmail?.trim().toLowerCase() || '';

  if (explicitEmail) {
    return {
      targets: [
        {
          email: explicitEmail,
          parentName: target.parentName?.trim() || 'Parent / Guardian',
          parentPhone: target.parentPhone?.trim() || '',
          studentName,
          className,
          studentPortalId: target.studentPortalId,
        },
      ],
    };
  }

  if (!target.studentPortalId) {
    return { targets: [], skipReason: 'No parent email and no student to resolve' };
  }

  const parents = await resolveParentsForStudent(db, target.studentPortalId);
  if (parents.length === 0) {
    return { targets: [], skipReason: `No parent email on file for ${studentName}` };
  }

  return {
    targets: parents.map((p) => ({
      email: p.email,
      parentName: target.parentName?.trim() || p.name,
      parentPhone: target.parentPhone?.trim() || p.phone,
      studentName,
      className,
      studentPortalId: target.studentPortalId,
    })),
  };
}

/**
 * GET /api/admin/parent-reach-out?studentPortalId=...
 * Prefill parent contact for the Template Machine modal.
 */
export async function GET(req: Request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  const studentPortalId = new URL(req.url).searchParams.get('studentPortalId')?.trim();
  if (!studentPortalId) {
    return NextResponse.json({ error: 'studentPortalId is required' }, { status: 400 });
  }

  const db = createAdminClient();
  const parents = await resolveParentsForStudent(db, studentPortalId);
  const primary = parents[0] || null;

  return NextResponse.json({
    ok: true,
    parents,
    parentEmail: primary?.email || '',
    parentName: primary?.name || 'Parent / Guardian',
    parentPhone: primary?.phone || '',
  });
}

/**
 * POST /api/admin/parent-reach-out
 * Single & batch parent Template Machine dispatch via real Resend/SendPulse SMTP.
 */
export async function POST(req: Request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const { user } = auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    templateKey,
    recipients,
    parentEmail,
    parentPhone,
    parentName,
    studentName,
    className,
    studentPortalId,
    schoolName,
    customVariables = {},
    channel = 'email',
  } = body;

  if (channel && channel !== 'email') {
    return NextResponse.json(
      { error: 'Only email channel is supported right now. SMS/WhatsApp dispatch is not wired yet.' },
      { status: 400 },
    );
  }

  const template = PARENT_TEMPLATE_ARCHIVE.find((t) => t.key === templateKey);
  if (!template) {
    return NextResponse.json({ error: `Template '${templateKey}' not found` }, { status: 404 });
  }

  if (
    template.key === 'credentials_resend_reassurance' &&
    !String(customVariables?.temporary_password || '').trim()
  ) {
    return NextResponse.json(
      {
        error:
          'Credentials templates require a real temporary_password in customVariables. Refusing to send a placeholder password.',
      },
      { status: 400 },
    );
  }

  if (!env.RESEND_API_KEY && !(env.SENDPULSE_API_ID && env.SENDPULSE_API_SECRET)) {
    return NextResponse.json(
      { error: 'No email provider configured. Set RESEND_API_KEY or SENDPULSE_API_ID/SECRET.' },
      { status: 503 },
    );
  }

  const targetList: ReachOutRecipient[] =
    Array.isArray(recipients) && recipients.length > 0
      ? recipients
      : [{ parentEmail, parentPhone, parentName, studentName, className, studentPortalId }];

  if (targetList.every((t) => !t.parentEmail && !t.studentPortalId && !t.parentPhone)) {
    return NextResponse.json(
      { error: 'At least one recipient email or studentPortalId is required' },
      { status: 400 },
    );
  }

  const db = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://rillcodacademy.org';

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const providersUsed = new Set<string>();

  for (const raw of targetList) {
    let expanded: { targets: ResolvedParentTarget[]; skipReason?: string };
    try {
      expanded = await expandRecipient(db, raw);
    } catch (e) {
      skippedCount += 1;
      errors.push(e instanceof Error ? e.message : 'Failed to resolve parent contact');
      continue;
    }

    if (expanded.targets.length === 0) {
      skippedCount += 1;
      if (expanded.skipReason) errors.push(expanded.skipReason);
      continue;
    }

    for (const target of expanded.targets) {
      const data: Record<string, string> = {
        parent_name: target.parentName || 'Parent / Guardian',
        student_name: target.studentName || 'Student',
        class_name: target.className || 'Class',
        school_name: schoolName || 'Rillcod Academy',
        access_link: `${siteUrl}/dashboard/results`,
        claim_link: `${siteUrl}/claim`,
        meeting_link: `${siteUrl}/dashboard/meetings`,
        payment_link: `${siteUrl}/dashboard/billing`,
        receipt_link: `${siteUrl}/dashboard/receipts`,
        absence_link: `${siteUrl}/dashboard/attendance`,
        rsvp_link: `${siteUrl}/events`,
        portal_url: `${siteUrl}/login`,
        parent_email: target.email,
        // Never invent a real password — credentials template is blocked unless provided.
        temporary_password: String(customVariables?.temporary_password || ''),
        direct_login_link: `${siteUrl}/login`,
        // Demo placeholders for Template Machine billing/event copy (overridable).
        amount_due: String(customVariables?.amount_due || '₦45,000.00'),
        amount_paid: String(customVariables?.amount_paid || '₦45,000.00'),
        receipt_ref: String(customVariables?.receipt_ref || `REC-${Date.now().toString().slice(-6)}`),
        payment_date: String(customVariables?.payment_date || new Date().toLocaleDateString('en-GB')),
        remaining_balance: String(customVariables?.remaining_balance || '₦0.00'),
        due_date: String(
          customVariables?.due_date || new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-GB'),
        ),
        event_date: String(
          customVariables?.event_date || new Date(Date.now() + 3 * 86400000).toLocaleDateString('en-GB'),
        ),
        event_time: String(customVariables?.event_time || '10:00 AM'),
        event_location: String(customVariables?.event_location || 'Main School Auditorium / Online Stream'),
        ...Object.fromEntries(
          Object.entries(customVariables || {}).map(([k, v]) => [k, v == null ? '' : String(v)]),
        ),
      };

      let rendered: { subject: string; body: string };
      try {
        rendered = renderCommunicationTemplate({
          subject: template.subject,
          body: template.body,
          requiredVariables: template.requiredVariables,
          data,
        });
      } catch (e) {
        failedCount += 1;
        errors.push(
          `${target.email}: ${e instanceof Error ? e.message : 'Template render failed'}`,
        );
        continue;
      }

      const html = buildRillcodTransactionalEmailHtml({
        title: rendered.subject,
        eyebrow: schoolName || 'Rillcod Academy',
        bodyHtml: plainBodyToHtml(rendered.body),
        summaryRows: [
          { label: 'Student', value: target.studentName },
          { label: 'Class', value: target.className },
          { label: 'Template', value: template.title },
        ],
        footerNote: 'Sent manually from Accountability → Parent Template Machine.',
      });

      try {
        const result = await notificationsService.sendExternalEmail({
          to: target.email,
          subject: rendered.subject,
          html,
          fromName: SMTP_FROM_NAME,
          fromEmail: SMTP_FROM_EMAIL,
          automated: false,
          templateKey: template.key,
          eventType: 'parent_reach_out',
          referenceId: `reach-out:${user!.id}:${target.studentPortalId || target.email}:${Date.now()}`,
        });
        providersUsed.add(result.provider);
        sentCount += 1;
      } catch (e) {
        failedCount += 1;
        errors.push(`${target.email}: ${e instanceof Error ? e.message : 'Send failed'}`);
      }
    }
  }

  try {
    await db.rpc('refresh_accountability_cache' as never);
  } catch (e) {
    console.warn('[parent-reach-out] cache refresh failed:', e);
  }

  const providerLabel = [...providersUsed].join('+').toUpperCase() || 'NONE';
  const ok = sentCount > 0;
  const message = ok
    ? `Sent ${sentCount} email(s) via ${providerLabel}` +
      (failedCount || skippedCount
        ? ` (${failedCount} failed, ${skippedCount} skipped)`
        : '')
    : failedCount > 0
      ? `All sends failed (${failedCount}). ${errors[0] || ''}`.trim()
      : `Nothing sent. ${errors[0] || 'No resolvable parent emails.'}`;

  await logAudit(db as any, {
    action: ok ? (failedCount || skippedCount ? 'send_parent_reach_out_partial' : 'send_parent_reach_out') : 'send_parent_reach_out_failed',
    actorId: user!.id,
    resourceType: 'parent_communication_batch',
    newValue: message,
    newValues: {
      template_key: template.key,
      channel: 'email',
      requested_count: targetList.length,
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      providers: [...providersUsed],
    },
  });

  return NextResponse.json(
    {
      ok,
      message,
      dispatched_count: sentCount,
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      provider: [...providersUsed][0] || null,
      providers: [...providersUsed],
      errors: errors.slice(0, 20),
    },
    { status: ok ? 200 : 502 },
  );
}
