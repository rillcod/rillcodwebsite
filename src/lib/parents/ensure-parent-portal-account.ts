import type { SupabaseClient } from '@supabase/supabase-js';
import { generateTempPassword } from '@/lib/utils/password';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';

type AnySupabase = SupabaseClient<any>;

export type EnsureParentPortalResult = {
  parentUserId: string | null;
  parentLogin: { email: string; password: string } | null;
  parentUserIdForDelivery: string;
};

/**
 * Resolve, create, or reset a parent portal account when activating a student.
 * Preserves activate behaviour: create parent when missing, reset password when present, link + archive.
 */
export async function ensureParentPortalForStudent(
  admin: AnySupabase,
  input: {
    studentRowId: string;
    parentEmail?: string | null;
    parentName?: string | null;
    schoolId: string | null;
    schoolName: string | null;
    fallbackDeliveryUserId: string;
  },
): Promise<EnsureParentPortalResult> {
  let parentLogin: { email: string; password: string } | null = null;
  let parentUserIdForDelivery = input.fallbackDeliveryUserId;
  let parentUserId: string | null = null;

  try {
    const { data: link } = await admin
      .from('parent_student_links')
      .select('parent_id')
      .eq('student_id', input.studentRowId)
      .maybeSingle();
    parentUserId = link?.parent_id ?? null;

    const normParentEmail = input.parentEmail?.trim().toLowerCase() || '';
    if (!parentUserId && normParentEmail) {
      const { data: pu } = await admin
        .from('portal_users')
        .select('id')
        .eq('email', normParentEmail)
        .eq('role', 'parent')
        .maybeSingle();
      parentUserId = pu?.id ?? null;
    }

    if (!parentUserId && normParentEmail) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existingAuthParent = list?.users?.find(
        (u) => u.email?.trim().toLowerCase() === normParentEmail,
      );

      let parentId = existingAuthParent?.id ?? null;
      const parentPw = generateTempPassword();

      if (!parentId) {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: normParentEmail,
          password: parentPw,
          email_confirm: true,
          user_metadata: { full_name: input.parentName || 'Parent/Guardian', role: 'parent' },
        });
        if (!createErr && created?.user) {
          parentId = created.user.id;
        } else {
          console.error('[ensureParentPortalForStudent] auth create failed:', createErr?.message);
        }
      } else {
        await admin.auth.admin.updateUserById(parentId, { password: parentPw });
      }

      if (parentId) {
        await admin.from('portal_users').upsert({
          id: parentId,
          email: normParentEmail,
          full_name: input.parentName || 'Parent/Guardian',
          role: 'parent',
          school_id: input.schoolId,
          school_name: input.schoolName,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        parentUserId = parentId;
        parentUserIdForDelivery = parentId;
        parentLogin = { email: normParentEmail, password: parentPw };

        await archivePortalCredential(admin, {
          schoolId: input.schoolId,
          schoolName: input.schoolName,
          fullName: input.parentName || 'Parent/Guardian',
          email: normParentEmail,
          password: parentPw,
          className: 'Parent Account',
          batchLabel: 'Single Student Parent Account',
        });
      }
    } else if (parentUserId) {
      const { data: parentUser } = await admin
        .from('portal_users')
        .select('email, role')
        .eq('id', parentUserId)
        .maybeSingle();
      if (parentUser?.email && parentUser.role === 'parent') {
        const parentPw = generateTempPassword();
        const { error: resetErr } = await admin.auth.admin.updateUserById(parentUserId, { password: parentPw });
        if (!resetErr) {
          parentLogin = { email: parentUser.email.trim().toLowerCase(), password: parentPw };
          parentUserIdForDelivery = parentUserId;
          await archivePortalCredential(admin, {
            schoolId: input.schoolId,
            schoolName: input.schoolName,
            fullName: input.parentName || 'Parent/Guardian',
            email: parentUser.email.trim().toLowerCase(),
            password: parentPw,
            className: 'Parent Account',
            batchLabel: 'Single Student Parent Account',
          });
        }
      }
    }

    if (parentUserId) {
      parentUserIdForDelivery = parentUserId;
      try {
        await syncExplicitParentStudentLink(admin, parentUserId, input.studentRowId);
      } catch { /* non-fatal */ }
    }
  } catch (err) {
    console.error('[ensureParentPortalForStudent] failed:', err);
  }

  return { parentUserId, parentLogin, parentUserIdForDelivery };
}
