import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportSessionContextBanner } from './ReportSessionContextBanner';

/**
 * This banner used to render up to four stacked blocks. On a phone that filled the
 * screen before a teacher could reach a single score, and a wall of banners reads as
 * noise — so the one line that matters, which term the report saves to, was lost
 * among the ones that do not.
 *
 * The rule these hold: the session stays visible always, everything else collapses.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const panels = (markup: string) => (markup.match(/rounded-xl border/g) ?? []).length;

const thisTerm = { term: 'First Term', period: '2026/2027' };
const otherTerm = { term: 'Third Term', period: '2025/2026' };

describe('report session context banner', () => {
  it('always shows which session the report saves to', () => {
    const markup = html(
      <ReportSessionContextBanner context="write" workingSession={thisTerm} showCalendarNow={false} />,
    );
    expect(markup).toContain('Reports you save here belong to');
    expect(markup).toContain('First Term');
    expect(markup).toContain('2026/2027');
  });

  it('renders a single panel when there is nothing to warn about', () => {
    const markup = html(
      <ReportSessionContextBanner context="write" workingSession={thisTerm} showCalendarNow={false} />,
    );
    expect(panels(markup)).toBe(1);
    expect(markup).not.toContain('<details');
  });

  it('collapses the notes instead of stacking a panel for each', () => {
    const markup = html(
      <ReportSessionContextBanner
        context="write"
        workingSession={thisTerm}
        classSession={otherTerm}
        reportSession={otherTerm}
        showCalendarNow
      />,
    );
    // One panel, however many notes there are.
    expect(panels(markup)).toBe(1);
    expect(markup).toContain('<details');
    expect(markup).toMatch(/\d+ notes about this session/);
  });

  it('says how many notes there are, so nothing looks hidden', () => {
    const one = html(
      <ReportSessionContextBanner
        context="write"
        workingSession={thisTerm}
        classSession={otherTerm}
        showCalendarNow={false}
      />,
    );
    expect(one).toContain('1 note about this session');
    expect(one).not.toContain('1 notes');
  });

  it('keeps the note text in the markup, so it is collapsed and not dropped', () => {
    const markup = html(
      <ReportSessionContextBanner
        context="write"
        workingSession={thisTerm}
        classSession={otherTerm}
        showCalendarNow={false}
      />,
    );
    // The warning a teacher must eventually read is still there to open.
    expect(markup).toContain('This class is now assigned to');
    expect(markup).toContain('Third Term');
  });

  it('does not invent a note when the class matches the working session', () => {
    const markup = html(
      <ReportSessionContextBanner
        context="write"
        workingSession={thisTerm}
        classSession={thisTerm}
        showCalendarNow={false}
      />,
    );
    expect(markup).not.toContain('<details');
  });

  it('behaves the same on the publish screen', () => {
    const markup = html(
      <ReportSessionContextBanner
        context="publish"
        workingSession={thisTerm}
        reportSession={thisTerm}
        rosterSession={otherTerm}
        showCalendarNow={false}
      />,
    );
    expect(panels(markup)).toBe(1);
    expect(markup).toContain('roster filter');
  });
});
