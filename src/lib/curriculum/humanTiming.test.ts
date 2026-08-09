import { describe, expect, it } from 'vitest';
import { humanCurriculumSpan, humanDeliveryStart } from './humanLabels';

describe('a span of teaching, said as a sentence', () => {
  it('names the term once when both ends share it', () => {
    // Reports printed "Term 1 Week 1  to  Term 1 Week 8" — the repetition is
    // what made it read like a database row.
    expect(humanCurriculumSpan({ startTerm: 1, startWeek: 1, endTerm: 1, endWeek: 8 }))
      .toBe('First Term, Weeks 1 to 8');
  });

  it('says a single week plainly', () => {
    expect(humanCurriculumSpan({ startTerm: 2, startWeek: 4, endTerm: 2, endWeek: 4 }))
      .toBe('Second Term, Week 4');
  });

  it('names both terms when the span crosses one', () => {
    expect(humanCurriculumSpan({ startTerm: 1, startWeek: 1, endTerm: 3, endWeek: 8 }))
      .toBe('First Term Week 1 to Third Term Week 8');
  });

  it('never prints an arrow', () => {
    // curriculum-range.ts put "Term 3 Week 1 → Term 1 Week 1" in front of whoever
    // was settling a school.
    const span = humanCurriculumSpan({ startTerm: 3, startWeek: 1, endTerm: 1, endWeek: 1 });
    expect(span).not.toContain('→');
    expect(span).not.toMatch(/T\dW\d/);
  });

  it('says so plainly when the period is not set', () => {
    expect(humanCurriculumSpan({ startTerm: null, startWeek: 1, endTerm: 1, endWeek: 8 }))
      .toBe('Teaching period not set');
  });
});

describe('where a school joins, and what that means for the children', () => {
  it('reassures when a mid-year joiner still starts from the beginning', () => {
    // The live case: a school that joined in Third Term, starting the curriculum
    // at week one. Shown as two coordinates, "has my class missed two terms?"
    // could not be answered without decoding them.
    expect(humanDeliveryStart({
      entryTerm: 3, entryWeek: 1, curriculumYear: 1, curriculumTerm: 1, curriculumWeek: 1,
    })).toBe('Begins Third Term, Week 1 — starting the curriculum from the beginning');
  });

  it('says where teaching picks up when it is not the beginning', () => {
    expect(humanDeliveryStart({
      entryTerm: 1, entryWeek: 3, curriculumYear: 2, curriculumTerm: 2, curriculumWeek: 5,
    })).toBe('Begins First Term, Week 3 — picking up the curriculum at Programme Year 2, Second Term, Week 5');
  });

  it('falls back to the entry alone when the curriculum position is unknown', () => {
    expect(humanDeliveryStart({ entryTerm: 2, entryWeek: 1, curriculumYear: null }))
      .toContain('Begins Second Term, Week 1');
  });

  it('says so plainly when nothing is set', () => {
    expect(humanDeliveryStart({ entryTerm: null, entryWeek: null })).toBe('Start point not set');
  });

  it('never leaks the coordinate shorthand', () => {
    const label = humanDeliveryStart({
      entryTerm: 3, entryWeek: 1, curriculumYear: 1, curriculumTerm: 1, curriculumWeek: 1,
    });
    expect(label).not.toMatch(/T\dW\d|Y\dT\dW\d|→/);
  });
});
