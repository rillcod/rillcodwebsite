import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ geminiGenerateText: vi.fn() }));

vi.mock('@/lib/gemini/client', () => ({ geminiGenerateText: mocks.geminiGenerateText }));

import { expandCourseDeliveryWeeks, normaliseExpansion, placeholderExpansion } from './week-expansion';

const weekNumbers = [1, 2, 3];

function aiWeeks(weeks = weekNumbers) {
  return JSON.stringify({
    weeks: weeks.map((week) => ({
      week,
      topic: `Robotics sensors part ${week}`,
      weekType: 'lesson',
      objectives: ['Wire a sensor', 'Read its output'],
    })),
  });
}

describe('normaliseExpansion', () => {
  it('rejects a partially answered plan rather than padding it', () => {
    // A half-filled plan presented as complete is worse than an honest placeholder:
    // staff would tick weeks the model never actually planned.
    const parsed = { weeks: [{ week: 1, topic: 'Only week one' }] };
    expect(normaliseExpansion(parsed, { courseTitle: 'Robotics', weekNumbers })).toBeNull();
  });

  it('rejects a response that is not a weeks array', () => {
    expect(normaliseExpansion({ nope: true }, { courseTitle: 'Robotics', weekNumbers })).toBeNull();
  });

  it('returns weeks in the requested order regardless of model ordering', () => {
    const parsed = { weeks: [{ week: 3, topic: 'C' }, { week: 1, topic: 'A' }, { week: 2, topic: 'B' }] };
    const result = normaliseExpansion(parsed, { courseTitle: 'Robotics', weekNumbers });
    expect(result?.map((row) => row.week)).toEqual([1, 2, 3]);
    expect(result?.map((row) => row.topic)).toEqual(['A', 'B', 'C']);
  });

  it('drops entries with no usable topic', () => {
    const parsed = { weeks: [{ week: 1, topic: '  ' }, { week: 2, topic: 'B' }, { week: 3, topic: 'C' }] };
    expect(normaliseExpansion(parsed, { courseTitle: 'Robotics', weekNumbers })).toBeNull();
  });

  it('caps objectives and accepts week_number/type aliases', () => {
    const parsed = {
      weeks: weekNumbers.map((week) => ({
        week_number: week,
        title: `Topic ${week}`,
        type: 'assessment',
        objectives: ['a', 'b', 'c', 'd', 'e'],
      })),
    };
    const result = normaliseExpansion(parsed, { courseTitle: 'Robotics', weekNumbers });
    expect(result?.[0].weekType).toBe('assessment');
    expect(result?.[0].objectives).toHaveLength(3);
  });
});

describe('expandCourseDeliveryWeeks', () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    courseTitle: 'Robotics Basics',
    programme: 'Robotics',
    termNumber: 1,
    weekNumbers,
    reachedTopics: ['Intro to sensors'],
  };

  it('returns an AI plan when the model answers every week', async () => {
    mocks.geminiGenerateText.mockResolvedValue({ text: aiWeeks(), model: 'gemini-2.5-flash' });
    const result = await expandCourseDeliveryWeeks(input);
    expect(result.source).toBe('ai');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.weeks).toHaveLength(3);
    expect(result.weeks[0].topic).toContain('Robotics sensors');
  });

  it('falls back to a labelled placeholder when the model is unavailable', async () => {
    mocks.geminiGenerateText.mockResolvedValue(null);
    const result = await expandCourseDeliveryWeeks(input);
    expect(result.source).toBe('placeholder');
    expect(result.weeks).toHaveLength(3);
  });

  it('falls back when the model returns unparseable text', async () => {
    mocks.geminiGenerateText.mockResolvedValue({ text: 'not json at all', model: 'x' });
    const result = await expandCourseDeliveryWeeks(input);
    expect(result.source).toBe('placeholder');
  });

  it('falls back when the model answers only some weeks', async () => {
    mocks.geminiGenerateText.mockResolvedValue({ text: aiWeeks([1, 2]), model: 'x' });
    const result = await expandCourseDeliveryWeeks(input);
    expect(result.source).toBe('placeholder');
  });

  it('never throws when the model call rejects', async () => {
    mocks.geminiGenerateText.mockRejectedValue(new Error('network down'));
    const result = await expandCourseDeliveryWeeks(input);
    expect(result.source).toBe('placeholder');
    expect(result.weeks).toHaveLength(3);
  });

  it('deduplicates and sorts the requested weeks', async () => {
    mocks.geminiGenerateText.mockResolvedValue(null);
    const result = await expandCourseDeliveryWeeks({ ...input, weekNumbers: [3, 1, 3, 2] });
    expect(result.weeks.map((row) => row.week)).toEqual([1, 2, 3]);
  });

  it('returns nothing to plan when no weeks are requested', async () => {
    const result = await expandCourseDeliveryWeeks({ ...input, weekNumbers: [] });
    expect(result.weeks).toEqual([]);
    expect(mocks.geminiGenerateText).not.toHaveBeenCalled();
  });
});

describe('placeholderExpansion', () => {
  it('is always labelled placeholder so it cannot pass as authored content', () => {
    const result = placeholderExpansion('Robotics Basics', [1, 4]);
    expect(result.source).toBe('placeholder');
    expect(result.model).toBeNull();
    expect(result.weeks[1].weekType).toBe('assessment');
  });
});
