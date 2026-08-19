import { describe, expect, it } from 'vitest';
import {
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
