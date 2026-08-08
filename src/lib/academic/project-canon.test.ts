import { describe, expect, it } from 'vitest';
import {
  decideProjectSource,
  fillBrief,
  isSubstantive,
  SUBSTANTIVE_BRIEF_CHARS,
  type RegistryBrief,
} from './project-canon';

/**
 * The whole point of this rule is that both systems keep working.
 *
 * The registry holds 21,354 authored slots and has never been used once; the
 * AI writes a project per class per week and always has. Picking one would
 * either throw away the canon or lock in placeholder text. These tests pin the
 * middle: canon when it is real, AI otherwise, and the changeover happening one
 * rewritten sentence at a time with nothing to switch on.
 */

const placeholder: RegistryBrief = {
  id: 'r-placeholder',
  title: 'Basic 4 Week 12: Creative Scratch Build',
  // The real thing, 71 characters, used across fifty-nine weeks.
  classwork_prompt: 'Build, test, and present practical output for week 12 using Cross Track concepts.',
  estimated_minutes: 35,
  concept_tags: ['demo'],
  difficulty_level: 1,
};

const authored: RegistryBrief = {
  id: 'r-authored',
  title: 'Basic 4 Week 12: Market Stall Counter',
  classwork_prompt:
    'Build a Scratch counter that a market trader could use to tally sales for week {week}. Test it by counting twenty items aloud with a partner and fixing anything that miscounts. Show the class your sprite, explain what each block does, and say one thing you would add next.',
  estimated_minutes: 45,
  concept_tags: ['loops', 'variables'],
  difficulty_level: 2,
};

describe('a placeholder never beats the AI', () => {
  it('rejects the seeded one-liner', () => {
    expect(isSubstantive(placeholder)).toBe(false);
    expect(placeholder.classwork_prompt!.length).toBeLessThan(SUBSTANTIVE_BRIEF_CHARS);
  });

  it('falls back to the AI when only placeholders match', () => {
    expect(decideProjectSource([placeholder], { week: 12, track: 'scratch' })).toEqual({
      source: 'ai',
      reason: 'placeholder_only',
    });
  });

  it('falls back to the AI when nothing matches at all', () => {
    expect(decideProjectSource([], { week: 3, track: 'python' })).toEqual({
      source: 'ai',
      reason: 'no_match',
    });
    expect(decideProjectSource(null, { week: 3, track: 'python' }).source).toBe('ai');
  });
});

describe('an authored brief wins, and carries its slot', () => {
  it('uses the canon and reports which template', () => {
    const decision = decideProjectSource([authored], { week: 12, track: 'scratch' });
    expect(decision.source).toBe('canon');
    if (decision.source !== 'canon') throw new Error('unreachable');
    expect(decision.templateId).toBe('r-authored');
    expect(decision.minutes).toBe(45);
  });

  it('substitutes the week so one brief stays specific to fifty-nine of them', () => {
    const decision = decideProjectSource([authored], { week: 12, track: 'scratch' });
    if (decision.source !== 'canon') throw new Error('unreachable');
    expect(decision.brief).toContain('for week 12');
    expect(decision.brief).not.toContain('{week}');
  });

  it('prefers the most written-out brief when several match', () => {
    const thinner = { ...authored, id: 'r-thin', classwork_prompt: 'x'.repeat(130) };
    const decision = decideProjectSource([thinner, authored], { week: 12, track: 'scratch' });
    if (decision.source !== 'canon') throw new Error('unreachable');
    expect(decision.templateId).toBe('r-authored');
  });

  it('picks the authored one out of a pile of placeholders', () => {
    // The realistic case while the catalogue is being rewritten: one good row
    // among many that are not.
    const pile = [placeholder, { ...placeholder, id: 'p2' }, authored, { ...placeholder, id: 'p3' }];
    const decision = decideProjectSource(pile, { week: 12, track: 'scratch' });
    if (decision.source !== 'canon') throw new Error('unreachable');
    expect(decision.templateId).toBe('r-authored');
  });
});

describe('filling a brief', () => {
  it('leaves an unknown placeholder visible rather than blanking it', () => {
    // A brief with a hole in it is silently wrong; one that reads {topic} is
    // obviously wrong, and gets fixed.
    expect(fillBrief('Build {topic} in week {week}', { week: 4 })).toBe('Build {topic} in week 4');
  });

  it('does not leave double spaces when a slot is unknown', () => {
    expect(fillBrief('Build for {track} learners', { track: null })).toBe('Build for learners');
  });
});
