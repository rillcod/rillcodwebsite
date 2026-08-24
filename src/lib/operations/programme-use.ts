import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasLearnerAssignmentEvidence,
  hasProtectedProgressReportEvidence,
} from '@/lib/academic/record-retention';

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

function combineScopeFilter(
  programId: string,
  courseIds: string[],
  classIds: string[] = [],
): string {
  return [
    `program_id.eq.${programId}`,
    ...(courseIds.length ? [`course_id.in.(${courseIds.join(',')})`] : []),
    ...(classIds.length ? [`class_id.in.(${classIds.join(',')})`] : []),
  ].join(',');
}

/**
 * Direct programme evidence guard. It deliberately does not depend only on a
 * surviving class row: programme/course-scoped work and legacy unscoped evidence
 * must still retire the programme instead of being orphaned by a hard delete.
 */
export async function programmeHasProtectedLearnerWork(
  db: SupabaseClient<any>,
  programId: string,
): Promise<boolean> {
  const [classResult, courseResult, enrollmentResult] = await Promise.all([
    db.from('classes').select('id').eq('program_id', programId),
    db.from('courses').select('id').eq('program_id', programId),
    db.from('enrollments').select('id').eq('program_id', programId),
  ]);
  const identityError = [classResult.error, courseResult.error, enrollmentResult.error].find(Boolean);
  if (identityError) throw identityError;

  const classIds = (classResult.data ?? []).map((row) => row.id);
  const courseIds = (courseResult.data ?? []).map((row) => row.id);
  const enrollmentIds = (enrollmentResult.data ?? []).map((row) => row.id);
  const parentScope = combineScopeFilter(programId, courseIds, classIds);
  const evidenceScope = [
    ...(courseIds.length ? [`course_id.in.(${courseIds.join(',')})`] : []),
    ...(classIds.length ? [`class_id.in.(${classIds.join(',')})`] : []),
  ].join(',');
  const termGradeScope = [
    ...(enrollmentIds.length ? [`enrollment_id.in.(${enrollmentIds.join(',')})`] : []),
    ...(courseIds.length ? [`course_id.in.(${courseIds.join(',')})`] : []),
    ...(classIds.length ? [`class_id.in.(${classIds.join(',')})`] : []),
  ].join(',');

  const [assignmentResult, cbtResult, writtenResult, reportResult, evidenceResult, termGradeResult] = await Promise.all([
    db.from('assignments').select('id').or(parentScope),
    db.from('cbt_exams').select('id').or(parentScope),
    db.from('exams').select('id').or(parentScope),
    db.from('student_progress_reports')
      .select('is_published,published_at,calculation_mode,theory_score,practical_score,attendance_score,participation_score,overall_score')
      .or(parentScope),
    evidenceScope
      ? db.from('academic_assessment_evidence').select('id', { count: 'exact', head: true }).or(evidenceScope)
      : Promise.resolve({ data: null, count: 0, error: null }),
    termGradeScope
      ? db.from('enrollment_term_grades').select('id', { count: 'exact', head: true }).or(termGradeScope)
      : Promise.resolve({ data: null, count: 0, error: null }),
  ]);
  const parentError = [
    assignmentResult.error, cbtResult.error, writtenResult.error, reportResult.error,
    evidenceResult.error, termGradeResult.error,
  ].find(Boolean);
  if (parentError) throw parentError;

  const assignmentIds = (assignmentResult.data ?? []).map((row) => row.id);
  const cbtExamIds = (cbtResult.data ?? []).map((row) => row.id);
  const writtenExamIds = (writtenResult.data ?? []).map((row) => row.id);
  const [submissionResult, cbtAttemptResult, writtenAttemptResult] = await Promise.all([
    assignmentIds.length
      ? db.from('assignment_submissions')
        .select('id,submission_text,file_url,submitted_at,answers,grade,weighted_score,graded_at,graded_by,grading_mode,status')
        .in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [], error: null }),
    cbtExamIds.length
      ? db.from('cbt_sessions').select('id', { count: 'exact', head: true }).in('exam_id', cbtExamIds)
      : Promise.resolve({ data: null, count: 0, error: null }),
    writtenExamIds.length
      ? db.from('exam_attempts').select('id', { count: 'exact', head: true }).in('exam_id', writtenExamIds)
      : Promise.resolve({ data: null, count: 0, error: null }),
  ]);
  const learnerError = [submissionResult.error, cbtAttemptResult.error, writtenAttemptResult.error].find(Boolean);
  if (learnerError) throw learnerError;

  return (submissionResult.data ?? []).some(hasLearnerAssignmentEvidence)
    || (cbtAttemptResult.count ?? 0) > 0
    || (writtenAttemptResult.count ?? 0) > 0
    || (reportResult.data ?? []).some(hasProtectedProgressReportEvidence)
    || (evidenceResult.count ?? 0) > 0
    || (termGradeResult.count ?? 0) > 0;
}
