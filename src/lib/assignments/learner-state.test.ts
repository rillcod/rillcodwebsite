import { describe, expect, it } from 'vitest';
import { learnerSubmissionState, learnerSubmissionLabel } from './learner-state';

describe('learner submission read-model', () => {
  it.each(['submitted', 'late', 'resubmitted', 'pending_review', 'under_review'])('%s is waiting for the teacher, not missing work', status => {
    expect(learnerSubmissionState(status)).toBe('review');
  });
  it.each(['graded', 'moderated', 'published'])('%s is no longer outstanding', status => {
    expect(learnerSubmissionState(status)).toBe('complete');
  });
  it('keeps revisions actionable without exposing internal status names', () => {
    expect(learnerSubmissionState('returned_for_revision')).toBe('action');
    expect(learnerSubmissionLabel('returned_for_revision', true)).toBe('Changes requested');
    expect(learnerSubmissionState('unrecognised')).toBe('unknown');
  });
});
