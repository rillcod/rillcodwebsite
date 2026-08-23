import type { SupabaseClient } from '@supabase/supabase-js';
import { classHasProtectedAcademicEvidence } from '@/lib/operations/delete-rebuildable-class';

export type ProgrammeOperationalUse = {
  classes: number;
  enrollments: number;
  studentEnrollments: number;
  inUse: boolean;
};

export const PROGRAMME_RETIRED_MESSAGE =
  'This programme still has learner scores or attempts, so it was turned off instead of removed.';

export async function loadProgrammeOperationalUse(
  db: SupabaseClient<any>,
  programId: string,
): Promise<ProgrammeOperationalUse> {
  const [classes, enrollments, studentEnrollments] = await Promise.all([
    db.from('classes').select('id', { count: 'exact', head: true }).eq('program_id', programId),
    db.from('enrollments').select('id', { count: 'exact', head: true }).eq('program_id', programId),
    db.from('student_enrollments').select('id', { count: 'exact', head: true }).eq('program_id', programId),
  ]);
  const missing = /does not exist|Could not find|schema cache/i;
  if (classes.error) throw classes.error;
  if (enrollments.error && !missing.test(enrollments.error.message ?? '')) throw enrollments.error;
  if (studentEnrollments.error && !missing.test(studentEnrollments.error.message ?? '')) {
    throw studentEnrollments.error;
  }

  const counts = {
    classes: classes.count ?? 0,
    enrollments: enrollments.error ? 0 : enrollments.count ?? 0,
    studentEnrollments: studentEnrollments.error ? 0 : studentEnrollments.count ?? 0,
  };
  return {
    ...counts,
    inUse: counts.classes > 0 || counts.enrollments > 0 || counts.studentEnrollments > 0,
  };
}

/** True only when a living classroom under this programme already has marks. */
export async function programmeHasProtectedLearnerWork(
  db: SupabaseClient<any>,
  programId: string,
): Promise<boolean> {
  const { data: classes, error } = await db.from('classes').select('id').eq('program_id', programId);
  if (error) throw error;
  for (const row of classes ?? []) {
    if (await classHasProtectedAcademicEvidence(db, row.id)) return true;
  }
  return false;
}
