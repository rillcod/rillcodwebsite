import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, TablesInsert, TablesUpdate } from '@/types/supabase';
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
  if (!profile || !['admin', 'teacher'].includes(profile.role)) return null;
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

async function generateReportVerificationCode(admin: ReturnType<typeof adminClient>) {
  for (let i = 0; i < 8; i += 1) {
    const code = `RPT-${crypto.randomBytes(9).toString('base64url').toUpperCase()}`;
    const { data } = await admin
      .from('student_progress_reports')
      .select('id, verification_code')
      .eq('verification_code', code)
      .maybeSingle();
    if (!data?.id) return code;
  }
  return `RPT-${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;
}

type PublishCandidate = Partial<TablesInsert<'student_progress_reports'>> & Partial<TablesUpdate<'student_progress_reports'>>;

function publishValidationIssues(report: PublishCandidate) {
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

// POST /api/progress-reports — insert or update a student progress report
export async function POST(request: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  let targetId = body.existing_id;

  // Whitelist allowed fields to prevent unintended column injection
  const ALLOWED_FIELDS: Array<keyof TablesUpdate<'student_progress_reports'>> = [
    // Identity (teacher_id intentionally excluded — set on insert only, never updated)
    'student_id', 'student_name', 'school_id', 'school_name', 'course_id', 'course_name',
    'section_class', 'gender',
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

  // On insert, always stamp teacher_id as caller.
  // On update, do NOT overwrite — original owner stays (ownership is verified below).
  updatePayload.updated_at = new Date().toISOString();
  insertPayload.teacher_id = caller.id;
  insertPayload.updated_at = new Date().toISOString();

  const admin = adminClient();
  const allowedSchoolIds =
    caller.role !== 'admin'
      ? await getTeacherSchoolIds(admin, caller.id, caller.school_id ?? null, caller.role)
      : [];

  if (updatePayload.student_id) {
    const { data: student } = await admin
      .from('portal_users')
      .select('school_id, school_name')
      .eq('id', String(updatePayload.student_id))
      .maybeSingle();
    const studentSchoolId = student?.school_id ?? null;
    if (caller.role !== 'admin' && (!studentSchoolId || !allowedSchoolIds.includes(studentSchoolId))) {
      return NextResponse.json({ error: 'Forbidden student scope' }, { status: 403 });
    }
    if (studentSchoolId) {
      updatePayload.school_id = studentSchoolId;
      insertPayload.school_id = studentSchoolId;
    }
    if (student?.school_name) {
      updatePayload.school_name = student.school_name;
      insertPayload.school_name = student.school_name;
    }
  }

  if (updatePayload.is_published === true || insertPayload.is_published === true) {
    const issues = publishValidationIssues(targetId ? updatePayload : insertPayload);
    if (issues.length > 0) {
      return NextResponse.json({ error: 'Report is not ready to publish', issues }, { status: 400 });
    }
  }

  // SERVER-SIDE DEDUP: a student has at most ONE report per (course · term · academic
  // year) — teacher-INDEPENDENT, matched on course_name (course_id was inconsistently
  // NULL, and per-teacher scoping let two teachers create twin reports). If the client
  // didn't pass an existing_id but a matching report exists, update it instead of
  // inserting a duplicate. The DB unique index uq_spr_student_term_course is the backstop.
  if (!targetId && insertPayload.student_id) {
    let q = admin.from('student_progress_reports').select('id, teacher_id')
      .eq('student_id', String(insertPayload.student_id));
    q = insertPayload.course_name ? q.ilike('course_name', String(insertPayload.course_name)) : q;
    q = insertPayload.report_term ? q.eq('report_term', String(insertPayload.report_term)) : q.is('report_term', null);
    q = insertPayload.report_period ? q.eq('report_period', String(insertPayload.report_period)) : q.is('report_period', null);
    const { data: found } = await q.order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (found) targetId = (found as { id: string }).id;
  }

  if (targetId) {
    const { data: existingReport } = await admin
      .from('student_progress_reports')
      .select('teacher_id, instructor_name')
      .eq('id', targetId)
      .maybeSingle();
    if (!existingReport) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (updatePayload.is_published === true) {
      const { data: currentCode } = await admin
        .from('student_progress_reports')
        .select('verification_code')
        .eq('id', targetId)
        .maybeSingle();
      if (!(currentCode as any)?.verification_code) {
        (updatePayload as any).verification_code = await generateReportVerificationCode(admin);
      }
    }

    if (caller.role !== 'admin') {
      // Non-admin teachers can only edit their own reports. When the existing report
      // belongs to another teacher this is a duplicate attempt — block it clearly
      // (rather than silently creating a twin) so one report per student/term/course holds.
      if ((existingReport as any).teacher_id !== caller.id) {
        return NextResponse.json({ error: 'A progress report for this student already exists for this term and course (created by another teacher). Ask an admin to update it.' }, { status: 409 });
      }
    } else {
      // Admin editing: preserve original authorship — never overwrite teacher_id or instructor_name
      delete (updatePayload as any).teacher_id;
      if ((existingReport as any).instructor_name) {
        (updatePayload as any).instructor_name = (existingReport as any).instructor_name;
      }
    }
    const { data, error } = await admin
      .from('student_progress_reports')
      .update(updatePayload)
      .eq('id', targetId)
      .select('id, verification_code')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sync corrected fields back to student profile (report builder is authoritative, second only to consent form data)
    const upGender = (updatePayload as any).gender;
    if ((updatePayload.section_class || updatePayload.student_name || upGender) && updatePayload.student_id) {
      await syncStudentProfile(admin, String(updatePayload.student_id), {
        sectionClass: updatePayload.section_class ? String(updatePayload.section_class) : null,
        studentName:  updatePayload.student_name  ? String(updatePayload.student_name)  : null,
        gender:       upGender                    ? String(upGender)                    : null,
      });
    }

    return NextResponse.json({ data });
  } else {
    if (typeof insertPayload.student_id !== 'string' || !insertPayload.student_id.trim()) {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
    }
    insertPayload.verification_code = await generateReportVerificationCode(admin);
    const { data, error } = await admin
      .from('student_progress_reports')
      .insert(insertPayload)
      .select('id')
      .single();
    if (error) {
      // Hard backstop: the unique index caught a duplicate the app dedup missed (race
      // or a course-name normalisation edge). Return a clear conflict, not a 500.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json({ error: 'A progress report for this student already exists for this term and course.' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sync corrected fields back to student profile
    const insGender = (insertPayload as any).gender;
    if ((insertPayload.section_class || insertPayload.student_name || insGender) && insertPayload.student_id) {
      await syncStudentProfile(admin, String(insertPayload.student_id), {
        sectionClass: insertPayload.section_class ? String(insertPayload.section_class) : null,
        studentName:  insertPayload.student_name  ? String(insertPayload.student_name)  : null,
        gender:       insGender                   ? String(insGender)                   : null,
      });
    }

    return NextResponse.json({ data });
  }
}

async function syncStudentProfile(
  admin: ReturnType<typeof adminClient>,
  studentId: string,
  fields: { sectionClass?: string | null; studentName?: string | null; gender?: string | null },
) {
  // IDENTITY SAFETY: grading must NEVER silently rename or re-identify an account.
  // Previously this overwrote portal_users.full_name (and class/gender) with the
  // report's typed values — so a report saved against the wrong account renamed
  // that account, cascading student-identity corruption. We now only FILL blanks:
  // a field is written only when the account currently has no value for it. Real
  // identity edits must be made deliberately in student management, not as a
  // side-effect of grading.
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
    await admin.from('portal_users').update(portalUpdate as any).eq('id', studentId);
    // Keep Supabase auth metadata in sync
    await admin.auth.admin.updateUserById(studentId, { user_metadata: portalUpdate });
  }
  if (Object.keys(studentsUpdate).length > 1) {
    await admin.from('students').update(studentsUpdate as any).eq('user_id', studentId);
  }
}
