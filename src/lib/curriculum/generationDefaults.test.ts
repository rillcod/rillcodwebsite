import { describe, expect, it } from "vitest";
import {
  getCurriculumGenerationDefaults,
  inferCurriculumFormat,
} from "./generationDefaults";

describe("curriculum generation defaults", () => {
  it("restores the saved pathway and generation settings", () => {
    expect(
      getCurriculumGenerationDefaults({
        content: {
          metadata: {
            format: "bootcamp",
            grade_level: "Basic 1",
            subject_area: "Creative AI",
            bootcamp_duration_weeks: 2,
            bootcamp_schedule: "weekend",
          },
        },
        programmeName: "Summer School",
        courseTitle: "Generative Art",
      })
    ).toMatchObject({
      format: "bootcamp",
      gradeLevel: "Basic 1",
      subjectArea: "Creative AI",
      bootcampDurationWeeks: "2",
      bootcampSchedule: "weekend",
    });
  });

  it("uses the protected audience for legacy curricula without saved grade metadata", () => {
    expect(
      getCurriculumGenerationDefaults({
        content: { metadata: { format: "bootcamp" } },
        officialAudience: "Basic 1",
        rememberedGrade: "JSS1",
      }).gradeLevel
    ).toBe("Basic 1");
  });

  it("infers safe defaults for new independent pathways", () => {
    expect(inferCurriculumFormat({ programmeName: "Online School" })).toBe(
      "online"
    );
    expect(inferCurriculumFormat({ programmeName: "Summer School 2026" })).toBe(
      "bootcamp"
    );
    expect(inferCurriculumFormat({ programmeName: "Regular School" })).toBe(
      "school"
    );
  });
});
