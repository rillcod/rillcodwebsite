import { describe, expect, it } from 'vitest';
import { resolveEffectiveScoreWeights, scoreWeightsFromPublishedComponents } from './grading-scheme';

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

  it('falls back to the canonical default when no policy matches', () => {
    const resolved = resolveEffectiveScoreWeights([
      { id: 'other', name: 'Other', school_id: 's2', components },
    ], { schoolId: 's1' });
    expect(resolved.scheme).toBeNull();
    expect(resolved.weights.theory).toBe(0.2);
  });
});
