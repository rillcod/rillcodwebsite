import { describe, expect, it } from 'vitest';
import { dayIndex, planSessionsFromSlots, sameTime } from './sessions-from-slots';

const TERM = { term_start: '2026-09-01', term_end: '2026-09-30' };
const WINDOW = { from: new Date('2026-09-01T00:00:00Z'), until: new Date('2026-09-30T23:59:59Z') };

const slot = (over: Record<string, unknown> = {}) => ({
  id: 'slot-1',
  class_id: 'class-1',
  day_of_week: 'Monday',
  start_time: '09:00',
  end_time: '10:00',
  subject: 'Scratch',
  room: 'Lab 2',
  ...over,
});

const plan = (over: Record<string, unknown> = {}) =>
  planSessionsFromSlots({ slots: [slot()], existing: [], window: TERM, ...WINDOW, ...over });

describe('turning a timetable into sessions', () => {
  it('creates one session per matching weekday in the term', () => {
    // September 2026: Mondays fall on the 7th, 14th, 21st and 28th.
    const result = plan();
    expect(result.create.map((s) => s.session_date)).toEqual([
      '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28',
    ]);
  });

  it('carries the subject and room onto the session', () => {
    const [first] = plan().create;
    expect(first).toMatchObject({
      class_id: 'class-1',
      start_time: '09:00',
      end_time: '10:00',
      title: 'Scratch',
      location: 'Lab 2',
      status: 'scheduled',
    });
  });

  it('never spills past the end of term', () => {
    const result = plan({ window: { term_start: '2026-09-01', term_end: '2026-09-10' } });
    expect(result.create.map((s) => s.session_date)).toEqual(['2026-09-07']);
  });

  it('does not recreate a session that already exists', () => {
    // A teacher may have renamed it, moved the room, or written up the topic.
    // Regenerating over that would erase the lesson record to match a template.
    const result = plan({
      existing: [{ class_id: 'class-1', session_date: '2026-09-14', start_time: '09:00:00' }],
    });
    expect(result.create.map((s) => s.session_date)).not.toContain('2026-09-14');
    expect(result.create).toHaveLength(3);
  });

  it('treats two slots at the same time on one day as one session', () => {
    const result = plan({ slots: [slot(), slot({ id: 'slot-2' })] });
    const mondays = result.create.filter((s) => s.session_date === '2026-09-07');
    expect(mondays).toHaveLength(1);
  });

  it('still creates a second session at a different time on the same day', () => {
    const result = plan({ slots: [slot(), slot({ id: 'slot-2', start_time: '11:00', subject: 'Python' })] });
    const mondays = result.create.filter((s) => s.session_date === '2026-09-07');
    expect(mondays.map((s) => s.start_time).sort()).toEqual(['09:00', '11:00']);
  });
});

describe('slots that cannot generate anything are reported, not guessed', () => {
  it('skips a slot with no class', () => {
    // An attendance register is the wrong place to be approximately right.
    const result = plan({ slots: [slot({ class_id: null })] });
    expect(result.create).toEqual([]);
    expect(result.skipped[0].reason).toContain('no class');
  });

  it('skips an unrecognised day', () => {
    const result = plan({ slots: [slot({ day_of_week: 'Someday' })] });
    expect(result.create).toEqual([]);
    expect(result.skipped[0].reason).toContain('not a day of the week');
  });

  it('skips a slot with no start time', () => {
    const result = plan({ slots: [slot({ start_time: null })] });
    expect(result.skipped[0].reason).toContain('no start time');
  });

  it('reports a slot whose day never falls inside the term', () => {
    const result = plan({
      slots: [slot({ day_of_week: 'Saturday' })],
      window: { term_start: '2026-09-07', term_end: '2026-09-11' },
    });
    expect(result.create).toEqual([]);
    expect(result.skipped[0].reason).toContain('No teaching days');
  });

  it('caps a run so a mistyped slot cannot flood the calendar', () => {
    const result = plan({
      window: { term_start: '2026-01-01', term_end: '2030-12-31' },
      until: new Date('2030-12-31T00:00:00Z'),
      max: 5,
    });
    expect(result.create.length).toBeLessThanOrEqual(5);
  });
});

describe('helpers', () => {
  it('reads day names however they are cased or padded', () => {
    expect(dayIndex(' monday ')).toBe(1);
    expect(dayIndex('SUNDAY')).toBe(0);
    expect(dayIndex('Frog')).toBeNull();
    expect(dayIndex(null)).toBeNull();
  });

  it('compares times regardless of seconds', () => {
    expect(sameTime('09:00', '09:00:00')).toBe(true);
    expect(sameTime('09:00', '09:30')).toBe(false);
    expect(sameTime(null, null)).toBe(false);
  });
});
