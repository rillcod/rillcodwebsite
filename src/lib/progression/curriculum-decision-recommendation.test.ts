import { describe, expect, it } from "vitest";
import { DEFAULT_PROMOTION_RULES } from "./promotion-intelligence";
import { recommendCurriculumDecision } from "./curriculum-decision-recommendation";

describe("curriculum decision recommendation", () => {
  it("does not invent a decision from absent or draft evidence", () => {
    expect(recommendCurriculumDecision(null, true, DEFAULT_PROMOTION_RULES).decision).toBeNull();
    expect(recommendCurriculumDecision({
      overall_grade: "A1",
      overall_score: 90,
      is_published: false,
    }, true, DEFAULT_PROMOTION_RULES).decision).toBeNull();
  });

  it("uses configured thresholds and recognizes WAEC grade codes", () => {
    expect(recommendCurriculumDecision({
      overall_grade: "F9",
      overall_score: 70,
      is_published: true,
    }, true, DEFAULT_PROMOTION_RULES).decision).toBe("repeat");
    expect(recommendCurriculumDecision({
      overall_grade: "B2",
      overall_score: 70,
      is_published: true,
    }, true, { ...DEFAULT_PROMOTION_RULES, min_assessment_avg_pct: 75 }).decision)
      .toBe("repeat");
  });

  it("finishes the track only when eligible evidence has no next level", () => {
    expect(recommendCurriculumDecision({
      overall_grade: "A1",
      overall_score: 80,
      is_published: true,
    }, false, DEFAULT_PROMOTION_RULES).decision).toBe("complete");
  });
});
