import { describe, expect, it } from "vitest";
import {
  summarizeTeachingGenerationRuns,
  teachingGenerationStatus,
} from "./tracked-week-generation";

describe("teaching generation run status", () => {
  it("distinguishes complete, partial and wholly failed packages", () => {
    expect(teachingGenerationStatus({
      week: 1,
      generated: 5,
      skipped: 0,
      byType: {},
      failedTypes: [],
    })).toBe("succeeded");
    expect(teachingGenerationStatus({
      week: 1,
      generated: 3,
      skipped: 1,
      byType: { slides: { error: "provider unavailable" } },
      failedTypes: ["slides"],
    })).toBe("partial");
    expect(teachingGenerationStatus({
      week: 1,
      generated: 0,
      skipped: 0,
      byType: { lessons: { error: "provider unavailable" } },
      failedTypes: ["lessons"],
    })).toBe("failed");
  });

  it("turns partial and interrupted runs into professional recovery guidance", () => {
    expect(summarizeTeachingGenerationRuns([{
      status: "partial",
      curriculum_week_number: 2,
      session_number: 1,
      failed_types: ["slides", "flashcards"],
      completed_at: "2026-08-23T00:00:00Z",
    }])).toMatchObject({
      state: "attention",
      week: 2,
      session: 1,
      message: "Some content still needs attention: slides, flashcards. Retry safely; completed items will be kept.",
    });
    expect(summarizeTeachingGenerationRuns([{ status: "interrupted" }]).message)
      .toContain("completed items will be kept");
  });
});
