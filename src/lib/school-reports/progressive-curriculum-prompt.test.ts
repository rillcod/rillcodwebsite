import { describe, expect, it } from 'vitest';
import {
  buildProgressiveExpansionContext,
  nationalTermArcLabel,
  progressiveCurriculumSystemRules,
  PROGRESSIVE_12_YEAR_SUMMARY,
} from './progressive-curriculum-prompt';

describe('progressive-curriculum-prompt', () => {
  it('states the 12-year zero-to-hero doctrine', () => {
    expect(PROGRESSIVE_12_YEAR_SUMMARY).toContain('12-year');
    expect(PROGRESSIVE_12_YEAR_SUMMARY.toLowerCase()).toContain('zero-to-hero');
  });

  it('forbids repetition in system rules', () => {
    const rules = progressiveCurriculumSystemRules(8).join('\n');
    expect(rules).toContain('NEVER repeat');
    expect(rules).toContain('EXACTLY 8');
  });

  it('maps national term arcs cyclically', () => {
    expect(nationalTermArcLabel(1)).toContain('foundations');
    expect(nationalTermArcLabel(2)).toContain('application');
    expect(nationalTermArcLabel(5)).toContain('application');
  });

  it('embeds anti-repetition context in expansion payloads', () => {
    const payload = buildProgressiveExpansionContext({
      courseTitle: 'Scratch',
      programme: 'Young Innovators',
      termNumber: 1,
      weekNumbers: [1, 2, 3],
      reachedTopics: ['Sprite motion intro'],
    });
    expect(payload.curriculumModel).toBe('rillcod_12_year_progressive_ladder');
    expect(String(payload.antiRepetitionRule)).toContain('Do not reuse');
    expect(payload.topicsAlreadyCovered).toEqual(['Sprite motion intro']);
  });
});
