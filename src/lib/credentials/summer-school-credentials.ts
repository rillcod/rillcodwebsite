import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';
import { buildReceiptEmailExtras, buildSummerWhatsAppBlock } from '@/lib/credentials/receipt-email-blocks';
import { portalAppUrl } from '@/lib/credentials/app-url';
import type { SummerOnboardResult } from '@/lib/summer-school/onboard';
import { registeredProgrammeName } from '@/lib/registration/programme-label';

type AnySupabase = SupabaseClient<any>;

type ProspectLike = {
  parent_email?: string | null;
  email?: string | null;
  parent_name?: string | null;
  full_name?: string | null;
  /** Carries the [Programme: <title>] tag, so the email can name what they bought. */
  notes?: string | null;
  course_interest?: string | null;
};

function buildSummerNextStepsHtml(firstName: string, appUrl: string, whatsappStep: string): string {
  return `
<div style="margin:22px 0 6px;">
  <p style="margin:0 0 12px;font-size:13px;color:#10b981;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Your Next Steps</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
    <tr>
      <td valign="top" style="width:34px;font-size:20px;">1️⃣</td>
      <td style="font-size:14px;color:#d4d4d8;line-height:1.6;">
        <strong style="color:#fff;">Join the class WhatsApp group</strong> — daily class link, schedule, and announcements.<br/>${whatsappStep}
      </td>
    </tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
    <tr>
      <td valign="top" style="width:34px;font-size:20px;">2️⃣</td>
      <td style="font-size:14px;color:#d4d4d8;line-height:1.6;">
        <strong style="color:#fff;">Log ${firstName} in to the Student Portal</strong> at
        <a href="${appUrl}/login" style="color:#7c3aed;font-weight:700;">${appUrl}/login</a>.
      </td>
    </tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
    <tr>
      <td valign="top" style="width:34px;font-size:20px;">3️⃣</td>
      <td style="font-size:14px;color:#d4d4d8;line-height:1.6;">
        <strong style="color:#fff;">Attend classes</strong> — cohort starts <strong>28 June 2026</strong>.
      </td>
    </tr>
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td valign="top" style="width:34px;font-size:20px;">4️⃣</td>
      <td style="font-size:14px;color:#d4d4d8;line-height:1.6;">
        <strong style="color:#fff;">Track progress as a parent</strong> using your Parent Portal login.
      </td>
    </tr>
  </table>
</div>`;
}

/** Summer school onboarding credentials — unified delivery with cohort next-steps. */
export async function deliverSummerSchoolCredentials(
  admin: AnySupabase,
  result: SummerOnboardResult,
  prospect: ProspectLike,
  opts: { activation?: boolean; force?: boolean; prospectId?: string | null } = {},
): Promise<{ email: boolean; whatsapp: boolean; alreadySent?: boolean }> {
  const to = (prospect.parent_email || prospect.email || '').trim().toLowerCase();
  if (!to) return { email: false, whatsapp: false };

  // The programme the parent actually registered for — never a fixed cohort.
  const programmeLabel = registeredProgrammeName({
    notes: prospect.notes,
    courseInterest: prospect.course_interest,
    fallback: 'Rillcod Technologies',
  });

  const prospectId = opts.prospectId?.trim() || null;
  const externalId = prospectId ? `special_activation:${prospectId}` : null;
  if (externalId && !opts.force) {
    const { data: previousDelivery } = await admin
      .from('notifications')
      .select('id')
      .eq('external_id', externalId)
      .eq('delivery_status', 'sent')
      .limit(1)
      .maybeSingle();
    if (previousDelivery) {
      return { email: true, whatsapp: false, alreadySent: true };
    }
  }

  const activation = opts.activation === true;
  const appUrl = portalAppUrl();
  const parentName = prospect.parent_name || 'Parent/Guardian';
  const firstName = (prospect.full_name || 'your child').trim().split(/\s+/)[0];
  const hasParentAccount = !!(result.parent?.id);

  let waGroupLink = '';
  try {
    const { getSummerSchoolWhatsAppLink } = await import('@/lib/summer-school/whatsapp-group');
    waGroupLink = (await getSummerSchoolWhatsAppLink()) || '';
  } catch { /* non-fatal */ }

  const whatsappStep = waGroupLink
    ? `<a href="${waGroupLink}" style="display:inline-block;margin-top:6px;padding:10px 22px;background:#25D366;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">Join the Class WhatsApp Group →</a>`
    : `<span style="font-size:12px;color:#71717a;">We'll share the class WhatsApp group link with you shortly.</span>`;

  const receiptExtras = await buildReceiptEmailExtras(admin, result.student.id, prospect.full_name || 'Student');
  const summerWaBlock = await buildSummerWhatsAppBlock();
  const nextSteps = buildSummerNextStepsHtml(firstName, appUrl, whatsappStep);

  const parentUserId = hasParentAccount && result.parent?.id
    ? result.parent.id
    : result.student.id;

  const delivery = await deliverPortalCredentials(admin, {
    parent: {
      userId: parentUserId,
      email: to,
      displayName: parentName,
      role: 'parent',
      storedPassword: activation ? null : (result.parent?.created ? result.parent.password : null),
    },
    students: [{
      userId: result.student.id,
      email: result.student.email,
      displayName: prospect.full_name || 'Student',
      role: 'student',
      storedPassword: activation ? null : result.student.password,
    }],
    parentPhone: result.parentPhone ?? null,
    parentName,
    schoolName: result.schoolName,
    schoolId: result.schoolId,
    resetPolicy: activation ? 'if-never-signed-in' : 'never',
    showParentCredentials: activation ? hasParentAccount : !!(result.parent?.created && result.parent.password && result.parent.id),
    showParentEmailAlways: activation && hasParentAccount,
    emailChannel: 'external',
    emailSubject: activation
      ? `You're activated — ${programmeLabel} (${prospect.full_name || 'Your Child'})`
      : `Welcome to ${programmeLabel} — ${prospect.full_name || 'Your Child'}'s Login Details`,
    title: activation
      ? `Your ${programmeLabel} account is active! 🚀`
      : `Welcome to ${programmeLabel}! 🚀`,
    bodyIntro: activation
      ? `Dear ${parentName}, payment is confirmed and ${firstName}'s portal access is ready. Use the login details below — temporary passwords are included for accounts that have not signed in yet.`
      : `Dear ${parentName}, ${firstName} is enrolled! Below are the portal login details.`,
    appendBodyHtml: `${nextSteps}${receiptExtras.appendHtml}${summerWaBlock}`,
    emailAttachments: receiptExtras.attachments,
  });

  if (externalId && delivery.email) {
    try {
      await admin.from('notifications').insert({
        user_id: null,
        title: 'Special programme activation delivered',
        message: `${prospect.full_name || 'Student'} | ${to}`,
        type: 'success',
        notification_channel: 'email',
        delivery_status: 'sent',
        retry_count: 0,
        sent_at: new Date().toISOString(),
        external_id: externalId,
        action_url: '/dashboard/approvals',
      });
    } catch (trackErr) {
      console.error('[summer-credentials] activation delivery tracking failed:', trackErr);
    }
  } else if (externalId && !delivery.email) {
    try {
      await admin.from('notifications').insert({
        user_id: null,
        title: 'Special programme activation needs attention',
        message: `${prospect.full_name || 'Student'} | ${to}`,
        type: 'error',
        notification_channel: 'email',
        delivery_status: 'failed',
        retry_count: 1,
        external_id: externalId,
        action_url: '/dashboard/approvals',
      });
    } catch { /* non-fatal */ }
  }

  return { email: delivery.email, whatsapp: delivery.whatsapp };
}
