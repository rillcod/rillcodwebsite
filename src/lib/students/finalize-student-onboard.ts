import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { syncExplicitParentStudentLink, isParentLinkConflict } from '@/lib/parents/links';

type AnySupabase = SupabaseClient<any>;

/**
 * Shared tail of student onboarding: parent link + default programme enrollment.
 * Keeps consent, prospect, and activate flows aligned after account creation.
 */
export async function finalizeStudentOnboard(
  admin: AnySupabase,
  params: {
    studentPortalId: string;
    studentRowId: string | null;
    parentId?: string | null;
    grade?: string | null;
    enrollmentType?: string;
    courseInterest?: string | null;
  },
): Promise<{ linked: boolean; linkError?: string }> {
  let linked = false;
  let linkError: string | undefined;

  if (params.parentId && params.studentRowId) {
    try {
      await syncExplicitParentStudentLink(admin, params.parentId, params.studentRowId, {
        source: 'finalizeStudentOnboard',
      });
      linked = true;
    } catch (error) {
      linkError = error instanceof Error ? error.message : 'Parent link failed';
      console.error('[finalizeStudentOnboard] parent link failed:', error);
      if (!isParentLinkConflict(error)) {
        // Non-conflict failures still log; callers can inspect return value.
      }
    }
  }

  void ensureDefaultEnrollment(admin, params.studentPortalId, {
    grade: params.grade ?? undefined,
    enrollmentType: params.enrollmentType,
    courseInterest: params.courseInterest ?? undefined,
  });

  return { linked, linkError };
}
