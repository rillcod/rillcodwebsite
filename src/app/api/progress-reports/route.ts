import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, TablesInsert, TablesUpdate } from '@/types/supabase';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';
import { generateProgressReportVerificationCode, progressReportPublishIssues } from '@/lib/reports/publication';
import { assertTeacherReportCourseScope } from '@/lib/reports/scope';
import {
  getCurrentAcademicYear,
  getCurrentTermLabel,
  isStaleAcademicSession,
} from '@/lib/reports/academic-period';

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

// POST /api/progress-reports — insert or update a student progress report
export async function POST(request: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  if (body.is_published === true) {
    return NextResponse.json({ error: 'Save the report as a draft, then publish it through the validated publish endpoint.' }, { status: 400 });
  }
  let targetId = body.existing_id;

  // Whitelist allowed fields to prevent unintended column injection
  const ALLOWED_FIELDS: Array<keyof TablesUpdate<'student_progress_reports'>> = [
    // Identity (teacher_id intentionally excluded — set on insert only, never updated)
    'student_id', 'student_name', 'school_id', 'school_name', 'course_id', 'course_name', 'term_id',
    'section_class', 'student_grade', 'gender',
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
      .select('school_id, school_name, class_id')
      .eq('id', String(updatePayload.student_id))
      .maybeSingle();
    const studentSchoolId = student?.school_id ?? null;
    if (caller.role !== 'admin' && (!studentSchoolId || !allowedSchoolIds.includes(studentSchoolId))) {
      return NextResponse.json({ error: 'Forbidden student scope' }, { status: 403 });
    }
    if (caller.role === 'teacher') {
      const classScope = await getTeacherClassScope(admin as any, caller.id, caller.school_id ?? null);
      const studentClassId = (student as any)?.class_id as string | null;
      if (!studentClassId || !classScope.classIds.includes(studentClassId)) {
        return NextResponse.json({ error: 'You can only create or update reports for students in classes you own.' }, { status: 403 });
      }
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

  const termLabelRaw = String(updatePayload.report_term ?? insertPayload.report_term ?? '').trim();
  const periodLabelRaw = String(updatePayload.report_period ?? insertPayload.report_period ?? '').trim();
  // Prevent the Samuel leak: saving under a prior term (e.g. Second) after the calendar
  // has moved to Third leaves a filled draft that never clears "needs report".
  const calTerm = getCurrentTermLabel();
  const calYear = getCurrentAcademicYear();
  const rollStale = isStaleAcademicSession(termLabelRaw || null, periodLabelRaw || null, calTerm, calYear);
  const termLabel = rollStale ? calTerm : termLabelRaw;
  const periodLabel = rollStale ? calYear : periodLabelRaw;
  if (rollStale) {
    updatePayload.report_term = termLabel;
    updatePayload.report_period = periodLabel;
    insertPayload.report_term = termLabel;
    insertPayload.report_period = periodLabel;
  }
  if (termLabel && periodLabel) {
    const { data: canonicalTerm } = await admin.from('academic_terms').select('id')
      .eq('term_label', termLabel).eq('academic_year', periodLabel).maybeSingle();
    if (!canonicalTerm?.id) return NextResponse.json({ error: `No canonical academic term exists for ${periodLabel} ${termLabel}` }, { status: 400 });
    updatePayload.term_id = canonicalTerm.id;
    insertPayload.term_id = canonicalTerm.id;
  }
  if (caller.role === 'teacher' && updatePayload.course_id) {
    const classScope = await getTeacherClassScope(admin as any, caller.id, caller.school_id ?? null);
    if (!(await assertTeacherReportCourseScope(admin, caller.id, String(updatePayload.course_id), classScope.classIds))) {
      return NextResponse.json({ error: 'You are not assigned to this course through an owned class or direct course assignment.' }, { status: 403 });
    }
  }
  if (updatePayload.is_published === true || insertPayload.is_published === true) {
    const issues = progressReportPublishIssues(targetId ? updatePayload : insertPayload);
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
        (updatePayload as any).verification_code = await generateProgressReportVerificationCode(admin);
      }
    }

    if (caller.role !== 'admin') {
      // Non-admin teachers can only edit their own reports — OR take over when they
      // currently own the student's class (class handoff / term rollover). Blocking
      // with a 409 while the client hides the other teacher's report made grading
      // look "tied" to the previous teacher and blocked new-term work.
      if ((existingReport as any).teacher_id !== caller.id) {
        if (caller.role === 'teacher' && updatePayload.student_id) {
          // Scope already verified above: student.class_id ∈ caller's owned classes.
          (updatePayload as any).teacher_id = caller.id;
          if (!(updatePayload as any).instructor_name && (insertPayload as any).instructor_name) {
            (updatePayload as any).instructor_name = (insertPayload as any).instructor_name;
          }
        } else {
          return NextResponse.json({ error: 'A progress report for this student already exists for this term and course (created by another teacher). Ask an admin to update it.' }, { status: 409 });
        }
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
    insertPayload.verification_code = await generateProgressReportVerificationCode(admin);
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
    await admin.from('portal_users').update(portalUpdate as any).eq('id', studentId);
    // Keep Supabase auth metadata in sync
    await admin.auth.admin.updateUserById(studentId, { user_metadata: portalUpdate });
  }
  if (Object.keys(studentsUpdate).length > 1) {
    await admin.from('students').update(studentsUpdate as any).eq('user_id', studentId);
  }
}
