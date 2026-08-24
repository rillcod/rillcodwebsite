import { SCORE_WEIGHTS, type ScoreWeights } from '@/lib/grading';

export const SCORE_COMPONENT_KEYS = [
  'theory', 'classwork', 'practical', 'assignments', 'attendance', 'assessment',
] as const;

export type PublishedGradingScheme = {
  id: string;
  name: string;
  components: unknown;
  school_id?: string | null;
  course_id?: string | null;
  academic_term_id?: string | null;
  academic_offering_id?: string | null;
  updated_at?: string | null;
};

export type GradingSchemeContext = {
  schoolId?: string | null;
  courseId?: string | null;
  termId?: string | null;
  academicOfferingId?: string | null;
};

export function scoreWeightsFromPublishedComponents(value: unknown): ScoreWeights | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const percentages = {} as Record<(typeof SCORE_COMPONENT_KEYS)[number], number>;
  let total = 0;
  for (const key of SCORE_COMPONENT_KEYS) {
    const parsed = Number(record[key]);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
    percentages[key] = parsed;
    total += parsed;
  }
  if (Math.abs(total - 100) > 0.001) return null;
  return Object.fromEntries(
    SCORE_COMPONENT_KEYS.map((key) => [key, percentages[key] / 100]),
  ) as ScoreWeights;
}

/** Resolve the immutable weighting snapshot stored with an official report. */
export function scoreWeightsFromReportMetrics(metrics: unknown): ScoreWeights {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return SCORE_WEIGHTS;
  const value = (metrics as Record<string, unknown>).score_weights;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return SCORE_WEIGHTS;
  const record = value as Record<string, unknown>;
  const parsed = {} as Record<(typeof SCORE_COMPONENT_KEYS)[number], number>;
  let total = 0;
  for (const key of SCORE_COMPONENT_KEYS) {
    const amount = Number(record[key]);
    if (!Number.isFinite(amount) || amount < 0) return SCORE_WEIGHTS;
    parsed[key] = amount;
    total += amount;
  }
  if (Math.abs(total - 1) <= 0.0001 && SCORE_COMPONENT_KEYS.every((key) => parsed[key] <= 1)) {
    return parsed as ScoreWeights;
  }
  return scoreWeightsFromPublishedComponents(parsed) ?? SCORE_WEIGHTS;
}

export function scoreWeightPercent(weights: ScoreWeights, key: keyof ScoreWeights): number {
  return Math.round(weights[key] * 10_000) / 100;
}

function matches(scope: string | null | undefined, context: string | null | undefined): boolean {
  return !scope || (!!context && scope === context);
}

export function selectEffectiveGradingScheme(
  schemes: readonly PublishedGradingScheme[],
  context: GradingSchemeContext,
): PublishedGradingScheme | null {
  return schemes
    .filter((scheme) => scoreWeightsFromPublishedComponents(scheme.components))
    .filter((scheme) => matches(scheme.school_id, context.schoolId))
    .filter((scheme) => matches(scheme.course_id, context.courseId))
    .filter((scheme) => matches(scheme.academic_term_id, context.termId))
    .filter((scheme) => matches(scheme.academic_offering_id, context.academicOfferingId))
    .sort((left, right) => {
      // Must match recalculate_academic_result exactly: offering → school →
      // course → term, then newest policy. A preview must never select a
      // different rule from the database calculation.
      const specificity = (scheme: PublishedGradingScheme) =>
        (scheme.academic_offering_id ? 8 : 0)
        + (scheme.school_id ? 4 : 0)
        + (scheme.course_id ? 2 : 0)
        + (scheme.academic_term_id ? 1 : 0);
      return specificity(right) - specificity(left)
        || String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? ''))
        || String(right.id).localeCompare(String(left.id));
    })[0] ?? null;
}

export function resolveEffectiveScoreWeights(
  schemes: readonly PublishedGradingScheme[],
  context: GradingSchemeContext,
): { weights: ScoreWeights; scheme: PublishedGradingScheme | null } {
  const scheme = selectEffectiveGradingScheme(schemes, context);
  return {
    scheme,
    weights: scheme ? scoreWeightsFromPublishedComponents(scheme.components)! : SCORE_WEIGHTS,
  };
}

type GradingDb = { from: (table: string) => any };

export async function loadEffectiveScoreWeights(db: GradingDb, context: GradingSchemeContext) {
  const { data, error } = await db
    .from('academic_assessment_schemes')
    .select('id,name,components,school_id,course_id,academic_term_id,academic_offering_id,updated_at')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`Could not load the active result-weighting policy: ${error.message}`);
  return resolveEffectiveScoreWeights((data ?? []) as PublishedGradingScheme[], context);
}
