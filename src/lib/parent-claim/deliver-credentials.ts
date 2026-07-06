import type { SupabaseClient } from '@supabase/supabase-js';
import { generateTempPassword } from '@/lib/utils/password';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';

type AnySupabase = SupabaseClient<any>;

export type CredentialDelivery = {
  email: boolean;
  whatsapp: boolean;
  parentPasswordSent: boolean;
  studentPasswordSent: boolean;
  parentEmail?: string;
  studentEmail?: string;
};

type LoginBlock = { email: string; password: string | null; label: string; accent: string };

function credentialsCard(label: string, accent: string, email: string, password: string | null): string {
  const pwRow = password
    ? `<tr><td style="padding:14px 16px;">
         <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
           <td style="font-size:12px;color:#71717a;font-weight:700;width:35%;">Temporary Password</td>
           <td style="font-size:13px;color:#f59e0b;font-weight:800;text-align:right;font-family:monospace,Arial;">${password}</td>
         </tr></table>
       </td></tr>`
    : `<tr><td style="padding:14px 16px;">
         <p style="margin:0;font-size:12px;color:#71717a;">Use your existing password, or reset it at the login page if you’ve forgotten it.</p>
       </td></tr>`;

  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#141618;border:1px solid #2a2d33;border-radius:8px;overflow:hidden;margin:0 0 16px;">
  <tr><td style="background:#1c1e22;border-bottom:1px solid #2a2d33;padding:10px 16px;">
    <p style="margin:0;font-size:10px;color:${accent};text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">${label}</p>
  </td></tr>
  <tr><td style="padding:14px 16px;border-bottom:1px solid #2a2d33;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:12px;color:#71717a;font-weight:700;width:35%;">Username / Email</td>
      <td style="font-size:13px;color:#ffffff;font-weight:800;text-align:right;font-family:monospace,Arial;">${email.trim().toLowerCase()}</td>
    </tr></table>
  </td></tr>
  ${pwRow}
</table>`;
}

async function hasUserEverSignedIn(admin: AnySupabase, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    return !!data.user.last_sign_in_at;
  } catch {
    return false;
  }
}

/** Issue a fresh temp password when the account exists but has never signed in. */
async function resolveDeliverablePassword(
  admin: AnySupabase,
  userId: string,
  newAccountPassword: string | null,
): Promise<string | null> {
  if (newAccountPassword) return newAccountPassword;
  const signedIn = await hasUserEverSignedIn(admin, userId);
  if (signedIn) return null;
  const pw = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pw });
  return error ? null : pw;
}

function buildWaMessage(
  parentName: string,
  schoolName: string | null,
  parent: LoginBlock | null,
  student: LoginBlock | null,
  appUrl: string,
): string {
  const lines = [
    `Hello ${parentName}! 👋`,
    `Your Rillcod portal access${schoolName ? ` for ${schoolName}` : ''} is ready.`,
    '',
  ];
  if (parent) {
    lines.push('PARENT PORTAL', `Email: ${parent.email}`);
    if (parent.password) lines.push(`Password: ${parent.password}`);
    lines.push('');
  }
  if (student) {
    lines.push('STUDENT PORTAL', `Email: ${student.email}`);
    if (student.password) lines.push(`Password: ${student.password}`);
    lines.push('');
  }
  lines.push(`Sign in: ${appUrl}/login`, '', 'Please change passwords after first login.');
  return lines.join('\n');
}

/**
 * Deliver parent + student portal credentials after a result-check claim.
 *
 * Credentials policy:
 *   • New parent          → create account + send parent + student logins
 *   • Existing parent, never signed in → reset temp password + send both logins
 *   • Existing parent, active          → link only; login link, no password reset
 *   • Existing student, never signed in → reset temp password + include in email
 *   • Existing student, active         → email only; point to existing password / reset
 *
 * No payment receipts here — school-type enrolments collect fees at the school;
 * receipts stay on the online/summer onboarding paths only.
 */
export async function deliverResultCheckerCredentials(
  admin: AnySupabase,
  input: {
    parentId: string;
    studentUserId: string;
    parentEmail: string;
    parentPhone: string | null;
    parentName: string;
    childName: string | null;
    schoolName: string | null;
    newParentPassword: string | null;
  },
): Promise<CredentialDelivery> {
  const sent: CredentialDelivery = {
    email: false,
    whatsapp: false,
    parentPasswordSent: false,
    studentPasswordSent: false,
  };

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  const { parentId, studentUserId, parentEmail, parentPhone, parentName, childName, schoolName, newParentPassword } = input;

  const { data: studentPU } = await admin
    .from('portal_users')
    .select('email, full_name')
    .eq('id', studentUserId)
    .maybeSingle();

  const parentPw = await resolveDeliverablePassword(admin, parentId, newParentPassword);
  const studentPw = studentPU?.email
    ? await resolveDeliverablePassword(admin, studentUserId, null)
    : null;

  const parentBlock: LoginBlock | null = {
    email: parentEmail,
    password: parentPw,
    label: 'Parent / Guardian Portal Login',
    accent: '#10b981',
  };
  const studentBlock: LoginBlock | null = studentPU?.email
    ? {
        email: studentPU.email,
        password: studentPw,
        label: 'Student Portal Login',
        accent: '#7c3aed',
      }
    : null;

  sent.parentEmail = parentEmail;
  sent.studentEmail = studentPU?.email ?? undefined;
  sent.parentPasswordSent = !!parentPw;
  sent.studentPasswordSent = !!studentPw;

  const firstName = (childName || studentPU?.full_name || 'your child').trim().split(/\s+/)[0];
  const loginUrl = `${appUrl}/login?type=parent&email=${encodeURIComponent(parentEmail)}${parentPw ? `&pw=${encodeURIComponent(parentPw)}` : ''}`;

  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;color:#d4d4d8;">
      Dear ${parentName}, ${firstName} is now linked to your Rillcod parent account${schoolName ? ` at ${schoolName}` : ''}.
      Below are your portal logins.
    </p>
    ${parentBlock ? credentialsCard(parentBlock.label, parentBlock.accent, parentBlock.email, parentBlock.password) : ''}
    ${studentBlock ? credentialsCard(studentBlock.label, studentBlock.accent, studentBlock.email, studentBlock.password) : ''}
    <p style="margin:0 0 16px;font-size:12px;color:#71717a;">
      Please change any temporary passwords after first login. Keep these details private.
    </p>`;

  const html = buildRillcodTransactionalEmailHtml({
    eyebrow: 'Portal access ready',
    title: `Welcome to Rillcod${schoolName ? ` — ${schoolName}` : ''}`,
    bodyHtml,
    cta: { href: loginUrl, label: 'Log In to Parent Portal', color: '#10b981' },
    footerNote: 'Rillcod Technologies · +234 811 660 0091',
  });

  try {
    await notificationsService.sendExternalEmail({
      to: parentEmail,
      subject: `Your Rillcod Portal Login${childName ? ` — ${childName}` : ''}`,
      html,
      fromName: schoolName ? `${schoolName} via Rillcod Technologies` : 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
    });
    sent.email = true;
  } catch (err) {
    console.error('[deliverResultCheckerCredentials] email failed:', err);
  }

  if (parentPhone) {
    try {
      const waMsg = buildWaMessage(parentName, schoolName, parentBlock, studentBlock, appUrl);
      sent.whatsapp = await sendWhatsApp(parentPhone, waMsg);
    } catch (err) {
      console.error('[deliverResultCheckerCredentials] whatsapp failed:', err);
    }
  }

  return sent;
}
