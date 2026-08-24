import { describe, expect, it } from 'vitest';
import {
  resolveEffectiveScoreWeights,
  scoreWeightsFromPublishedComponents,
  scoreWeightsFromReportMetrics,
  scoreWeightPercent,
} from './grading-scheme';

const components = { theory: 20, classwork: 10, practical: 25, assignments: 20, attendance: 10, assessment: 15 };

describe('published grading scheme selection', () => {
  it('converts a validated 100% scheme to calculator weights', () => {
    expect(scoreWeightsFromPublishedComponents(components)?.practical).toBe(0.25);
    expect(scoreWeightsFromPublishedComponents({ ...components, theory: 10 })).toBeNull();
  });

  it('uses the most specific matching scheme', () => {
    const resolved = resolveEffectiveScoreWeights([
      { id: 'global', name: 'Global', components },
      { id: 'school', name: 'School', school_id: 's1', components: { ...components, theory: 30, practical: 15 } },
      { id: 'other', name: 'Other', school_id: 's2', components },
    ], { schoolId: 's1' });
    expect(resolved.scheme?.id).toBe('school');
    expect(resolved.weights.theory).toBe(0.3);
  });

  it('matches the database precedence when scope counts tie', () => {
    const resolved = resolveEffectiveScoreWeights([
      { id: 'course', name: 'Course', course_id: 'c1', components },
      { id: 'school', name: 'School', school_id: 's1', components: { ...components, theory: 30, practical: 15 } },
      { id: 'term', name: 'Term', academic_term_id: 't1', components },
    ], { schoolId: 's1', courseId: 'c1', termId: 't1' });

    expect(resolved.scheme?.id).toBe('school');
    expect(resolved.weights.theory).toBe(0.3);
  });

  it('falls back to the canonical default when no policy matches', () => {
    const resolved = resolveEffectiveScoreWeights([
      { id: 'other', name: 'Other', school_id: 's2', components },
    ], { schoolId: 's1' });
    expect(resolved.scheme).toBeNull();
    expect(resolved.weights.theory).toBe(0.2);
  });

  it('restores a report weighting snapshot in fractions or percentages', () => {
    expect(scoreWeightsFromReportMetrics({
      score_weights: { theory: 0.3, classwork: 0.1, practical: 0.15, assignments: 0.2, attendance: 0.1, assessment: 0.15 },
    }).theory).toBe(0.3);
    expect(scoreWeightsFromReportMetrics({ score_weights: components }).practical).toBe(0.25);
  });

  it('rejects malformed report snapshots and uses the canonical fallback', () => {
    expect(scoreWeightsFromReportMetrics({ score_weights: { theory: 1 } }).theory).toBe(0.2);
  });

  it('preserves fractional percentages in report labels', () => {
    expect(scoreWeightPercent({ ...scoreWeightsFromPublishedComponents(components)!, theory: 0.205 }, 'theory')).toBe(20.5);
  });
});
