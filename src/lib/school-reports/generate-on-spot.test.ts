import { describe, expect, it, vi, beforeEach } from 'vitest';

const expansionMocks = vi.hoisted(() => ({ expandCourseDeliveryWeeks: vi.fn() }));

vi.mock('./week-expansion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./week-expansion')>();
  return {
    ...actual,
    expandCourseDeliveryWeeks: expansionMocks.expandCourseDeliveryWeeks,
  };
});

import {
  expandCourseWeeksForDelivery,
  isPlaceholderWeekRecord,
  mergeGeneratedWeeksIntoContent,
  realWeekNumbersInTerm,
} from './generate-on-spot';
import { isPlaceholderDeliveryLabel, syntheticWeekTopicLabel } from './topics-covered-presentation';

describe('placeholder delivery detection', () => {
  it('flags canned week phrases and synthetic keys', () => {
    expect(isPlaceholderDeliveryLabel(syntheticWeekTopicLabel('Scratch', 1))).toBe(true);
    expect(isPlaceholderDeliveryLabel('Core concepts & guided practice')).toBe(true);
    expect(isPlaceholderDeliveryLabel('Sensors and motor control')).toBe(false);
    expect(isPlaceholderDeliveryLabel('Intro', 'synthetic::abc::1::1')).toBe(true);
  });

  it('treats placeholder-sourced weeks as missing even when a topic string exists', () => {
    expect(isPlaceholderWeekRecord({ week: 1, topic: 'Chassis build', source: 'placeholder' })).toBe(true);
    expect(isPlaceholderWeekRecord({ week: 1, topic: 'Chassis build', source: 'ai' })).toBe(false);
    expect(
      isPlaceholderWeekRecord(
        { week: 1, topic: syntheticWeekTopicLabel('Robotics', 1) },
        'placeholder',
      ),
    ).toBe(true);
  });
});

describe('realWeekNumbersInTerm', () => {
  it('ignores placeholder weeks so a canned plan cannot cover the report window', () => {
    const weeks = realWeekNumbersInTerm(
      {
        generated_source: 'placeholder',
        terms: [
          {
            term: 1,
            weeks: [
              { week: 1, topic: syntheticWeekTopicLabel('Python', 1), source: 'placeholder' },
              { week: 2, topic: 'Variables and types', source: 'ai' },
            ],
          },
        ],
      },
      1,
    );
    expect([...weeks]).toEqual([2]);
  });
});

describe('mergeGeneratedWeeksIntoContent', () => {
  it('keeps authored weeks and fills only the missing ones', () => {
    const merged = mergeGeneratedWeeksIntoContent(
      {
        course_title: 'Robotics',
        generated_source: 'ai',
        terms: [
          {
            term: 1,
            weeks: [{ week: 1, topic: 'Safety and kit unpack', source: 'ai', type: 'lesson' }],
          },
        ],
      },
      {
        courseTitle: 'Robotics',
        programme: 'Young Innovators',
        termNumber: 1,
        weeks: [
          {
            week: 2,
            topic: 'Drive motors and wheels',
            weekType: 'lesson',
            objectives: ['Wire the motors'],
          },
        ],
        source: 'ai',
        model: 'gemini-test',
      },
    );

    const weeks = (merged.terms as Array<{ weeks: Array<{ week: number; topic: string }> }>)[0].weeks;
    expect(weeks.map((row) => row.week)).toEqual([1, 2]);
    expect(weeks[0].topic).toBe('Safety and kit unpack');
    expect(weeks[1].topic).toBe('Drive motors and wheels');
    expect(merged.generated_source).toBe('ai');
  });

  it('replaces canned placeholder weeks instead of keeping them beside real ones', () => {
    const merged = mergeGeneratedWeeksIntoContent(
      {
        generated_source: 'placeholder',
        terms: [
          {
            term: 1,
            weeks: [{ week: 1, topic: syntheticWeekTopicLabel('Python', 1), source: 'placeholder' }],
          },
        ],
      },
      {
        courseTitle: 'Python',
        programme: 'Teen Developers',
        termNumber: 1,
        weeks: [{ week: 1, topic: 'Variables and input', weekType: 'lesson', objectives: ['Store a value'] }],
        source: 'ai',
        model: 'gemini-test',
      },
    );
    const weeks = (merged.terms as Array<{ weeks: Array<{ week: number; topic: string; source?: string }> }>)[0].weeks;
    expect(weeks).toHaveLength(1);
    expect(weeks[0].topic).toBe('Variables and input');
    expect(weeks[0].source).toBe('ai');
  });
});

describe('expandCourseWeeksForDelivery', () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    courseTitle: 'Robotics',
    programme: 'Young Innovators',
    termNumber: 1,
    weekNumbers: [1, 2, 3, 4, 5, 6, 7, 8],
  };

  it('returns a full-window AI plan when the first call succeeds', async () => {
    expansionMocks.expandCourseDeliveryWeeks.mockResolvedValueOnce({
      weeks: input.weekNumbers.map((week) => ({ week, topic: `Topic ${week}`, weekType: 'lesson', objectives: [] })),
      source: 'ai',
      model: 'gemini-test',
    });
    const result = await expandCourseWeeksForDelivery(input);
    expect(result.source).toBe('ai');
    expect(result.weeks).toHaveLength(8);
    expect(expansionMocks.expandCourseDeliveryWeeks).toHaveBeenCalledTimes(1);
  });

  it('merges chunked AI weeks when the full-window call falls back to placeholder', async () => {
    expansionMocks.expandCourseDeliveryWeeks
      .mockResolvedValueOnce({ weeks: [], source: 'placeholder', model: null })
      .mockResolvedValueOnce({
        weeks: [
          { week: 1, topic: 'A', weekType: 'lesson', objectives: [] },
          { week: 2, topic: 'B', weekType: 'lesson', objectives: [] },
          { week: 3, topic: 'C', weekType: 'lesson', objectives: [] },
          { week: 4, topic: 'D', weekType: 'lesson', objectives: [] },
        ],
        source: 'ai',
        model: 'gemini-test',
      })
      .mockResolvedValueOnce({
        weeks: [
          { week: 5, topic: 'E', weekType: 'lesson', objectives: [] },
          { week: 6, topic: 'F', weekType: 'lesson', objectives: [] },
          { week: 7, topic: 'G', weekType: 'lesson', objectives: [] },
          { week: 8, topic: 'H', weekType: 'lesson', objectives: [] },
        ],
        source: 'ai',
        model: 'gemini-test',
      });

    const result = await expandCourseWeeksForDelivery(input);
    expect(result.source).toBe('ai');
    expect(result.weeks.map((row) => row.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(expansionMocks.expandCourseDeliveryWeeks).toHaveBeenCalledTimes(3);
  });
});
