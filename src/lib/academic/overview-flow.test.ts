import { describe, expect, it } from "vitest";
import {
  overviewAssetStages,
  overviewDeliveryStages,
} from "./overview-flow";
import { nextAction } from "./status";
import { stagesInLane } from "./lanes";

const base = {
  centralCourses: 10,
  certifiedCourses: 0,
  readyToCertifyCount: 0,
  readyToCertifyCourseId: null,
  awaitingCurriculumCount: 4,
  awaitingCurriculumCourseId: "course-a",
  assignedDirections: 0,
  stuckPlans: 0,
  classesWithPlans: 0,
  classesTotal: 5,
  classesWithDeliveryStarted: 0,
  deliveredLessons: 0,
  assessments: 0,
  linkedAssessments: 0,
  evidenceRecords: 0,
  linkedEvidence: 0,
  legacyEvidenceRecords: 0,
  progressReports: 0,
  readyReports: 0,
  publishedReports: 0,
};

describe("overviewAssetStages", () => {
  it("only emits stages registered in the curriculum lane", () => {
    expect(overviewAssetStages(base).map((stage) => stage.id)).toEqual(
      stagesInLane("asset").map((stage) => stage.id)
    );
  });

  it("keeps certify waiting until a curriculum is written", () => {
    const stages = overviewAssetStages(base);
    const certify = stages.find((s) => s.id === "certify");
    expect(certify?.state).toBe("waiting");
    expect(certify?.actionHref).toBeUndefined();
  });

  it("points next action at writing, not certify, when curricula are missing", () => {
    const stages = overviewAssetStages(base);
    const next = nextAction(stages);
    expect(next?.id).toBe("author");
    expect(next?.actionHref).toContain("/dashboard/academic/build");
  });

  it("opens certify only after drafts exist", () => {
    const stages = overviewAssetStages({
      ...base,
      awaitingCurriculumCount: 0,
      awaitingCurriculumCourseId: null,
      readyToCertifyCount: 2,
      readyToCertifyCourseId: "course-b",
    });
    const next = nextAction(stages);
    expect(next?.id).toBe("certify");
    expect(next?.actionHref).toContain("course_id=course-b");
  });
});

describe("overviewDeliveryStages", () => {
  it("blocks class plans until an official edition exists", () => {
    const stages = overviewDeliveryStages(base);
    const plan = stages.find((s) => s.id === "plan");
    expect(plan?.state).toBe("blocked");
  });

  it("does not call assessment or results ready before teaching is delivered", () => {
    const stages = overviewDeliveryStages({
      ...base,
      certifiedCourses: 10,
      classesWithPlans: 5,
    });
    expect(stages.find((stage) => stage.id === "cover")?.state).toBe("ready");
    expect(stages.find((stage) => stage.id === "evidence")?.state).toBe("waiting");
    expect(stages.find((stage) => stage.id === "result")?.state).toBe("waiting");
  });

  it("stops results when assessment evidence has lost its teaching context", () => {
    const stages = overviewDeliveryStages({
      ...base,
      certifiedCourses: 10,
      classesWithPlans: 5,
      classesWithDeliveryStarted: 5,
      deliveredLessons: 12,
      assessments: 4,
      linkedAssessments: 4,
      evidenceRecords: 8,
      linkedEvidence: 7,
      legacyEvidenceRecords: 1,
    });
    expect(stages.find((stage) => stage.id === "evidence")?.state).toBe("blocked");
    expect(stages.find((stage) => stage.id === "result")?.state).toBe("waiting");
  });

  it("moves from checked results to publication without inventing completion", () => {
    const stages = overviewDeliveryStages({
      ...base,
      certifiedCourses: 10,
      classesWithPlans: 5,
      classesWithDeliveryStarted: 5,
      deliveredLessons: 12,
      assessments: 4,
      linkedAssessments: 4,
      evidenceRecords: 8,
      linkedEvidence: 8,
      progressReports: 5,
      readyReports: 5,
      publishedReports: 3,
    });
    const result = stages.find((stage) => stage.id === "result");
    expect(result?.state).toBe("ready");
    expect(result?.headline).toContain("2 checked results");
  });
});
