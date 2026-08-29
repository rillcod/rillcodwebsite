import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { cronInterval } from '@/lib/operations/cron-registry';
import {
  currentDeliveryWeek,
  notifyWeekReady,
} from '@/lib/academic/week-generation';
import { calendarHasStarted } from '@/lib/academic/delivery-calendar';
import {
  copyableMeetingKeysFromSources,
  decideSweepTargets,
  describeGenerationSkip,
  meetingSeedKey,
  orderPlansForSweep,
  planMeetingsForSweep,
  shouldStampSweepRun,
} from '@/lib/academic/generation-ops';
import type { ExistingContent } from '@/lib/academic/content-reuse';
import {
  generateTrackedPlanWeek,
  markInterruptedTeachingGenerationRuns,
} from '@/lib/academic/tracked-week-generation';
import {
  parseAutoGenerateSettings,
  weeksToGenerateForPlan,
  nextMeetingsToGenerate,
  planMeetingKey,
  type AutoGenerateSettings,
} from '@/lib/academic/auto-generate-settings';
import { extractLessonPlanOperationWeeks } from '@/lib/progression/lessonPlanOperation';
import { buildTeachingWeekRows } from '@/lib/academic/teaching-workspace';
import {
  cadenceForTeachingPlan,
  expandPlanWeeksForMeetings,
  hostCalendarForClass,
  keepRillcodTeachingWeeks,
} from '@/lib/academic/school-programme-standing';
import { ensureGenerationPlanReady } from '@/lib/academic/generation-plan-state';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — each plan generates up to N weeks

// Shape, defaults and the publish rule all live in auto-generate-settings —
// this route reads them, it does not restate them.
type AutoGenSettings = AutoGenerateSettings;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET or POST /api/cron/auto-generate-content
// Finds all executable class plans with auto_generate_settings.enabled = true.
// Older draft plans with teaching weeks are activated here; child content is
// still held for teacher review and is never exposed by this status change.
// and generates the next N weeks of content for each plan.
// Chained once a day from academic-readiness, so the health interval is daily. A shorter one
// marks this job Late for most of every day.
export async function GET(req: NextRequest) {
  return runMonitoredCron('auto-generate-content', cronInterval('auto-generate-content'), () => handleRequest(req));
}

export async function POST(req: NextRequest) {
  return runMonitoredCron('auto-generate-content', cronInterval('auto-generate-content'), () => handleRequest(req));
}

