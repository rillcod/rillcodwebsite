import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';
import { buildReceiptEmailExtras, buildSummerWhatsAppBlock } from '@/lib/credentials/receipt-email-blocks';
import { portalAppUrl } from '@/lib/credentials/app-url';
import type { SummerOnboardResult } from '@/lib/summer-school/onboard';

type AnySupabase = SupabaseClient<any>;

type ProspectLike = {
  parent_email?: string | null;
  email?: string | null;
  parent_name?: string | null;
  full_name?: string | null;
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
): Promise<{ email: boolean; whatsapp: boolean }> {
  const to = (prospect.parent_email || prospect.email || '').trim().toLowerCase();
  if (!to) return { email: false, whatsapp: false };

  const appUrl = portalAppUrl();
  const parentName = prospect.parent_name || 'Parent/Guardian';
  const firstName = (prospect.full_name || 'your child').trim().split(/\s+/)[0];
  const showParent = !!(result.parent?.created && result.parent.password && result.parent.id);

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

  const parentUserId = showParent && result.parent?.id
    ? result.parent.id
    : result.student.id;

  const delivery = await deliverPortalCredentials(admin, {
    parent: {
      userId: parentUserId,
      email: to,
      displayName: parentName,
      role: 'parent',
      storedPassword: showParent ? result.parent!.password : null,
    },
    students: [{
      userId: result.student.id,
      email: result.student.email,
      displayName: prospect.full_name || 'Student',
      role: 'student',
      storedPassword: result.student.password,
    }],
    parentPhone: result.parentPhone ?? null,
    parentName,
    schoolName: result.schoolName,
    schoolId: result.schoolId,
    resetPolicy: 'never',
    showParentCredentials: showParent,
    emailChannel: 'external',
    emailSubject: `Welcome to Rillcod Summer School 2026 — ${prospect.full_name || 'Your Child'}'s Login Details`,
    title: 'Welcome to Rillcod Summer School 2026! 🚀',
    bodyIntro: `Dear ${parentName}, ${firstName} is enrolled! Below are the portal login details.`,
    appendBodyHtml: `${nextSteps}${receiptExtras.appendHtml}${summerWaBlock}`,
    emailAttachments: receiptExtras.attachments,
  });

  return { email: delivery.email, whatsapp: delivery.whatsapp };
}
