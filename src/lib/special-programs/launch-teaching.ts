/**
 * Special-programme launch pipeline:
 *
 * Publish page → bridge curriculum from write-up → prepare Week 1 · Class 1 only
 * (fast, AI-context safe). Remaining class meetings and later weeks continue
 * via the nightly sweep and the teacher's Prepare button — one meeting at a time.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { parseAutoGenerateSettings, weeksToGenerateForPlan } from '@/lib/academic/auto-generate-settings';
import {
  bridgeOfferingFromPage,
  type BridgeOfferingResult,
} from '@/lib/special-programs/bridge-offering';
import { extractLessonPlanOperationWeeks } from '@/lib/progression/lessonPlanOperation';
import { currentDeliveryWeek, generatePlanWeek, notifyWeekReady } from '@/lib/academic/week-generation';
import {
  notifyAdminTeachingLaunch,
  writeTeachingLaunchStatus,
} from '@/lib/special-programs/teaching-launch-status';

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
  warning?: string;
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
  /** Notify this admin when prep finishes (success or failure). */
  notifyAdminId?: string;
}): Promise<LaunchTeachingResult> {
  const db = createAdminClient();
  const empty: LaunchTeachingResult = {
    pageId: input.pageId,
    offeringId: null,
    bridge: null,
    weeksStarted: [],
  };

  const { data: pageMeta } = await db
    .from('special_program_pages')
    .select('id,title,program_id,is_published,academic_offering_id')
    .eq('id', input.pageId)
    .maybeSingle();

  if (!pageMeta?.is_published) {
    return { ...empty, error: 'Publish the page before preparing teaching.' };
  }
  if (!pageMeta.program_id) {
    return {
      ...empty,
      error: 'Link a programme on this page first.',
      detail: 'Open Basics, choose the programme these modules belong to, save, then prepare teaching again.',
    };
  }

  // Re-read after publish — the offering-link trigger runs in a follow-up UPDATE.
  let offeringId: string | null = pageMeta.academic_offering_id
    ? String(pageMeta.academic_offering_id)
    : null;
  for (let attempt = 0; attempt < 4 && !offeringId; attempt += 1) {
    const { data: page } = await db
      .from('special_program_pages')
      .select('id,academic_offering_id,is_published')
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
      detail: 'Save the page with a start date and linked programme, then try Prepare teaching again.',
    };
  }

  await writeTeachingLaunchStatus(db, offeringId, {
    status: 'running',
    at: new Date().toISOString(),
    force_rebuild: input.forceRebuild === true,
  });

  const bridge = await bridgeOfferingFromPage(db, {
    offeringId,
    createdBy: input.createdBy,
    forceRebuild: input.forceRebuild === true,
    // Expanding Weeks 1–2 → 1–3 (or any window change) is captured on launch.
    rebuildOnWindowChange: true,
  });

  if (bridge.error) {
    const failed: LaunchTeachingResult = {
      pageId: input.pageId,
      offeringId,
      bridge,
      weeksStarted: [],
      error: bridge.error,
      detail: bridge.detail,
    };
    await writeTeachingLaunchStatus(db, offeringId, {
      status: 'error',
      at: new Date().toISOString(),
      error: bridge.error,
      detail: bridge.detail,
      built: bridge.built,
      skipped: bridge.skipped,
      failed: bridge.failed,
      force_rebuild: input.forceRebuild === true,
    });
    if (input.notifyAdminId) {
      await notifyAdminTeachingLaunch(db, {
        adminId: input.notifyAdminId,
        pageTitle: String(pageMeta.title || 'Special programme'),
        pageId: input.pageId,
        result: failed,
      });
    }
    return failed;
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
  let missingClass = false;

  for (const planId of planIds) {
    const { data: plan } = await db
      .from('lesson_plans')
      .select('id,class_id,plan_data,metadata,academic_offering_periods:offering_period_id(starts_on)')
      .eq('id', planId)
      .maybeSingle();
    if (!plan) continue;
    if (!plan.class_id) missingClass = true;

    const period = Array.isArray((plan as any).academic_offering_periods)
      ? (plan as any).academic_offering_periods[0]
      : (plan as any).academic_offering_periods;
    const week = firstPlanWeekNumber(plan.plan_data, period?.starts_on ?? null);
    const ags = parseAutoGenerateSettings(
      (plan.metadata as Record<string, unknown> | null)?.auto_generate_settings,
    );

    // Fast launch: one class meeting only (Week N · Class 1). The rest of the
    // week and later weeks keep flowing via cron / teacher AI — one meeting at
    // a time so the model does not run out of context.
    const outcome = await generatePlanWeek({
      planId,
      week,
      session: 1,
      types: ags.types,
      baseUrl,
      cookie: input.cookie,
      cronSecret: input.cronSecret,
      autoPublish: false,
    });

    await notifyWeekReady(db, {
      planId,
      classId: plan.class_id ?? null,
      week,
      outcome,
      autoPublish: false,
    });

    weeksStarted.push({
      planId,
      week,
      generated: outcome.generated,
      skipped: outcome.skipped,
      failedTypes: outcome.failedTypes,
    });
  }

  const result: LaunchTeachingResult = {
    pageId: input.pageId,
    offeringId,
    bridge,
    weeksStarted,
    warning: missingClass
      ? 'Plans were prepared, but this programme has no cohort class yet. Create a class on the offering so teachers get Approvals and workspace access.'
      : undefined,
  };

  await writeTeachingLaunchStatus(db, offeringId, {
    status: 'ok',
    at: new Date().toISOString(),
    built: bridge.built,
    skipped: bridge.skipped,
    failed: bridge.failed,
    weeks_started: weeksStarted.length,
    detail: result.warning,
    force_rebuild: input.forceRebuild === true,
  });

  if (input.notifyAdminId) {
    await notifyAdminTeachingLaunch(db, {
      adminId: input.notifyAdminId,
      pageTitle: String(pageMeta.title || 'Special programme'),
      pageId: input.pageId,
      result,
    });
  }

  return result;
}
