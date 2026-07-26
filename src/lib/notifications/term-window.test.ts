import { describe, expect, it } from 'vitest';
import { resolveTermWindow, watToday } from './term-window';

// The real calendar shape from academic_terms: three terms a year with holiday gaps.
const TERMS = [
  { academic_year: '2025/2026', term_label: 'Second Term', start_date: '2026-01-08', end_date: '2026-04-15' },
  { academic_year: '2025/2026', term_label: 'Third Term', start_date: '2026-04-30', end_date: '2026-08-05' },
  { academic_year: '2026/2027', term_label: 'First Term', start_date: '2026-09-01', end_date: '2026-12-20' },
];

describe('resolveTermWindow', () => {
  it('reports in-term on a normal teaching day', () => {
    const w = resolveTermWindow(TERMS, '2026-07-26');
    expect(w.inTerm).toBe(true);
    expect(w.termLabel).toBe('Third Term');
    expect(w.academicYear).toBe('2025/2026');
  });

  it('treats the long August-September holiday as a break', () => {
    const w = resolveTermWindow(TERMS, '2026-08-20');
    expect(w.inTerm).toBe(false);
    expect(w.nextTermStarts).toBe('2026-09-01');
  });

  it('treats the short Easter gap between terms as a break', () => {
    const w = resolveTermWindow(TERMS, '2026-04-20');
    expect(w.inTerm).toBe(false);
    expect(w.nextTermStarts).toBe('2026-04-30');
  });

  it('counts the first and last day of term as in-term', () => {
    expect(resolveTermWindow(TERMS, '2026-04-30').inTerm).toBe(true);
    expect(resolveTermWindow(TERMS, '2026-08-05').inTerm).toBe(true);
  });

  it('counts the day after term ends as a break', () => {
    expect(resolveTermWindow(TERMS, '2026-08-06').inTerm).toBe(false);
  });

  it('has no next term after the last configured one', () => {
    const w = resolveTermWindow(TERMS, '2027-06-01');
    expect(w.inTerm).toBe(false);
    expect(w.nextTermStarts).toBeNull();
  });

  it('keeps sending when the calendar has no rows, rather than muting forever', () => {
    const w = resolveTermWindow([], '2026-07-26');
    expect(w.calendarMissing).toBe(true);
    expect(w.inTerm).toBe(true);
  });

  it('ignores rows with missing dates and still finds a dated term', () => {
    const w = resolveTermWindow(
      [{ academic_year: '2025/2026', term_label: 'Undated', start_date: null, end_date: null }, ...TERMS],
      '2026-07-26',
    );
    expect(w.inTerm).toBe(true);
    expect(w.termLabel).toBe('Third Term');
  });

  it('accepts full ISO timestamps as well as plain dates', () => {
    const iso = TERMS.map((t) => ({
      ...t,
      start_date: `${t.start_date}T00:00:00.000Z`,
      end_date: `${t.end_date}T00:00:00.000Z`,
    }));
    expect(resolveTermWindow(iso, '2026-07-26').inTerm).toBe(true);
    expect(resolveTermWindow(iso, '2026-08-20').inTerm).toBe(false);
  });

  it('uses WAT, so a late-evening UTC run does not read as the previous day', () => {
    // 23:30 UTC on 31 Aug is already 1 Sep in Lagos — the day term resumes.
    expect(watToday(new Date('2026-08-31T23:30:00Z'))).toBe('2026-09-01');
    expect(resolveTermWindow(TERMS, watToday(new Date('2026-08-31T23:30:00Z'))).inTerm).toBe(true);
  });
});
