import { describe, expect, it } from 'vitest';
import { inspectCurriculumQuality } from './qualityGate';

describe('inspectCurriculumQuality', () => {
  it('passes a structurally sound curriculum and keeps optional guidance as warnings', () => {
    const result = inspectCurriculumQuality({
      overview: 'A progressive coding and robotics pathway.',
      terms: [{ year: 1, term: 1, weeks: [{ week: 1, topic: 'Computational thinking', subtopics: [] }] }],
    });
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings[0]?.message).toContain('focus points');
  });

  it('blocks missing topics and duplicate programme positions', () => {
    const result = inspectCurriculumQuality({
      terms: [{ term: 1, weeks: [
        { week: 1, topic: '', subtopics: ['Sequence'] },
        { week: 1, topic: 'Algorithms', subtopics: ['Steps'] },
      ] }],
    });
    expect(result.passed).toBe(false);
    expect(result.errors.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'Add a clear teaching topic.',
      'This week position is duplicated.',
    ]));
  });

  it('does not treat a school starting in Third Term Week 3 as a curriculum defect', () => {
    const result = inspectCurriculumQuality({
      overview: 'Canonical programme sequence.',
      terms: [{ term: 1, weeks: [{ week: 1, topic: 'Welcome to coding', subtopics: ['Safety'] }] }],
      metadata: { delivery_entry: { term: 3, week: 3 } },
    });
    expect(result.passed).toBe(true);
  });
});
