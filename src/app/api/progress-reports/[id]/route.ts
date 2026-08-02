import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database, TablesUpdate } from '@/types/supabase';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';
import { buildReportEmail, isInAppEmail } from '@/lib/email/rillcod-transactional-email';
import { buildEmailTrackingPixelUrl } from '@/lib/email/email-tracking-token';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { publishProgressReport } from '@/lib/reports/publish-service';
import { reconcileReportCourseFromClassContext } from '@/lib/reports/class-course';
import { canAccessProgressReport } from '@/lib/reports/access';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import {
  resolveSessionForWrite,
} from '@/lib/reports/academic-period';
import { logAudit } from '@/lib/audit/log';
import { deriveProgressReportResult, touchesProgressReportScores } from '@/lib/reports/score';

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
    studentsUpdate.current_class = fields.sectionClass;
    studentsUpdate.section = fields.sectionClass;
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
  const { data: report } = await admin.from('student_progress_reports')
    .select('id, school_id, student_id, teacher_id').eq('id', reportId).maybeSingle();
  if (!report) return false;

  const access = await canAccessProgressReport(admin, caller, report as any, { transferOwnership: true });
  if (!access.ok) return false;

  // Class-owner takeover: transfer authorship so publish/unpublish stays unblocked.
  if ((report as any).teacher_id !== caller.id) {
    await admin.from('student_progress_reports')
      .update({ teacher_id: caller.id, updated_at: new Date().toISOString() } as any)
      .eq('id', reportId);
  }
  return true;
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
    'theory_score', 'practical_score', 'attendance_score', 'is_published', 'learning_milestones', 'instructor_name',
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
  // Unpublishing clears the stamp so the next publish records a fresh published_at.
  if (allowed.is_published === false) allowed.published_at = null;

  const admin = adminClient();

  // Central session resolve on PATCH (same rules as POST).
  if ('report_term' in allowed || 'report_period' in allowed) {
    const { data: current } = await admin
      .from('student_progress_reports')
      .select('report_term, report_period')
      .eq('id', id)
      .maybeSingle();
    const nextTerm = String(allowed.report_term ?? (current as any)?.report_term ?? '').trim();
    const nextPeriod = String(allowed.report_period ?? (current as any)?.report_period ?? '').trim();
    const allowBackfill = body.allow_backfill === true;
    const { session } = resolveSessionForWrite(nextTerm, nextPeriod, { allowBackfill });
    allowed.report_term = session.termLabel;
    allowed.report_period = session.periodLabel;
    if (allowed.report_term && allowed.report_period) {
      const { data: canonicalTerm } = await admin.from('academic_terms').select('id')
        .eq('term_label', allowed.report_term)
        .eq('academic_year', allowed.report_period)
        .maybeSingle();
      if (canonicalTerm?.id) allowed.term_id = canonicalTerm.id;
    }
  }

  const { data: currentReport } = await admin
    .from('student_progress_reports')
    .select('student_id, student_name, section_class, course_id, course_name, is_published, academic_trace_status, academic_qa_status, theory_score, practical_score, attendance_score, participation_score, engagement_metrics, overall_score, overall_grade, calculation_mode')
    .eq('id', id)
    .maybeSingle();

  if (touchesProgressReportScores(body as Record<string, unknown>)) {
    const result = deriveProgressReportResult({ ...(currentReport as any), ...allowed });
    allowed.overall_score = result.overallScore;
    allowed.overall_grade = result.overallGrade;
  }

  // Direct overall-score overrides are intentionally ignored; evidence components
  // are the only input to the official calculation.
  const reconciledCourse = await reconcileReportCourseFromClassContext(admin, {
    course_id: allowed.course_id ?? (currentReport as any)?.course_id,
    course_name: allowed.course_name ?? (currentReport as any)?.course_name,
    section_class: allowed.section_class ?? (currentReport as any)?.section_class,
    student_id: (currentReport as any)?.student_id,
  });
  if (reconciledCourse.course_id) allowed.course_id = reconciledCourse.course_id;
  if (reconciledCourse.course_name) allowed.course_name = reconciledCourse.course_name;

  if (allowed.is_published === true && (currentReport as any)?.academic_trace_status === 'traceable') {
    const { data: qa, error: qaError } = await (admin as any).rpc('evaluate_progress_report_academic_qa', {
      p_report_id: id,
    });
    if (qaError) return NextResponse.json({ error: qaError.message }, { status: 400 });
    if ((qa as any)?.status !== 'ready') {
      return NextResponse.json({
        error: 'This result is not ready to publish yet. Review the learning evidence shown in Academic Spine.',
        academic_quality: qa,
      }, { status: 409 });
    }
  }

  let data: any;
  let error: any;
  if (allowed.is_published === true) {
    const publishResult = await publishProgressReport(admin, id, allowed as Record<string, unknown>);
    if (!publishResult.ok) return NextResponse.json({ error: publishResult.error, issues: publishResult.issues }, { status: publishResult.status });
    data = publishResult.report;
  } else {
    const updateResult = await admin
    .from('student_progress_reports')
    .update(allowed as TablesUpdate<'student_progress_reports'>)
      .eq('id', id)
      .select('id, student_id, course_name, overall_score, overall_grade, is_published, verification_code')
      .single();
    data = updateResult.data;
    error = updateResult.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data && typeof body.is_published !== 'boolean') {
    await logAudit(admin as any, {
      action: 'update_progress_report',
      actorId: caller.id,
      resourceType: 'progress_report',
      resourceId: id,
      tableName: 'student_progress_reports',
      oldValues: { overall_score: (currentReport as any)?.overall_score ?? null, overall_grade: (currentReport as any)?.overall_grade ?? null },
      newValues: { overall_score: data.overall_score ?? null, overall_grade: data.overall_grade ?? null, fields: Object.keys(allowed) },
    });
  }

  if (typeof body.is_published === 'boolean' && data) {
    const wasPublished = !!(currentReport as any)?.is_published;
    if (body.is_published && !wasPublished) {
      await logAudit(admin as any, {
        action: 'publish_progress_report',
        actorId: caller.id,
        resourceType: 'progress_report',
        resourceId: id,
        tableName: 'student_progress_reports',
        newValue: (currentReport as any)?.student_name || data.course_name || id,
        newValues: {
          student_id: data.student_id,
          student_name: (currentReport as any)?.student_name ?? null,
          course_name: data.course_name ?? null,
          overall_grade: data.overall_grade ?? null,
        },
      });
    } else if (!body.is_published && wasPublished) {
      await logAudit(admin as any, {
        action: 'unpublish_progress_report',
        actorId: caller.id,
        resourceType: 'progress_report',
        resourceId: id,
        tableName: 'student_progress_reports',
        newValue: (currentReport as any)?.student_name || data.course_name || id,
        newValues: {
          student_id: data.student_id,
          student_name: (currentReport as any)?.student_name ?? null,
          course_name: data.course_name ?? null,
        },
      });
    }
  }

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
      const verifyUrl = data.verification_code ? `${appUrl}/result-check/${data.verification_code}` : parentPortalUrl;
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
          fromEmail: SMTP_FROM_EMAIL,
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

      // 3b — portal parents via junction (resolve portal user id → students.id first)
      const { getParentsForStudentPortalId } = await import('@/lib/parents/links');
      const portalParents = await getParentsForStudentPortalId(db as any, data.student_id);
      for (const p of portalParents) {
        if (p.email) parentEmails.set(p.email.toLowerCase(), p.full_name || 'Parent/Guardian');
        if (p.phone) parentPhones.set(p.phone, p.full_name || 'Parent/Guardian');
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
          fromEmail: SMTP_FROM_EMAIL,
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
  const admin = adminClient();
  const { data: existing } = await admin
    .from('student_progress_reports')
    .select('id, student_id, student_name, course_name, is_published, calculation_mode, theory_score, practical_score, attendance_score, participation_score, engagement_metrics, overall_score')
    .eq('id', id)
    .maybeSingle();
  if (existing) {
    const metrics = existing.engagement_metrics && typeof existing.engagement_metrics === 'object'
      ? existing.engagement_metrics as Record<string, unknown>
      : {};
    const hasRecordedScore = existing.calculation_mode === 'manual' || existing.is_published || [
      existing.theory_score, existing.practical_score, existing.attendance_score,
      existing.participation_score, existing.overall_score,
      metrics.classwork_score, metrics.assessment_score,
    ].some((value) => value !== null && value !== undefined);
    if (hasRecordedScore) return NextResponse.json({
      error: 'This report contains protected academic evidence. Unpublish to correct it, or archive the learner; recorded scores cannot be deleted.',
      code: 'PROTECTED_ACADEMIC_EVIDENCE',
    }, { status: 409 });
  }
  const { error } = await admin
    .from('student_progress_reports')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (existing) {
    await logAudit(admin as any, {
      action: 'delete_progress_report',
      actorId: caller.id,
      resourceType: 'progress_report',
      resourceId: id,
      tableName: 'student_progress_reports',
      oldValue: existing.student_name || existing.course_name || id,
      newValues: {
        student_id: existing.student_id,
        student_name: existing.student_name,
        course_name: existing.course_name,
        was_published: existing.is_published,
      },
    });
  }
  return NextResponse.json({ success: true });
}
