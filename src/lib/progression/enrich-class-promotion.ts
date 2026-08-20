import type { ClassPromotionPlan, PromotionMovePlan } from '@/lib/classes/class-promotion';
import {
  evaluatePromotionEvidence,
  shouldAdvanceCurriculum,
  summariseIntelligentMoves,
  type PromotionEvidence,
  type PromotionIntelVerdict,
  type PromotionRules,
} from '@/lib/progression/promotion-intelligence';

export type IntelligentMovePlan = PromotionMovePlan & {
  intel?: PromotionIntelVerdict;
  evidence?: PromotionEvidence;
  curriculum_planned?: boolean;
};

export type IntelligentClassPromotionPlan = ClassPromotionPlan & {
  moves: IntelligentMovePlan[];
  intelligence: ReturnType<typeof summariseIntelligentMoves>;
  rules_snapshot: PromotionRules;
};

export type SmartPromotionOptions = {
  smart_mode?: boolean;
  advance_curriculum?: 'auto' | 'always' | 'never';
  strict_class_gate?: boolean;
};

/** Apply platform gates to a mechanical class promotion plan. */
export function enrichPromotionPlanWithIntelligence(
  plan: ClassPromotionPlan,
  evidenceByStudent: Map<string, PromotionEvidence>,
  rules: PromotionRules,
  opts: SmartPromotionOptions = {},
): IntelligentClassPromotionPlan {
  const smart = opts.smart_mode !== false;
  const curriculumMode = opts.advance_curriculum ?? 'auto';
  const strict = opts.strict_class_gate === true;

  const moves: IntelligentMovePlan[] = plan.moves.map((move) => {
    if (move.skipped) return { ...move };

    const evidence = evidenceByStudent.get(move.student_id) ?? {
      overall_score: null,
      overall_grade: null,
      attendance_pct: null,
    };

    if (!smart) {
      return {
        ...move,
        evidence,
        curriculum_planned: curriculumMode !== 'never',
        intel: {
          tier: 'full',
          class_promote: true,
          curriculum_advance: curriculumMode !== 'never',
          fast_track_hint: false,
          reason: 'Smart gates off — all roster moves proceed; curriculum follows your setting.',
        },
      };
    }

    const intel = evaluatePromotionEvidence(evidence, rules, { strict_class_gate: strict });

    if (!intel.class_promote) {
      return {
        ...move,
        skipped: true,
        skip_reason: intel.reason,
        evidence,
        intel,
        curriculum_planned: false,
      };
    }

    const curriculum_planned = shouldAdvanceCurriculum(intel, curriculumMode);

    return {
      ...move,
      evidence,
      intel,
      curriculum_planned,
    };
  });

  const promotable_count = moves.filter((m) => !m.skipped).length;
  const skipped_count = moves.filter((m) => m.skipped).length;

  return {
    ...plan,
    moves,
    promotable_count,
    skipped_count,
    intelligence: summariseIntelligentMoves(moves),
    rules_snapshot: rules,
  };
}
