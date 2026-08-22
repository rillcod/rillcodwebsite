export type AssignmentScoreEvidence = {
  grade?: unknown;
  weighted_score?: unknown;
  graded_at?: unknown;
  graded_by?: unknown;
  grading_mode?: unknown;
  status?: unknown;
};

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

export type ProgressReportEvidence = {
  is_published?: unknown;
  published_at?: unknown;
  overall_score?: unknown;
  participation_score?: unknown;
  attendance_score?: unknown;
  theory_score?: unknown;
  practical_score?: unknown;
};

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
