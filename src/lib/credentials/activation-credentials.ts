import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';
import { buildReceiptEmailExtras, buildSummerWhatsAppBlock } from '@/lib/credentials/receipt-email-blocks';

type AnySupabase = SupabaseClient<any>;

/** Unified credential delivery for student activate / force-resend. */
export async function deliverActivationCredentials(
  admin: AnySupabase,
  input: {
    destinationEmail: string;
    studentUserId: string;
    studentEmail: string;
    studentName: string;
    studentPassword: string;
    parentUserId: string;
    parentLogin?: { email: string; password: string } | null;
    parentName: string;
    parentPhone?: string | null;
    schoolId: string | null;
    schoolName: string | null;
    registrationResultId?: string | null;
    isSummerSchool?: boolean;
  },
): Promise<boolean> {
  const hasParentLogin = !!(input.parentLogin?.email && input.parentLogin.password);
  const receiptExtras = await buildReceiptEmailExtras(admin, input.studentUserId, input.studentName);
  const summerBlock = input.isSummerSchool ? await buildSummerWhatsAppBlock() : '';

  const delivery = await deliverPortalCredentials(admin, {
    parent: {
      userId: input.parentUserId,
      email: input.destinationEmail.trim().toLowerCase(),
      displayName: hasParentLogin ? input.parentName : input.studentName,
      role: 'parent',
      storedPassword: hasParentLogin ? input.parentLogin!.password : null,
    },
    students: [{
      userId: input.studentUserId,
      email: input.studentEmail,
      displayName: input.studentName,
      role: 'student',
      storedPassword: input.studentPassword,
    }],
    parentPhone: input.parentPhone ?? null,
    parentName: input.parentName,
    schoolName: input.schoolName,
    schoolId: input.schoolId,
    resetPolicy: 'never',
    showParentCredentials: hasParentLogin,
    emailChannel: 'external',
    emailSubject: hasParentLogin
      ? 'Your Rillcod Academy Parent & Student Login Details'
      : 'Your Rillcod Academy Login Credentials',
    title: hasParentLogin
      ? 'Your Rillcod Academy Login Details'
      : `Welcome to Rillcod${input.schoolName ? ` — ${input.schoolName}` : ''}`,
    bodyIntro: hasParentLogin
      ? `Below are the login details for <strong style="color:#fff;">${input.studentName}</strong>. The Parent Portal lets you track progress, reports and payments; the Student Portal is for your child's lessons and activities.`
      : undefined,
    appendBodyHtml: `${receiptExtras.appendHtml}${summerBlock}`,
    emailAttachments: receiptExtras.attachments,
    registrationResultId: input.registrationResultId ?? null,
  });

  return delivery.email || delivery.whatsapp;
}
