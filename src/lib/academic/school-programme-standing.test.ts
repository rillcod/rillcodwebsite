import { describe, expect, it } from "vitest";
import {
  calendarRoleLabel,
  classifyCalendarWeek,
  defaultCompulsoryTermActivities,
  expandPlanWeeksForMeetings,
  keepRillcodTeachingWeeks,
  parseProgrammeStanding,
  recommendTeachingAction,
  resolveSchoolProgrammePolicy,
  schoolWeeklyCadence,
} from "./school-programme-standing";

describe("school programme standing", () => {
  it("treats an unstated school as optional — the Rillcod way", () => {
    expect(parseProgrammeStanding(null)).toBe("optional");
    expect(parseProgrammeStanding("club")).toBe("optional");
    const policy = resolveSchoolProgrammePolicy({});
    expect(policy.standing).toBe("optional");
    expect(policy.usesRillcodEvaluation).toBe(true);
    expect(policy.usesHostEvaluation).toBe(false);
    expect(policy.examCapture).toBe("cbt");
    expect(policy.testCapture).toBe("cbt");
  });

  it("gives compulsory schools the host's own tests, not a twice-a-week rule", () => {
    const policy = resolveSchoolProgrammePolicy({ programme_standing: "compulsory" });
    expect(policy.usesRillcodEvaluation).toBe(false);
    expect(policy.usesHostEvaluation).toBe(true);
    expect(policy.examCapture).toBe("physical");
    expect(policy.testCapture).toBe("physical");
    expect(
      resolveSchoolProgrammePolicy({
        programme_standing: "compulsory",
        exam_capture: "cbt",
      }).examCapture,
    ).toBe("cbt");
  });
});

describe("school weekly cadence", () => {
  it("is once or twice for every school class, defaulting to twice", () => {
    expect(schoolWeeklyCadence(undefined)).toBe(2);
    expect(schoolWeeklyCadence(1)).toBe(1);
    expect(schoolWeeklyCadence("1")).toBe(1);
    expect(schoolWeeklyCadence(2)).toBe(2);
    expect(schoolWeeklyCadence(5)).toBe(2);
    expect(resolveSchoolProgrammePolicy({}).sessionsPerWeek).toBe(2);
    expect(
      resolveSchoolProgrammePolicy({
        programme_standing: "optional",
        sessions_per_week: 1,
      }).sessionsPerWeek,
    ).toBe(1);
    expect(
      resolveSchoolProgrammePolicy({
        programme_standing: "compulsory",
        sessions_per_week: 1,
      }).sessionsPerWeek,
    ).toBe(1);
  });
});

describe("Royhills-shaped compulsory calendars", () => {
  it("places First Test, midterm, Second Test, revision and exams inside the term", () => {
    const activities = defaultCompulsoryTermActivities("2026-09-14", "2026-12-15");
    const kinds = activities.map((row) => row.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "resumption",
        "holiday",
        "first_test",
        "midterm",
        "second_test",
        "revision",
        "examination",
        "vacation",
      ]),
    );
    expect(activities.find((row) => row.label === "Independence Day")?.start).toBe(
      "2026-10-01",
    );
    expect(classifyCalendarWeek({
      standing: "compulsory",
      termStart: "2026-09-14",
      weekNumber: 1,
      activities,
    })).toBe("teach");
    expect(classifyCalendarWeek({
      standing: "compulsory",
      termStart: "2026-09-14",
      weekNumber: 7,
      activities,
    })).toBe("school_test");
    expect(classifyCalendarWeek({
      standing: "optional",
      termStart: "2026-09-14",
      weekNumber: 7,
      activities,
    })).toBe("teach");
    expect(
      keepRillcodTeachingWeeks([1, 7, 12], {
        standing: "compulsory",
        termStart: "2026-09-14",
        activities,
      }),
    ).toEqual([1]);
  });

  it("does not ask Rillcod to examine a host-evaluated class", () => {
    expect(
      recommendTeachingAction({
        base: "assess",
        calendarRole: "teach",
        usesHostEvaluation: true,
      }),
    ).toBe("none");
    expect(
      recommendTeachingAction({
        base: "prepare",
        calendarRole: "examination",
        usesHostEvaluation: true,
      }),
    ).toBe("none");
    expect(
      recommendTeachingAction({
        base: "teach",
        calendarRole: "school_test",
        usesHostEvaluation: true,
      }),
    ).toBe("none");
    expect(
      recommendTeachingAction({
        base: "teach",
        calendarRole: "teach",
        usesHostEvaluation: true,
      }),
    ).toBe("teach");
    expect(
      recommendTeachingAction({
        base: "assess",
        calendarRole: "examination",
        usesHostEvaluation: true,
        examCapture: "cbt",
      }),
    ).toBe("assess");
  });

  it("expands a curriculum week into two class meetings", () => {
    const rows = expandPlanWeeksForMeetings(
      [{ week: 3, topic: "Loops" }],
      2,
    );
    expect(rows.map((row) => row.session)).toEqual([1, 2]);
    expect(expandPlanWeeksForMeetings(rows, 2)).toEqual(rows);
  });
});
