/** Platform promotion gates — mirrors lms.ops.promotion defaults. */
export type PromotionRules = {
  min_attendance_pct: number;
  min_assessment_avg_pct: number;
  allow_conditional_promotion: boolean;
  conditional_promotion_min_pct: number;
};

export const DEFAULT_PROMOTION_RULES: PromotionRules = {
  min_attendance_pct: 70,
  min_assessment_avg_pct: 50,
  allow_conditional_promotion: true,
  conditional_promotion_min_pct: 45,
};

export type PromotionEvidence = {
  overall_score: number | null;
  overall_grade: string | null;
  attendance_pct: number | null;
};

export type PromotionIntelTier = 'full' | 'class_only' | 'hold' | 'graduate';

export type PromotionIntelVerdict = {
  tier: PromotionIntelTier;
  class_promote: boolean;
  curriculum_advance: boolean;
  fast_track_hint: boolean;
  reason: string;
};

const FAIL_GRADES = new Set(['F', 'E', 'U']);

function letterFails(grade: string | null | undefined): boolean {
  if (!grade) return false;
  const g = grade.trim().toUpperCase().split(/[\s(/]/)[0];
  return FAIL_GRADES.has(g);
}

/** Score-based promotion verdict for one learner. */
export function evaluatePromotionEvidence(
  evidence: PromotionEvidence,
  rules: PromotionRules = DEFAULT_PROMOTION_RULES,
  opts: { strict_class_gate?: boolean } = {},
): PromotionIntelVerdict {
  const strict = opts.strict_class_gate === true;
  const score = evidence.overall_score != null && Number.isFinite(Number(evidence.overall_score))
    ? Number(evidence.overall_score)
    : null;
  const att = evidence.attendance_pct != null && Number.isFinite(Number(evidence.attendance_pct))
    ? Number(evidence.attendance_pct)
    : null;

  if (letterFails(evidence.overall_grade)) {
    return {
      tier: 'hold',
      class_promote: false,
      curriculum_advance: false,
      fast_track_hint: false,
      reason: `Report grade ${evidence.overall_grade} — repeat recommended; class promotion paused.`,
    };
  }

  if (att != null && att < rules.min_attendance_pct) {
    if (strict) {
      return {
        tier: 'hold',
        class_promote: false,
        curriculum_advance: false,
        fast_track_hint: false,
        reason: `Attendance ${att}% is below the ${rules.min_attendance_pct}% gate.`,
      };
    }
    return {
      tier: 'class_only',
      class_promote: true,
      curriculum_advance: false,
      fast_track_hint: false,
      reason: `Attendance ${att}% — moves class; curriculum track waits until attendance recovers.`,
    };
  }

  if (score == null) {
    return {
      tier: 'class_only',
      class_promote: true,
      curriculum_advance: false,
      fast_track_hint: false,
      reason: 'No scored report yet — class moves; curriculum track waits for evidence.',
    };
  }

  const fastTrack = score >= rules.min_assessment_avg_pct + 25;

  if (score >= rules.min_assessment_avg_pct) {
    return {
      tier: 'full',
      class_promote: true,
      curriculum_advance: true,
      fast_track_hint: fastTrack,
      reason: fastTrack
        ? `Score ${score}% — class + curriculum; strong candidate for extra ladder steps in Learner Progress.`
        : `Score ${score}% — class and curriculum track advance together.`,
    };
  }

  if (
    rules.allow_conditional_promotion &&
    score >= rules.conditional_promotion_min_pct
  ) {
    return {
      tier: 'class_only',
      class_promote: true,
      curriculum_advance: false,
      fast_track_hint: false,
      reason: `Score ${score}% — conditional pass; class moves, curriculum track held for review.`,
    };
  }

  if (strict) {
    return {
      tier: 'hold',
      class_promote: false,
      curriculum_advance: false,
      fast_track_hint: false,
      reason: `Score ${score}% is below ${rules.conditional_promotion_min_pct}% — held for repeat.`,
    };
  }

  return {
    tier: 'class_only',
    class_promote: true,
    curriculum_advance: false,
    fast_track_hint: false,
    reason: `Score ${score}% — class moves with cohort; use Learner Progress to repeat or fast-track the ladder.`,
  };
}

export function shouldAdvanceCurriculum(
  verdict: PromotionIntelVerdict,
  mode: 'auto' | 'always' | 'never',
): boolean {
  if (mode === 'never') return false;
  if (mode === 'always') return verdict.class_promote;
  return verdict.curriculum_advance;
}

export type IntelligentPromotionSummary = {
  full: number;
  class_only: number;
  hold: number;
  curriculum_auto: number;
  fast_track_hints: number;
};

export function summariseIntelligentMoves(
  moves: Array<{ intel?: PromotionIntelVerdict | null; skipped?: boolean; curriculum_planned?: boolean }>,
): IntelligentPromotionSummary {
  let full = 0;
  let class_only = 0;
  let hold = 0;
  let curriculum_auto = 0;
  let fast_track_hints = 0;
  for (const m of moves) {
    if (m.skipped) continue;
    const tier = m.intel?.tier;
    if (tier === 'full') full += 1;
    else if (tier === 'class_only') class_only += 1;
    else if (tier === 'hold') hold += 1;
    if (m.curriculum_planned) curriculum_auto += 1;
    if (m.intel?.fast_track_hint) fast_track_hints += 1;
  }
  return { full, class_only, hold, curriculum_auto, fast_track_hints };
}
