import { getProgressionTermStatus, isLockedTerm } from './termStatus';

describe('progression term status', () => {
  it('defaults to draft when missing', () => {
    expect(getProgressionTermStatus({}, 1, 1)).toBe('draft');
  });

  it('returns explicit approved and locked statuses', () => {
    const planData = {
      progression: {
        generated_terms: {
          y1t1: { term_status: 'approved' },
          y1t2: { term_status: 'locked' },
        },
      },
    };
    expect(getProgressionTermStatus(planData, 1, 1)).toBe('approved');
    expect(getProgressionTermStatus(planData, 1, 2)).toBe('locked');
    expect(isLockedTerm(planData, 1, 2)).toBe(true);
  });

  it('treats unknown status as draft', () => {
    const planData = {
      progression: {
        generated_terms: {
          y2t3: { term_status: 'something_else' },
        },
      },
    };
    expect(getProgressionTermStatus(planData, 2, 3)).toBe('draft');
  });
});
