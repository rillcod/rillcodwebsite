import type { SupabaseClient } from '@supabase/supabase-js';
import {
  onboardStudentFromProspect,
  type ProspectChild,
  type OnboardFromProspectResult,
} from '@/lib/students/onboard-from-prospect';
import {
  onboardSummerStudent,
  type SummerOnboardResult,
} from '@/lib/summer-school/onboard';

type AnySupabase = SupabaseClient<any>;

export type OnboardStudentInput =
  | {
      track: 'prospect';
      admin: AnySupabase;
      prospect: ProspectChild;
      parentId?: string | null;
      enrollmentType?: string;
      approvedBy?: string | null;
      classId?: string | null;
      className?: string | null;
      termId?: string | null;
    }
  | {
      track: 'summer';
      admin: AnySupabase;
      prospect: Parameters<typeof onboardSummerStudent>[1];
      approvedBy?: string | null;
    };

export type OnboardStudentResult = OnboardFromProspectResult | SummerOnboardResult;

/**
 * Single entry point for student onboarding — routes to general prospect or summer paths.
 */
export async function onboardStudent(input: OnboardStudentInput): Promise<OnboardStudentResult> {
  if (input.track === 'summer') {
    return onboardSummerStudent(input.admin, input.prospect, { approvedBy: input.approvedBy ?? null });
  }
  return onboardStudentFromProspect(input.admin, input.prospect, {
    parentId: input.parentId,
    enrollmentType: input.enrollmentType,
    approvedBy: input.approvedBy,
    classId: input.classId,
    className: input.className,
    termId: input.termId,
  });
}
