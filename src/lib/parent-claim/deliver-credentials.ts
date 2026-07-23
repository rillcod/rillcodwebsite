import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';

type AnySupabase = SupabaseClient<any>;

export type CredentialDelivery = {
  email: boolean;
  whatsapp: boolean;
  parentPasswordSent: boolean;
  studentPasswordSent: boolean;
  parentEmail?: string;
  studentEmail?: string;
  parentLoginUrl?: string;
  studentLoginUrl?: string;
};

/**
 * Deliver parent + student portal credentials after a result-check claim.
 * Delegates to the unified credential service (if-never-signed-in reset policy).
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
  const { data: studentPU } = await admin
    .from('portal_users')
    .select('email, full_name')
    .eq('id', input.studentUserId)
    .maybeSingle();

  const result = await deliverPortalCredentials(admin, {
    parent: {
      userId: input.parentId,
      email: input.parentEmail,
      displayName: input.parentName,
      role: 'parent',
      storedPassword: input.newParentPassword,
    },
    students: studentPU?.email
      ? [{
          userId: input.studentUserId,
          email: studentPU.email,
          displayName: studentPU.full_name || input.childName || 'Student',
          role: 'student',
        }]
      : [],
    parentPhone: input.parentPhone,
    parentName: input.parentName,
    schoolName: input.schoolName,
    resetPolicy: input.newParentPassword ? 'never' : 'if-never-signed-in',
    title: `Welcome to Rillcod${input.schoolName ? ` — ${input.schoolName}` : ''}`,
    bodyIntro: `Dear ${input.parentName}, ${(input.childName || studentPU?.full_name || 'your child').trim().split(/\s+/)[0]} is now linked to your Rillcod parent account${input.schoolName ? ` at ${input.schoolName}` : ''}. Below are your portal logins.`,
    emailSubject: `Your Rillcod Portal Login${input.childName ? ` — ${input.childName}` : ''}`,
  });

  return {
    email: result.email,
    whatsapp: result.whatsapp,
    parentPasswordSent: !!result.parent.password,
    studentPasswordSent: result.students.some((s) => !!s.password),
    parentEmail: result.parent.email,
    studentEmail: result.students[0]?.email,
    parentLoginUrl: result.parentLoginUrl,
    studentLoginUrl: result.studentLoginUrl,
  };
}
