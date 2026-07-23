import type { SupabaseClient } from '@supabase/supabase-js';
import { generateTempPassword } from '@/lib/utils/password';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { notificationsService } from '@/services/notifications.service';
import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';
import { SMTP_FROM_EMAIL, brandContact } from '@/config/brand';
import { portalAppUrl } from '@/lib/credentials/app-url';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';

type AnySupabase = SupabaseClient<any>;

export type CredentialResetPolicy = 'always' | 'if-never-signed-in' | 'never';

export type PortalLoginTarget = {
  userId: string;
  email: string;
  displayName: string;
  role: 'parent' | 'student';
  /** Required when resetPolicy is 'never'. */
  storedPassword?: string | null;
  className?: string | null;
};

export type DeliverPortalCredentialsInput = {
  parent: PortalLoginTarget;
  students?: PortalLoginTarget[];
  parentPhone?: string | null;
  parentName: string;
  schoolName?: string | null;
  schoolId?: string | null;
  resetPolicy?: CredentialResetPolicy;
  archiveToRegistrationResults?: boolean;
  emailSubject?: string;
  title?: string;
  bodyIntro?: string;
  /** system = notificationsService.sendEmail; external = sendExternalEmail */
  emailChannel?: 'system' | 'external';
  /** Archive passwords but skip email/WhatsApp (bulk silent mode). */
  skipDelivery?: boolean;
  /** When false, omit the parent credentials card (student-only delivery). */
  showParentCredentials?: boolean;
  /** Extra HTML appended after credential cards (receipt link, WhatsApp group, etc.). */
  appendBodyHtml?: string;
  emailAttachments?: Array<{ filename: string; content: string }>;
  /** Mark registration_results row sent/failed after email attempt. */
  registrationResultId?: string | null;
};

export type ResolvedPortalLogin = {
  userId: string;
  email: string;
  name: string;
  password: string | null;
  role: 'parent' | 'student';
};

export type DeliverPortalCredentialsResult = {
  email: boolean;
  whatsapp: boolean;
  channels: string[];
  parent: ResolvedPortalLogin;
  students: ResolvedPortalLogin[];
  parentLoginUrl?: string;
  studentLoginUrl?: string;
};

type LoginBlock = { email: string; password: string | null; label: string; accent: string };

async function hasUserEverSignedIn(admin: AnySupabase, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    return !!data.user.last_sign_in_at;
  } catch {
    return false;
  }
}

async function resolvePasswordForDelivery(
  admin: AnySupabase,
  target: PortalLoginTarget,
  resetPolicy: CredentialResetPolicy,
): Promise<string | null> {
  if (resetPolicy === 'never') {
    return target.storedPassword?.trim() || null;
  }
  if (resetPolicy === 'if-never-signed-in') {
    const signedIn = await hasUserEverSignedIn(admin, target.userId);
    if (signedIn) return null;
  }
  const pw = generateTempPassword();
  const { error } = await admin.auth.admin.updateUserById(target.userId, { password: pw });
  return error ? null : pw;
}

