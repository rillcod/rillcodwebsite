import { describe, expect, it } from 'vitest';
import { sanitizeTeachingPattern, teachingPatternAttemptsAcademicChange } from './teachingPattern';

describe('teaching patterns', () => {
  it('keeps reusable delivery choices without copying the curriculum core', () => {
    expect(sanitizeTeachingPattern({
      activities: [' Pair programming '],
      materials: ['Robot kit'],
      topic: 'Replace official topic',
      weeks: [{ week: 1 }],
    })).toEqual({ activities: ['Pair programming'], materials: ['Robot kit'] });
  });

  it('detects attempts to change the academic direction', () => {
    expect(teachingPatternAttemptsAcademicChange({ activities: ['Build'], objectives: ['Changed'] })).toBe(true);
    expect(teachingPatternAttemptsAcademicChange({ activities: ['Build'], teacher_notes: 'Support pairs' })).toBe(false);
  });
});

