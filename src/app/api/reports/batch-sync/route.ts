import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { computeWeightedScore, getWAECGrade } from '@/lib/grading';
import { loadEffectiveScoreWeights } from '@/lib/grading-scheme';
import { logAudit } from '@/lib/audit/log';
import { getTeacherClassScope } from '@/lib/server/teacher-class-scope';
import { resolveBatchSyncApiSession } from '@/lib/reports/session-workflows';
import { evidencePercentage, relevantAssignmentsForReport } from '@/lib/reports/evidence';
import { assertTeacherReportCourseScope } from '@/lib/reports/scope';
import { reconcileReportCourseFromClassContext } from '@/lib/reports/class-course';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { findCanonicalProgressReport, isReusableLockedResult } from '@/lib/reports/canonical-report';
import { applyHostAssessmentToReportScores, hostAssessmentMetricFields } from '@/lib/academic/taught-assessment';
import { hostPapersComplete, mergeHostSchoolMetrics } from '@/lib/academic/host-marks';
import { scoreAuthorityFromStanding } from '@/lib/reports/complement';

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
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id, full_name, school_name')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'teacher')) return null;
  return profile;
}

const FINAL_CBT_STATUSES = new Set(['completed', 'passed', 'failed', 'pending_grading']);
const cbtExamType = (row: any) => String(row?.cbt_exams?.metadata?.exam_type ?? 'examination').toLowerCase();
const isReadyCbt = (row: any) => row?.score != null && FINAL_CBT_STATUSES.has(String(row?.status ?? '').toLowerCase());
const cbtScopeRank = (row: any, courseId: string, programId?: string | null) => {
  const exam = row?.cbt_exams;
  if (!exam) return 0;
  if (exam.course_id === courseId) return 3;
  if (programId && exam.program_id === programId) return 2;
  if (!exam.course_id && !exam.program_id) return 1;
  return 0;
};
const topCbtScore = (rows: any[], courseId: string, kind: 'examination' | 'evaluation', programId?: string | null) => Math.min(100, rows
  .filter(isReadyCbt)
  .filter((row) => cbtScopeRank(row, courseId, programId) > 0)
  .filter((row) => kind === 'evaluation' ? cbtExamType(row) === 'evaluation' : cbtExamType(row) !== 'evaluation')
  .sort((a, b) =>
    cbtScopeRank(b, courseId, programId) - cbtScopeRank(a, courseId, programId)
    || Number(b.score ?? 0) - Number(a.score ?? 0)
  )[0]?.score ?? 0);
const assignmentPct = (row: any) => {
  const grade = Number(row?.grade ?? 0);
  const max = Number(row?.assignments?.max_points ?? 100) || 100;
  return Math.max(0, Math.min(100, Math.round((grade / max) * 100)));
};

