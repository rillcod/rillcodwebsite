import { describe, expect, it } from 'vitest';
import {
  dedupeStringList,
  resolveCommunityMessageForReport,
  textsSubstantiallyOverlap,
} from './report-content-dedup';

describe('report-content-dedup', () => {
  it('detects overlapping prose', () => {
    const a = 'Grace Academy recorded 20 active learners with strong Scratch delivery this term.';
    const b = 'Grace Academy recorded 20 active learners with strong delivery this term in partnership with Rillcod.';
    expect(textsSubstantiallyOverlap(a, b)).toBe(true);
  });

  it('does not fall back to executive summary for community message', () => {
    const executive = 'Grace Academy recorded 20 active learners, an average score of 72%.';
    expect(resolveCommunityMessageForReport(undefined, executive)).toBe('');
    expect(resolveCommunityMessageForReport(executive, executive)).toBe('');
  });

  it('keeps distinct community copy', () => {
    const community = 'Dear Grace Academy community, thank you for walking this term with us.';
    const executive = 'Grace Academy recorded 20 active learners, an average score of 72%.';
    expect(resolveCommunityMessageForReport(community, executive)).toBe(community);
  });

  it('dedupes list items against a corpus', () => {
    const corpus = ['Continue Python from Module 4 next term.'];
    const items = [
      'Continue Python from Module 4 next term.',
      'Schedule a joint review with school leadership early next term.',
    ];
    expect(dedupeStringList(items, corpus)).toEqual([
      'Schedule a joint review with school leadership early next term.',
    ]);
  });
});
