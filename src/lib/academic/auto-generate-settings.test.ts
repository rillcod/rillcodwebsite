import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTO_GENERATE_SETTINGS,
  WEEK_CONTENT_TYPES,
  describeAutoGenerateSettings,
  listPlanMeetings,
  nextMeetingsToGenerate,
  normaliseTypes,
  parseAutoGenerateSettings,
  weeksToGenerateForPlan,
} from './auto-generate-settings';

describe('WEEK_CONTENT_TYPES', () => {
  it('lists slides after the lesson they are rendered from', () => {
    // Slides read the saved lesson. Ahead of it they fail every time with
    // "generate the lesson before creating its slides".
    expect(WEEK_CONTENT_TYPES.indexOf('slides')).toBeGreaterThan(
      WEEK_CONTENT_TYPES.indexOf('lessons'),
    );
  });
});

describe('parseAutoGenerateSettings', () => {
  it('treats a missing auto_publish as hold-for-approval', () => {
    // The whole point of the approval queue. An absent flag must never be read
    // as permission to publish AI writing to learners.
    expect(parseAutoGenerateSettings({ enabled: true }).auto_publish).toBe(false);
    expect(parseAutoGenerateSettings({}).auto_publish).toBe(false);
    expect(parseAutoGenerateSettings(null).auto_publish).toBe(false);
    expect(parseAutoGenerateSettings({ auto_publish: 'true' }).auto_publish).toBe(false);
  });

  it('honours an explicit opt-in to publishing', () => {
    expect(parseAutoGenerateSettings({ auto_publish: true }).auto_publish).toBe(true);
  });

  it('defaults auto-generate to on unless explicitly turned off', () => {
    expect(parseAutoGenerateSettings({}).enabled).toBe(true);
    expect(parseAutoGenerateSettings({ enabled: true }).enabled).toBe(true);
    expect(parseAutoGenerateSettings({ enabled: false }).enabled).toBe(false);
  });

  it('adds slides to the settings every existing plan was seeded with', () => {
    const stored = { enabled: true, types: ['lessons', 'assignments', 'projects'] };
    expect(parseAutoGenerateSettings(stored).types).toEqual([
      'lessons',
      'slides',
      'flashcards',
      'assignments',
      'projects',
    ]);
  });

  it('clamps a nonsense batch size instead of trusting it', () => {
    expect(parseAutoGenerateSettings({ maxWeeksPerBatch: 999 }).maxWeeksPerBatch).toBe(10);
    expect(parseAutoGenerateSettings({ maxWeeksPerBatch: -4 }).maxWeeksPerBatch).toBe(0);
    expect(parseAutoGenerateSettings({ maxWeeksPerBatch: 'x' }).maxWeeksPerBatch).toBe(0);
    expect(parseAutoGenerateSettings({ maxWeeksPerBatch: 3 }).maxWeeksPerBatch).toBe(3);
  });

  it('carries last_run_at through so the rotation queue still works', () => {
    expect(parseAutoGenerateSettings({ last_run_at: '2026-08-04T00:00:00Z' }).last_run_at)
      .toBe('2026-08-04T00:00:00Z');
    expect(parseAutoGenerateSettings({}).last_run_at).toBeUndefined();
  });

  it('is idempotent — parsing its own output changes nothing', () => {
    const once = parseAutoGenerateSettings({ enabled: true, types: ['lessons'] });
    expect(parseAutoGenerateSettings(once)).toEqual(once);
  });
});

describe('DEFAULT_AUTO_GENERATE_SETTINGS', () => {
  it('prepares a full week but publishes nothing without a teacher', () => {
    expect(DEFAULT_AUTO_GENERATE_SETTINGS.auto_publish).toBe(false);
    expect(DEFAULT_AUTO_GENERATE_SETTINGS.types).toEqual([...WEEK_CONTENT_TYPES]);
  });

  it('survives a round trip through the parser', () => {
    expect(parseAutoGenerateSettings(DEFAULT_AUTO_GENERATE_SETTINGS))
      .toEqual(DEFAULT_AUTO_GENERATE_SETTINGS);
  });
});

