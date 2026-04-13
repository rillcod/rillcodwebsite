import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller;
}

async function getTeacherSchoolIds(teacherId: string, fallbackSchoolId: string | null) {
  const ids = new Set<string>();
  if (fallbackSchoolId) ids.add(fallbackSchoolId);
  const admin = adminClient();
  const { data } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', teacherId);
  for (const row of data ?? []) {
    const sid = (row as { school_id: string | null }).school_id;
    if (sid) ids.add(sid);
  }
  return Array.from(ids);
}

function canCreateLesson(role: string | undefined) {
  return role === 'admin' || role === 'teacher';
}

// GET /api/lessons — list lessons visible to current user
export async function GET(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const admin = adminClient();
    let query = admin
      .from('lessons')
      .select(`
        id, title, description, lesson_type, status, duration_minutes,
        session_date, video_url, created_by, created_at,
        courses ( id, title, programs ( name ) )
      `)
      .order('created_at', { ascending: false });

    if (caller.role === 'teacher') {
      const schoolIds = await getTeacherSchoolIds(caller.id, caller.school_id ?? null);
      if (schoolIds.length > 0) {
        query = query.or(`created_by.eq.${caller.id},school_id.in.(${schoolIds.join(',')})`) as any;
      } else {
        query = query.eq('created_by', caller.id) as any;
      }
    } else if (caller.role === 'school' && caller.school_id) {
      // School role: scope to their school's lessons only
      query = query.eq('school_id', caller.school_id) as any;
    }
    // admin: no filter — all lessons visible

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/lessons — create a lesson (bypasses RLS)
export async function POST(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (!canCreateLesson(caller.role)) {
      return NextResponse.json({ error: 'Only admin and teacher can create lessons' }, { status: 403 });
    }

    const body = await request.json();
    const allowed = ['title', 'description', 'content', 'lesson_type', 'status',
      'duration_minutes', 'order_index', 'video_url', 'is_active', 'course_id',
      'session_date', 'content_layout'];
    const payload: Record<string, unknown> = { created_by: caller.id };
    for (const f of allowed) {
      if (f in body) payload[f] = body[f] ?? null;
    }
    payload.created_at = new Date().toISOString();

    const { data, error } = await adminClient()
      .from('lessons')
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If lesson_plan data is included, save it too
    if (body.lesson_plan && data?.id) {
      const plan = body.lesson_plan;
      await adminClient().from('lesson_plans').insert({
        lesson_id: data.id,
        objectives: plan.objectives ?? null,
        activities: plan.activities ?? null,
        assessment_methods: plan.assessment_methods ?? null,
        staff_notes: plan.staff_notes ?? null,
        plan_data: plan.plan_data ?? null,
        covers_full_course: plan.covers_full_course ?? false,
      });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
