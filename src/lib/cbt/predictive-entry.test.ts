import { describe, expect, it } from 'vitest';
import { buildCbtEntrySuggestion } from './predictive-entry';

describe('predictive CBT authoring defaults', () => {
  it('creates a short, auto-gradable evaluation draft', () => {
    expect(buildCbtEntrySuggestion('evaluation')).toMatchObject({
      minimumQuestions: 5,
      maximumQuestions: 20,
      mcqCount: 10,
      theoryCount: 0,
      durationMinutes: 20,
      passingScore: 60,
      accessWindowMinutes: 35,
    });
  });

  it('creates a balanced main examination draft', () => {
    expect(buildCbtEntrySuggestion('examination')).toMatchObject({
      minimumQuestions: 10,
      maximumQuestions: 40,
      mcqCount: 20,
      theoryCount: 5,
      durationMinutes: 70,
      passingScore: 70,
      accessWindowMinutes: 85,
    });
  });

  it('recommends duration from the teacher question mix within safe boundaries', () => {
    expect(buildCbtEntrySuggestion('evaluation', { mcqCount: 5, theoryCount: 5 }).durationMinutes).toBe(35);
    expect(buildCbtEntrySuggestion('examination', { mcqCount: 40, theoryCount: 40 })).toMatchObject({
      mcqCount: 40,
      theoryCount: 40,
      durationMinutes: 120,
    });
  });
});
