import { describe, expect, it } from 'vitest';
import { evaluateAcademicEvidence, humanAcademicStatus } from './quality';

describe('academic evidence quality', () => {
  it('allows a result backed by linked evidence', () => {
    expect(evaluateAcademicEvidence({
      evidenceCount: 4,
      officiallyLinkedCount: 4,
      plannedDeliveryCount: 8,
      deliveredCount: 6,
      hasOfficialDirection: true,
    })).toMatchObject({ status: 'ready', curriculumCoverage: 100, teachingDelivery: 75 });
  });

  it('blocks invented or directionless results', () => {
    const result = evaluateAcademicEvidence({
      evidenceCount: 0,
      officiallyLinkedCount: 0,
      plannedDeliveryCount: 0,
      deliveredCount: 0,
      hasOfficialDirection: false,
    });
    expect(result.status).toBe('blocked');
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'missing_official_direction',
      'no_assessment_evidence',
    ]);
  });

  it('humanises internal QA states', () => {
    expect(humanAcademicStatus('needs_attention')).toBe('Needs a quick review');
  });
});
