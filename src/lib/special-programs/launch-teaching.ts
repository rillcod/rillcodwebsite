/**
 * Special-programme launch pipeline (option 2 — simple gated flow):
 *
 * Publish page → bridge curriculum from write-up → start week-1 lesson pack.
 * Everything stays hold-for-approval (auto_publish: false). No separate
 * curriculum-approval gate before lessons begin.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { parseAutoGenerateSettings, weeksToGenerateForPlan } from '@/lib/academic/auto-generate-settings';
import {
  bridgeOfferingFromPage,
  type BridgeOfferingResult,
} from '@/lib/special-programs/bridge-offering';
import { extractLessonPlanOperationWeeks } from '@/lib/progression/lessonPlanOperation';
import { currentDeliveryWeek, generatePlanWeek, notifyWeekReady } from '@/lib/academic/week-generation';

export type LaunchTeachingResult = {
  pageId: string;
  offeringId: string | null;
  bridge: BridgeOfferingResult | null;
  weeksStarted: Array<{
    planId: string;
    week: number;
    generated: number;
    skipped: number;
    failedTypes: string[];
  }>;
  error?: string;
  detail?: string;
};

function firstPlanWeekNumber(planData: unknown, periodStart: string | null): number {
  const weeks = extractLessonPlanOperationWeeks(planData) as Array<{ week?: number }>;
  const numbers = weeks
    .map((w) => Number(w.week))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const targets = weeksToGenerateForPlan({
    planWeekNumbers: numbers,
    deliveryWeek: currentDeliveryWeek({ periodStart }),
    prepAheadWeeks: 0,
    maxWeeksPerBatch: 1,
    allowEarlyPrep: true,
  });
  return targets[0] ?? numbers[0] ?? 1;
}

/**
 * Resolve the offering for a page (trigger may have just stamped it), bridge
 * every track, then generate the first teachable weeks for each plan — held
 * for teacher approval.
 */
export async function launchSpecialProgramTeaching(input: {
  pageId: string;
  createdBy: string;
  baseUrl: string;
  cookie?: string;
  cronSecret?: string;
  /** Always rebuild every track from the current page write-up. */
  forceRebuild?: boolean;
}): Promise<LaunchTeachingResult> {
  const db = createAdminClient();
  const empty: LaunchTeachingResult = {
    pageId: input.pageId,
    offeringId: null,
    bridge: null,
    weeksStarted: [],
  };

  // Re-read after publish — the offering-link trigger runs in a follow-up UPDATE.
  let offeringId: string | null = null;
  for (let attempt = 0; attempt < 4 && !offeringId; attempt += 1) {
    const { data: page } = await db
      .from('special_program_pages')
      .select('id,academic_offering_id,is_published,content')
      .eq('id', input.pageId)
      .maybeSingle();
    if (!page?.is_published) {
      return {
        ...empty,
        error: 'Programme is not published.',
      };
    }
    offeringId = page.academic_offering_id ? String(page.academic_offering_id) : null;
    if (!offeringId) {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }

  if (!offeringId) {
    return {
      ...empty,
      error: 'No academic offering is linked to this page yet.',
      detail: 'Publish again once the offering sync has finished, or link the page manually.',
    };
  }

  const bridge = await bridgeOfferingFromPage(db, {
    offeringId,
    createdBy: input.createdBy,
    forceRebuild: input.forceRebuild === true,
    // Expanding Weeks 1–2 → 1–3 (or any window change) is captured on launch.
    rebuildOnWindowChange: true,
  });

  if (bridge.error) {
    return {
      pageId: input.pageId,
      offeringId,
      bridge,
      weeksStarted: [],
      error: bridge.error,
      detail: bridge.detail,
    };
  }

  const planIds = [
    ...new Set(
      bridge.results
        .map((r) => r.planId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const weeksStarted: LaunchTeachingResult['weeksStarted'] = [];
  const baseUrl = input.baseUrl.replace(/\/$/, '');

  for (const planId of planIds) {
    const { data: plan } = await db
      .from('lesson_plans')
      .select('id,class_id,plan_data,metadata,academic_offering_periods:offering_period_id(starts_on)')
      .eq('id', planId)
      .maybeSingle();
    if (!plan) continue;

    const period = Array.isArray((plan as any).academic_offering_periods)
      ? (plan as any).academic_offering_periods[0]
      : (plan as any).academic_offering_periods;
    const week = firstPlanWeekNumber(plan.plan_data, period?.starts_on ?? null);
    const ags = parseAutoGenerateSettings(
      (plan.metadata as Record<string, unknown> | null)?.auto_generate_settings,
    );

    // Launch preps the anchor week plus one ahead so week 2 starts flowing
    // into approvals after week 1 — still never auto-publishes.
    const planWeekNumbers = (
      extractLessonPlanOperationWeeks(plan.plan_data) as Array<{ week?: number }>
    )
      .map((w) => Number(w.week))
      .filter((n) => Number.isFinite(n) && n > 0);
    const targetWeeks = weeksToGenerateForPlan({
      planWeekNumbers,
      deliveryWeek: week,
      prepAheadWeeks: Math.max(1, ags.prep_ahead_weeks || 1),
      maxWeeksPerBatch: Math.max(2, ags.maxWeeksPerBatch || 2),
      allowEarlyPrep: true,
    });

    for (const targetWeek of targetWeeks.length ? targetWeeks : [week]) {
      const outcome = await generatePlanWeek({
        planId,
        week: targetWeek,
        types: ags.types,
        baseUrl,
        cookie: input.cookie,
        cronSecret: input.cronSecret,
        autoPublish: false,
      });

      await notifyWeekReady(db, {
        planId,
        classId: plan.class_id ?? null,
        week: targetWeek,
        outcome,
        autoPublish: false,
      });

      weeksStarted.push({
        planId,
        week: targetWeek,
        generated: outcome.generated,
        skipped: outcome.skipped,
        failedTypes: outcome.failedTypes,
      });
    }
  }

  return {
    pageId: input.pageId,
    offeringId,
    bridge,
    weeksStarted,
  };
}
