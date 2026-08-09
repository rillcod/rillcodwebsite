import { describe, expect, it } from 'vitest';
import { runAcademicQualityEngine } from './academicQualityEngine';

const BASE = {
  overview: 'A term of foundational computing.',
  terms: [{
    year: 1,
    term: 1,
    weeks: [{
      week: 1,
      topic: 'Introduction to Scratch',
      subtopics: ['Sprites', 'Stage'],
      lesson_plan: { activities: ['Build a sprite'] },
      assessment_plan: { check: 'Demonstrate it' },
    }],
  }],
};

const CONTEXT = {
  sourceMetadata: { name: 'Rillcod Academic Office', framework: 'Approved Standard' },
  academicSession: '2026/2027',
  audienceLabel: 'Basic 1-3',
};

const timingFindings = (metadata: Record<string, unknown>) =>
  runAcademicQualityEngine({ ...BASE, metadata }, CONTEXT)
    .improvements.filter((issue) => issue.code === 'school_timing_in_core');

describe('school timing stored in a central curriculum', () => {
  it('says nothing when the start term is the neutral default', () => {
    // The builder writes program_start_term on every save, and 1 means
    // "Programme Term 1 is the first term" — the default, not a school's timing.
    // Flagging it produced a suggestion on every curriculum that nobody could
    // ever clear, sitting among the ones that mattered.
    expect(timingFindings({ program_start_term: 1, weeks_per_term: 8 })).toEqual([]);
  });

  it('says nothing when no timing is recorded at all', () => {
    expect(timingFindings({ weeks_per_term: 8 })).toEqual([]);
  });

  it.each([2, 3])('flags a mid-year start (%i), which is one school\'s fact', (term) => {
    // Schools here are onboarded termly; some joined in Third Term. A central
    // document that hard-codes one of those imposes it on every other school.
    const found = timingFindings({ program_start_term: term });
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain('school-specific start point');
  });

  it('flags an explicit entry week or delivery entry whatever the term says', () => {
    expect(timingFindings({ entry_week: 3 })).toHaveLength(1);
    expect(timingFindings({ delivery_entry: { term: 1, week: 4 } })).toHaveLength(1);
  });

  it('points at fields that exist', () => {
    // The old wording said "move it to that school's delivery schedule", and
    // there is no program_start_term column there to move it to. Someone
    // following it literally went looking for a field that does not exist.
    const [issue] = timingFindings({ program_start_term: 3 });
    expect(issue.action).toContain('entry term and week');
    expect(issue.action).not.toMatch(/move it to that school.s delivery schedule/i);
  });
});
