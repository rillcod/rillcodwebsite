import {
  hasCbtAttemptEvidence,
  hasProtectedAssignmentScoreEvidence,
  hasProtectedProgressReportEvidence,
  hasWrittenExamAttemptEvidence,
} from '@/lib/academic/record-retention';

type AnyAdmin = {
  from: (table: string) => any;
};

export type ProtectedAcademicEvidence = {
  assignmentScores: number;
  cbtScores: number;
  writtenExamAttempts: number;
  progressReports: number;
  moderatedTermGrades: number;
  total: number;
};

/**
 * Academic marks are records, not disposable account metadata. Account cleanup
 * may archive a learner, but a hard wipe must stop while any assessed evidence
 * still points at that learner.
 */
export async function getProtectedAcademicEvidence(
  admin: AnyAdmin,
  userId: string | null,
  knownStudentRowIds: string[] = [],
): Promise<ProtectedAcademicEvidence> {
  const studentRowsResult = userId
    ? await admin.from('students').select('id,user_id').eq('user_id', userId)
    : knownStudentRowIds.length > 0
      ? await admin.from('students').select('id,user_id').in('id', knownStudentRowIds)
      : { data: [], error: null };
  if (studentRowsResult.error) {
    throw new Error(`Could not verify protected academic evidence: ${studentRowsResult.error.message}`);
  }
  const studentRowIds = [...new Set([
    ...knownStudentRowIds,
    ...(studentRowsResult.data ?? []).map((row: { id?: string }) => row.id ?? ''),
  ].filter(Boolean))];
  const portalUserIds = [...new Set([
    userId ?? '',
    ...(studentRowsResult.data ?? []).map((row: { user_id?: string | null }) => row.user_id ?? ''),
  ].filter(Boolean))];
  const identityFilters = [
    ...portalUserIds.flatMap((id) => [`portal_user_id.eq.${id}`, `user_id.eq.${id}`]),
    ...studentRowIds.map((id) => `student_id.eq.${id}`),
  ];

  const assignmentResult = identityFilters.length > 0
    ? await admin
      .from('assignment_submissions')
      .select('id,grade,weighted_score,graded_at,graded_by,grading_mode,status')
      .or(identityFilters.join(','))
    : { data: [], error: null };
  const cbtResult = portalUserIds.length > 0
    ? await admin
      .from('cbt_sessions')
      .select('id,answers,score,manual_scores,start_time,end_time,status')
      .in('user_id', portalUserIds)
    : { data: [], error: null };
  const writtenExamResult = portalUserIds.length > 0
    ? await admin
      .from('exam_attempts')
      .select('id,answers,score,percentage,started_at,submitted_at,status')
      .in('portal_user_id', portalUserIds)
    : { data: [], error: null };
  const reportResult = portalUserIds.length > 0
    ? await admin
      .from('student_progress_reports')
      .select('id,is_published,published_at,overall_score,participation_score,attendance_score,theory_score,practical_score')
      .in('student_id', portalUserIds)
    : { data: [], error: null };
  const enrollmentResult = portalUserIds.length > 0
    ? await admin.from('enrollments').select('id').in('user_id', portalUserIds)
    : { data: [], error: null };

  const sourceError = assignmentResult.error
    || cbtResult.error
    || writtenExamResult.error
    || reportResult.error
    || enrollmentResult.error;
  if (sourceError) {
    throw new Error(`Could not verify protected academic evidence: ${sourceError.message}`);
  }

  const enrollmentIds = (enrollmentResult.data ?? [])
    .map((row: { id?: string }) => row.id)
    .filter((id: string | undefined): id is string => !!id);
  const termGradeResult = enrollmentIds.length > 0
    ? await admin
      .from('enrollment_term_grades')
      .select('id', { count: 'exact', head: true })
      .in('enrollment_id', enrollmentIds)
    : { count: 0 };
  if ('error' in termGradeResult && termGradeResult.error) {
    throw new Error(`Could not verify moderated term grades: ${termGradeResult.error.message}`);
  }

  const assignmentScores = (assignmentResult.data ?? []).filter(hasProtectedAssignmentScoreEvidence).length;
  const cbtScores = (cbtResult.data ?? []).filter(hasCbtAttemptEvidence).length;
  const writtenExamAttempts = (writtenExamResult.data ?? []).filter(hasWrittenExamAttemptEvidence).length;
  const progressReports = (reportResult.data ?? []).filter(hasProtectedProgressReportEvidence).length;
  const moderatedTermGrades = termGradeResult.count ?? 0;
  return {
    assignmentScores,
    cbtScores,
    writtenExamAttempts,
    progressReports,
    moderatedTermGrades,
    total: assignmentScores + cbtScores + writtenExamAttempts + progressReports + moderatedTermGrades,
  };
}

export function protectedAcademicEvidenceMessage(evidence: ProtectedAcademicEvidence): string {
  const parts = [
    evidence.assignmentScores ? `${evidence.assignmentScores} graded assignment${evidence.assignmentScores === 1 ? '' : 's'}` : '',
    evidence.cbtScores ? `${evidence.cbtScores} CBT result${evidence.cbtScores === 1 ? '' : 's'}` : '',
    evidence.writtenExamAttempts ? `${evidence.writtenExamAttempts} written exam attempt${evidence.writtenExamAttempts === 1 ? '' : 's'}` : '',
    evidence.progressReports ? `${evidence.progressReports} progress report${evidence.progressReports === 1 ? '' : 's'}` : '',
    evidence.moderatedTermGrades ? `${evidence.moderatedTermGrades} moderated term grade${evidence.moderatedTermGrades === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return `This learner has protected academic evidence (${parts.join(', ')}). Archive the account instead; recorded scores cannot be deleted.`;
}
