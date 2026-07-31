import { describe, expect, it } from "vitest";
import {
  overviewAssetStages,
  overviewDeliveryStages,
} from "./overview-flow";
import { nextAction } from "./status";

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
};

describe("overviewAssetStages", () => {
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
});
