/**
 * After academic readiness creates a school plan, generate the first teachable
 * week through the same engine special programmes use on Prepare teaching.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { parseAutoGenerateSettings, weeksToGenerateForPlan } from './auto-generate-settings';
import {
  currentDeliveryWeek,
  notifyWeekReady,
  type WeekGenerationOutcome,
} from './week-generation';
import { generateTrackedPlanWeek } from './tracked-week-generation';
import { extractLessonPlanOperationWeeks } from '@/lib/progression/lessonPlanOperation';
import { ensureGenerationPlanReady } from './generation-plan-state';

export async function bootstrapClassTeachingWeek(
  classId: string,
  opts?: { cronSecret?: string; cookie?: string },
): Promise<WeekGenerationOutcome | null> {
  if (!classId) return null;
  const db = createAdminClient() as any;

  const { data: plan } = await db
    .from('lesson_plans')
    .select(
      'id, class_id, status, plan_data, metadata, term_start, academic_offering_periods:offering_period_id(starts_on)',
    )
    .eq('class_id', classId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan?.id) return null;

  const weeks = extractLessonPlanOperationWeeks(plan.plan_data);
  if (!weeks.length) return null;

  // Activating the class plan only enables generation. Every generated child
  // item still stays held until a teacher shares the package.
  const planState = await ensureGenerationPlanReady(db, plan);
  if (!planState.ready) return null;

  const period = Array.isArray(plan.academic_offering_periods)
    ? plan.academic_offering_periods[0]
    : plan.academic_offering_periods;
  const weekNumbers = weeks
    .map((w) => Number((w as { week?: number }).week))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!weekNumbers.length) return null;

  const week =
    weeksToGenerateForPlan({
      planWeekNumbers: weekNumbers,
      deliveryWeek: currentDeliveryWeek({
        termStart: plan.term_start ?? null,
        periodStart: period?.starts_on ?? null,
      }),
      prepAheadWeeks: 0,
      maxWeeksPerBatch: 1,
      allowEarlyPrep: true,
    })[0] ?? [...weekNumbers].sort((a, b) => a - b)[0];

  const ags = parseAutoGenerateSettings(plan.metadata?.auto_generate_settings);
  const cronSecret =
    opts?.cronSecret ??
    process.env.CRON_SECRET ??
    process.env.BILLING_CRON_SECRET ??
    undefined;

  const { outcome } = await generateTrackedPlanWeek({
    db,
    planId: String(plan.id),
    classId: plan.class_id ?? null,
    week,
    session: 1,
    types: ags.types,
    cronSecret,
    cookie: opts?.cookie,
    autoPublish: false,
    source: 'bootstrap',
  });

  await notifyWeekReady(db, {
    planId: String(plan.id),
    classId: plan.class_id ?? null,
    week,
    session: 1,
    outcome,
    autoPublish: false,
  });

  return outcome;
}
