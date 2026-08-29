import { describe, expect, it } from "vitest";
import { summarizeTeachingWorkflow } from "./teaching-workflow-summary";

function row(input: Partial<{
  week: number;
  taught: boolean;
  action: string;
  complete: boolean;
  live: boolean;
  held: boolean;
}> = {}) {
  return {
    week: input.week ?? 1,
    taught: input.taught ?? false,
    recommendedAction: input.action ?? "prepare",
    packageStatus: {
      complete: input.complete ?? false,
      missing: input.complete ? [] : ["lesson", "slides"],
    },
    visibilitySummary: {
      fullyLive: input.live ?? false,
      needsRelease: input.held ?? false,
    },
  };
}

describe("teaching workflow summary", () => {
  it("counts curriculum weeks separately from teaching sessions", () => {
    const summary = summarizeTeachingWorkflow([
      row({ week: 1 }),
      row({ week: 1 }),
      row({ week: 2 }),
    ]);
    expect(summary.curriculumWeeks).toBe(2);
    expect(summary.totalSessions).toBe(3);
    expect(summary.missingItems).toBe(6);
    expect(summary.nextStage).toBe("prepare");
  });

  it("moves from preparation to review, teaching and completion", () => {
    expect(summarizeTeachingWorkflow([
      row({ complete: true, held: true, action: "release" }),
    ]).nextStage).toBe("review");
    expect(summarizeTeachingWorkflow([
      row({ complete: true, live: true, action: "teach" }),
    ]).nextStage).toBe("teach");
    expect(summarizeTeachingWorkflow([
      row({ complete: true, live: true, taught: true, action: "none" }),
    ]).nextStage).toBe("complete");
  });
});
