import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';

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
): Promise<void> {
  if (params.parentId && params.studentRowId) {
    try {
      await syncExplicitParentStudentLink(admin, params.parentId, params.studentRowId);
    } catch (error) {
      console.error('[finalizeStudentOnboard] parent link failed:', error);
    }
  }

  void ensureDefaultEnrollment(admin, params.studentPortalId, {
    grade: params.grade ?? undefined,
    enrollmentType: params.enrollmentType,
    courseInterest: params.courseInterest ?? undefined,
  });
}
