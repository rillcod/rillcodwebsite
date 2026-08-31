import { describe, expect, it } from 'vitest';
import {
  assessmentBelongsToClass,
} from './class-assessment-workspace';
import { assessmentExperience } from './assessment-experience';

describe('class assessment workspace', () => {
  it('explains optional and compulsory result ownership in customer language', () => {
    expect(assessmentExperience({ standing: 'optional', usesHostEvaluation: false })).toMatchObject({
      standingLabel: 'Optional programme',
      resultLabel: 'Rillcod-managed results',
      resultsAction: 'Open Rillcod results',
    });
    expect(assessmentExperience({ standing: 'compulsory', usesHostEvaluation: true })).toMatchObject({
      standingLabel: 'Compulsory subject',
      resultLabel: 'School examination results',
      resultsAction: 'Open school results',
    });
  });

  it('keeps the canonical class column ahead of stale compatibility metadata', () => {
    expect(assessmentBelongsToClass({ class_id: 'class-1', metadata: { target_class_id: 'class-2' } }, 'class-1')).toBe(true);
    expect(assessmentBelongsToClass({ class_id: 'class-1', metadata: { target_class_id: 'class-2' } }, 'class-2')).toBe(false);
    expect(assessmentBelongsToClass({ class_id: null, metadata: { target_class_id: 'class-2' } }, 'class-2')).toBe(true);
  });
});
