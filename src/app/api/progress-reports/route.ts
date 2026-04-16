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
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'teacher')) return null;
  return profile;
}

async function getTeacherSchoolIds(admin: ReturnType<typeof createClient>, teacherId: string, fallbackSchoolId: string | null) {
  const ids = new Set<string>();
  if (fallbackSchoolId) ids.add(fallbackSchoolId);
  const { data } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', teacherId);
  for (const row of data ?? []) {
    const sid = (row as { school_id: string | null }).school_id;
    if (sid) ids.add(sid);
  }
  return Array.from(ids);
}

// POST /api/progress-reports — insert or update a student progress report
export async function POST(request: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { existing_id } = body;

  // Whitelist allowed fields to prevent unintended column injection
  const ALLOWED_FIELDS = [
    'student_id', 'course_name', 'report_term', 'report_date',
    'theory_score', 'practical_score', 'attendance_score', 'participation_score',
    'overall_score', 'overall_grade', 'is_published',
    'learning_milestones', 'instructor_name', 'template_id',
    'key_strengths', 'areas_for_growth', 'projects_grade', 'homework_grade',
    'fee_status', 'fee_amount', 'has_certificate', 'certificate_text',
    'section_class', 'school_name',
  ] as const;

  const payload: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) payload[field] = body[field];
  }

  // Always set teacher_id to caller
  payload.teacher_id = caller.id;
  payload.updated_at = new Date().toISOString();

  const admin = adminClient();
  const teacherSchoolIds =
    caller.role === 'teacher'
      ? await getTeacherSchoolIds(admin as any, caller.id, caller.school_id ?? null)
      : [];

  if (payload.student_id && caller.role === 'teacher') {
    const { data: student } = await admin
      .from('portal_users')
      .select('school_id')
      .eq('id', String(payload.student_id))
      .maybeSingle();
    const studentSchoolId = (student as any)?.school_id as string | null;
    if (!studentSchoolId || !teacherSchoolIds.includes(studentSchoolId)) {
      return NextResponse.json({ error: 'Forbidden student scope' }, { status: 403 });
    }
  }

  if (existing_id) {
    const { data, error } = await admin
      .from('student_progress_reports')
      .update(payload)
      .eq('id', existing_id)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } else {
    const { data, error } = await admin
      .from('student_progress_reports')
      .insert(payload)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }
}
