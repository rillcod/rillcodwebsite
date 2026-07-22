import { describe, expect, it } from 'vitest';
import {
  fallbackLeadershipReportStory,
  normalizeLeadershipReportStory,
} from './leadership-story';

describe('leadership report story', () => {
  it('limits output to two sentences', () => {
    const text =
      'First sentence about the term. Second sentence about partnership. Third sentence should be dropped.';
    expect(normalizeLeadershipReportStory(text)).toBe(
      'First sentence about the term. Second sentence about partnership.',
    );
  });

  it('strips percentages and learner counts', () => {
    const text =
      'During First Term, 42 learners averaged 78% across Scratch and Python. The school showed strong partnership spirit.';
    const result = normalizeLeadershipReportStory(text);
    expect(result).not.toMatch(/%/);
    expect(result).not.toMatch(/\b42\b/);
    expect(result).toContain('partnership');
  });

  it('builds a short fallback story without statistics', () => {
    const story = fallbackLeadershipReportStory({
      school: { name: 'Grace Academy' },
      period: { termLabel: 'First Term 2025/2026' },
      curriculum: { courses: [{ programme: 'Young Innovators', course: 'Scratch' }] },
      schoolProgrammes: [],
    } as any);
    expect(story).toContain('Grace Academy');
    expect(story).not.toMatch(/%/);
    expect(story?.split(/[.!?]+/).filter(Boolean).length).toBeLessThanOrEqual(2);
  });
});
