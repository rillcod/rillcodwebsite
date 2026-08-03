import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMEZONE,
  MAX_OCCURRENCES_PER_RUN,
  describePattern,
  generateOccurrences,
  parseCalendarDate,
  parseStartTime,
  resolveSeriesWindow,
  zonedWallClockToUtc,
} from './recurrence';

// 2026-08-03 is a Monday. Africa/Lagos is UTC+1 year-round (no DST).
const MON = '2026-08-03';
const iso = (d: Date) => d.toISOString();

describe('zonedWallClockToUtc', () => {
  it('keeps the school\'s wall clock, not the server\'s', () => {
    // 20:00 in Lagos is 19:00Z. If this ever drifts, every class materialises at the
    // wrong hour and nobody notices until the room is empty.
    const at = zonedWallClockToUtc({ year: 2026, month: 8, day: 3 }, 20, 0, 'Africa/Lagos');
    expect(iso(at)).toBe('2026-08-03T19:00:00.000Z');
  });

  it('handles a zone that is behind UTC', () => {
    const at = zonedWallClockToUtc({ year: 2026, month: 8, day: 3 }, 20, 0, 'America/New_York');
    expect(iso(at)).toBe('2026-08-04T00:00:00.000Z');   // EDT, UTC-4
  });

  it('resolves the same wall clock either side of a DST change', () => {
    // London: BST (UTC+1) in August, GMT (UTC+0) in December. 20:00 local both times.
    expect(iso(zonedWallClockToUtc({ year: 2026, month: 8, day: 3 }, 20, 0, 'Europe/London')))
      .toBe('2026-08-03T19:00:00.000Z');
    expect(iso(zonedWallClockToUtc({ year: 2026, month: 12, day: 3 }, 20, 0, 'Europe/London')))
      .toBe('2026-12-03T20:00:00.000Z');
  });

  it('handles midnight without wrapping to the wrong day', () => {
    expect(iso(zonedWallClockToUtc({ year: 2026, month: 8, day: 3 }, 0, 0, 'Africa/Lagos')))
      .toBe('2026-08-02T23:00:00.000Z');
  });
});

describe('parseStartTime', () => {
  it('accepts a 24h wall clock', () => {
    expect(parseStartTime('20:00')).toEqual({ hours: 20, minutes: 0 });
    expect(parseStartTime('00:00')).toEqual({ hours: 0, minutes: 0 });
    expect(parseStartTime('23:59')).toEqual({ hours: 23, minutes: 59 });
  });

  it('returns null instead of throwing — one bad row must not kill the cron', () => {
    for (const bad of ['24:00', '8pm', '7:5', '', null, undefined, '25:61']) {
      expect(parseStartTime(bad as any)).toBeNull();
    }
  });
});

describe('parseCalendarDate', () => {
  it('reads a date or a full timestamp', () => {
    expect(parseCalendarDate('2026-08-03')).toEqual({ year: 2026, month: 8, day: 3 });
    expect(parseCalendarDate('2026-08-03T10:00:00Z')).toEqual({ year: 2026, month: 8, day: 3 });
  });
  it('rejects rubbish', () => {
    for (const bad of ['03/08/2026', 'soon', '', null]) expect(parseCalendarDate(bad as any)).toBeNull();
  });
});

describe('resolveSeriesWindow', () => {
  it('uses the academic term for a regular school programme', () => {
    expect(resolveSeriesWindow({ term_start: '2026-09-01', term_end: '2026-12-20' })).toEqual({
      start: { year: 2026, month: 9, day: 1 },
      end: { year: 2026, month: 12, day: 20 },
    });
  });

  it('uses explicit dates for a special programme with its own calendar', () => {
    // Summer school has no term — this is the path that makes that work.
    expect(resolveSeriesWindow({ starts_on: '2026-07-01', ends_on: '2026-08-28' })).toEqual({
      start: { year: 2026, month: 7, day: 1 },
      end: { year: 2026, month: 8, day: 28 },
    });
  });

  it('intersects the two rather than letting a series spill past its term', () => {
    const w = resolveSeriesWindow({
      term_start: '2026-09-01', term_end: '2026-12-20',
      starts_on: '2026-10-01', ends_on: '2027-03-01',
    });
    expect(w).toEqual({ start: { year: 2026, month: 10, day: 1 }, end: { year: 2026, month: 12, day: 20 } });
  });

  it('refuses an unbounded series', () => {
    // The DB CHECK requires term_id or ends_on; this is the code-side half of that promise.
    expect(resolveSeriesWindow({ starts_on: '2026-07-01' })).toBeNull();
    expect(resolveSeriesWindow({})).toBeNull();
  });

  it('returns null when the constraints cannot overlap', () => {
    expect(resolveSeriesWindow({ term_start: '2026-09-01', term_end: '2026-12-20', starts_on: '2027-01-01', ends_on: '2027-02-01' })).toBeNull();
  });
});

