export type AssignmentScoreEvidence = {
  id?: unknown;
  submission_text?: unknown;
  file_url?: unknown;
  submitted_at?: unknown;
  answers?: unknown;
  grade?: unknown;
  weighted_score?: unknown;
  graded_at?: unknown;
  graded_by?: unknown;
  grading_mode?: unknown;
  status?: unknown;
};

/**
 * Submitted learner work is irreplaceable even before a teacher records a mark.
 * Empty setup rows may still be cleaned; answers, files, text, a submission stamp,
 * or a submitted/graded state must be retained and corrected through workflow.
 */
export function hasLearnerAssignmentEvidence(row: AssignmentScoreEvidence | null | undefined): boolean {
  if (!row) return false;
  const answers = row.answers;
  const hasAnswers = Array.isArray(answers)
    ? answers.length > 0
    : Boolean(answers && typeof answers === 'object' && Object.keys(answers as object).length > 0);
  return hasProtectedAssignmentScoreEvidence(row)
    || Boolean(row.submitted_at)
    || Boolean(typeof row.submission_text === 'string' && row.submission_text.trim())
    || Boolean(row.file_url)
    || hasAnswers
    || ['submitted', 'graded', 'returned', 'approved'].includes(String(row.status ?? '').toLowerCase());
}

/**
 * A submission becomes an academic record as soon as a mark or grading stamp
 * exists. These records must be corrected through grading, never hard-deleted.
 */
export function hasProtectedAssignmentScoreEvidence(row: AssignmentScoreEvidence | null | undefined): boolean {
  if (!row) return false;
  return row.grade != null
    || row.weighted_score != null
    || Boolean(row.graded_at)
    || Boolean(row.graded_by)
    || String(row.status ?? '').toLowerCase() === 'graded'
    || String(row.grading_mode ?? '').toLowerCase() === 'manual';
}

export type CbtAttemptEvidence = {
  id?: unknown;
  answers?: unknown;
  score?: unknown;
  manual_scores?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  status?: unknown;
};

/** A CBT session is learner evidence even before it receives a final mark. */
export function hasCbtAttemptEvidence(row: CbtAttemptEvidence | null | undefined): boolean {
  if (!row) return false;
  return Boolean(row.id)
    || row.score != null
    || Boolean(row.start_time)
    || Boolean(row.end_time)
    || Boolean(row.answers)
    || Boolean(row.manual_scores)
    || Boolean(row.status);
}

export type WrittenExamAttemptEvidence = {
  id?: unknown;
  answers?: unknown;
  score?: unknown;
  percentage?: unknown;
  started_at?: unknown;
  submitted_at?: unknown;
  status?: unknown;
};

/** A started written paper is protected learner work, even before moderation. */
export function hasWrittenExamAttemptEvidence(
  row: WrittenExamAttemptEvidence | null | undefined,
): boolean {
  if (!row) return false;
  return Boolean(row.id)
    || row.score != null
    || row.percentage != null
    || Boolean(row.started_at)
    || Boolean(row.submitted_at)
    || Boolean(row.answers)
    || Boolean(row.status);
}

export type ProgressReportEvidence = {
  is_published?: unknown;
  published_at?: unknown;
  overall_score?: unknown;
  participation_score?: unknown;
  attendance_score?: unknown;
  theory_score?: unknown;
  practical_score?: unknown;
};

export type CertificateAwardEvidence = {
  portal_user_id?: unknown;
  verification_code?: unknown;
  pdf_url?: unknown;
  certificate_number?: unknown;
  issued_date?: unknown;
  completion_status?: unknown;
};

export function certificateWasAwarded(row: CertificateAwardEvidence | null | undefined): boolean {
  if (!row) return false;
  return Boolean(row.portal_user_id)
    || Boolean(row.verification_code)
    || Boolean(row.pdf_url)
    || Boolean(row.certificate_number)
    || Boolean(row.issued_date);
}

export function certificateIsRevoked(row: CertificateAwardEvidence | null | undefined): boolean {
  return String(row?.completion_status ?? '').toLowerCase() === 'revoked';
}

/** Narrative-only drafts remain cleanable while published/scored reports do not. */
export function hasProtectedProgressReportEvidence(row: ProgressReportEvidence | null | undefined): boolean {
  if (!row) return false;
  return row.is_published === true
    || Boolean(row.published_at)
    || row.overall_score != null
    || row.participation_score != null
    || row.attendance_score != null
    || row.theory_score != null
    || row.practical_score != null;
}
