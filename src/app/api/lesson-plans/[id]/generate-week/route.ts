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

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: planId } = await context.params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient() as any;
  const { data: profile } = await db
    .from('portal_users')
    .select('id, role, is_active, is_deleted')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_active || profile.is_deleted) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: plan } = await db
    .from('lesson_plans')
    .select('id, class_id, term_start, status, metadata, academic_offering_periods:offering_period_id(starts_on)')
    .eq('id', planId)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: 'Teaching plan not found.' }, { status: 404 });

  const { data: klass } = plan.class_id
    ? await db
        .from('classes')
        .select(
          'id, name, teacher_id, academic_terms(start_date,end_date), schools(programme_standing,sessions_per_week)',
        )
        .eq('id', plan.class_id)
        .maybeSingle()
    : { data: null };

  if (!canGenerateForClass({ id: user.id, role: profile.role }, klass)) {
    return NextResponse.json(
      { error: 'You can only generate content for your own class.' },
      { status: 403 },
    );
  }

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
