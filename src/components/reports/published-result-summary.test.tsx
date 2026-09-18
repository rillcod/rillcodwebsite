import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublishedResultSummary } from './PublishedResultSummary';

describe('published result summary', () => {
  it.each(['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9', 'A'])('shows saved %s without recalculating or replacing it', (grade) => {
    const html = renderToStaticMarkup(<PublishedResultSummary report={{ is_published: true, overall_grade: grade, overall_score: 72 }} />);
    expect(html).toContain(`>${grade}</dd>`);
    expect(html).toContain('Published grade');
    expect(html).toContain('72%');
  });
  it('retains a recorded zero', () => {
    expect(renderToStaticMarkup(<PublishedResultSummary report={{ is_published: true, overall_grade: 'F9', overall_score: 0 }} />)).toContain('0%');
  });
  it('does not invent a grade or turn a missing score into zero', () => {
    const html = renderToStaticMarkup(<PublishedResultSummary report={{ is_published: true }} />);
    expect(html).toContain('Not recorded');
    expect(html).not.toContain('0%');
    expect(html).not.toContain('F9');
  });
  it('does not label a draft as a published result', () => {
    expect(renderToStaticMarkup(<PublishedResultSummary report={{ is_published: false, overall_grade: 'A1' }} />)).toBe('');
  });
});
