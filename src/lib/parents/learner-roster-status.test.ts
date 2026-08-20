import { describe, expect, it } from 'vitest';
import {
  learnerDepartedOnClassRoster,
  parentLearnerEnrollmentFields,
} from '@/lib/parents/learner-roster-status';

describe('parentLearnerEnrollmentFields', () => {
  it('shows inactive when roster is withdrawn even if registry is active', () => {
    const fields = parentLearnerEnrollmentFields({
      studentStatus: 'active',
      rosterInactive: true,
    });
    expect(fields.is_enrollment_active).toBe(false);
    expect(fields.enrollment_label).toBe('Inactive');
  });

  it('shows registry label when roster is fine', () => {
    const fields = parentLearnerEnrollmentFields({
      studentStatus: 'partially_paid',
      rosterInactive: false,
    });
    expect(fields.is_enrollment_active).toBe(true);
    expect(fields.enrollment_label).toBe('Partially paid');
  });
});

describe('learnerDepartedOnClassRoster', () => {
  it('detects departed status for assigned class only', () => {
    const rows = [
      { student_id: 's1', class_id: 'c1', status: 'withdrawn' },
      { student_id: 's1', class_id: 'c2', status: 'active' },
    ];
    expect(learnerDepartedOnClassRoster('s1', 'c1', rows)).toBe(true);
    expect(learnerDepartedOnClassRoster('s1', 'c2', rows)).toBe(false);
  });
});