describe('generateOccurrences', () => {
  const termWindow = { starts_on: MON, ends_on: '2026-08-31' };

  it('generates Mon/Tue/Thu at 20:00 Lagos and nothing else', () => {
    const out = generateOccurrences(
      { weekdays: [1, 2, 4], start_time: '20:00', timezone: DEFAULT_TIMEZONE },
      termWindow,
      { from: new Date('2026-08-03T00:00:00Z'), until: new Date('2026-08-10T00:00:00Z') },
    );
    expect(out.map(iso)).toEqual([
      '2026-08-03T19:00:00.000Z',  // Mon
      '2026-08-04T19:00:00.000Z',  // Tue
      '2026-08-06T19:00:00.000Z',  // Thu
    ]);
  });

  it('generates every day when all seven are selected', () => {
    const out = generateOccurrences(
      { weekdays: [0, 1, 2, 3, 4, 5, 6], start_time: '20:00' },
      termWindow,
      { from: new Date('2026-08-03T00:00:00Z'), until: new Date('2026-08-09T23:59:59Z') },
    );
    expect(out).toHaveLength(7);
  });

  it('never generates outside the window, even when the horizon is wider', () => {
    const out = generateOccurrences(
      { weekdays: [1], start_time: '20:00' },
      { starts_on: MON, ends_on: '2026-08-17' },
      { from: new Date('2026-08-01T00:00:00Z'), until: new Date('2026-12-01T00:00:00Z') },
    );
    expect(out.map(iso)).toEqual([
      '2026-08-03T19:00:00.000Z',
      '2026-08-10T19:00:00.000Z',
      '2026-08-17T19:00:00.000Z',
    ]);
  });

  it('skips occurrences already in the past — the cron must not backfill', () => {
    const out = generateOccurrences(
      { weekdays: [1, 2, 4], start_time: '20:00' },
      termWindow,
      { from: new Date('2026-08-05T00:00:00Z'), until: new Date('2026-08-10T00:00:00Z') },
    );
    expect(out.map(iso)).toEqual(['2026-08-06T19:00:00.000Z']);
  });

  it('caps a run so a misconfigured series cannot flood the calendar', () => {
    const out = generateOccurrences(
      { weekdays: [0, 1, 2, 3, 4, 5, 6], start_time: '20:00' },
      { starts_on: '2026-01-01', ends_on: '2030-01-01' },
      { from: new Date('2026-01-01T00:00:00Z'), until: new Date('2030-01-01T00:00:00Z') },
    );
    expect(out.length).toBeLessThanOrEqual(MAX_OCCURRENCES_PER_RUN);
  });

  it('yields nothing for an unusable pattern rather than throwing', () => {
    const base = { from: new Date('2026-08-03T00:00:00Z'), until: new Date('2026-09-03T00:00:00Z') };
    expect(generateOccurrences({ weekdays: [], start_time: '20:00' }, termWindow, base)).toEqual([]);
    expect(generateOccurrences({ weekdays: [1], start_time: 'nope' }, termWindow, base)).toEqual([]);
    expect(generateOccurrences({ weekdays: [9], start_time: '20:00' }, termWindow, base)).toEqual([]);
    expect(generateOccurrences({ weekdays: [1], start_time: '20:00' }, { starts_on: MON }, base)).toEqual([]);
  });

  it('is stable across runs — the same inputs give the same instants', () => {
    // The materialiser relies on this: a repeated run must hit the unique index, not
    // create a near-duplicate a millisecond away.
    const run = () => generateOccurrences(
      { weekdays: [1, 3], start_time: '08:30', timezone: DEFAULT_TIMEZONE },
      termWindow,
      { from: new Date('2026-08-03T00:00:00Z'), until: new Date('2026-08-20T00:00:00Z') },
    );
    expect(run().map(iso)).toEqual(run().map(iso));
    expect(run().length).toBeGreaterThan(0);
    expect(run().every((d) => d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0)).toBe(true);
  });

  it('handles a late-evening class near the day boundary', () => {
    // 23:30 Lagos on Monday is 22:30Z the same day; a naive UTC weekday check would drop it.
    const out = generateOccurrences(
      { weekdays: [1], start_time: '23:30', timezone: 'Africa/Lagos' },
      { starts_on: MON, ends_on: MON },
      { from: new Date('2026-08-03T00:00:00Z'), until: new Date('2026-08-04T12:00:00Z') },
    );
    expect(out.map(iso)).toEqual(['2026-08-03T22:30:00.000Z']);
  });
});

describe('describePattern', () => {
  it('reads naturally for staff', () => {
    expect(describePattern({ weekdays: [1, 2, 4], start_time: '20:00' })).toBe('Mon, Tue & Thu at 20:00');
    expect(describePattern({ weekdays: [3], start_time: '09:00' })).toBe('Wed at 09:00');
    expect(describePattern({ weekdays: [0, 1, 2, 3, 4, 5, 6], start_time: '20:00' })).toBe('Every day at 20:00');
    expect(describePattern({ weekdays: [1, 2, 3, 4, 5], start_time: '16:15' })).toBe('Weekdays at 16:15');
  });

  it('does not pretend a broken pattern is a schedule', () => {
    expect(describePattern({ weekdays: [], start_time: '20:00' })).toBe('No days selected');
  });
});
