import { describe, expect, it } from 'vitest';
import { acceptRepair, parseRepairResponse, repairCurriculumQuality } from './quality-repair';

const GOOD = {
  overview: 'Intro to physical computing.',
  terms: [
    { year: 1, term: 1, weeks: [{ week: 1, topic: 'Sensors', subtopics: ['a', 'b'] }] },
  ],
};

/** Missing topic on week 2 — an error the gate blocks publishing on. */
const FAULTY = {
  overview: 'Intro to physical computing.',
  terms: [
    {
      year: 1,
      term: 1,
      weeks: [
        { week: 1, topic: 'Sensors', subtopics: ['a'] },
        { week: 2, topic: '', subtopics: ['c'] },
      ],
    },
  ],
};

describe('acceptRepair', () => {
  it('refuses a repair that deletes a week to satisfy the gate', () => {
    const gutted = { ...FAULTY, terms: [{ year: 1, term: 1, weeks: [FAULTY.terms[0].weeks[0]] }] };
    const verdict = acceptRepair(FAULTY, gutted);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/dropped 1 teaching week/i);
  });

  it('refuses a repair that drops a whole term', () => {
    const twoTerms = {
      ...FAULTY,
      terms: [FAULTY.terms[0], { year: 1, term: 2, weeks: [{ week: 1, topic: '', subtopics: [] }] }],
    };
    const verdict = acceptRepair(twoTerms, { ...twoTerms, terms: [twoTerms.terms[0]] });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/dropped 1 term/i);
  });

  it('refuses a repair that fixes nothing', () => {
    expect(acceptRepair(FAULTY, FAULTY).ok).toBe(false);
  });

  it('refuses anything that is not a curriculum object', () => {
    expect(acceptRepair(FAULTY, null).ok).toBe(false);
    expect(acceptRepair(FAULTY, []).ok).toBe(false);
    expect(acceptRepair(FAULTY, { overview: 'x' }).ok).toBe(false);
  });

  it('accepts a repair that fills the gap and keeps every week', () => {
    const mended = JSON.parse(JSON.stringify(FAULTY));
    mended.terms[0].weeks[1].topic = 'Actuators and motors';
    expect(acceptRepair(FAULTY, mended).ok).toBe(true);
  });

  it('allows renumbering to resolve a duplicate, since no week is lost', () => {
    const dupes = {
      overview: 'x',
      terms: [{ year: 1, term: 1, weeks: [
        { week: 1, topic: 'A', subtopics: ['s'] },
        { week: 1, topic: 'B', subtopics: ['s'] },
      ] }],
    };
    const renumbered = JSON.parse(JSON.stringify(dupes));
    renumbered.terms[0].weeks[1].week = 2;
    expect(acceptRepair(dupes, renumbered).ok).toBe(true);
  });
});

describe('parseRepairResponse', () => {
  it('reads plain JSON', () => {
    expect(parseRepairResponse('{"terms":[]}')).toEqual({ terms: [] });
  });
  it('reads JSON wrapped in a markdown fence or prose', () => {
    expect(parseRepairResponse('Here you go:\n```json\n{"terms":[]}\n```')).toEqual({ terms: [] });
  });
  it('returns null when there is no JSON at all', () => {
    expect(parseRepairResponse('sorry, I cannot help')).toBeNull();
    expect(parseRepairResponse('')).toBeNull();
  });
});

describe('repairCurriculumQuality', () => {
  it('does not call the model when the curriculum already passes', async () => {
    let called = false;
    const out = await repairCurriculumQuality(GOOD, async () => { called = true; return null; });
    expect(out.status).toBe('not_needed');
    expect(called).toBe(false);
  });

  it('keeps the original when the model deletes content', async () => {
    const gutted = { ...FAULTY, terms: [{ year: 1, term: 1, weeks: [FAULTY.terms[0].weeks[0]] }] };
    const out = await repairCurriculumQuality(FAULTY, async () => ({
      text: JSON.stringify(gutted), model: 'test',
    }));
    expect(out.status).toBe('rejected');
    expect(out.content).toBe(FAULTY);
    expect(out.reason).toMatch(/dropped/i);
  });

  it('keeps the original when the model returns unusable output', async () => {
    const out = await repairCurriculumQuality(FAULTY, async () => ({ text: 'no.', model: 'test' }));
    expect(out.status).toBe('rejected');
    expect(out.content).toBe(FAULTY);
  });

  it('reports unavailable rather than failing when the model does not respond', async () => {
    const out = await repairCurriculumQuality(FAULTY, async () => null);
    expect(out.status).toBe('unavailable');
    expect(out.content).toBe(FAULTY);
  });

  it('accepts a genuine repair and clears the errors', async () => {
    const mended = JSON.parse(JSON.stringify(FAULTY));
    mended.terms[0].weeks[1].topic = 'Actuators and motors';
    const out = await repairCurriculumQuality(FAULTY, async () => ({
      text: JSON.stringify(mended), model: 'test',
    }));
    expect(out.status).toBe('repaired');
    expect(out.after?.errors).toHaveLength(0);
    expect(out.before.errors.length).toBeGreaterThan(0);
  });
});
