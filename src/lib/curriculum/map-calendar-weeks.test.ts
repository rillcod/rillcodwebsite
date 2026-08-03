import { describe, expect, it } from "vitest";
import { mapOfficialCurriculumToCalendarWeeks } from "./official-direction";

/**
 * This mapper decides what a class actually sees in its Teaching tab, and it
 * had no tests. The bug that prompted them: it walked calendar weeks 1-12 and
 * looked each one up inside a term by number. Curricula that number straight
 * through the year — term 2 starting at week 14 — matched nothing, the plan was
 * saved with an empty weeks array, and the workspace fell back to deriving
 * weeks from existing lessons. That fallback is what showed "Week 14" with no
 * term context and no route back to week 1.
 */
const BASE = {
  directionAcademicSession: "2026/2027",
  currentAcademicSession: "2026/2027",
  calendarTerm: 2,
  schedule: {
    entry_term_number: 1,
    entry_week_number: 1,
    curriculum_year_number: 1,
    curriculum_term_number: 1,
    curriculum_week_number: 1,
  },
};

function content(terms: unknown) {
  return { terms } as Record<string, unknown>;
}

describe("mapping an official curriculum onto class plan weeks", () => {
  it("keeps every week of every term, not just the current one", () => {
    const weeks = mapOfficialCurriculumToCalendarWeeks({
      ...BASE,
      content: content([
        { term: 1, weeks: [{ week: 1, topic: "A" }, { week: 2, topic: "B" }] },
        { term: 2, weeks: [{ week: 14, topic: "C" }] },
        { term: 3, weeks: [{ week: 27, topic: "D" }] },
      ]),
    });
    expect(weeks.map((w) => w.week)).toEqual([1, 2, 14, 27]);
  });

  it("carries curricula that number straight through the year", () => {
    // The case that used to yield an empty plan.
    const weeks = mapOfficialCurriculumToCalendarWeeks({
      ...BASE,
      content: content([{ term: 2, weeks: [{ week: 14, topic: "C" }] }]),
    });
    expect(weeks).toHaveLength(1);
    expect(weeks[0].week).toBe(14);
  });

  it("records the term each week belongs to", () => {
    const weeks = mapOfficialCurriculumToCalendarWeeks({
      ...BASE,
      content: content([
        { term: 1, weeks: [{ week: 1, topic: "A" }] },
        { term: 3, year: 2, weeks: [{ week: 5, topic: "B" }] },
      ]),
    });
    expect(weeks[0].official_position).toMatchObject({
      programme_year: 1,
      programme_term: 1,
      programme_week: 1,
    });
    expect(weeks[1].official_position).toMatchObject({
      programme_year: 2,
      programme_term: 3,
      programme_week: 5,
    });
  });

  it("never repeats a week number when terms restart at 1", () => {
    // Week number is the key lessons, assignments and delivery rows join on.
    // Three weeks called "1" would attach Term 2's lesson to Term 1's card.
    const weeks = mapOfficialCurriculumToCalendarWeeks({
      ...BASE,
      content: content([
        { term: 1, weeks: [{ week: 1, topic: "A" }, { week: 2, topic: "B" }] },
        { term: 2, weeks: [{ week: 1, topic: "C" }, { week: 2, topic: "D" }] },
      ]),
    });
    const numbers = weeks.map((w) => w.week);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("still reports the true term position after renumbering", () => {
    const weeks = mapOfficialCurriculumToCalendarWeeks({
      ...BASE,
      content: content([
        { term: 1, weeks: [{ week: 1, topic: "A" }] },
        { term: 2, weeks: [{ week: 1, topic: "C" }] },
      ]),
    });
    // The second week had to move off 1 to stay unique, but it is still the
    // first week of term 2 and must say so.
    expect(weeks[1].official_position).toMatchObject({
      programme_term: 2,
      programme_week: 1,
    });
  });

  it("returns nothing rather than guessing when the content has no terms", () => {
    expect(
      mapOfficialCurriculumToCalendarWeeks({ ...BASE, content: content([]) })
    ).toEqual([]);
    expect(
      mapOfficialCurriculumToCalendarWeeks({ ...BASE, content: content(null) })
    ).toEqual([]);
  });
});
