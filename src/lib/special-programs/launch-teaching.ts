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
import { ensureCohortClass } from '@/lib/special-programs/ensure-cohort-class';

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

  // Teaching without a cohort class leaves Approvals and the classroom empty.
  // Create it here rather than failing, so every entry point (publish, Prepare,
  // featured, cron) lands ready instead of half-built. Doing it before the
  // bridge lets the new plans attach to the class as they are written.
  let cohort = await ensureCohortClass(db, {
    pageId: input.pageId,
    actorId: input.createdBy,
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

  // The bridge stamps the school and programme onto the offering, so a cohort
  // that failed for want of those anchors can succeed on the second pass.
  if (!cohort.cohort) {
    cohort = await ensureCohortClass(db, {
      pageId: input.pageId,
      actorId: input.createdBy,
    });
  }
  const cohortWarning = cohort.error
    ? cohort.cohort
      ? `Cohort class ready, but: ${cohort.error}`
      : `${cohort.error} Teachers will not see this in Approvals until a cohort class exists.`
    : undefined;

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
    const { data: planRow } = await db
      .from('lesson_plans')
      .select('id,class_id,plan_data,metadata,academic_offering_periods:offering_period_id(starts_on)')
      .eq('id', planId)
      .maybeSingle();
    // Cast around generated Supabase types that reject metadata on lesson_plans.
    const plan = planRow as {
      id: string;
      class_id: string | null;
      plan_data: unknown;
      metadata: Record<string, unknown> | null;
      academic_offering_periods?: { starts_on?: string | null } | Array<{ starts_on?: string | null }> | null;
    } | null;
    if (!plan) continue;
    if (!plan.class_id) missingClass = true;

    const period = Array.isArray(plan.academic_offering_periods)
      ? plan.academic_offering_periods[0]
      : plan.academic_offering_periods;
    const week = firstPlanWeekNumber(plan.plan_data, period?.starts_on ?? null);
    const ags = parseAutoGenerateSettings(
      plan.metadata?.auto_generate_settings,
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

    // Fallback: If HTTP loopback returned 0 generated items (e.g. serverless loopback fetch restriction),
    // populate draft lesson & assignment rows directly from curriculum plan_data!
    if (outcome.generated === 0) {
      const direct = await ensureDraftWeekContentDirectly(db, { planId, week, session: 1 });
      outcome.generated += direct.generated;
    }

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
    warning:
      cohortWarning ??
      (missingClass
        ? 'Plans were prepared, but some of them are not attached to the cohort class yet. Open the class workspace to link them.'
        : cohort.created
          ? `Cohort class "${cohort.cohort?.name}" was created automatically for teachers.`
          : undefined),
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

async function ensureDraftWeekContentDirectly(
  db: any,
  input: { planId: string; week: number; session?: number | null }
): Promise<{ generated: number }> {
  const { data: planRow } = await db
    .from('lesson_plans')
    .select('id, course_id, school_id, plan_data')
    .eq('id', input.planId)
    .maybeSingle();

  if (!planRow) return { generated: 0 };
  const weeks = Array.isArray(planRow.plan_data?.weeks) ? planRow.plan_data.weeks : [];
  const weekMeta = weeks.find((w: any) => Number(w.week) === input.week) || weeks[0];
  if (!weekMeta) return { generated: 0 };

  let generated = 0;

  // 1. Check/create draft lesson
  const { data: existingLesson } = await db
    .from('lessons')
    .select('id')
    .eq('lesson_plan_id', input.planId)
    .eq('curriculum_week_number', input.week)
    .maybeSingle();

  if (!existingLesson) {
    const lessonDesc = typeof weekMeta.objectives === 'string' && weekMeta.objectives.trim()
      ? weekMeta.objectives
      : Array.isArray(weekMeta.objectives) && weekMeta.objectives.length > 0
      ? weekMeta.objectives.join(' · ')
      : typeof weekMeta.desc === 'string' && weekMeta.desc.trim()
      ? weekMeta.desc
      : `Curriculum Lesson: ${weekMeta.topic || `Week ${input.week}`}`;

    const { error: lErr } = await db.from('lessons').insert({
      lesson_plan_id: input.planId,
      course_id: planRow.course_id,
      school_id: planRow.school_id,
      title: weekMeta.topic || `Week ${input.week} Lesson`,
      description: lessonDesc,
      status: 'draft',
      duration_minutes: 60,
      curriculum_week_number: input.week,
      order_index: 1,
      metadata: {
        generated_by: 'special_program_launcher',
        topic: weekMeta.topic,
        objectives: weekMeta.objectives,
        student_activities: weekMeta.student_activities || weekMeta.activities,
        classwork: weekMeta.classwork,
        assignment: weekMeta.assignment,
        session_number: input.session || 1,
      },
    });
    if (!lErr) generated++;
  }

  // 2. Check/create draft assignment
  const { data: existingAssignment } = await db
    .from('assignments')
    .select('id')
    .eq('lesson_plan_id', input.planId)
    .eq('curriculum_week_number', input.week)
    .maybeSingle();

  if (!existingAssignment) {
    const assignmentTitle = weekMeta.assignment
      ? (typeof weekMeta.assignment === 'string' ? weekMeta.assignment : (weekMeta.assignment.title || `Assignment: Week ${input.week}`))
      : `Assignment: ${weekMeta.topic || `Week ${input.week}`}`;

    const assignmentDesc = typeof weekMeta.assignment === 'string' && weekMeta.assignment.trim()
      ? weekMeta.assignment
      : typeof weekMeta.assignment === 'object' && weekMeta.assignment?.description
      ? String(weekMeta.assignment.description)
      : typeof weekMeta.assignment === 'object' && weekMeta.assignment?.instructions
      ? String(weekMeta.assignment.instructions)
      : `Practical Homework Task: Review and complete exercises based on "${weekMeta.topic || `Week ${input.week}`}". Apply key concepts learned in class.`;

    const { error: aErr } = await db.from('assignments').insert({
      lesson_plan_id: input.planId,
      course_id: planRow.course_id,
      school_id: planRow.school_id,
      title: assignmentTitle,
      description: assignmentDesc,
      is_active: false,
      assignment_type: 'homework',
      curriculum_week_number: input.week,
      metadata: {
        generated_by: 'special_program_launcher',
        topic: weekMeta.topic,
        session_number: input.session || 1,
      },
    });
    if (!aErr) generated++;
  }

  return { generated };
}
