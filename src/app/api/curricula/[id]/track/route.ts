import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function getStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) return null;
  return { user, profile };
}

// GET /api/curricula/[id]/track — get all week tracking for this curriculum
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getStaff();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const admin = createAdminClient() as any;

  let query = admin.from('curriculum_week_tracking').select('*').eq('curriculum_id', id);
  // Schools only see their own tracking
  if (auth.profile.role === 'school' && auth.profile.school_id) {
    query = query.eq('school_id', auth.profile.school_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/curricula/[id]/track — upsert week tracking status
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getStaff();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // School role cannot mark progress — only admin/teacher
  if (auth.profile.role === 'school') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await req.json();
  const { term_number, week_number, status, teacher_notes, actual_date } = body;

  const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'] as const;
  if (!term_number || !week_number || !status) {
    return NextResponse.json({ error: 'term_number, week_number, status required' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }
  if (teacher_notes && teacher_notes.length > 1000) {
    return NextResponse.json({ error: 'teacher_notes must be under 1000 characters' }, { status: 400 });
  }

  const admin = createAdminClient() as any;
  const schoolId = auth.profile.school_id || null;

  const payload: any = {
    curriculum_id: id,
    school_id: schoolId,
    term_number,
    week_number,
    status,
    teacher_notes: teacher_notes || null,
    actual_date: actual_date || null,
    updated_at: new Date().toISOString(),
  };
  if (status === 'completed') {
    payload.completed_by = auth.user.id;
    payload.completed_at = new Date().toISOString();
  } else {
    payload.completed_by = null;
    payload.completed_at = null;
  }

  // Use upsert with a SELECT first to handle the conditional unique index
  const matchQuery = admin
    .from('curriculum_week_tracking')
    .select('id')
    .eq('curriculum_id', id)
    .eq('term_number', term_number)
    .eq('week_number', week_number);

  if (schoolId) {
    matchQuery.eq('school_id', schoolId);
  } else {
    matchQuery.is('school_id', null);
  }

  const { data: existing } = await matchQuery.maybeSingle();

  let data, error;
  if (existing?.id) {
    ({ data, error } = await admin
      .from('curriculum_week_tracking')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single());
  } else {
    ({ data, error } = await admin
      .from('curriculum_week_tracking')
      .insert(payload)
      .select()
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
