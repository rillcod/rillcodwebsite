import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, TablesInsert, TablesUpdate } from '@/types/supabase';

function adminClient() {
  return createClient<Database>(
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
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  return profile;
}

async function getTeacherSchoolIds(admin: ReturnType<typeof adminClient>, teacherId: string, fallbackSchoolId: string | null, role: string) {
  if (role === 'school' && fallbackSchoolId) return [fallbackSchoolId];
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
  const ALLOWED_FIELDS: Array<keyof TablesUpdate<'student_progress_reports'>> = [
    // Identity
    'student_id', 'student_name', 'school_id', 'school_name', 'course_id', 'course_name',
    'section_class', 'teacher_id',
    // Session metadata
    'report_term', 'report_date', 'report_period', 'instructor_name',
    'current_module', 'next_module', 'course_duration', 'learning_milestones',
    'school_section',
    // WAEC 6-component scores (attendance_score stores assignments %, participation_score stores attendance %)
    'theory_score', 'practical_score', 'attendance_score', 'participation_score',
    'engagement_metrics',   // ← stores classwork_score (10%) and assessment_score (15%)
    'overall_score', 'overall_grade',
    // Qualitative
    'participation_grade',  // ← Classwork & Participation qualifier
    'projects_grade', 'homework_grade',
    'key_strengths', 'areas_for_growth',
    'proficiency_level',
    // Publication & certificate
    'is_published', 'has_certificate', 'certificate_text', 'course_completed',
    // Photo
    'photo_url',
    // Payment / fee
    'fee_status', 'fee_amount', 'fee_label', 'show_payment_notice',
  ];

  const updatePayload: TablesUpdate<'student_progress_reports'> = {};
  const insertPayload: TablesInsert<'student_progress_reports'> = {
    student_id: '',
  };
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      (updatePayload as Record<string, unknown>)[field] = body[field];
      (insertPayload as Record<string, unknown>)[field] = body[field];
    }
  }

  // Always set teacher_id to caller
  updatePayload.teacher_id = caller.id;
  updatePayload.updated_at = new Date().toISOString();
  insertPayload.teacher_id = caller.id;
  insertPayload.updated_at = new Date().toISOString();

  const admin = adminClient();
  const allowedSchoolIds =
    caller.role !== 'admin'
      ? await getTeacherSchoolIds(admin, caller.id, caller.school_id ?? null, caller.role)
      : [];

  if (updatePayload.student_id && caller.role !== 'admin') {
    const { data: student } = await admin
      .from('portal_users')
      .select('school_id')
      .eq('id', String(updatePayload.student_id))
      .maybeSingle();
    const studentSchoolId = student?.school_id ?? null;
    if (!studentSchoolId || !allowedSchoolIds.includes(studentSchoolId)) {
      return NextResponse.json({ error: 'Forbidden student scope' }, { status: 403 });
    }
  }

  if (existing_id) {
    // Ownership check: non-admin teachers can only edit their own reports
    if (caller.role !== 'admin') {
      const { data: existingReport } = await admin
        .from('student_progress_reports')
        .select('teacher_id')
        .eq('id', existing_id)
        .maybeSingle();
      if (!existingReport) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
      if ((existingReport as any).teacher_id !== caller.id) {
        return NextResponse.json({ error: 'You can only edit your own reports' }, { status: 403 });
      }
    }
    const { data, error } = await admin
      .from('student_progress_reports')
      .update(updatePayload)
      .eq('id', existing_id)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } else {
    if (typeof insertPayload.student_id !== 'string' || !insertPayload.student_id.trim()) {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
    }
    const { data, error } = await admin
      .from('student_progress_reports')
      .insert(insertPayload)
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }
}
