/**
 * POST /api/lesson-plans/[id]/generate-week
 *
 * The teacher's "Generate next week now" button — and the single entry the
 * WeekAIGenerator UI also uses. Prepares one week's package through
 * generatePlanWeek (same path as /api/cron/auto-generate-content).
 *
 * Access: admins anywhere; teachers ONLY on classes they own (classes.teacher_id).
 * Belonging to the school is deliberately not enough — a teacher cannot generate
 * into a colleague's class. Works for Regular School and Special/Online classes
 * alike: ownership is the class teacher, not the pathway.
 *
 * Publish policy comes from the plan's auto_generate_settings (central). When
 * auto_publish is false, content stays held for the approvals queue.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  canGenerateForClass,
  currentDeliveryWeek,
  notifyWeekReady,
} from '@/lib/academic/week-generation';
import { generateTrackedPlanWeek } from '@/lib/academic/tracked-week-generation';
import { resolveGenerationRepairTypes } from '@/lib/academic/generation-repair';
import { parseAutoGenerateSettings } from '@/lib/academic/auto-generate-settings';
import { parseRequestSession } from '@/lib/academic/session-identity';
import { extractCronSecret } from '@/lib/server/cron-auth';
import {
  classifyCalendarWeek,
  hostCalendarForClass,
  rillcodTeachesThisWeek,
} from '@/lib/academic/school-programme-standing';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function loadGenerationAccess(planId: string, userId: string) {
  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('portal_users')
    .select('id, role, is_active, is_deleted')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.is_active || profile.is_deleted) {
    return { error: 'Unauthorized', status: 401 } as const;
  }

  const { data: plan } = await db
    .from('lesson_plans')
    .select('id, class_id, term_start, status, metadata, academic_offering_periods:offering_period_id(starts_on)')
    .eq('id', planId)
    .maybeSingle();
  if (!plan) {
    return { error: 'Teaching plan not found.', status: 404 } as const;
  }

  const { data: klass } = plan.class_id
    ? await db
        .from('classes')
        .select(
          'id, name, teacher_id, academic_terms(start_date,end_date), schools(programme_standing,sessions_per_week)',
        )
        .eq('id', plan.class_id)
        .maybeSingle()
    : { data: null };

  if (!canGenerateForClass({ id: userId, role: profile.role }, klass)) {
    return {
      error: 'You can only generate content for your own class.',
      status: 403,
    } as const;
  }

  return { db, profile, plan, klass } as const;
}

/**
 * Read the durable state after a browser reconnects. This endpoint never starts
 * or retries AI work; it tells the client whether the original request is still
 * running and which content remains missing.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: planId } = await context.params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await loadGenerationAccess(planId, user.id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const requestedWeek = Number(req.nextUrl.searchParams.get('week'));
  const week = Number.isFinite(requestedWeek) && requestedWeek > 0
    ? Math.floor(requestedWeek)
    : 1;
  const requestedSession = Number(req.nextUrl.searchParams.get('session'));
  const session = Number.isFinite(requestedSession) && requestedSession > 0
    ? Math.floor(requestedSession)
    : 1;
  const afterRaw = req.nextUrl.searchParams.get('after');
  const after = afterRaw && Number.isFinite(Date.parse(afterRaw))
    ? new Date(Date.parse(afterRaw) - 5_000).toISOString()
    : null;

  let runQuery = access.db
    .from('teaching_generation_runs')
    .select(
      'id,status,generated_count,skipped_count,by_type,failed_types,started_at,completed_at,last_heartbeat_at',
    )
    .eq('lesson_plan_id', planId)
    .eq('curriculum_week_number', week)
    .eq('session_number', session);
  if (after) runQuery = runQuery.gte('started_at', after);

  const [{ data: run, error: runError }, repair] = await Promise.all([
    runQuery
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    resolveGenerationRepairTypes({
      db: access.db,
      planId,
      week,
      session,
    }),
  ]);

  const missingTypes = repair?.typesToRun ?? [];
  return NextResponse.json({
    available: !runError,
    planId,
    week,
    session,
    status: run?.status ?? 'idle',
    generationRunId: run?.id ?? null,
    generated: Number(run?.generated_count) || 0,
    skipped: Number(run?.skipped_count) || 0,
    byType: run?.by_type ?? {},
    failedTypes: Array.isArray(run?.failed_types) ? run.failed_types : [],
    missingTypes,
    complete: repair !== null && missingTypes.length === 0,
    startedAt: run?.started_at ?? null,
    completedAt: run?.completed_at ?? null,
    lastHeartbeatAt: run?.last_heartbeat_at ?? null,
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: planId } = await context.params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await loadGenerationAccess(planId, user.id);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { db, plan, klass } = access;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const requestedWeek = Number((body as any).week);
  const week = Number.isFinite(requestedWeek) && requestedWeek > 0
    ? Math.floor(requestedWeek)
    : currentDeliveryWeek({
        termStart: plan.term_start ?? null,
        // A duration programme counts from its delivery window, not a term.
        periodStart:
          (Array.isArray((plan as any).academic_offering_periods)
            ? (plan as any).academic_offering_periods[0]
            : (plan as any).academic_offering_periods)?.starts_on ?? null,
      });

  const session = parseRequestSession(body as Record<string, unknown>) ?? 1;
  const host = hostCalendarForClass(klass);
  const calendarRole = classifyCalendarWeek({
    standing: host.policy.standing,
    termStart: host.termStart ?? plan.term_start,
    weekNumber: week,
    activities: host.activities,
  });
  if (!rillcodTeachesThisWeek(calendarRole)) {
    return NextResponse.json(
      {
        error:
          'This week is a school test, exam, revision or break. Rillcod does not prepare a teaching package for it.',
      },
      { status: 409 },
    );
  }

  const settings = parseAutoGenerateSettings(
    (plan.metadata as Record<string, unknown> | null)?.auto_generate_settings
  );
  // Body may override for a one-off, but only an explicit true publishes.
  const autoPublish =
    (body as any).auto_publish === true || settings.auto_publish === true;

  const { outcome, runId, alreadyRunning, effectiveTypes } = await generateTrackedPlanWeek({
    db,
    planId,
    classId: plan.class_id ?? null,
    week,
    session,
    types: (body as any).types ?? settings.types,
    cookie: req.headers.get('cookie') ?? undefined,
    cronSecret: extractCronSecret(req) || undefined,
    autoPublish,
    source: 'teacher',
    actorId: user.id,
  });

  const notified = await notifyWeekReady(db, {
    planId,
    classId: plan.class_id ?? null,
    week,
    outcome,
    autoPublish,
  });

  const allFailed = outcome.failedTypes.length > 0 && outcome.generated === 0 && outcome.skipped === 0;
  return NextResponse.json(
    {
      success: !allFailed,
      planId,
      week,
      session,
      generated: outcome.generated,
      skipped: outcome.skipped,
      byType: outcome.byType,
      failedTypes: outcome.failedTypes,
      generationRunId: runId,
      alreadyRunning,
      preparedTypes: effectiveTypes,
      auto_publish: autoPublish,
      notified,
    },
    { status: allFailed ? 502 : 200 },
  );
}
