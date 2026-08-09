import { describe, expect, it } from 'vitest';
import { NOT_READY_REASONS, PLAIN_WORDS, startPointNotSaved } from './labels';

/**
 * The system's own vocabulary is precise and belongs in the code. It does not
 * belong in front of a teacher. These are the words that were reaching people.
 */
const SYSTEM_DIALECT = [
  'academic direction',
  'official edition',
  'adoption',
  'rollout',
  'delivery schedule',
  'delivery period',
  'entry point',
  'pathway',
  'readiness',
];

const containsDialect = (text: string) =>
  SYSTEM_DIALECT.filter((word) => text.toLowerCase().includes(word));

describe('what a teacher reads when a class is not ready', () => {
  it.each(Object.entries(NOT_READY_REASONS))('%s speaks plainly', (_code, message) => {
    expect(containsDialect(message)).toEqual([]);
  });

  it.each(Object.entries(NOT_READY_REASONS))('%s says what to do next', (_code, message) => {
    // "The Academic Office has not assigned an official edition to this pathway
    // and course" told someone that something was wrong and nothing about how to
    // end it. Every reason now names the missing thing and who supplies it.
    expect(message.length).toBeGreaterThan(40);
    expect(message).toMatch(/[.!]$/);
  });

  it('explains the curriculum gap without naming an internal concept', () => {
    expect(NOT_READY_REASONS.no_direction).toContain('approved curriculum');
    expect(NOT_READY_REASONS.no_direction).toContain('Academic Office');
  });

  it('tells a school with no term what to set', () => {
    expect(NOT_READY_REASONS.no_period).toContain('term');
    expect(NOT_READY_REASONS.no_period).not.toContain('delivery period');
  });
});

describe('the shared vocabulary', () => {
  it('offers a plain phrase for every system term it replaces', () => {
    for (const phrase of Object.values(PLAIN_WORDS)) {
      expect(containsDialect(phrase)).toEqual([]);
    }
  });

  it('reports a failed save in words, not in internals', () => {
    const message = startPointNotSaved('duplicate key value violates unique constraint');
    expect(message).toContain('when this school starts teaching');
    expect(containsDialect(message.split(':')[0])).toEqual([]);
  });
});
