import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildReportEmail } from '@/lib/email/rillcod-transactional-email';

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
    .select('id, school_id, student_id, teacher_id')
    .eq('id', reportId)
    .maybeSingle();
  if (!report) return false;
  // Ownership: teachers can only modify their own reports
  if ((report as any).teacher_id !== caller.id) return false;
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
    'course_name', 'report_term', 'report_period', 'report_date',
    'theory_score', 'practical_score', 'attendance_score', 'overall_score',
    'overall_grade', 'is_published', 'learning_milestones', 'instructor_name',
    'participation_score', 'engagement_metrics',
    'participation_grade', 'projects_grade', 'homework_grade',
    'proficiency_level', 'has_certificate', 'certificate_text',
    'course_completed', 'photo_url',
    'fee_status', 'fee_amount', 'fee_label', 'show_payment_notice',
    'school_section', 'course_id', 'course_duration',
    'key_strengths', 'areas_for_growth',
    'current_module', 'next_module',
  ];
  fields.forEach(f => { if (f in body) allowed[f] = body[f]; });
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await adminClient()
    .from('student_progress_reports')
    .update(allowed)
    .eq('id', id)
    .select('id, student_id, course_name, overall_score, overall_grade, is_published')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Email alert when report is published
  if (body.is_published && data?.student_id) {
    (async () => {
      const { data: student } = await adminClient().from('portal_users').select('email, full_name').eq('id', data.student_id).single();
      if (!student?.email) return;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
      const html = buildReportEmail({
        recipientName: student.full_name || 'Student',
        studentName:   student.full_name || 'Student',
        term:          data.course_name || 'Current Term',
        overallGrade:  data.overall_grade ?? (data.overall_score !== null ? `${data.overall_score}%` : undefined),
        portalUrl:     `${appUrl}/dashboard/results`,
        appUrl,
      });
      await queueService.queueNotification(data.student_id!, 'email', {
        to:        student.email,
        subject:   `Progress Report Published — Rillcod Technologies`,
        fromName:  'Rillcod Technologies',
        fromEmail: 'support@rillcod.com',
        html,
      });
    })().catch(console.error);
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
