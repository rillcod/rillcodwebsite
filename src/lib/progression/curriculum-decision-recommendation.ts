import {
  evaluatePromotionEvidence,
  type PromotionRules,
} from "./promotion-intelligence";
import type { PromotionDecision } from "@/types/progression.types";

export type CurriculumDecisionReport = {
  overall_grade?: string | null;
  overall_score?: number | null;
  is_published?: boolean | null;
};

export type CurriculumDecisionRecommendation = {
  decision: PromotionDecision | null;
  label: string;
  description: string;
  tone: "neutral" | "hold" | "advance" | "complete";
};

/**
 * Suggests a curriculum-ladder decision from published evidence and configured
 * promotion rules. It never invents a decision when evidence is absent/draft,
 * and it never prevents a teacher from recording a reviewed manual decision.
 */
export function recommendCurriculumDecision(
  report: CurriculumDecisionReport | null | undefined,
  hasNextLevel: boolean,
  rules: PromotionRules,
): CurriculumDecisionRecommendation {
  if (!report?.is_published) {
    return {
      decision: null,
      label: "Review evidence",
      description: report
        ? "This report is still a draft. Publish or verify the term evidence before applying an automatic suggestion."
        : "No published report is available for this term. Make a manual decision after reviewing the learner's evidence.",
      tone: "neutral",
    };
  }
  if (report.overall_score == null && !report.overall_grade) {
    return {
      decision: null,
      label: "Review evidence",
      description: "The published report has no scored outcome. Make a manual decision after review.",
      tone: "neutral",
    };
  }

  const verdict = evaluatePromotionEvidence({
    overall_score: report.overall_score ?? null,
    overall_grade: report.overall_grade ?? null,
    attendance_pct: null,
  }, rules);
  if (!verdict.curriculum_advance) {
    return {
      decision: "repeat",
      label: "Hold this level",
      description: `${verdict.reason} This is a suggestion; the teacher can still record a reviewed manual decision.`,
      tone: "hold",
    };
  }
  if (!hasNextLevel) {
    return {
      decision: "complete",
      label: "Complete track",
      description: `${verdict.reason} This is the final configured level.`,
      tone: "complete",
    };
  }
  return {
    decision: "promote",
    label: "Promote",
    description: verdict.reason,
    tone: "advance",
  };
}
