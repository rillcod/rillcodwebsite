/** Read-model for the existing submission lifecycle; never changes submission/grade authority. */
export function learnerSubmissionState(status?: string | null): 'action' | 'review' | 'complete' | 'unknown' {
  if (!status || ['missing', 'draft', 'pending', 'returned_for_revision'].includes(status)) return 'action';
  if (['submitted', 'late', 'resubmitted', 'pending_review', 'under_review'].includes(status)) return 'review';
  if (['graded', 'moderated', 'published'].includes(status)) return 'complete';
  return 'unknown';
}

export function learnerSubmissionLabel(status?: string | null, overdue = false): string {
  if (status === 'returned_for_revision') return 'Changes requested';
  if (status === 'draft') return 'Continue your draft';
  const state = learnerSubmissionState(status);
  if (state === 'action') return overdue ? 'Overdue' : 'Not started';
  if (state === 'review') return status === 'late' ? 'Submitted late · awaiting review' : 'Awaiting teacher feedback';
  if (state === 'complete') return 'Marked';
  return 'Open to check status';
}
