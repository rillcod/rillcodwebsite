type AnyAdmin = {
  from: (table: string) => any;
};

export type ProtectedAcademicEvidence = {
  assignmentScores: number;
  cbtScores: number;
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
  userId: string,
): Promise<ProtectedAcademicEvidence> {
  const [assignmentResult, cbtResult, reportResult, enrollmentResult] = await Promise.all([
    admin
      .from('assignment_submissions')
      .select('id', { count: 'exact', head: true })
      .or(`portal_user_id.eq.${userId},user_id.eq.${userId},student_id.eq.${userId}`)
      .not('grade', 'is', null),
    admin
      .from('cbt_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or('score.not.is.null,manual_scores.not.is.null'),
    admin
      .from('student_progress_reports')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', userId),
    admin.from('enrollments').select('id').eq('user_id', userId),
  ]);

  const sourceError = assignmentResult.error
    || cbtResult.error
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

  const assignmentScores = assignmentResult.count ?? 0;
  const cbtScores = cbtResult.count ?? 0;
  const progressReports = reportResult.count ?? 0;
  const moderatedTermGrades = termGradeResult.count ?? 0;
  return {
    assignmentScores,
    cbtScores,
    progressReports,
    moderatedTermGrades,
    total: assignmentScores + cbtScores + progressReports + moderatedTermGrades,
  };
}

export function protectedAcademicEvidenceMessage(evidence: ProtectedAcademicEvidence): string {
  const parts = [
    evidence.assignmentScores ? `${evidence.assignmentScores} graded assignment${evidence.assignmentScores === 1 ? '' : 's'}` : '',
    evidence.cbtScores ? `${evidence.cbtScores} CBT result${evidence.cbtScores === 1 ? '' : 's'}` : '',
    evidence.progressReports ? `${evidence.progressReports} progress report${evidence.progressReports === 1 ? '' : 's'}` : '',
    evidence.moderatedTermGrades ? `${evidence.moderatedTermGrades} moderated term grade${evidence.moderatedTermGrades === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return `This learner has protected academic evidence (${parts.join(', ')}). Archive the account instead; recorded scores cannot be deleted.`;
}
