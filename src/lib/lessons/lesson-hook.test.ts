import { describe, expect, it } from 'vitest';
import { parseLessonHook } from './lesson-hook';

describe('lesson opener contract', () => {
  it('normalizes a complete AI response for safe reuse', () => {
    expect(
      parseLessonHook({
        hook_title: 'Why it matters',
        hook: 'A short opener.',
        real_world_example: 'A local example.',
        challenge_question: 'What would you try?',
      }),
    ).toEqual({
      hook_title: 'Why it matters',
      hook: 'A short opener.',
      real_world_example: 'A local example.',
      challenge_question: 'What would you try?',
    });
  });

  it('rejects incomplete or non-object responses', () => {
    expect(parseLessonHook(null)).toBeNull();
    expect(parseLessonHook({ hook_title: 'Missing body' })).toBeNull();
    expect(parseLessonHook({ hook: '  ' })).toBeNull();
  });
});