describe('describeAutoGenerateSettings', () => {
  it('says plainly when nothing will happen', () => {
    const s = parseAutoGenerateSettings({ enabled: false });
    expect(describeAutoGenerateSettings(s)).toMatch(/turned off|disabled/i);
  });

  it('distinguishes held from published', () => {
    const held = parseAutoGenerateSettings({ enabled: true });
    const live = parseAutoGenerateSettings({ enabled: true, auto_publish: true });
    expect(describeAutoGenerateSettings(held)).toMatch(/held for your approval/i);
    expect(describeAutoGenerateSettings(live)).toMatch(/published straight to students/i);
  });
});

describe('weeksToGenerateForPlan', () => {
  it('preps the delivery week and the next in-plan week when ahead is on', () => {
    expect(
      weeksToGenerateForPlan({
        planWeekNumbers: [1, 2],
        deliveryWeek: 1,
        prepAheadWeeks: 1,
        maxWeeksPerBatch: 2,
      }),
    ).toEqual([1, 2]);
  });

  it('does not force mid-cohort modules to generate week 1 on the cron path', () => {
    expect(
      weeksToGenerateForPlan({
        planWeekNumbers: [4, 5],
        deliveryWeek: 1,
        prepAheadWeeks: 1,
        maxWeeksPerBatch: 2,
      }),
    ).toEqual([]);
  });

  it('allows launch to stage a mid-cohort module early', () => {
    expect(
      weeksToGenerateForPlan({
        planWeekNumbers: [4, 5],
        deliveryWeek: 1,
        prepAheadWeeks: 1,
        maxWeeksPerBatch: 2,
        allowEarlyPrep: true,
      }),
    ).toEqual([4, 5]);
  });

  it('waits between module windows instead of bleeding', () => {
    expect(
      weeksToGenerateForPlan({
        planWeekNumbers: [4, 5],
        deliveryWeek: 3,
        prepAheadWeeks: 1,
      }),
    ).toEqual([]);
  });

  it('stops when the delivery week is past the module', () => {
    expect(
      weeksToGenerateForPlan({
        planWeekNumbers: [1, 2],
        deliveryWeek: 5,
        prepAheadWeeks: 1,
      }),
    ).toEqual([]);
  });
});

describe('nextMeetingsToGenerate', () => {
  it('prepares Class 2 after Class 1 is done, then the next week', () => {
    const meetings = listPlanMeetings([
      { week: 1, session: 1 },
      { week: 1, session: 2 },
      { week: 2, session: 1 },
      { week: 2, session: 2 },
    ]);
    expect(
      nextMeetingsToGenerate({
        meetings,
        completedKeys: ['1:s1'],
        eligibleWeeks: [1, 2],
        maxMeetingsPerBatch: 1,
      }),
    ).toEqual([{ week: 1, session: 2 }]);
    expect(
      nextMeetingsToGenerate({
        meetings,
        completedKeys: ['1:s1', '1:s2'],
        eligibleWeeks: [1, 2],
        maxMeetingsPerBatch: 1,
      }),
    ).toEqual([{ week: 2, session: 1 }]);
  });

  it('treats an untagged legacy lesson as Class 1 complete', () => {
    expect(
      nextMeetingsToGenerate({
        meetings: listPlanMeetings([
          { week: 1, session: 1 },
          { week: 1, session: 2 },
        ]),
        completedKeys: ['1'],
        eligibleWeeks: [1],
        maxMeetingsPerBatch: 1,
      }),
    ).toEqual([{ week: 1, session: 2 }]);
  });
});

describe('normaliseTypes', () => {
  it('drops anything not a real content type', () => {
    expect(normaliseTypes(['lessons', 'sql-injection', 'projects']))
      .toEqual(['lessons', 'slides', 'flashcards', 'projects']);
  });

  it('falls back to everything rather than generating nothing', () => {
    expect(normaliseTypes([])).toEqual([...WEEK_CONTENT_TYPES]);
    expect(normaliseTypes(['nonsense'])).toEqual([...WEEK_CONTENT_TYPES]);
  });

  it('sorts into dependency order, not the order it was stored in', () => {
    expect(normaliseTypes(['projects', 'slides', 'lessons']))
      .toEqual(['lessons', 'slides', 'flashcards', 'projects']);
  });

  it('does not invent lessons for a caller that only wants assignments', () => {
    expect(normaliseTypes(['assignments'])).toEqual(['assignments']);
  });
});
