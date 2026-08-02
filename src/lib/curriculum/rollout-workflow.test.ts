import { describe, expect, it } from "vitest";
import {
  findLiveDirectionForDraft,
  findScheduleForTimingScope,
  timingValuesFromSchedule,
  validateCurriculumTiming,
} from "./rollout-workflow";

describe("curriculum rollout workflow", () => {
  it("recognises only the exact live publishing decision", () => {
    const directions = [
      {
        id: "old",
        source_curriculum_id: "draft-1",
        status: "retired",
        academic_session: "2025/2026",
        effective_term_number: 1,
        audience_label: "All learners",
      },
      {
        id: "live",
        source_curriculum_id: "draft-1",
        status: "published",
        academic_session: "2025/2026",
        effective_term_number: 1,
        audience_label: "All learners",
      },
    ];

    expect(
      findLiveDirectionForDraft(directions, {
        curriculumId: "draft-1",
        academicSession: "2025/2026",
        effectiveTermNumber: 1,
        audienceLabel: " all learners ",
      })?.id
    ).toBe("live");
    expect(
      findLiveDirectionForDraft(directions, {
        curriculumId: "draft-1",
        academicSession: "2026/2027",
        effectiveTermNumber: 1,
        audienceLabel: "All learners",
      })
    ).toBeNull();
  });

  it("prefills the exact school or class timing instead of overwriting it with defaults", () => {
    const schedules = [
      {
        id: "school",
        school_id: "school-1",
        class_id: null,
        course_id: "course-1",
        release_id: "release-1",
        status: "active",
        entry_term_number: 3,
        entry_week_number: 4,
        curriculum_year_number: 2,
        curriculum_term_number: 2,
        curriculum_week_number: 5,
        sessions_per_week: 2,
        pacing_mode: "extended",
      },
      {
        id: "class",
        school_id: "school-1",
        class_id: "class-1",
        course_id: "course-1",
        release_id: "release-1",
        status: "active",
      },
    ];
    const assignment = {
      school_id: "school-1",
      course_id: "course-1",
      release_id: "release-1",
    };

    const schoolSchedule = findScheduleForTimingScope(schedules, assignment, "");
    expect(schoolSchedule?.id).toBe("school");
    expect(timingValuesFromSchedule(schoolSchedule)).toMatchObject({
      entryTerm: 3,
      entryWeek: 4,
      programmeYear: 2,
      programmeTerm: 2,
      programmeWeek: 5,
      sessionsPerWeek: 2,
      pacing: "extended",
    });
    expect(findScheduleForTimingScope(schedules, assignment, "class-1")?.id).toBe("class");
  });

  it("rejects out-of-range timing before it reaches the database", () => {
    expect(
      validateCurriculumTiming({
        entryTerm: 1,
        entryWeek: 1,
        programmeYear: 1,
        programmeTerm: 1,
        programmeWeek: 1,
        sessionsPerWeek: 2,
      })
    ).toEqual({ ok: true });
    expect(
      validateCurriculumTiming({
        entryTerm: 1,
        entryWeek: 13,
        programmeYear: 0,
        programmeTerm: 1,
        programmeWeek: 1,
        sessionsPerWeek: 2,
      })
    ).toMatchObject({ ok: false });
  });
});