async function handleRequest(req: NextRequest) {
  const cronSecret = extractCronSecret(req);
  if (!isValidCronSecret(cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = adminClient();
  const interruptedRunsRecovered = await markInterruptedTeachingGenerationRuns(db);

  // No base URL here on purpose. The sweep used to reach its own generator routes
  // over HTTP, which meant guessing which deployment it was running in —
  // NEXT_PUBLIC_APP_URL names production everywhere, so preview and local runs
  // generated against production and recorded the 404s as "types failed".
  // generatePlanWeek now calls those handlers in-process, so there is no URL to
  // get wrong.

  // The delivery period comes along so a duration programme can be advanced.
  // Counting a holiday programme from term_start gave week 1 forever, because
  // it has no term and no term_start — the sweep would have rebuilt week 1
  // every night instead of moving through the programme.
  const { data: plans, error } = await db
    .from('lesson_plans')
    .select('id, term_start, class_id, status, metadata, plan_data, curriculum_release_id, sessions_per_week, academic_offering_periods:offering_period_id(starts_on)')
    .in('status', ['draft', 'published']);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enabledPlans = (plans ?? []).filter((p) => {
    const meta = p.metadata as Record<string, unknown> | null;
    return parseAutoGenerateSettings(meta?.auto_generate_settings).enabled;
  });

  // Hobby-safe batching (no extra cron jobs): each run handles only the few
  // least-recently-generated plans and stops before the serverless cap, so
  // successive scheduled runs rotate through every plan without ever timing out.
  // maxDuration=300 above is honoured on Pro; on Hobby the 50s budget guards it.
  // Raised from 3 now that a week is mostly copied rather than generated. Three
  // was sized for five AI calls per plan; the first class on a release still
  // pays that, but every class after it copies, which is inserts and a storage
  // duplication. The cap was never the real guard — DEADLINE below is, and it
  // stops the loop mid-batch whatever this says. A cap sized for the slow path
  // simply left the fast path idling for fifty seconds.
  const MAX_PLANS_PER_RUN = Number(process.env.AUTO_GEN_PLANS_PER_RUN) || 12;
  const DEADLINE = Date.now() + 50_000; // ~10s headroom under the 60s Hobby cap
  const lastRunAt = (p: any): number => {
    const t = (p.metadata?.auto_generate_settings as AutoGenSettings & { last_run_at?: string })?.last_run_at;
    const ms = t ? new Date(t).getTime() : 0;
    return Number.isFinite(ms) ? ms : 0;
  };
  const allClassIds = Array.from(
    new Set(enabledPlans.map((plan) => plan.class_id).filter(Boolean)),
  ) as string[];
  const { data: classRows } = allClassIds.length
    ? await db
        .from('classes')
        .select(
          'id, academic_terms(start_date,end_date), schools(programme_standing,sessions_per_week)',
        )
        .in('id', allClassIds)
    : { data: [] as any[] };
  const classById = new Map((classRows ?? []).map((row: any) => [row.id, row]));

  const prepared = enabledPlans.map((plan) => {
    const meta = (plan.metadata ?? {}) as Record<string, unknown>;
    const ags = parseAutoGenerateSettings(meta.auto_generate_settings);
    const period = Array.isArray((plan as any).academic_offering_periods)
      ? (plan as any).academic_offering_periods[0]
      : (plan as any).academic_offering_periods;
    const periodStart = period?.starts_on ?? null;
    const currentWeek = currentDeliveryWeek({
      termStart: plan.term_start ?? null,
      periodStart,
    });
    const termHasStarted = calendarHasStarted(plan.term_start ?? periodStart);
    const planRows = extractLessonPlanOperationWeeks(plan.plan_data) as Array<
      Record<string, unknown>
    >;
    const planWeekNumbers = planRows
      .map((w) => Number(w.week))
      .filter((n) => Number.isFinite(n) && n > 0);
    const host = hostCalendarForClass(classById.get(plan.class_id));
    const sessionsPerWeek = cadenceForTeachingPlan({
      planSessionsPerWeek: (plan as { sessions_per_week?: unknown }).sessions_per_week,
      schoolSessionsPerWeek: host.policy.sessionsPerWeek,
    });
    const teachingWeeks = expandPlanWeeksForMeetings(planRows, sessionsPerWeek);
    const windowWeeks = weeksToGenerateForPlan({
      planWeekNumbers,
      deliveryWeek: currentWeek,
      prepAheadWeeks: ags.prep_ahead_weeks,
      termHasStarted,
    });
    const eligibleWeeks = keepRillcodTeachingWeeks(windowWeeks, {
      standing: host.policy.standing,
      termStart: host.termStart ?? plan.term_start,
      activities: host.activities,
    });
    return {
      id: plan.id,
      releaseId: (plan as { curriculum_release_id?: string | null }).curriculum_release_id ?? null,
      lastRunAt: lastRunAt(plan),
      calendarReady: eligibleWeeks.length > 0,
      plan,
      meta,
      ags,
      currentWeek,
      termHasStarted,
      host,
      planRows: teachingWeeks,
      sessionsPerWeek,
      windowWeeks,
      eligibleWeeks,
    };
  });

  const batch = orderPlansForSweep(prepared).slice(0, MAX_PLANS_PER_RUN);
  const writtenThisRun = new Set<string>();

  async function stampLastRun(planId: string, meta: Record<string, unknown>) {
    await db.from('lesson_plans').update({
      metadata: {
        ...meta,
        auto_generate_settings: {
          ...((meta.auto_generate_settings as Record<string, unknown>) ?? {}),
          last_run_at: new Date().toISOString(),
        },
      },
    }).eq('id', planId);
  }

  const results: Array<{
    planId: string;
    status: 'ok' | 'error' | 'skipped';
    currentWeek?: number;
    weeks?: number[];
    generated?: number;
    skipped?: number;
    notified?: string;
    error?: string;
  }> = [];

  let stoppedEarly = false;
  for (const item of batch) {
    if (Date.now() > DEADLINE) { stoppedEarly = true; break; }
    const {
      plan,
      meta,
      ags,
      currentWeek,
      termHasStarted,
      host,
      planRows,
      sessionsPerWeek,
      windowWeeks,
      eligibleWeeks,
      releaseId,
    } = item;
    try {
      const planState = await ensureGenerationPlanReady(db, plan);
      if (!planState.ready) {
        results.push({
          planId: plan.id,
          status: 'skipped',
          currentWeek,
          weeks: [],
          error: planState.reason || 'The class plan is not ready for generation.',
        });
        continue;
      }
      if (!windowWeeks.length) {
        results.push({
          planId: plan.id,
          status: 'skipped',
          currentWeek,
          weeks: [],
          error: describeGenerationSkip({
            code: 'waiting_for_module',
            termHasStarted,
          }),
        });
        continue;
      }

      if (!eligibleWeeks.length) {
        results.push({
          planId: plan.id,
          status: 'skipped',
          currentWeek,
          weeks: [],
          error: describeGenerationSkip({
            code: 'host_calendar',
            termHasStarted,
          }),
        });
        continue;
      }

      // Completion means the whole five-asset package exists and no derived
      // deck is stale. Looking at lessons alone stopped the sweep forever after
      // the first asset and left slides, recall cards and tasks as teacher work.
      const [
        { data: existingLessons },
        { data: existingAssignments },
        { data: existingSlides },
        { data: existingFlashcards },
      ] = await Promise.all([
        db
          .from('lessons')
          .select('id,title,status,curriculum_week_number,session_number,metadata,content,content_layout,description,lesson_notes')
          .eq('lesson_plan_id', plan.id),
        db
          .from('assignments')
          .select('id,title,is_active,assignment_type,curriculum_week_number,session_number,metadata')
          .eq('lesson_plan_id', plan.id),
        db
          .from('lesson_materials')
          .select('id,title,lesson_id,curriculum_week_number,session_number,content_stale_at')
          .eq('lesson_plan_id', plan.id)
          .eq('file_type', 'slide-deck'),
        db
          .from('flashcard_decks')
          .select('id,title,lesson_id,is_public,curriculum_week_number,session_number,content_stale_at')
          .eq('lesson_plan_id', plan.id),
      ]);
      const assignmentRows = existingAssignments ?? [];
      const weekState = buildTeachingWeekRows({
        planWeeks: planRows,
        lessons: existingLessons ?? [],
        assignments: assignmentRows.filter(
          (row: any) => row.assignment_type !== 'project'
        ),
        projects: assignmentRows.filter(
          (row: any) => row.assignment_type === 'project'
        ),
        slideDecks: existingSlides ?? [],
        flashcardDecks: existingFlashcards ?? [],
        standing: host.policy.standing,
        usesHostEvaluation: host.policy.usesHostEvaluation,
        termStart: host.termStart ?? plan.term_start,
        activities: host.activities,
      });
      const completedKeys = new Set(
        weekState
          .filter(
            (row) =>
              row.packageStatus.complete && !row.provenance.staleDerived
          )
          .map((row) =>
            planMeetingKey({ week: row.week, session: row.session ?? 1 })
          )
      );

      const meetings = planMeetingsForSweep({
        planWeeks: planRows,
        sessionsPerWeek,
      });
      const incomplete = nextMeetingsToGenerate({
        meetings,
        eligibleWeeks,
        completedKeys,
        maxMeetingsPerBatch: 10,
      });
      let siblings: ExistingContent[] = [];
      if (releaseId && incomplete.length) {
        const weeks = [...new Set(incomplete.map((m) => m.week))];
        const { data } = await db
          .from('lessons')
          .select(
            'id,lesson_plan_id,curriculum_release_id,curriculum_week_number,session_number,metadata,content,content_layout,description,lesson_notes,created_at',
          )
          .eq('curriculum_release_id', releaseId)
          .in('curriculum_week_number', weeks)
          .neq('lesson_plan_id', plan.id)
          .limit(40);
        siblings = (data ?? []) as ExistingContent[];
      }
      const copyableKeys = copyableMeetingKeysFromSources({
        meetings: incomplete,
        releaseId,
        targetPlanId: plan.id,
        siblings,
        writtenThisRun,
      });
      const targetMeetings = decideSweepTargets({
        meetings,
        eligibleWeeks,
        completedKeys,
        configuredCap: ags.maxWeeksPerBatch,
        canCopy: copyableKeys.length > 0,
        copyableMeetingKeys: copyableKeys,
      });

      if (!targetMeetings.length) {
        if (shouldStampSweepRun('all_prepared')) {
          await stampLastRun(plan.id, meta);
        }
        results.push({
          planId: plan.id,
          status: 'skipped',
          currentWeek,
          weeks: eligibleWeeks,
          error: describeGenerationSkip({
            code: 'all_prepared',
            termHasStarted,
          }),
        });
        continue;
      }

      let generated = 0;
      let skipped = 0;
      const failedTypes = new Set<string>();
      let notified: string | undefined;
      const targetWeeks = [...new Set(targetMeetings.map((m) => m.week))];

      for (const meeting of targetMeetings) {
        if (Date.now() > DEADLINE) { stoppedEarly = true; break; }
        const { outcome } = await generateTrackedPlanWeek({
          db,
          planId: plan.id,
          classId: plan.class_id ?? null,
          week: meeting.week,
          session: meeting.session,
          types: ags.types,
          cronSecret,
          autoPublish: ags.auto_publish,
          source: 'cron',
        });
        generated += outcome.generated;
        skipped += outcome.skipped;
        outcome.failedTypes.forEach((t) => failedTypes.add(t));

        const note = await notifyWeekReady(db, {
          planId: plan.id,
          classId: plan.class_id ?? null,
          week: meeting.week,
          session: meeting.session,
          outcome,
          autoPublish: ags.auto_publish,
        });
        if (note === 'sent') notified = note;
        if (outcome.generated > 0) {
          const seed = meetingSeedKey(releaseId, meeting.week, meeting.session);
          if (seed) writtenThisRun.add(seed);
        }
      }

      if (shouldStampSweepRun('worked')) {
        await stampLastRun(plan.id, meta);
      }

      results.push({
        planId: plan.id,
        status: failedTypes.size && !generated && !skipped ? 'error' : 'ok',
        currentWeek,
        weeks: targetWeeks,
        generated,
        skipped,
        notified,
        ...(failedTypes.size ? { error: `types failed: ${[...failedTypes].join(', ')}` } : {}),
      });
    } catch (err) {
      console.error(`Auto-gen error for plan ${plan.id}:`, err);
      results.push({
        planId: plan.id,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    interrupted_runs_recovered: interruptedRunsRecovered,
    processed: results.filter((r) => r.status === 'ok').length,
    failed: results.filter((r) => r.status === 'error').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    batch: batch.length,
    total_enabled: enabledPlans.length,
    stopped_early: stoppedEarly,
    results,
  });
}
