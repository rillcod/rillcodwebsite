import { NextRequest, NextResponse } from 'next/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import {
  canManageLiveSession,
  requireLiveSessionStaff,
} from '@/lib/live-sessions/authz';
import { clearFutureOccurrences, materialiseSeries } from '@/lib/live-sessions/series';
import { parseStartTime } from '@/lib/live-sessions/recurrence';

export const dynamic = 'force-dynamic';

/**
 * A series is scoped like the sessions it produces, so reuse the session rule rather than
 * inventing a second one that can drift out of step.
 */
async function loadManageableSeries(seriesId: string) {
  const caller = await requireLiveSessionStaff();
  if (!caller) return { error: 'Forbidden', status: 403 as const };

  const admin = createEngagementAdminClient();
  const { data: series } = await admin
    .from('live_session_series')
    .select('*')
    .eq('id', seriesId)
    .maybeSingle();
  if (!series) return { error: 'Series not found', status: 404 as const };

  const allowed = await canManageLiveSession(admin as any, caller, series as any);
  if (!allowed) return { error: 'You cannot manage this series.', status: 403 as const };
  return { admin, caller, series: series as any };
}

// PATCH — edit the pattern, the window, or the parent-alert switch.
export async function PATCH(req: NextRequest, context: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await context.params;
  const ctx = await loadManageableSeries(seriesId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({} as Record<string, any>));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const f of ['title', 'description', 'program_id', 'term_id', 'starts_on', 'ends_on', 'platform', 'timezone']) {
    if (body[f] !== undefined) patch[f] = body[f] || null;
  }
  if (body.notify_parents !== undefined) patch.notify_parents = !!body.notify_parents;
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;

  // Anything that changes WHEN the classes fall invalidates the occurrences already created.
  let patternChanged = false;
  if (body.weekdays !== undefined) {
    const weekdays = Array.isArray(body.weekdays) ? body.weekdays.map(Number) : [];
    if (weekdays.length === 0) return NextResponse.json({ error: 'Pick at least one day of the week.' }, { status: 400 });
    if (weekdays.some((d: number) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return NextResponse.json({ error: 'Invalid day of the week.' }, { status: 400 });
    }
    patch.weekdays = weekdays;
    patternChanged = true;
  }
  if (body.start_time !== undefined) {
    if (!parseStartTime(body.start_time)) return NextResponse.json({ error: 'Start time must look like 20:00.' }, { status: 400 });
    patch.start_time = body.start_time;
    patternChanged = true;
  }
  if (body.duration_minutes !== undefined) {
    const d = Number(body.duration_minutes);
    if (!Number.isFinite(d) || d <= 0 || d > 600) return NextResponse.json({ error: 'Duration must be between 1 and 600 minutes.' }, { status: 400 });
    patch.duration_minutes = d;
    patternChanged = true;
  }
  if (body.timezone !== undefined || body.starts_on !== undefined || body.ends_on !== undefined || body.term_id !== undefined) {
    patternChanged = true;
  }

  const nextTerm = patch.term_id !== undefined ? patch.term_id : ctx.series.term_id;
  const nextEnd = patch.ends_on !== undefined ? patch.ends_on : ctx.series.ends_on;
  if (!nextTerm && !nextEnd) {
    return NextResponse.json({
      error: 'Choose an academic term, or give the series an end date (special programmes run to their own calendar).',
    }, { status: 400 });
  }

  const { data, error } = await ctx.admin
    .from('live_session_series')
    .update(patch)
    .eq('id', seriesId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Rebuild only what has not happened yet — a class that already ran is history, not a plan.
  let rebuilt = 0;
  if (patternChanged || body.is_active === false) {
    await clearFutureOccurrences(ctx.admin as any, seriesId);
    if ((data as any).is_active) {
      const r = await materialiseSeries(ctx.admin as any);
      rebuilt = r.created;
    }
  }

  return NextResponse.json({ data, rebuilt });
}

// DELETE — stop the series and drop its future classes, keeping the ones that already ran.
export async function DELETE(_req: NextRequest, context: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await context.params;
  const ctx = await loadManageableSeries(seriesId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const removed = await clearFutureOccurrences(ctx.admin as any, seriesId);
  const { error } = await ctx.admin.from('live_session_series').delete().eq('id', seriesId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, removedUpcoming: removed });
}