export async function POST(request: NextRequest) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const {
    school_id,
    school_name,
    class_name,
    class_id,
    report_term,
    report_date,
    instructor_name,
    publish_immediately = false
  } = body;
  let course_id = body.course_id as string;
  let course_name = body.course_name as string | undefined;

  if (!course_id || !report_term || !report_date) {
    return NextResponse.json({ error: 'Missing required configuration (Course, Term, or Date)' }, { status: 400 });
  }

  const admin = adminClient();
  const reconciledCourse = await reconcileReportCourseFromClassContext(admin as any, {
    course_id,
    course_name,
    section_class: class_name,
    class_id,
  });
  course_id = reconciledCourse.course_id || course_id;
  course_name = reconciledCourse.course_name || course_name;

  const { data: courseMeta } = await admin
    .from('courses')
    .select('program_id')
    .eq('id', course_id)
    .maybeSingle();
  const programId = (courseMeta as any)?.program_id ?? null;
  const allowBackfill = body.allow_backfill === true || body.allowBackfill === true;
  const requestedPeriod = typeof body.report_period === 'string' && body.report_period.trim()
    ? body.report_period.trim()
    : null;
  const resolved = resolveBatchSyncApiSession(report_term, requestedPeriod, allowBackfill);
  const reportPeriod = resolved.period ?? '';
  const resolvedTerm = resolved.term ?? report_term;
  const { data: academicTerm } = await admin.from('academic_terms')
    .select('id, start_date, end_date')
    .eq('academic_year', reportPeriod).eq('term_label', resolvedTerm).maybeSingle();
  const termId = (academicTerm as any)?.id ?? null;
  if (!termId) {
    return NextResponse.json({ error: 'No canonical academic term found for ' + resolvedTerm + ' ' + reportPeriod + '. Configure the academic term before generating reports.' }, { status: 400 });
  }
  const teacherSchoolIds =
    caller.role === 'teacher'
      ? await getTeacherSchoolIds(caller.id, caller.school_id ?? null)
      : [];
  const teacherClassScope = caller.role === 'teacher'
    ? await getTeacherClassScope(admin as any, caller.id, caller.school_id ?? null)
    : null;

  if (caller.role === 'teacher' && teacherSchoolIds.length === 0) {
    return NextResponse.json({ error: 'No school scope assigned for this teacher' }, { status: 403 });
  }
  if (caller.role === 'teacher' && (!teacherClassScope || teacherClassScope.classIds.length === 0)) {
    return NextResponse.json({ error: 'No owned class scope assigned for this teacher' }, { status: 403 });
  }
  if (caller.role === 'teacher' && class_id && !teacherClassScope!.classIds.includes(class_id)) {
    return NextResponse.json({ error: 'You can only build reports for classes you own' }, { status: 403 });
  }
  if (caller.role === 'teacher' && !(await assertTeacherReportCourseScope(admin, caller.id, course_id, teacherClassScope!.classIds))) {
    return NextResponse.json({ error: 'You are not assigned to this course through an owned class or direct course assignment.' }, { status: 403 });
  }
  
  // 1. Fetch Students in the specified School/Class
  let studentQuery = admin
    .from('portal_users')
    .select('id, full_name, email, school_id, school_name, section_class, grade, class_id')
    .eq('role', 'student')
    .eq('is_deleted', false);

  if (class_id) {
    studentQuery = studentQuery.eq('class_id', class_id);
  } else if (class_name) {
    studentQuery = studentQuery.eq('section_class', class_name);
  }

  if (caller.role === 'teacher') {
    studentQuery = studentQuery.in('class_id', teacherClassScope!.classIds);
    studentQuery = studentQuery.in('school_id', teacherSchoolIds);
    if (school_id && !teacherSchoolIds.includes(school_id)) {
      return NextResponse.json({ error: 'Forbidden school scope' }, { status: 403 });
    }
    if (school_id) studentQuery = studentQuery.eq('school_id', school_id);
  } else if (school_id) {
    studentQuery = studentQuery.eq('school_id', school_id);
  } else if (school_name) {
    studentQuery = studentQuery.eq('school_name', school_name);
  }

  const { data: students, error: studentError } = await studentQuery;
  
  if (studentError) return NextResponse.json({ error: studentError.message }, { status: 500 });
  if (!students || students.length === 0) {
    return NextResponse.json({ error: 'No students found for the selected class' }, { status: 404 });
  }

  const schoolIds = [...new Set(students.map((row: any) => row.school_id).filter(Boolean))];
  const standingBySchool = new Map<string, 'compulsory' | 'optional'>();
  if (schoolIds.length > 0) {
    const { data: standingRows } = await admin
      .from('schools')
      .select('id, programme_standing')
      .in('id', schoolIds);
    for (const row of standingRows ?? []) {
      standingBySchool.set(
        String((row as any).id),
        (row as any).programme_standing === 'compulsory' ? 'compulsory' : 'optional',
      );
    }
  }

  // 2. Fetch Global data for calculations (Assignments in this course/school)
  let assignmentQuery = admin
    .from('assignments')
    .select('id, max_points, class_id, term_id, lesson_plan_id, curriculum_release_id')
    .eq('course_id', course_id)
    .eq('is_active', true);
  if (caller.role === 'teacher') {
    assignmentQuery = assignmentQuery.in('school_id', teacherSchoolIds) as typeof assignmentQuery;
  } else if (school_id) {
    assignmentQuery = assignmentQuery.eq('school_id', school_id) as typeof assignmentQuery;
  }
  const { data: allAssignments } = await assignmentQuery;

  // 3. Process each student
  const results = [];
  const policyBySchool = new Map<string, Awaited<ReturnType<typeof loadEffectiveScoreWeights>>>();
  for (const student of students) {
    try {
      const { data: teachingPlan } = await admin.from('lesson_plans')
        .select('id,curriculum_release_id,school_id,class_id,course_id,term_id,status')
        .eq('class_id', student.class_id)
        .eq('course_id', course_id)
        .eq('term_id', termId)
        .neq('status', 'archived')
        .maybeSingle();
      if (!teachingPlan?.curriculum_release_id) {
        throw new Error('This class needs a teaching plan before auto-fill.');
      }
      const relevantAssignments = relevantAssignmentsForReport(allAssignments ?? [], student.class_id, termId)
        .filter((assignment: any) => !assignment.lesson_plan_id || assignment.lesson_plan_id === teachingPlan.id);
      const relevantAssignmentIds = new Set(relevantAssignments.map((assignment: any) => assignment.id));
      let sessionQuery = admin.from('class_sessions').select('id').eq('class_id', student.class_id).eq('is_active', true);
      if (termId) sessionQuery = sessionQuery.eq('term_id', termId);
      const { data: classSessions } = await sessionQuery;
      const sessionIds = (classSessions ?? []).map((session: any) => session.id);

      const [attRes, subRes, cbtRes, labRes] = await Promise.all([
        sessionIds.length
          ? admin.from('attendance').select('id, status').eq('user_id', student.id).in('session_id', sessionIds).eq('status', 'present')
          : Promise.resolve({ data: [] as any[] }),
        admin.from('assignment_submissions').select('grade, assignment_id, assignments!inner(course_id, assignment_type, max_points)').eq('portal_user_id', student.id).eq('status', 'graded').eq('assignments.course_id', course_id),
        admin.from('cbt_sessions').select('score, status, needs_grading, end_time, cbt_exams(course_id, program_id, metadata, term_id, lesson_plan_id, curriculum_release_id)').eq('user_id', student.id).order('score', { ascending: false }),
        admin.from('lab_projects').select('id, assignment_id').eq('user_id', student.id),
      ]);
      const scopedSubmissions = (subRes.data ?? []).filter((submission: any) => relevantAssignmentIds.has(submission.assignment_id));
      const { loadAcademicTermBounds, filterCbtByAcademicTerm } = await import('@/lib/cbt/session');
      const termBounds = await loadAcademicTermBounds(admin as any, termId)
        ?? (academicTerm ? {
          id: termId as string,
          start_date: academicTerm.start_date ?? null,
          end_date: academicTerm.end_date ?? null,
        } : null);
      const scopedCbtRows = filterCbtByAcademicTerm(
        (cbtRes.data ?? []) as any[],
        termId,
        termBounds,
        { includeUntagged: true },
      );
      const scopedLabProjects = (labRes.data ?? []).filter((project: any) => project.assignment_id && relevantAssignmentIds.has(project.assignment_id));

      // CALCULATION LOGIC (Matching the Report Builder's 6-component WAEC pattern)
      const grades = scopedSubmissions.filter((s: any) => s.grade != null).map(assignmentPct) as number[];
      const asgnAvg = grades.length > 0 ? Math.round(grades.reduce((a, b) => a + b, 0) / grades.length) : 0;
      const hostSchool = scoreAuthorityFromStanding(
        standingBySchool.get(String(student.school_id ?? '')) ?? 'optional',
      ) === 'host_school';
      const hostApplied = applyHostAssessmentToReportScores({
        rows: scopedCbtRows,
        examinationFallback: topCbtScore(scopedCbtRows, course_id, 'examination', programId),
        evaluationFallback: topCbtScore(scopedCbtRows, course_id, 'evaluation', programId) || asgnAvg,
        mapIntoSixBox: !hostSchool,
      });
      const theoryScore = hostSchool ? null : hostApplied.theory;

      // Classwork - 10% - current proxy: graded homework/classwork average
      const classworkScore = asgnAvg;
      
      // Practical / Projects - 25%
      const projectCount = scopedLabProjects.length;
      const practicalScore = Math.min(100, Math.round((projectCount / 3) * 100));

      // Assignments Submitted - 20%
      const gradedCount = scopedSubmissions.length;
      const totalAssignmentsCount = relevantAssignments.length;
      const hasAssignmentEvidence = totalAssignmentsCount > 0;
      const assignmentScore = hasAssignmentEvidence
        ? evidencePercentage(gradedCount, totalAssignmentsCount)
        : 0; // No invented mark: teacher must review and enter evidence manually.

      // Attendance - 10%
      const hasAttendanceEvidence = sessionIds.length > 0;
      const attendanceScore = hasAttendanceEvidence ? evidencePercentage(attRes.data?.length || 0, sessionIds.length) : 0;

      // Mid-term Assessment - 15% - host First/Second Test when present
      const assessmentScore = hostSchool ? null : hostApplied.assessment;

      const policyKey = student.school_id ?? 'global';
      let effectivePolicy = policyBySchool.get(policyKey);
      if (!effectivePolicy) {
        effectivePolicy = await loadEffectiveScoreWeights(admin as any, {
          schoolId: student.school_id,
          courseId: course_id,
          termId,
        });
        policyBySchool.set(policyKey, effectivePolicy);
      }
      const hostComplete = hostPapersComplete(hostApplied.papers);
      const overallScore = hostSchool
        ? (hostComplete ? hostApplied.total!.percent : null)
        : computeWeightedScore({
        theory: hostApplied.theory,
        classwork: classworkScore,
        practical: practicalScore,
        assignments: assignmentScore,
        attendance: attendanceScore,
        assessment: hostApplied.assessment,
      }, effectivePolicy.weights);
      const reportGrade = overallScore == null ? null : getWAECGrade(overallScore).code;

      const payload = {
        student_id: student.id,
        teacher_id: caller.id,
        school_id: student.school_id,
        school_name: student.school_name || school_name,
        section_class: student.section_class || class_name,
        student_grade: student.grade || null,  // Class = grade, isolated from Section (cohort)
        course_id: course_id,
        course_name: course_name,
        class_id: student.class_id,
        program_id: programId,
        curriculum_release_id: teachingPlan.curriculum_release_id,
        academic_trace_status: 'traceable',
        academic_qa_status: 'not_checked',
        calculation_mode: 'automatic',
        report_term: resolvedTerm,
        term_id: termId,
        report_period: reportPeriod,
        report_date: report_date,
        instructor_name: instructor_name || caller.full_name,
        theory_score: theoryScore,
        practical_score: practicalScore,
        attendance_score: assignmentScore,
        participation_score: attendanceScore,
        engagement_metrics: {
          classwork_score: classworkScore,
          assessment_score: assessmentScore,
          assignment_evidence_missing: hostSchool ? false : !hasAssignmentEvidence,
          attendance_evidence_missing: hostSchool ? false : !hasAttendanceEvidence,
          score_authority: hostSchool ? 'host_school' : 'rillcod',
          programme_standing: hostSchool ? 'compulsory' : 'optional',
          host_review_required: hostSchool,
          ...(hostSchool ? hostAssessmentMetricFields(hostApplied.papers) : {}),
          evidence: {
            term_id: termId,
            assignment_ids: [...relevantAssignmentIds],
            session_ids: sessionIds,
            lab_project_ids: scopedLabProjects.map((project: any) => project.id),
            cbt_session_count: scopedCbtRows.length,
          },
        },
        overall_score: overallScore,
        overall_grade: reportGrade,
        is_published: false,
        updated_at: new Date().toISOString(),
      };

      const existing = await findCanonicalProgressReport(admin as any, {
        studentId: student.id,
        courseId: course_id,
        courseName: course_name,
        reportTerm: resolvedTerm,
        reportPeriod: reportPeriod,
      });
      if (isReusableLockedResult(existing)) {
        results.push({ student: student.full_name, status: 'skipped', message: 'Published or typed scores were not changed.' });
        continue;
      }

      if (existing) {
        // mergeHostSchoolMetrics returns a loose record by design — it merges
        // whatever host paper fields are present. The payload field is structurally
        // typed, so the widening has to go through unknown.
        payload.engagement_metrics = mergeHostSchoolMetrics(
          existing.engagement_metrics,
          payload.engagement_metrics,
        ) as unknown as typeof payload.engagement_metrics;
      }

      const writeResult = existing
        ? await admin.from('student_progress_reports').update(payload).eq('id', existing.id).select('id').single()
        : await admin.from('student_progress_reports').insert(payload).select('id').single();
      if (writeResult.error) throw writeResult.error;
      let calculation: unknown = { skipped: 'host_school' };
      if (!hostSchool) {
        const { data, error: calculationError } = await admin.rpc(
          'recalculate_academic_result',
          { p_report_id: writeResult.data.id, p_actor_id: caller.id },
        );
        if (calculationError) throw calculationError;
        calculation = data;
      }
      const { data: academicQuality, error: academicQualityError } = await admin.rpc(
        'evaluate_progress_report_academic_qa',
        { p_report_id: writeResult.data.id },
      );
      if (academicQualityError) throw academicQualityError;
      
      results.push({ student: student.full_name, status: 'success', calculation, academic_quality: academicQuality });
    } catch (err: any) {
      results.push({ student: student.full_name, status: 'error', message: err.message });
    }
  }

  const succeeded = results.filter((item: any) => item.status === 'success').length;
  const skipped = results.filter((item: any) => item.status === 'skipped').length;
  const failed = results.filter((item: any) => item.status === 'error').length;
  await logAudit(admin as any, {
    action: 'batch_sync_academic_results',
    actorId: caller.id,
    resourceType: 'student_progress_report_batch',
    resourceId: class_id || course_id,
    newValue: `Prepared ${succeeded} results; skipped ${skipped}; failed ${failed}`,
    newValues: {
      class_id: class_id || null,
      course_id,
      term_id: termId,
      report_period: reportPeriod,
      total_students: students.length,
      succeeded,
      skipped,
      failed,
    },
  });

  return NextResponse.json({ 
    message: `Processed ${students.length} students`,
    results 
  });
}
