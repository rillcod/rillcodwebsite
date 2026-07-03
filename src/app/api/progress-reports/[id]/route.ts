import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database, TablesUpdate } from '@/types/supabase';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildReportEmail, buildEmailTrackingPixelUrl, isInAppEmail } from '@/lib/email/rillcod-transactional-email';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import crypto from 'crypto';

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

async function generateReportVerificationCode(admin: ReturnType<typeof adminClient>) {
  for (let i = 0; i < 8; i += 1) {
    const code = `RPT-${crypto.randomBytes(9).toString('base64url').toUpperCase()}`;
    const { data } = await admin
      .from('student_progress_reports')
      .select('id')
      .eq('verification_code', code)
      .maybeSingle();
    if (!data?.id) return code;
  }
  return `RPT-${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;
}

type ProgressReportRow = Database['public']['Tables']['student_progress_reports']['Row'];

function publishValidationIssues(report: Partial<ProgressReportRow>) {
  const issues: string[] = [];
  const text = (value: unknown) => String(value ?? '').trim();
  const score = (value: unknown) => typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  const scoreReady = (value: unknown) => Number.isFinite(score(value)) && score(value) >= 0 && score(value) <= 100;
  const metrics = report.engagement_metrics && typeof report.engagement_metrics === 'object' && !Array.isArray(report.engagement_metrics)
    ? report.engagement_metrics as Record<string, unknown>
    : {};
  const isSchoolReport = ['basic', 'secondary', 'unified', 'school'].includes(text(report.school_section));

  if (!text(report.student_id)) issues.push('student_id is required before publishing');
  if (!text(report.student_name)) issues.push('student_name is required before publishing');
  if (!text(report.section_class)) issues.push('section_class is required before publishing');
  if (!text(report.course_name)) issues.push('course_name is required before publishing');
  if (!text(report.report_term)) issues.push('report_term is required before publishing');
  if (isSchoolReport && !text(report.report_period)) issues.push('report_period is required for school reports before publishing');
  if (!isSchoolReport && text(report.school_section) && !text(report.course_duration)) issues.push('course_duration is required for cohort reports before publishing');
  if (!text(report.report_date)) issues.push('report_date is required before publishing');
  if (!text(report.instructor_name)) issues.push('instructor_name is required before publishing');
  if (!scoreReady(report.theory_score)) issues.push('theory_score must be between 0 and 100 before publishing');
  if (!scoreReady(metrics.classwork_score)) issues.push('classwork_score must be between 0 and 100 before publishing');
  if (!scoreReady(report.practical_score)) issues.push('practical_score must be between 0 and 100 before publishing');
  if (!scoreReady(report.attendance_score)) issues.push('attendance_score must be between 0 and 100 before publishing');
  if (!scoreReady(report.participation_score)) issues.push('participation_score must be between 0 and 100 before publishing');
  if (!scoreReady(metrics.assessment_score)) issues.push('assessment_score must be between 0 and 100 before publishing');
  if (!scoreReady(report.overall_score)) issues.push('overall_score must be between 0 and 100 before publishing');
  if (!text(report.overall_grade)) issues.push('overall_grade is required before publishing');
  if (!text(report.key_strengths)) issues.push('key_strengths is required before publishing');
  if (!text(report.areas_for_growth)) issues.push('areas_for_growth is required before publishing');

  return issues;
}

async function syncStudentProfile(
  admin: ReturnType<typeof adminClient>,
  studentId: string,
  fields: { sectionClass?: string | null; studentName?: string | null; gender?: string | null },
) {
  const { data: current } = await admin
    .from('portal_users')
    .select('full_name, section_class, gender')
    .eq('id', studentId)
    .maybeSingle();
  const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';
  const portalUpdate: Record<string, unknown> = {};
  const studentsUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (fields.sectionClass && blank(current?.section_class)) {
    portalUpdate.section_class = fields.sectionClass;
    studentsUpdate.section_class = fields.sectionClass;
    studentsUpdate.current_class = fields.sectionClass;
    studentsUpdate.grade_level   = fields.sectionClass;
  }
  if (fields.studentName && blank(current?.full_name)) {
    portalUpdate.full_name   = fields.studentName;
    studentsUpdate.full_name = fields.studentName;
  }
  if (fields.gender && blank(current?.gender)) {
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
  if (allowed.is_published === true) {
    const { data: currentReport } = await admin
      .from('student_progress_reports')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const issues = publishValidationIssues({ ...(currentReport ?? {}), ...allowed });
    if (issues.length > 0) {
      return NextResponse.json({ error: 'Report is not ready to publish', issues }, { status: 400 });
    }
    if (!currentReport?.verification_code) {
      allowed.verification_code = await generateReportVerificationCode(admin);
    }
  }
  const { data, error } = await admin
    .from('student_progress_reports')
    .update(allowed as TablesUpdate<'student_progress_reports'>)
    .eq('id', id)
    .select('id, student_id, course_name, overall_score, overall_grade, is_published, verification_code')
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
      // Public QR/verify link — opens the full result hub with NO login required, so a
      // parent can view (and verify) the result straight from the message.
      const verifyUrl = data.verification_code ? `${appUrl}/verify/${data.verification_code}` : parentPortalUrl;
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
          action_url: `/dashboard/results?student=${data.student_id}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // 3 — Collect parent contacts (email + phone) from two sources and deduplicate
      const parentEmails = new Map<string, string>();          // email → name
      const parentPhones = new Map<string, string>();          // phone → name

      // 3a — students table parent_email / parent_phone (non-portal parents)
      const { data: studentRow } = await db
        .from('students')
        .select('parent_email, parent_name, parent_phone')
        .eq('user_id', data.student_id)
        .maybeSingle();
      if (studentRow?.parent_email) {
        parentEmails.set(studentRow.parent_email.toLowerCase(), studentRow.parent_name || 'Parent/Guardian');
      }
      if (studentRow?.parent_phone) {
        parentPhones.set(studentRow.parent_phone, studentRow.parent_name || 'Parent/Guardian');
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
          .select('id, email, full_name, phone')
          .in('id', parentIds);
        for (const p of portalParents ?? []) {
          if (p.email) parentEmails.set(p.email.toLowerCase(), p.full_name || 'Parent/Guardian');
          if (p.phone) parentPhones.set(p.phone, p.full_name || 'Parent/Guardian');
        }
      }

      // 4 — Email each parent (external addresses only) — button opens the public verify
      //     result page (no login), so parents see the result straight away.
      const { notificationsService } = await import('@/services/notifications.service');
      for (const [email, parentName] of parentEmails) {
        if (isInAppEmail(email)) continue; // in-app handle — no SMTP mailbox
        const trackingPixelUrl = buildEmailTrackingPixelUrl({ appUrl, reportId: id, email });
        const html = buildReportEmail({
          recipientName: parentName,
          studentName,
          term,
          overallGrade: grade,
          portalUrl: verifyUrl,
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

      // 5 — WhatsApp each parent the same result link (best-effort; no-ops if unconfigured)
      for (const [phone, parentName] of parentPhones) {
        const waMessage =
          `Hello ${parentName}, ${studentName}'s ${term} progress report has been published` +
          `${grade ? ` (Overall: ${grade})` : ''}.\n\n` +
          `View & verify it here: ${verifyUrl}\n\n— Rillcod Technologies`;
        await sendWhatsApp(phone, waMessage);
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
