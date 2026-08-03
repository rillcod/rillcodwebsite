import { NextRequest, NextResponse } from 'next/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import {
  canCreateLiveSessionForTarget,
  getTeacherSchoolIds,
  requireLiveSessionStaff,
} from '@/lib/live-sessions/authz';
import { materialiseSeries } from '@/lib/live-sessions/series';
import { parseStartTime } from '@/lib/live-sessions/recurrence';

export const dynamic = 'force-dynamic';

const SELECT = '*, academic_terms:term_id(term_label, academic_year, start_date, end_date), program:programs(name)';

/** Shared validation for POST/PATCH. Returns an error string, or null when the body is sane. */
function validatePattern(body: Record<string, any>): string | null {
  const weekdays = Array.isArray(body.weekdays) ? body.weekdays.map(Number) : [];
  if (weekdays.length === 0) return 'Pick at least one day of the week.';
  if (weekdays.some((d: number) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Invalid day of the week.';
  if (!parseStartTime(body.start_time)) return 'Start time must look like 20:00.';
  const duration = Number(body.duration_minutes ?? 60);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) return 'Duration must be between 1 and 600 minutes.';
  // Mirrors the DB CHECK: a series with no term and no end date would generate forever.
  if (!body.term_id && !body.ends_on) {
    return 'Choose an academic term, or give the series an end date (special programmes run to their own calendar).';
  }
  if (body.starts_on && body.ends_on && String(body.starts_on) > String(body.ends_on)) {
    return 'The series cannot end before it starts.';
  }
  return null;
}

// GET /api/live-sessions/series — series the caller may see.
export async function GET(_req: NextRequest) {
  const caller = await requireLiveSessionStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createEngagementAdminClient();
  let query = admin.from('live_session_series').select(SELECT).order('created_at', { ascending: false });

  if (caller.role !== 'admin') {
    const schoolIds = caller.role === 'school'
      ? (caller.school_id ? [caller.school_id] : [])
      : await getTeacherSchoolIds(admin as any, caller.id, caller.school_id);
    const filters = [`host_id.eq.${caller.id}`];
    if (schoolIds.length) filters.push(`school_id.in.(${schoolIds.join(',')})`);
    query = query.or(filters.join(','));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/live-sessions/series — create a recurring series and fill the calendar immediately.
export async function POST(req: NextRequest) {
  const caller = await requireLiveSessionStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, any>));
  if (!body.title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const invalid = validatePattern(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const admin = createEngagementAdminClient();
  const schoolId = caller.role === 'school' ? (caller.school_id ?? null) : (body.school_id || null);
  const programId = body.program_id || null;

  const allowed = await canCreateLiveSessionForTarget(admin as any, caller, schoolId, programId);
  if (!allowed) {
    return NextResponse.json({ error: 'You cannot create a series for that school or programme.' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('live_session_series')
    .insert({
      title: String(body.title).trim(),
      description: body.description?.trim() || null,
      host_id: caller.id,
      school_id: schoolId,
      program_id: programId,
      platform: body.platform || 'other',
      weekdays: body.weekdays.map(Number),
      start_time: body.start_time,
      timezone: body.timezone || 'Africa/Lagos',
      duration_minutes: Number(body.duration_minutes ?? 60),
      term_id: body.term_id || null,
      starts_on: body.starts_on || null,
      ends_on: body.ends_on || null,
      notify_parents: !!body.notify_parents,
      created_by: caller.id,
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fill the calendar now rather than making staff wait for the next cron tick — otherwise
  // they save a series and the page still looks empty.
  const filled = await materialiseSeries(admin as any);
  return NextResponse.json({ data, created: filled.created, errors: filled.errors });
}
