import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';

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

async function canModifyReport(caller: any, reportId: string) {
  if (caller.role === 'admin') return true;
  const admin = adminClient();
  const teacherSchoolIds = await getTeacherSchoolIds(admin as any, caller.id, caller.school_id ?? null);
  const { data: report } = await admin
    .from('student_progress_reports')
    .select('id, school_id, student_id')
    .eq('id', reportId)
    .maybeSingle();
  if (!report) return false;
  const reportSchoolId = (report as any).school_id as string | null;
  if (reportSchoolId) return teacherSchoolIds.includes(reportSchoolId);
  const { data: student } = await admin
    .from('portal_users')
    .select('school_id')
    .eq('id', (report as any).student_id)
    .maybeSingle();
  const studentSchoolId = (student as any)?.school_id as string | null;
  return !!studentSchoolId && teacherSchoolIds.includes(studentSchoolId);
}

// PATCH /api/progress-reports/[id] — update specific fields (e.g. course_name)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  if (!(await canModifyReport(caller, id))) {
    return NextResponse.json({ error: 'Forbidden report scope' }, { status: 403 });
  }
  const body = await request.json();

  const allowed: Record<string, any> = {};
  const fields = [
    'course_name', 'report_term', 'theory_score', 'practical_score',
    'attendance_score', 'overall_score', 'overall_grade', 'is_published',
    'learning_milestones', 'instructor_name', 'report_date',
  ];
  fields.forEach(f => { if (f in body) allowed[f] = body[f]; });
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await adminClient()
    .from('student_progress_reports')
    .update(allowed)
    .eq('id', id)
    .select('id, student_id, course_name, overall_score, is_published')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Email Alert if published
  if (body.is_published && data?.student_id) {
    queueService.queueNotification(data.student_id, 'email', {
       subject: 'Progress Report Published',
       body: `Great news! Your Progress Report for ${data.course_name || 'your course'} has just been published by your instructor. Your overall score is ${data.overall_score !== null ? data.overall_score + '%' : 'available now'}. Check your dashboard for full details!`
    }).catch(console.error);
  }

  return NextResponse.json({ data });
}

// DELETE /api/progress-reports/[id] — delete a report
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  if (!(await canModifyReport(caller, id))) {
    return NextResponse.json({ error: 'Forbidden report scope' }, { status: 403 });
  }
  const { error } = await adminClient()
    .from('student_progress_reports')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
