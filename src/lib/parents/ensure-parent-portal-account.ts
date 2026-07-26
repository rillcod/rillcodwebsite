import type { SupabaseClient } from '@supabase/supabase-js';
import { findOrCreateParentPortal } from '@/lib/parents/provision';
import { syncExplicitParentStudentLink, isParentLinkConflict } from '@/lib/parents/links';

type AnySupabase = SupabaseClient<any>;

export type EnsureParentPortalResult = {
  parentUserId: string | null;
  parentLogin: { email: string; password: string } | null;
  parentUserIdForDelivery: string;
  linkError?: string | null;
};

/**
 * Resolve/create a parent portal when activating a student, then establish the
 * canonical parent_student_links row. Link failures are returned (not swallowed).
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
  let linkError: string | null = null;

  try {
    if (!input.schoolId) {
      console.error('[ensureParentPortalForStudent] schoolId required — parent not created/activated');
      return { parentUserId: null, parentLogin: null, parentUserIdForDelivery, linkError: 'schoolId required' };
    }

    const normParentEmail = input.parentEmail?.trim().toLowerCase() || '';

    // Prefer existing junction parent for this student
    const { data: link } = await admin
      .from('parent_student_links')
      .select('parent_id')
      .eq('student_id', input.studentRowId)
      .maybeSingle();

    if (link?.parent_id) {
      parentUserId = link.parent_id;
      const { data: existingParent } = await admin
        .from('portal_users')
        .select('email, full_name')
        .eq('id', parentUserId)
        .maybeSingle();
      const emailForReset = existingParent?.email?.trim().toLowerCase() || normParentEmail;
      if (emailForReset) {
        const provisioned = await findOrCreateParentPortal(admin, {
          email: emailForReset,
          fullName: input.parentName || existingParent?.full_name,
          schoolId: input.schoolId,
          schoolName: input.schoolName,
          passwordPolicy: 'reset',
          preserveExistingProfile: true,
          batchLabel: 'Single Student Parent Account',
        });
        if (provisioned.ok && provisioned.password) {
          parentLogin = { email: emailForReset, password: provisioned.password };
        }
      }
    } else if (normParentEmail) {
      const provisioned = await findOrCreateParentPortal(admin, {
        email: normParentEmail,
        fullName: input.parentName,
        schoolId: input.schoolId,
        schoolName: input.schoolName,
        passwordPolicy: 'reset',
        preserveExistingProfile: true,
        batchLabel: 'Single Student Parent Account',
      });
      if (!provisioned.ok || !provisioned.parentId) {
        return {
          parentUserId: null,
          parentLogin: null,
          parentUserIdForDelivery,
          linkError: provisioned.error || 'Could not provision parent',
        };
      }
      parentUserId = provisioned.parentId;
      if (provisioned.password) {
        parentLogin = { email: normParentEmail, password: provisioned.password };
      }
    } else {
      return {
        parentUserId: null,
        parentLogin: null,
        parentUserIdForDelivery,
        linkError: 'parent email required',
      };
    }

    if (parentUserId) {
      parentUserIdForDelivery = parentUserId;
      try {
        await syncExplicitParentStudentLink(admin, parentUserId, input.studentRowId, {
          source: 'ensureParentPortalForStudent',
        });
      } catch (err) {
        if (isParentLinkConflict(err)) {
          linkError = err.message;
          console.error('[ensureParentPortalForStudent] link conflict:', err.message);
        } else {
          linkError = err instanceof Error ? err.message : 'Link failed';
          console.error('[ensureParentPortalForStudent] link failed:', err);
        }
      }
    }
  } catch (err) {
    console.error('[ensureParentPortalForStudent] failed:', err);
    linkError = err instanceof Error ? err.message : 'Parent portal setup failed';
  }

  return { parentUserId, parentLogin, parentUserIdForDelivery, linkError };
}
