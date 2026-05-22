import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildReportEmail, buildEmailTrackingPixelUrl, isInAppEmail } from '@/lib/email/rillcod-transactional-email';

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

async function syncStudentProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  studentId: string,
  fields: { sectionClass?: string | null; studentName?: string | null; gender?: string | null },
) {
  const portalUpdate: Record<string, unknown> = {};
  const studentsUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (fields.sectionClass) {
    portalUpdate.section_class = fields.sectionClass;
    studentsUpdate.section_class = fields.sectionClass;
    studentsUpdate.current_class = fields.sectionClass;
    studentsUpdate.grade_level   = fields.sectionClass;
  }
  if (fields.studentName) {
    portalUpdate.full_name   = fields.studentName;
    studentsUpdate.full_name = fields.studentName;
  }
  if (fields.gender) {
    portalUpdate.gender   = fields.gender;
    studentsUpdate.gender = fields.gender;
  }

  if (Object.keys(portalUpdate).length > 0) {
    await (admin as any).from('portal_users').update(portalUpdate).eq('id', studentId);
    // Keep Supabase auth metadata in sync
    await (admin as any).auth.admin.updateUserById(studentId, { user_metadata: portalUpdate });
  }
  if (Object.keys(studentsUpdate).length > 1) {
    await (admin as any).from('students').update(studentsUpdate).eq('user_id', studentId);
  }
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
    // Student identity corrections — sync back to portal_users + students
    'section_class', 'student_name', 'gender',
  ];
  fields.forEach(f => { if (f in body) allowed[f] = body[f]; });
  allowed.updated_at = new Date().toISOString();

  const admin = adminClient();
  const { data, error } = await admin
    .from('student_progress_reports')
    .update(allowed)
    .eq('id', id)
    .select('id, student_id, course_name, overall_score, overall_grade, is_published')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync name / class / gender corrections back to the student profile
  if ((allowed.section_class || allowed.student_name || allowed.gender) && data?.student_id) {
    await syncStudentProfile(admin, data.student_id, {
      sectionClass: allowed.section_class ?? null,
      studentName:  allowed.student_name  ?? null,
      gender:       allowed.gender        ?? null,
    });
  }

  // Email alert when report is published — notify student AND their parent(s)
  if (body.is_published && data?.student_id) {
    (async () => {
      const db = adminClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
      const studentPortalUrl = `${appUrl}/dashboard/results?student=${data.student_id}`;
      const parentPortalUrl  = `${appUrl}/dashboard/parent-results`;
      const subject   = `Progress Report Published — Rillcod Technologies`;
      const grade     = data.overall_grade ?? (data.overall_score !== null ? `${data.overall_score}%` : undefined);
      const term      = data.course_name || 'Current Term';

      // 1 — Fetch student portal profile
      const { data: student } = await db
        .from('portal_users')
        .select('id, email, full_name, school_id')
        .eq('id', data.student_id)
        .maybeSingle();

      const studentName = student?.full_name || 'Student';

      // 2 — Email the student (skip @rillcod.com in-app handles — use in-app notification instead)
      if (student?.email && !isInAppEmail(student.email)) {
        const trackingPixelUrl = buildEmailTrackingPixelUrl({ appUrl, reportId: id, email: student.email });
        const html = buildReportEmail({
          recipientName: studentName,
          studentName,
          term,
          overallGrade: grade,
          portalUrl: studentPortalUrl,
          appUrl,
          trackingPixelUrl,
        });
        await queueService.queueNotification(data.student_id!, 'email', {
          to:        student.email,
          subject,
          fromName:  'Rillcod Technologies',
          fromEmail: 'support@rillcod.com',
          html,
        });
      } else if (student?.id) {
        // In-app notification for @rillcod.com handle users
        await db.from('notifications').insert({
          user_id:    student.id,
          title:      subject,
          message:    `Your progress report for ${term} is now available. Log in to view your results.`,
          type:       'info',
          is_read:    false,
          link:       `/dashboard/results?student=${data.student_id}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // 3 — Collect parent emails from two sources and deduplicate
      const parentEmails = new Map<string, string>(); // email → name

      // 3a — students table parent_email (non-portal parents)
      const { data: studentRow } = await db
        .from('students')
        .select('parent_email, parent_name')
        .eq('user_id', data.student_id)
        .maybeSingle();
      if (studentRow?.parent_email) {
        parentEmails.set(
          studentRow.parent_email.toLowerCase(),
          studentRow.parent_name || 'Parent/Guardian',
        );
      }

      // 3b — portal parents linked via parent_student_links
      const { data: links } = await db
        .from('parent_student_links')
        .select('parent_id')
        .eq('student_id', data.student_id);
      if (links && links.length > 0) {
        const parentIds = links.map((l: any) => l.parent_id);
        const { data: portalParents } = await db
          .from('portal_users')
          .select('id, email, full_name')
          .in('id', parentIds)
          .not('email', 'is', null);
        for (const p of portalParents ?? []) {
          if (p.email) parentEmails.set(p.email.toLowerCase(), p.full_name || 'Parent/Guardian');
        }
      }

      // 4 — Email each parent (external addresses only — skip @rillcod.com in-app handles)
      const { notificationsService } = await import('@/services/notifications.service');
      for (const [email, parentName] of parentEmails) {
        if (isInAppEmail(email)) continue; // in-app handle — no SMTP mailbox
        const trackingPixelUrl = buildEmailTrackingPixelUrl({ appUrl, reportId: id, email });
        const html = buildReportEmail({
          recipientName: parentName,
          studentName,
          term,
          overallGrade: grade,
          portalUrl: parentPortalUrl,
          appUrl,
          trackingPixelUrl,
        });
        await notificationsService.sendExternalEmail({
          to:        email,
          subject,
          fromName:  'Rillcod Technologies',
          fromEmail: 'support@rillcod.com',
          html,
        }).catch(console.error);
      }
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
