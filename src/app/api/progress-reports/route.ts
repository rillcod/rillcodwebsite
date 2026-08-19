import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, TablesInsert, TablesUpdate } from '@/types/supabase';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';
import { generateProgressReportVerificationCode } from '@/lib/reports/publication';
import { assertTeacherReportCourseScope } from '@/lib/reports/scope';
import {
  resolveSessionForWrite,
  sessionsEqual,
  wouldRewriteSessionIdentity,
} from '@/lib/reports/academic-period';
import { reconcileReportCourseFromClassContext } from '@/lib/reports/class-course';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { logAudit } from '@/lib/audit/log';
import { deriveProgressReportResult, PROGRESS_REPORT_SCORE_FIELDS } from '@/lib/reports/score';
import { findCanonicalProgressReport } from '@/lib/reports/canonical-report';
import { loadEffectiveScoreWeights } from '@/lib/grading-scheme';


/**
 * student_progress_reports.student_id is portal_users.id (FK + student RLS),
 * not students.id. Resolve registry rows via students.user_id when needed.
 */

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

// POST /api/progress-reports — insert or update a student progress report
export async function POST(request: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  if (body.is_published === true) {
    return NextResponse.json({ error: 'Save the report as a draft, then publish it through the validated publish endpoint.' }, { status: 400 });
  }
  // Draft saves never publish or unpublish. Clients used to send is_published: false
  // and that withdrew a live family copy.
  delete body.is_published;
  let targetId = typeof body.existing_id === 'string' && body.existing_id.trim()
    ? body.existing_id.trim()
    : null;
  const allowBackfill = body.allow_backfill === true;

  // Whitelist allowed fields to prevent unintended column injection
  const ALLOWED_FIELDS: Array<keyof TablesUpdate<'student_progress_reports'>> = [
    // Identity — school_id / school_name are NEVER client-writable (derived from student)
    'student_id', 'student_name', 'course_id', 'course_name', 'term_id',
    'section_class', 'student_grade', 'gender',
    // Session metadata
    'report_term', 'report_date', 'report_period', 'instructor_name',
    'current_module', 'next_module', 'course_duration', 'learning_milestones',
    'school_section',
    // WAEC 6-component scores (attendance_score stores assignments %, participation_score stores attendance %)
    'theory_score', 'practical_score', 'attendance_score', 'participation_score',
    'engagement_metrics',   // Component evidence plus the immutable weighting-policy snapshot
    'overall_score', 'overall_grade',
    // Qualitative
    'participation_grade',  // ← Classwork & Participation qualifier
    'projects_grade', 'homework_grade',
    'key_strengths', 'areas_for_growth',
    'proficiency_level',
    // Certificate (publication is PATCH-only — never unpublish from a draft save)
    'has_certificate', 'certificate_text', 'course_completed',
    // Photo
    'photo_url',
    // Payment / fee
    'fee_status', 'fee_amount', 'fee_label', 'show_payment_notice',
  ];

  // Ignore any client attempt to set tenancy fields. class_id joins them: it
  // decides the academic offering and delivery period a result belongs to, so
  // it is derived from the learner rather than accepted from the caller.
  delete body.school_id;
  delete body.school_name;
  delete body.class_id;

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

  // Overall score and grade are server-derived. Clients submit evidence components,
  // never the official result. Require the full component set before recalculating
  // so a partial legacy edit cannot zero components it did not send.
  delete (updatePayload as Record<string, unknown>).overall_score;
  delete (updatePayload as Record<string, unknown>).overall_grade;
  delete (insertPayload as Record<string, unknown>).overall_score;
  delete (insertPayload as Record<string, unknown>).overall_grade;
  // On insert, always stamp teacher_id as caller.
  // On update, do NOT overwrite — original owner stays (ownership is verified below).
  updatePayload.updated_at = new Date().toISOString();
  insertPayload.teacher_id = caller.id;
  insertPayload.updated_at = new Date().toISOString();
  // This route is Write report cards. Stamp typed so Prepare cannot insert a twin
  // or overwrite the same row from evidence.
  updatePayload.calculation_mode = 'manual';
  insertPayload.calculation_mode = 'manual';

  const admin = adminClient();
  const allowedSchoolIds =
    caller.role !== 'admin'
      ? await getTeacherSchoolIds(caller.id, caller.school_id ?? null)
      : [];
  let studentClassId: string | null = null;

  let existingRow: {
    id: string;
    student_id?: string | null;
    class_id?: string | null;
    course_id?: string | null;
    course_name?: string | null;
    report_term?: string | null;
    report_period?: string | null;
    teacher_id?: string | null;
    school_id?: string | null;
    instructor_name?: string | null;
  } | null = null;
  if (targetId) {
    const { data: pointed } = await admin
      .from('student_progress_reports')
      .select('id, student_id, class_id, course_id, course_name, report_term, report_period, teacher_id, school_id, instructor_name')
      .eq('id', targetId)
      .maybeSingle();
    if (!pointed) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (updatePayload.student_id && pointed.student_id && String(pointed.student_id) !== String(updatePayload.student_id)) {
      return NextResponse.json({ error: 'This save does not match the report you opened.' }, { status: 409 });
    }
    existingRow = pointed as typeof existingRow;
  }

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
    studentClassId = ((student as any)?.class_id as string | null) ?? null;
    if (caller.role === 'teacher') {
      const classScope = await getTeacherClassScope(admin as any, caller.id, caller.school_id ?? null);
      const ownsCurrentClass = !!studentClassId && classScope.classIds.includes(studentClassId);
      const ownsReportClass = !!existingRow?.class_id && classScope.classIds.includes(existingRow.class_id);
      const authored = existingRow?.teacher_id === caller.id;
      if (!ownsCurrentClass && !ownsReportClass && !authored) {
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
  // Central session resolve: stale prior sessions roll to LIVE unless this save
  // is an explicit backfill of an opened historical report.
  const { session } = resolveSessionForWrite(termLabelRaw, periodLabelRaw, { allowBackfill });
  const termLabel = session.termLabel;
  const periodLabel = session.periodLabel;
  updatePayload.report_term = termLabel;
  updatePayload.report_period = periodLabel;
  insertPayload.report_term = termLabel;
  insertPayload.report_period = periodLabel;
  if (termLabel && periodLabel) {
    const { data: canonicalTerm } = await admin.from('academic_terms').select('id')
      .eq('term_label', termLabel).eq('academic_year', periodLabel).maybeSingle();
    if (!canonicalTerm?.id) return NextResponse.json({ error: `No canonical academic term exists for ${periodLabel} ${termLabel}` }, { status: 400 });
    updatePayload.term_id = canonicalTerm.id;
    insertPayload.term_id = canonicalTerm.id;
  }

  const keepHistoricalPlacement = Boolean(
    allowBackfill
    && existingRow
    && sessionsEqual({ termLabel, periodLabel }, existingRow),
  );
  if (keepHistoricalPlacement && existingRow?.class_id) {
    updatePayload.class_id = existingRow.class_id;
  } else if (studentClassId) {
    updatePayload.class_id = studentClassId;
    insertPayload.class_id = studentClassId;
  }

  if (keepHistoricalPlacement && (existingRow?.course_id || existingRow?.course_name)) {
    if (existingRow.course_id) {
      updatePayload.course_id = existingRow.course_id;
      insertPayload.course_id = existingRow.course_id;
    }
    if (existingRow.course_name) {
      updatePayload.course_name = existingRow.course_name;
      insertPayload.course_name = existingRow.course_name;
    }
  } else {
    const reconciledCourse = await reconcileReportCourseFromClassContext(admin as any, {
      course_id: updatePayload.course_id ?? insertPayload.course_id,
      course_name: updatePayload.course_name ?? insertPayload.course_name,
      section_class: updatePayload.section_class ?? insertPayload.section_class,
      class_id: updatePayload.class_id ?? insertPayload.class_id ?? existingRow?.class_id,
      student_id: existingRow?.class_id ? null : (updatePayload.student_id ?? insertPayload.student_id),
    });
    if (reconciledCourse.course_id) {
      updatePayload.course_id = reconciledCourse.course_id;
      insertPayload.course_id = reconciledCourse.course_id;
    }
    if (reconciledCourse.course_name) {
      updatePayload.course_name = reconciledCourse.course_name;
      insertPayload.course_name = reconciledCourse.course_name;
    }
  }

  // The published Academic Office scheme is the one weighting authority for
  // both manually entered evidence and automatic evidence calculations.
  if (PROGRESS_REPORT_SCORE_FIELDS.every((field) => field in body)) {
    try {
      const weighting = await loadEffectiveScoreWeights(admin as any, {
        schoolId: String(updatePayload.school_id ?? insertPayload.school_id ?? '') || null,
        courseId: String(updatePayload.course_id ?? insertPayload.course_id ?? '') || null,
        termId: String(updatePayload.term_id ?? insertPayload.term_id ?? '') || null,
      });
      const result = deriveProgressReportResult(updatePayload as Record<string, unknown>, weighting.weights);
      updatePayload.overall_score = result.overallScore;
      updatePayload.overall_grade = result.overallGrade;
      insertPayload.overall_score = result.overallScore;
      insertPayload.overall_grade = result.overallGrade;
      const weightingSnapshot = {
        score_weights: weighting.weights,
        grading_scheme_id: weighting.scheme?.id ?? null,
        grading_scheme_name: weighting.scheme?.name ?? 'Rillcod balanced evidence model',
      };
      const updateMetrics = updatePayload.engagement_metrics && typeof updatePayload.engagement_metrics === 'object' && !Array.isArray(updatePayload.engagement_metrics)
        ? updatePayload.engagement_metrics as Record<string, unknown>
        : {};
      const insertMetrics = insertPayload.engagement_metrics && typeof insertPayload.engagement_metrics === 'object' && !Array.isArray(insertPayload.engagement_metrics)
        ? insertPayload.engagement_metrics as Record<string, unknown>
        : {};
      updatePayload.engagement_metrics = { ...updateMetrics, ...weightingSnapshot } as any;
      insertPayload.engagement_metrics = { ...insertMetrics, ...weightingSnapshot } as any;
    } catch (cause) {
      return NextResponse.json({
        error: cause instanceof Error ? cause.message : 'The active result-weighting policy could not be loaded.',
      }, { status: 500 });
    }
  }

  if (caller.role === 'teacher' && updatePayload.course_id && !keepHistoricalPlacement) {
    const classScope = await getTeacherClassScope(admin as any, caller.id, caller.school_id ?? null);
    if (!(await assertTeacherReportCourseScope(admin, caller.id, String(updatePayload.course_id), classScope.classIds))) {
      return NextResponse.json({ error: 'You are not assigned to this course through an owned class or direct course assignment.' }, { status: 403 });
    }
  }

  // SERVER-SIDE DEDUP: a student has at most ONE report per (course · term · academic
  // year) — teacher-INDEPENDENT, matched on course_name (course_id was inconsistently
  // NULL, and per-teacher scoping let two teachers create twin reports). If the client
  // didn't pass an existing_id but a matching report exists, update it instead of
  // inserting a duplicate. The DB unique index uq_spr_student_term_course is the backstop.
  if (!targetId && insertPayload.student_id) {
    const found = await findCanonicalProgressReport(admin as any, {
      studentId: String(insertPayload.student_id),
      courseId: insertPayload.course_id ? String(insertPayload.course_id) : null,
      courseName: insertPayload.course_name ? String(insertPayload.course_name) : null,
      reportTerm: insertPayload.report_term ? String(insertPayload.report_term) : null,
      reportPeriod: insertPayload.report_period ? String(insertPayload.report_period) : null,
    });
    if (found) targetId = found.id;
  }

  // If existing_id points at a DIFFERENT session identity, never rewrite it in place.
  if (targetId && termLabel && periodLabel) {
    const { data: pointed } = await admin
      .from('student_progress_reports')
      .select('id, report_term, report_period, student_id, course_name')
      .eq('id', targetId)
      .maybeSingle();
    if (pointed && wouldRewriteSessionIdentity(pointed as any, { termLabel, periodLabel })) {
      let retargetQ = admin.from('student_progress_reports').select('id')
        .eq('report_term', termLabel)
        .eq('report_period', periodLabel);
      if ((pointed as any).student_id) retargetQ = retargetQ.eq('student_id', String((pointed as any).student_id));
      if ((pointed as any).course_name) retargetQ = retargetQ.ilike('course_name', String((pointed as any).course_name));
      const { data: currentTermRow } = await retargetQ.order('updated_at', { ascending: false }).limit(1).maybeSingle();
      targetId = (currentTermRow as { id?: string } | null)?.id ?? null;
    }
  }

  if (targetId) {
    const { data: existingReport } = await admin
      .from('student_progress_reports')
      .select('teacher_id, instructor_name, student_id, school_id')
      .eq('id', targetId)
      .maybeSingle();
    if (!existingReport) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    // Always re-derive school tenancy from the report's student (never trust client school_id)
    const scopeStudentId = String(updatePayload.student_id || existingReport.student_id || '');
    if (scopeStudentId) {
      const { data: scopeStudent } = await admin
        .from('portal_users')
        .select('school_id, school_name, class_id')
        .eq('id', scopeStudentId)
        .maybeSingle();
      const studentSchoolId = scopeStudent?.school_id ?? null;
      if (caller.role !== 'admin' && (!studentSchoolId || !allowedSchoolIds.includes(studentSchoolId))) {
        return NextResponse.json({ error: 'Forbidden student scope' }, { status: 403 });
      }
      if (studentSchoolId) {
        updatePayload.school_id = studentSchoolId;
      }
      if (scopeStudent?.school_name) {
        updatePayload.school_name = scopeStudent.school_name;
      }
      if (keepHistoricalPlacement && existingRow?.class_id) {
        updatePayload.class_id = existingRow.class_id;
      } else if ((scopeStudent as any)?.class_id) {
        updatePayload.class_id = (scopeStudent as any).class_id;
      }
    } else {
      // Never allow orphaned school_id overwrite without a student
      delete (updatePayload as Record<string, unknown>).school_id;
      delete (updatePayload as Record<string, unknown>).school_name;
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

    await logAudit(admin as any, {
      action: 'save_progress_report',
      actorId: caller.id,
      resourceType: 'progress_report',
      resourceId: data.id,
      tableName: 'student_progress_reports',
      newValues: { mode: 'update', student_id: updatePayload.student_id ?? existingReport.student_id, overall_score: updatePayload.overall_score ?? null },
    });

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

    await logAudit(admin as any, {
      action: 'create_progress_report',
      actorId: caller.id,
      resourceType: 'progress_report',
      resourceId: data.id,
      tableName: 'student_progress_reports',
      newValues: { mode: 'insert', student_id: insertPayload.student_id, overall_score: insertPayload.overall_score ?? null },
    });

    return NextResponse.json({ data });
  }
}