function credentialsCard(label: string, accent: string, email: string, password: string | null): string {
  const pwRow = password
    ? `<tr><td style="padding:14px 16px;">
         <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
           <td style="font-size:12px;color:#71717a;font-weight:700;width:35%;">Temporary Password</td>
           <td style="font-size:13px;color:#f59e0b;font-weight:800;text-align:right;font-family:monospace,Arial;">${password}</td>
         </tr></table>
       </td></tr>`
    : `<tr><td style="padding:14px 16px;">
         <p style="margin:0;font-size:12px;color:#71717a;">Use your existing password, or reset it at the login page if you've forgotten it.</p>
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

function buildWaMessage(
  parentName: string,
  schoolName: string | null,
  parent: LoginBlock | null,
  students: LoginBlock[],
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
  for (const student of students) {
    lines.push('STUDENT PORTAL', `Email: ${student.email}`);
    if (student.password) lines.push(`Password: ${student.password}`);
    lines.push('');
  }
  lines.push(`Sign in: ${appUrl}/login`, '', 'Please change passwords after first login.');
  return lines.join('\n');
}

/**
 * Unified portal credential delivery — one reset policy, one template, optional vault archive.
 */
export async function deliverPortalCredentials(
  admin: AnySupabase,
  input: DeliverPortalCredentialsInput,
): Promise<DeliverPortalCredentialsResult> {
  const resetPolicy = input.resetPolicy ?? 'if-never-signed-in';
  const appUrl = portalAppUrl();
  const channels: string[] = [];
  const studentTargets = input.students ?? [];

  const parentPassword = await resolvePasswordForDelivery(admin, input.parent, resetPolicy);
  const resolvedStudents: ResolvedPortalLogin[] = [];
  for (const student of studentTargets) {
    const password = await resolvePasswordForDelivery(admin, student, resetPolicy);
    resolvedStudents.push({
      userId: student.userId,
      email: student.email,
      name: student.displayName,
      password,
      role: 'student',
    });
  }

  const parent: ResolvedPortalLogin = {
    userId: input.parent.userId,
    email: input.parent.email,
    name: input.parent.displayName,
    password: parentPassword,
    role: 'parent',
  };

  if (input.archiveToRegistrationResults) {
    const archiveBatch = input.schoolId ? 'Portal Credentials' : 'Portal Credentials';
    const vaultEntries = [
      { target: input.parent, password: parentPassword, className: 'Parent Account' },
      ...studentTargets.map((s, i) => ({
        target: s,
        password: resolvedStudents[i]?.password ?? null,
        className: s.className ?? 'Student Account',
      })),
    ];
    for (const entry of vaultEntries) {
      if (!entry.password) continue;
      await archivePortalCredential(admin, {
        schoolId: input.schoolId ?? null,
        schoolName: input.schoolName ?? null,
        fullName: entry.target.displayName,
        email: entry.target.email,
        password: entry.password,
        className: entry.className,
        batchLabel: archiveBatch,
      });
    }
  }

  const parentBlock: LoginBlock = {
    email: parent.email,
    password: parent.password,
    label: 'Parent / Guardian Portal Login',
    accent: '#10b981',
  };
  const studentBlocks: LoginBlock[] = resolvedStudents.map((s) => ({
    email: s.email,
    password: s.password,
    label: 'Student Portal Login',
    accent: '#7c3aed',
  }));

  const parentLoginUrl = `${appUrl}/login?type=parent&email=${encodeURIComponent(parent.email)}`;
  const studentLoginUrl = resolvedStudents[0]?.email
    ? `${appUrl}/login?type=student&email=${encodeURIComponent(resolvedStudents[0].email)}`
    : undefined;

  const intro = input.bodyIntro
    ?? `Dear ${input.parentName}, below are your portal login details${input.schoolName ? ` for ${input.schoolName}` : ''}.`;

  const showParent = input.showParentCredentials !== false && !!parent.password;
  const bodyHtml = `
    <p style="margin:0 0 14px;font-size:15px;color:#d4d4d8;">${intro}</p>
    ${showParent ? credentialsCard(parentBlock.label, parentBlock.accent, parentBlock.email, parentBlock.password) : ''}
    ${studentBlocks.map((b) => credentialsCard(b.label, b.accent, b.email, b.password)).join('')}
    <p style="margin:0 0 16px;font-size:12px;color:#71717a;">
      Please change any temporary passwords after first login. Keep these details private.
    </p>${input.appendBodyHtml ?? ''}`;

  const html = buildRillcodTransactionalEmailHtml({
    eyebrow: 'Portal access',
    title: input.title ?? `Your Rillcod Login${input.schoolName ? ` — ${input.schoolName}` : ''}`,
    bodyHtml,
    cta: { href: parentLoginUrl, label: 'Log In to Parent Portal', color: '#10b981' },
    footerNote: `Rillcod Technologies · ${brandContact.phone}`,
  });

  let emailSent = false;
  const subject = input.emailSubject ?? `Your Rillcod Portal Login`;
  if (!input.skipDelivery) {
    try {
      if (input.emailChannel === 'system') {
        await notificationsService.sendEmail('system', { to: parent.email, subject, html });
      } else {
        await notificationsService.sendExternalEmail({
          to: parent.email,
          subject,
          html,
          fromName: input.schoolName ? `${input.schoolName} via Rillcod Technologies` : 'Rillcod Technologies',
          fromEmail: SMTP_FROM_EMAIL,
          ...(input.emailAttachments?.length ? { attachments: input.emailAttachments } : {}),
        });
      }
      emailSent = true;
      channels.push('email');
      if (input.registrationResultId) {
        await admin.from('registration_results').update({ status: 'sent' }).eq('id', input.registrationResultId);
      }
    } catch (err) {
      console.error('[deliverPortalCredentials] email failed:', err);
      if (input.registrationResultId) {
        try {
          await admin.from('registration_results').update({ status: 'failed' }).eq('id', input.registrationResultId);
        } catch { /* non-fatal */ }
      }
    }
  }

  let whatsappSent = false;
  if (!input.skipDelivery && input.parentPhone) {
    try {
      whatsappSent = await sendWhatsApp(
        input.parentPhone,
        buildWaMessage(
          input.parentName,
          input.schoolName ?? null,
          showParent ? parentBlock : null,
          studentBlocks,
          appUrl,
        ),
      );
      if (whatsappSent) channels.push('whatsapp');
    } catch (err) {
      console.error('[deliverPortalCredentials] whatsapp failed:', err);
    }
  }

  return {
    email: emailSent,
    whatsapp: whatsappSent,
    channels,
    parent,
    students: resolvedStudents,
    parentLoginUrl,
    studentLoginUrl,
  };
}
