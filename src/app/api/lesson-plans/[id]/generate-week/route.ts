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
  currentTermWeek,
  generatePlanWeek,
  notifyWeekReady,
} from '@/lib/academic/week-generation';
import { parseAutoGenerateSettings } from '@/lib/academic/auto-generate-settings';

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
    .select('id, class_id, term_start, status, metadata')
    .eq('id', planId)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: 'Teaching plan not found.' }, { status: 404 });

  const { data: klass } = plan.class_id
    ? await db.from('classes').select('id, name, teacher_id').eq('id', plan.class_id).maybeSingle()
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
    : currentTermWeek(plan.term_start ?? null);

  const settings = parseAutoGenerateSettings(
    (plan.metadata as Record<string, unknown> | null)?.auto_generate_settings
  );
  // Body may override for a one-off, but only an explicit true publishes.
  const autoPublish =
    (body as any).auto_publish === true || settings.auto_publish === true;

  const baseUrl = (req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const outcome = await generatePlanWeek({
    planId,
    week,
    types: (body as any).types ?? settings.types,
    baseUrl,
    cookie: req.headers.get('cookie') ?? undefined,
    autoPublish,
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
      generated: outcome.generated,
      skipped: outcome.skipped,
      byType: outcome.byType,
      failedTypes: outcome.failedTypes,
      auto_publish: autoPublish,
      notified,
    },
    { status: allFailed ? 502 : 200 },
  );
}
