/**
 * POST /api/lesson-plans/[id]/generate-week
 *
 * The teacher's "Generate next week now" button. Prepares one week's lesson, assignment and
 * project for a plan without waiting for the weekly sweep.
 *
 * Access: admins anywhere; teachers ONLY on classes they own (classes.teacher_id). Belonging to
 * the school is deliberately not enough — a teacher cannot generate into a colleague's class.
 *
 * Generated content stays draft. The teacher still reviews and publishes.
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
    .select('id, class_id, term_start, status')
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

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '');
  // Forward the caller's session so the generators apply their own checks too, rather than this
  // route borrowing cron privileges on a teacher's behalf.
  const outcome = await generatePlanWeek({
    planId,
    week,
    types: (body as any).types,
    baseUrl,
    cookie: req.headers.get('cookie') ?? undefined,
  });

  const notified = await notifyWeekReady(db, {
    planId,
    classId: plan.class_id ?? null,
    week,
    outcome,
  });

  // Every requested type failing is a failure, not a quiet success with zero items.
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
      notified,
    },
    { status: allFailed ? 502 : 200 },
  );
}
