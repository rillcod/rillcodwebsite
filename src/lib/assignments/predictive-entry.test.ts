import { describe, expect, it } from 'vitest';
import { buildAssignmentEntrySuggestion, formatDatetimeLocal } from './predictive-entry';

describe('predictive assignment entry', () => {
  it('gives routine homework a one-week reviewable draft', () => {
    expect(buildAssignmentEntrySuggestion('homework', new Date(2026, 7, 10, 9, 30))).toEqual({
      dueDate: '2026-08-17T18:00',
      maxPoints: 20,
      multiStep: false,
    });
  });

  it('gives projects more time and enables progress evidence', () => {
    expect(buildAssignmentEntrySuggestion('project', new Date(2026, 7, 10, 9, 30))).toEqual({
      dueDate: '2026-08-24T18:00',
      maxPoints: 100,
      multiStep: true,
    });
  });

  it('moves weekend deadlines to Monday', () => {
    expect(buildAssignmentEntrySuggestion('discussion', new Date(2026, 7, 13, 9, 30)).dueDate)
      .toBe('2026-08-17T18:00');
  });

  it('uses the safe homework policy for an unknown type', () => {
    const suggestion = buildAssignmentEntrySuggestion('unknown', new Date(2026, 7, 10, 9, 30));
    expect(suggestion.maxPoints).toBe(20);
    expect(suggestion.multiStep).toBe(false);
  });

  it('formats stored deadlines for the teacher local-time input', () => {
    expect(formatDatetimeLocal(new Date(2026, 7, 10, 14, 5))).toBe('2026-08-10T14:05');
  });
});
