import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/curricula/[id]/track/bulk
// Mark multiple weeks at once.
// Body: { weeks: [{ term_number, week_number, status, teacher_notes?, actual_date? }] }

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'] as const;
type TrackStatus = typeof VALID_STATUSES[number];

async function getStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) return null;
  return { user, profile };
}

async function callerCanManageSchool(
  admin: any,
  profile: { id: string; role: string; school_id: string | null },
  schoolId: string | null,
) {
  if (profile.role === 'admin') return true;
  if (!schoolId) return false;
  if (profile.school_id === schoolId) return true;
  if (profile.role === 'teacher') {
    const { data: ts } = await admin
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', profile.id)
      .eq('school_id', schoolId)
      .maybeSingle();
    return !!ts;
  }
  return false;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getStaff();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await req.json();

  const weeks: Array<{
    term_number: number;
    week_number: number;
    status: TrackStatus;
    teacher_notes?: string;
    actual_date?: string;
    class_id?: string | null;
    lesson_plan_id?: string | null;
  }> = body.weeks ?? [];

  if (!Array.isArray(weeks) || weeks.length === 0) {
    return NextResponse.json({ error: 'weeks array is required and must not be empty' }, { status: 400 });
  }

  for (const w of weeks) {
    if (!w.term_number || !w.week_number || !w.status) {
      return NextResponse.json({ error: 'Each week must have term_number, week_number, status' }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(w.status)) {
      return NextResponse.json({ error: `Invalid status: ${w.status}` }, { status: 400 });
    }
  }

  const admin = createAdminClient() as any;

  const { data: curriculum, error: currErr } = await admin
    .from('course_curricula')
    .select('id, school_id')
    .eq('id', id)
    .maybeSingle();

  if (currErr) return NextResponse.json({ error: currErr.message }, { status: 500 });
  if (!curriculum) return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });

  const canWrite = await callerCanManageSchool(admin, auth.profile, curriculum.school_id ?? null);
  if (!canWrite) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const schoolId: string | null = curriculum.school_id ?? null;
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  // Fetch existing records for this curriculum to decide insert vs update
  let existingQuery = admin
    .from('curriculum_week_tracking')
    .select('id, term_number, week_number, class_id, lesson_plan_id')
    .eq('curriculum_id', id);
  existingQuery = schoolId
    ? existingQuery.eq('school_id', schoolId)
    : existingQuery.is('school_id', null);
  const { data: existing } = await existingQuery;
  const existingMap = new Map<string, string>(
    (existing ?? []).map((r: any) => [`${r.term_number}-${r.week_number}-${r.class_id ?? 'none'}-${r.lesson_plan_id ?? 'none'}`, r.id])
  );

  const toInsert: any[] = [];
  const toUpdate: Array<{ id: string; payload: any }> = [];

  for (const w of weeks) {
    const payload: any = {
      curriculum_id: id,
      school_id: schoolId,
      term_number: w.term_number,
      week_number: w.week_number,
      class_id: w.class_id ?? null,
      lesson_plan_id: w.lesson_plan_id ?? null,
      status: w.status,
      teacher_notes: w.teacher_notes || null,
      actual_date: w.actual_date || (w.status === 'completed' ? today : null),
      updated_at: now,
    };
    if (w.status === 'completed') {
      payload.completed_by = auth.user.id;
      payload.completed_at = now;
    } else {
      payload.completed_by = null;
      payload.completed_at = null;
    }

    const existingId = existingMap.get(`${w.term_number}-${w.week_number}-${w.class_id ?? 'none'}-${w.lesson_plan_id ?? 'none'}`);
    if (existingId) {
      toUpdate.push({ id: existingId, payload });
    } else {
      toInsert.push(payload);
    }
  }

  const results: any[] = [];

  if (toInsert.length > 0) {
    const { data: inserted, error: insertErr } = await admin
      .from('curriculum_week_tracking')
      .insert(toInsert)
      .select();
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    results.push(...(inserted ?? []));
  }

  for (const { id: rowId, payload } of toUpdate) {
    const { data: updated, error: updErr } = await admin
      .from('curriculum_week_tracking')
      .update(payload)
      .eq('id', rowId)
      .select()
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (updated) results.push(updated);
  }

  return NextResponse.json({ data: results, count: results.length });
}
