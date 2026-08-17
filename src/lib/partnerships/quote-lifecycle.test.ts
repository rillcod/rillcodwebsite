import { describe, expect, it } from 'vitest';

import { isQuoteExpired, quoteExpiryDate } from './issue-document';
import { recommendOffer, LARGE_ROLL_FLOOR, SMALL_ROLL_CEILING } from './offers';
import { commencementLabel, nextTeachingTerm, UNKNOWN_COMMENCEMENT } from './commencement';

describe('when a quote lapses', () => {
  it('counts forward from the day it was issued', () => {
    expect(quoteExpiryDate(90, new Date('2026-08-16T10:00:00Z'))).toBe('2026-11-14');
  });

  it('treats zero and nothing as "no expiry stated"', () => {
    // Better than issuing a quote that has already expired, which is what a
    // naive zero would produce.
    expect(quoteExpiryDate(0)).toBeNull();
    expect(quoteExpiryDate(-5)).toBeNull();
    expect(quoteExpiryDate(null)).toBeNull();
  });

  it('stands all day on its last day', () => {
    // A proposal valid until the 14th is signable on the 14th. Comparing
    // timestamps rather than dates would have refused it that morning.
    expect(isQuoteExpired('2026-11-14', new Date('2026-11-14T23:00:00Z'))).toBe(false);
    expect(isQuoteExpired('2026-11-14', new Date('2026-11-15T00:30:00Z'))).toBe(true);
  });

  it('never lapses when no expiry was recorded', () => {
    // Every document issued before the date was stored looks like this. They
    // are not retrospectively invalid.
    expect(isQuoteExpired(null)).toBe(false);
    expect(isQuoteExpired(undefined)).toBe(false);
  });
});

describe('recommending an option', () => {
  /*
    The proposal already claimed it had been "picked for the size of your roll".
    Nothing read the roll — a human chose from a dropdown and the document
    asserted a reasoning it had not performed. These are the rules that make the
    sentence true.
  */
  it('proves it after school first at a small roll', () => {
    const r = recommendOffer({ studentCount: SMALL_ROLL_CEILING - 40 });
    expect(r.offer.code).toBe('A');
    expect(r.basis).toBe('roll');
    expect(r.reason).toContain('80');
  });

  it('reaches every child at a large roll', () => {
    const r = recommendOffer({ studentCount: LARGE_ROLL_FLOOR + 200 });
    expect(r.offer.code).toBe('B1');
    expect(r.reason).toContain('every child');
  });

  it('recommends the honest option in between, not the cheapest', () => {
    const r = recommendOffer({ studentCount: 300 });
    expect(r.offer.code).toBe('B2');
  });

  it('says so plainly when it has no roll to reason from', () => {
    const r = recommendOffer({ studentCount: null });
    expect(r.basis).toBe('default');
    // No invented reasoning about a roll nobody told us.
    expect(r.reason).not.toMatch(/\d+ learners/);
    expect(r.reason).toContain('Tell us your enrolment');
  });

  it('never states a fee, because fees come from the terms record', () => {
    for (const roll of [0, 60, 300, 900]) {
      const { reason } = recommendOffer({ studentCount: roll });
      expect(reason).not.toMatch(/₦|\d{1,3}(,\d{3})+|\d+\s*%/);
    }
  });

  it('does not recommend the SS-paced option to a primary-only school', () => {
    const r = recommendOffer({ studentCount: 300, stage: 'primary' });
    expect(r.offer.code).toBe('B1');
    expect(r.reason).toMatch(/primary/i);
  });

  it('names the stage when that is all it has to go on', () => {
    const r = recommendOffer({ studentCount: null, stage: 'primary' });
    expect(r.offer.code).toBe('B1');
    expect(r.basis).toBe('stage');
  });
});

describe('when teaching would start', () => {
  function db(rows: Array<Record<string, unknown>> | null, throws = false) {
    return {
      from: () => {
        const chain: any = {
          select: () => chain,
          gt: () => chain,
          order: () => chain,
          limit: async () => {
            if (throws) throw new Error('no such table');
            return { data: rows };
          },
        };
        return chain;
      },
    };
  }

  it('names the term and the day it resumes', async () => {
    const term = await nextTeachingTerm(
      db([
        {
          id: 't1',
          academic_year: '2026/2027',
          term_label: 'Second Term',
          term_number: 2,
          start_date: '2027-01-06',
          is_current: false,
        },
      ]) as any,
    );

    expect(term?.phrase).toBe('Second Term, 2026/2027, from 6 January 2027');
  });

  it('falls back rather than failing when the calendar is empty', async () => {
    expect(await nextTeachingTerm(db([]) as any)).toBeNull();
    // A missing table or an RLS refusal must not stop a contract being issued.
    expect(await nextTeachingTerm(db(null, true) as any)).toBeNull();
  });

  it('prefers what a person typed over what the calendar says', async () => {
    const term = {
      id: 't1',
      academicYear: '2026/2027',
      termLabel: 'Second Term',
      termNumber: 2,
      startDate: '2027-01-06',
      phrase: 'Second Term, 2026/2027, from 6 January 2027',
    };

    expect(commencementLabel('12 January 2027', term)).toBe('12 January 2027');
    expect(commencementLabel('   ', term)).toBe(term.phrase);
    expect(commencementLabel(null, null)).toBe(UNKNOWN_COMMENCEMENT);
  });
});
