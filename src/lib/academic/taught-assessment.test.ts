import { describe, expect, it } from "vitest";
import { defaultCompulsoryTermActivities } from "./school-programme-standing";
import {
  applyHostAssessmentToReportScores,
  hostAssessmentKindForWeek,
  hostAssessmentKindFromExam,
  hostAssessmentSit,
  hostScoresFromCbtSessions,
  taughtAssessmentBrief,
  taughtTopicsForHostAssessment,
} from "./taught-assessment";

const activities = defaultCompulsoryTermActivities("2026-09-14", "2026-12-15");

const weeks = [
  { week: 1, taught: true, topic: "Scratch stage" },
  { week: 2, taught: true, topic: "Sprites" },
  { week: 7, taught: true, topic: "Loops" },
  { week: 8, taught: false, topic: "Not taught" },
  { week: 10, taught: true, topic: "Events" },
];

describe("taught host assessments", () => {
  it("names First Test, Second Test and Examination from the school calendar", () => {
    expect(
      hostAssessmentKindForWeek({
        calendarRole: "school_test",
        weekNumber: 7,
        termStart: "2026-09-14",
        activities,
      }),
    ).toBe("first_test");
    expect(
      hostAssessmentKindForWeek({
        calendarRole: "examination",
        weekNumber: 12,
        termStart: "2026-09-14",
        activities,
      }),
    ).toBe("examination");
  });

  it("builds the paper from taught weeks only", () => {
    expect(
      taughtTopicsForHostAssessment({
        weeks,
        kind: "first_test",
        assessmentWeek: 7,
        termStart: "2026-09-14",
        activities,
      }),
    ).toEqual(["Week 1: Scratch stage", "Week 2: Sprites"]);
    expect(
      taughtTopicsForHostAssessment({
        weeks,
        kind: "examination",
        assessmentWeek: 12,
        termStart: "2026-09-14",
        activities,
      }),
    ).toEqual([
      "Week 1: Scratch stage",
      "Week 2: Sprites",
      "Week 7: Loops",
      "Week 10: Events",
    ]);
  });

  it("seeds the existing CBT writer and print sheet", () => {
    const brief = taughtAssessmentBrief({
      weeks,
      calendarRole: "school_test",
      weekNumber: 7,
      termStart: "2026-09-14",
      activities,
      courseName: "Coding",
      sit: "print",
    });
    expect(brief?.examType).toBe("evaluation");
    expect(brief?.title).toBe("Coding — First Test");
    expect(brief?.sourceMaterial).toContain("Week 1: Scratch stage");
    expect(brief?.sourceMaterial).not.toContain("Not taught");
    expect(hostAssessmentSit("examination", { examCapture: "cbt" })).toBe("cbt");
    expect(hostAssessmentSit("school_test", { testCapture: "physical" })).toBe(
      "print",
    );
  });

  it("keeps First Test, Second Test and Examination as separate scores on the same CBT record", () => {
    expect(
      hostAssessmentKindFromExam({
        title: "Coding — First Test",
        metadata: { generated_from: "taught_weeks" },
      }),
    ).toBe("first_test");
    expect(
      hostAssessmentKindFromExam({
        metadata: { host_assessment: "examination" },
        title: "Weekly quiz",
      }),
    ).toBe("examination");

    const host = hostScoresFromCbtSessions([
      {
        score: 60,
        status: "passed",
        cbt_exams: { title: "Coding — First Test" },
      },
      {
        score: 80,
        status: "passed",
        cbt_exams: { metadata: { host_assessment: "second_test" } },
      },
      {
        score: 90,
        status: "passed",
        cbt_exams: { metadata: { host_assessment: "examination" } },
      },
      {
        score: 99,
        status: "passed",
        cbt_exams: { title: "Weekly evaluation", metadata: { exam_type: "evaluation" } },
      },
    ]);
    expect(host).toEqual({
      first_test: 60,
      second_test: 80,
      examination: 90,
    });
    expect(
      applyHostAssessmentToReportScores({
        rows: [
          {
            score: 60,
            status: "passed",
            cbt_exams: { title: "Coding — First Test" },
          },
          {
            score: 80,
            status: "passed",
            cbt_exams: { metadata: { host_assessment: "second_test" } },
          },
          {
            score: 90,
            status: "passed",
            cbt_exams: { metadata: { host_assessment: "examination" } },
          },
        ],
        examinationFallback: 12,
        evaluationFallback: 15,
      }),
    ).toMatchObject({
      host: { first_test: 60, second_test: 80, examination: 90 },
      theory: 90,
      assessment: 70,
    });
    expect(
      applyHostAssessmentToReportScores({
        rows: [
          {
            score: 90,
            status: "passed",
            cbt_exams: { metadata: { host_assessment: "examination" } },
          },
        ],
        examinationFallback: 12,
        evaluationFallback: 15,
        mapIntoSixBox: false,
      }),
    ).toMatchObject({
      theory: 12,
      assessment: 15,
      host: { first_test: null, second_test: null, examination: 90 },
    });
  });

  it("labels a later school-test week as Second Test when First Test has already passed", () => {
    expect(
      hostAssessmentKindForWeek({
        calendarRole: "school_test",
        weekNumber: 9,
        termStart: "2026-09-14",
        activities: [
          { kind: "first_test", label: "First Test", start: "2026-10-20", end: "2026-10-24" },
        ],
      }),
    ).toBe("second_test");
  });
});
