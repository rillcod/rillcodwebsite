import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { cronInterval } from '@/lib/operations/cron-registry';
import {
  currentDeliveryWeek,
  notifyWeekReady,
} from '@/lib/academic/week-generation';
import {
  generateTrackedPlanWeek,
  markInterruptedTeachingGenerationRuns,
} from '@/lib/academic/tracked-week-generation';
import {
  parseAutoGenerateSettings,
  weeksToGenerateForPlan,
  listPlanMeetings,
  nextMeetingsToGenerate,
  planMeetingKey,
  type AutoGenerateSettings,
} from '@/lib/academic/auto-generate-settings';
import { extractLessonPlanOperationWeeks } from '@/lib/progression/lessonPlanOperation';
import { buildTeachingWeekRows } from '@/lib/academic/teaching-workspace';
import {
  hostCalendarForClass,
  keepRillcodTeachingWeeks,
} from '@/lib/academic/school-programme-standing';

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
// Finds all published plans with auto_generate_settings.enabled = true
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
    .select('id, term_start, class_id, metadata, plan_data, academic_offering_periods:offering_period_id(starts_on)')
    .eq('status', 'published')
    .not('metadata', 'is', null);

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
  enabledPlans.sort((a, b) => lastRunAt(a) - lastRunAt(b)); // oldest first
  const batch = enabledPlans.slice(0, MAX_PLANS_PER_RUN);
  const classIds = Array.from(
    new Set(batch.map((plan) => plan.class_id).filter(Boolean)),
  ) as string[];
  const { data: classRows } = classIds.length
    ? await db
        .from('classes')
        .select(
          'id, academic_terms(start_date,end_date), schools(programme_standing,sessions_per_week)',
        )
        .in('id', classIds)
    : { data: [] as any[] };
  const classById = new Map((classRows ?? []).map((row: any) => [row.id, row]));

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
  for (const plan of batch) {
    if (Date.now() > DEADLINE) { stoppedEarly = true; break; }
    try {
      const meta = plan.metadata as Record<string, unknown>;
      const ags = parseAutoGenerateSettings(meta.auto_generate_settings);
      const period = Array.isArray((plan as any).academic_offering_periods)
        ? (plan as any).academic_offering_periods[0]
        : (plan as any).academic_offering_periods;
      const periodStart = period?.starts_on ?? null;
      const currentWeek = currentDeliveryWeek({
        termStart: plan.term_start ?? null,
        periodStart,
      });

      const planRows = extractLessonPlanOperationWeeks(plan.plan_data) as Array<
        Record<string, unknown>
      >;
      const planWeekNumbers = planRows
        .map((w) => Number(w.week))
        .filter((n) => Number.isFinite(n) && n > 0);

      // Special-programme mid-modules (weeks 4–5) must not be forced to generate
      // calendar week 1. Prep ahead keeps the next in-plan week flowing after
      // the first is ready — still hold-for-approval unless opted in.
      const host = hostCalendarForClass(classById.get(plan.class_id));
      const eligibleWeeks = keepRillcodTeachingWeeks(
        weeksToGenerateForPlan({
          planWeekNumbers,
          deliveryWeek: currentWeek,
          prepAheadWeeks: ags.prep_ahead_weeks,
          maxWeeksPerBatch: ags.maxWeeksPerBatch || Math.max(1, ags.prep_ahead_weeks + 1),
        }),
        {
          standing: host.policy.standing,
          termStart: host.termStart ?? plan.term_start,
          activities: host.activities,
        },
      );

      if (!eligibleWeeks.length) {
        await db.from('lesson_plans').update({
          metadata: {
            ...meta,
            auto_generate_settings: {
              ...((meta.auto_generate_settings as Record<string, unknown>) ?? {}),
              last_run_at: new Date().toISOString(),
            },
          },
        }).eq('id', plan.id);
        results.push({
          planId: plan.id,
          status: 'skipped',
          currentWeek,
          weeks: [],
          error: periodStart
            ? 'No in-plan week due for this delivery window'
            : 'Host school is on a test, exam or break week — Rillcod will wait',
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
          .select('id,title,status,curriculum_week_number,session_number,metadata')
          .or(`lesson_plan_id.eq.${plan.id},metadata->>lesson_plan_id.eq.${plan.id}`),
        db
          .from('assignments')
          .select('id,title,is_active,assignment_type,curriculum_week_number,session_number,metadata')
          .or(`lesson_plan_id.eq.${plan.id},metadata->>lesson_plan_id.eq.${plan.id}`),
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

      const targetMeetings = nextMeetingsToGenerate({
        meetings: listPlanMeetings(planRows),
        completedKeys,
        eligibleWeeks,
        // One meeting per plan per sweep — continuous and AI-context safe.
        maxMeetingsPerBatch: 1,
      });

      if (!targetMeetings.length) {
        await db.from('lesson_plans').update({
          metadata: {
            ...meta,
            auto_generate_settings: {
              ...((meta.auto_generate_settings as Record<string, unknown>) ?? {}),
              last_run_at: new Date().toISOString(),
            },
          },
        }).eq('id', plan.id);
        results.push({
          planId: plan.id,
          status: 'skipped',
          currentWeek,
          weeks: eligibleWeeks,
          error: 'All due class meetings already prepared',
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
          outcome,
          autoPublish: ags.auto_publish,
        });
        if (note === 'sent') notified = note;
      }

      await db.from('lesson_plans').update({
        metadata: {
          ...meta,
          auto_generate_settings: {
            ...((meta.auto_generate_settings as Record<string, unknown>) ?? {}),
            last_run_at: new Date().toISOString(),
          },
        },
      }).eq('id', plan.id);

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
