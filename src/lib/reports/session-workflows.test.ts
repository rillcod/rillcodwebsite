import { describe, expect, it } from 'vitest';
import {
  filterReportsByRosterSession,
  gradingEvidenceSession,
  resolveWriteHydrateSession,
  rollRosterSessionIfStale,
  rosterSessionQueryFilters,
} from './session-workflows';

describe('session-workflows — Write Prev/Next', () => {
  it('adopts Third Term report session when switching learners mid-session', () => {
    const next = resolveWriteHydrateSession({
      hydratedReport: { id: 'spr-1', report_term: 'Third Term', report_period: '2024/2025' },
      prevSession: { report_term: 'First Term', report_period: '2025/2026' },
      live: { term: 'First Term', period: '2025/2026' },
    });
    expect(next).toEqual({ report_term: 'Third Term', report_period: '2024/2025' });
  });

  it('does not roll saved report session forward to live calendar', () => {
    const next = resolveWriteHydrateSession({
      hydratedReport: { id: 'spr-old', report_term: 'Third Term', report_period: '2024/2025' },
      prevSession: { report_term: 'First Term', report_period: '2025/2026' },
      live: { term: 'First Term', period: '2025/2026' },
    });
    expect(next.report_term).toBe('Third Term');
  });

  it('rolls only unsaved stale drafts forward when not keeping requested session', () => {
    const next = resolveWriteHydrateSession({
      hydratedReport: { report_term: 'Second Term', report_period: '2024/2025' },
      prevSession: { report_term: 'Second Term', report_period: '2024/2025' },
      live: { term: 'Third Term', period: '2024/2025' },
    });
    expect(next).toEqual({ report_term: 'Third Term', report_period: '2024/2025' });
  });
});

describe('session-workflows — Publish roster', () => {
  const rows = [
    { id: 'a', report_term: 'Third Term', report_period: '2024/2025' },
    { id: 'b', report_term: 'First Term', report_period: '2025/2026' },
  ];

  it('filters history to roster session only', () => {
    const filtered = filterReportsByRosterSession(rows, {
      term: 'First Term',
      period: '2025/2026',
    });
    expect(filtered.map((r) => r.id)).toEqual(['b']);
  });

  it('returns all rows when roster session is unset', () => {
    expect(filterReportsByRosterSession(rows, null)).toHaveLength(2);
  });

  it('builds query filters for API calls', () => {
    expect(rosterSessionQueryFilters({ term: 'First Term', period: '2025/2026' })).toEqual({
      report_term: 'First Term',
      report_period: '2025/2026',
    });
  });
});

describe('session-workflows — calendar roll', () => {
  it('advances stale roster and records previous label', () => {
    const { session, rolledFrom } = rollRosterSessionIfStale(
      { term: 'Second Term', period: '2024/2025' },
      { term: 'Third Term', period: '2024/2025' },
    );
    expect(session).toEqual({ term: 'Third Term', period: '2024/2025' });
    expect(rolledFrom).toEqual({ term: 'Second Term', period: '2024/2025' });
  });

  it('leaves current session when not stale', () => {
    const { session, rolledFrom } = rollRosterSessionIfStale(
      { term: 'Third Term', period: '2024/2025' },
      { term: 'Third Term', period: '2024/2025' },
    );
    expect(session.term).toBe('Third Term');
    expect(rolledFrom).toBeNull();
  });
});

describe('session-workflows — grades to report pipeline', () => {
  it('gradingEvidenceSession uses API term label when scoped', () => {
    expect(gradingEvidenceSession({ term_label: 'Third Term' }).term).toBe('Third Term');
  });
});
