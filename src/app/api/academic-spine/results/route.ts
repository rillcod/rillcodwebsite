import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { normalizeEnrollmentType } from '@/lib/registration/enrollment-types';
import { fetchAllReportRows } from '@/lib/school-reports/paginated-query';
import { findCanonicalProgressReport, isReusableLockedResult } from '@/lib/reports/canonical-report';
import { resolveClassReportSession } from '@/lib/reports/session-labels';
import { autoFillResultMessage } from '@/lib/reports/score';

type Actor = { id: string; role: string; school_id: string | null };

async function actor(): Promise<Actor | null> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const db: any = createAdminClient();
  const { data } = await db.from('portal_users').select('id,role,school_id').eq('id', user.id).maybeSingle();
  return data as Actor | null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function GET() {
  const user = await actor();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'teacher'].includes(user.role)) return NextResponse.json({ error: 'Academic staff access required' }, { status: 403 });
  const db: any = createAdminClient();
  let classQuery = db.from('classes').select(`
    id,name,teacher_id,term_id,academic_offering_id,offering_period_id,
    schools(programme_standing),
    academic_offerings(title,enrollment_type,academic_model),
    academic_offering_periods(label),academic_terms(term_label,academic_year)
  `).order('name');
  if (user.role === 'teacher') classQuery = classQuery.eq('teacher_id', user.id);
  const { data: classes, error: classError } = await classQuery;
  if (classError) return NextResponse.json({ error: classError.message }, { status: 500 });
  const classIds = (classes ?? []).map((item: any) => item.id);
  if (!classIds.length) return NextResponse.json({ data: { classes: [], students: [], plans: [], reports: [] } });
  const [students, plans] = await Promise.all([
    db.from('portal_users').select('id,full_name,class_id,enrollment_type').eq('role', 'student').in('class_id', classIds).eq('is_deleted', false).order('full_name'),
    db.from('lesson_plans').select('id,class_id,course_id,curriculum_release_id,status,courses(title)').in('class_id', classIds).neq('status', 'archived'),
  ]);
  const listError = students.error || plans.error;
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  // Report Builder loads by student_id. Many older rows have null class_id, so
  // filtering only `.in('class_id', classIds)` under-counted the workspace hero.
  const reportSelect =
    'id,student_id,class_id,course_id,student_name,course_name,report_term,report_period,overall_score,overall_grade,calculation_mode,academic_qa_status,is_published,updated_at,calculation_snapshot,engagement_metrics';
  const byId = new Map<string, Record<string, unknown>>();
  const studentIds = ((students.data ?? []) as Array<{ id: string }>).map((s) => s.id);

  async function collectReports(column: 'class_id' | 'student_id', ids: string[]) {
    for (let i = 0; i < ids.length; i += 120) {
      const batch = ids.slice(i, i + 120);
      const { data, error } = await fetchAllReportRows<Record<string, unknown>>((from, to) => db
          .from('student_progress_reports')
          .select(reportSelect)
          .in(column, batch)
          .order('updated_at', { ascending: false })
          .range(from, to),
        400,
      );
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (typeof row?.id === 'string') byId.set(row.id, row);
      }
    }
  }

  try {
    await collectReports('class_id', classIds);
    if (studentIds.length) await collectReports('student_id', studentIds);
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Unable to load results.' },
      { status: 500 },
    );
  }

  const reports = [...byId.values()].sort((a, b) => {
    const aTime = String(a.updated_at || '');
    const bTime = String(b.updated_at || '');
    return bTime.localeCompare(aTime);
  });

  return NextResponse.json({ data: {
    classes: classes ?? [],
    students: students.data ?? [],
    plans: plans.data ?? [],
    reports,
  } });
}


export async function POST(req: NextRequest) {
  const user = await actor();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'teacher'].includes(user.role)) return NextResponse.json({ error: 'Academic staff access required' }, { status: 403 });
  const body = await req.json();
  const db: any = createAdminClient();

  if (body.action === 'recalculate') {
    const reportId = typeof body.report_id === 'string' ? body.report_id : '';
    const { data: report } = await db.from('student_progress_reports')
      .select('id,class_id,calculation_mode,is_published')
      .eq('id', reportId).maybeSingle();
    if (!report) return NextResponse.json({ error: 'Result record not found' }, { status: 404 });
    if (report.is_published || report.calculation_mode === 'manual') {
      return NextResponse.json({
        error: 'Published and typed scores stay as they are. Refresh only unpublished Auto-fill drafts.',
      }, { status: 409 });
    }
    if (user.role === 'teacher') {
      const { data: klass } = await db.from('classes').select('teacher_id').eq('id', report.class_id).maybeSingle();
      if (klass?.teacher_id !== user.id) return NextResponse.json({ error: 'This result belongs to another class.' }, { status: 403 });
    }
    const { data: calculation, error: calculationError } = await db.rpc('recalculate_academic_result', { p_report_id: reportId, p_actor_id: user.id });
    if (calculationError) return NextResponse.json({ error: calculationError.message, detail: calculationError.details }, { status: 400 });
    const { data: quality, error: qualityError } = await db.rpc('evaluate_progress_report_academic_qa', { p_report_id: reportId });
    if (qualityError) return NextResponse.json({ error: qualityError.message }, { status: 400 });
    await logAudit(db as any, {
      action: 'recalculate_academic_result',
      actorId: user.id,
      resourceType: 'student_progress_report',
      resourceId: reportId,
      newValue: 'Refreshed scores from current class work',
      newValues: { calculation, academic_quality: quality },
    });
    return NextResponse.json({ data: { report_id: reportId, calculation, academic_quality: quality, message: autoFillResultMessage(calculation) } });
  }

  const studentId = typeof body.student_id === 'string' ? body.student_id : '';
  const classId = typeof body.class_id === 'string' ? body.class_id : '';
  const courseId = typeof body.course_id === 'string' ? body.course_id : '';
  if (!studentId || !classId || !courseId) return NextResponse.json({ error: 'Learner, class and course are required.' }, { status: 400 });

  const [{ data: klass }, { data: student }, { data: course }] = await Promise.all([
    db.from('classes').select('id,name,school_id,teacher_id,program_id,term_id,academic_offering_id,offering_period_id,schools(name,programme_standing),academic_terms(term_label,academic_year),academic_offerings(title,pathway,academic_model,delivery_mode,enrollment_type),academic_offering_periods(label,starts_on,ends_on)').eq('id', classId).maybeSingle(),
    db.from('portal_users').select('id,full_name,class_id,school_id,section_class,grade,enrollment_type').eq('id', studentId).eq('role', 'student').maybeSingle(),
    db.from('courses').select('id,title,program_id').eq('id', courseId).maybeSingle(),
  ]);
  if (!klass || !student || !course) return NextResponse.json({ error: 'The learner, class or course could not be found.' }, { status: 404 });
  if (student.class_id !== klass.id) return NextResponse.json({ error: 'This learner is not in the selected class or cohort.' }, { status: 400 });
  if (user.role === 'teacher' && klass.teacher_id !== user.id) return NextResponse.json({ error: 'You can only auto-fill reports for your assigned class.' }, { status: 403 });
  if (!klass.academic_offering_id || !klass.offering_period_id) return NextResponse.json({ error: 'Set the class programme and reporting period first.' }, { status: 409 });
  const offering = one<any>(klass.academic_offerings);
  const studentEnrollmentType = student.enrollment_type
    ? normalizeEnrollmentType(student.enrollment_type)
    : null;
  const offeringEnrollmentType = offering?.enrollment_type
    ? normalizeEnrollmentType(offering.enrollment_type)
    : null;
  if (!studentEnrollmentType || !offeringEnrollmentType || studentEnrollmentType !== offeringEnrollmentType) {
    return NextResponse.json({
      error: 'This learner is not placed on this class programme. Fix placement before auto-fill.',
    }, { status: 409 });
  }

  let planQuery = db.from('lesson_plans').select('id,curriculum_release_id,status,updated_at')
    .eq('class_id', classId).eq('course_id', courseId).eq('offering_period_id', klass.offering_period_id).neq('status', 'archived');
  if (klass.term_id) planQuery = planQuery.eq('term_id', klass.term_id);
  const { data: plan, error: planError } = await planQuery
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) return NextResponse.json({ error: `The teaching plan could not be checked: ${planError.message}` }, { status: 500 });
  if (!plan?.curriculum_release_id) return NextResponse.json({ error: 'This course needs a teaching plan before auto-fill.' }, { status: 409 });

  const period = one<any>(klass.academic_offering_periods);
  const term = one<any>(klass.academic_terms);
  const school = one<any>(klass.schools);
  const compulsorySchoolPapers = school?.programme_standing === 'compulsory';
  const sessionLabels = resolveClassReportSession({
    academicTerm: term,
    termId: klass.term_id,
    offeringPeriod: period,
    offeringTitle: offering?.title,
    isTermly: offering?.academic_model === 'termly_school',
  });
  const calculationMode = body.calculation_mode === 'manual' ? 'manual' : 'automatic';

  const payload = {
    student_id: student.id,
    teacher_id: user.id,
    school_id: klass.school_id,
    class_id: klass.id,
    program_id: klass.program_id,
    course_id: course.id,
    curriculum_release_id: plan.curriculum_release_id,
    academic_offering_id: klass.academic_offering_id,
    offering_period_id: klass.offering_period_id,
    term_id: sessionLabels.term_id,
    student_name: student.full_name,
    school_name: school?.name ?? null,
    section_class: student.section_class || klass.name,
    student_grade: student.grade ?? null,
    course_name: course.title,
    report_term: sessionLabels.report_term,
    report_period: sessionLabels.report_period,
    report_date: new Date().toISOString().slice(0, 10),
    calculation_mode: calculationMode,
    academic_trace_status: 'traceable',
    academic_qa_status: 'not_checked',
    engagement_metrics: {
      score_authority: compulsorySchoolPapers ? 'host_school' : 'rillcod',
      programme_standing: compulsorySchoolPapers ? 'compulsory' : 'optional',
      // Auto-fill may prepare the shared draft, but host-school test/exam
      // papers are authoritative and must be adopted in Write before release.
      host_review_required: compulsorySchoolPapers,
    },
    is_published: false,
    updated_at: new Date().toISOString(),
  };

  const existing = await findCanonicalProgressReport(db, {
    studentId: student.id,
    courseId: course.id,
    courseName: course.title,
    reportTerm: payload.report_term,
    reportPeriod: payload.report_period,
    termId: sessionLabels.term_id,
    academicOfferingId: klass.academic_offering_id,
    offeringPeriodId: klass.offering_period_id,
  });
  if (isReusableLockedResult(existing) && existing) {
    return NextResponse.json({
      data: {
        report_id: existing.id,
        calculation_mode: existing.calculation_mode,
        reused: true,
        message: existing.is_published
          ? 'This report is already published. Open Publish to view it.'
          : 'Scores are already typed. Open Write to change them.',
      },
    });
  }


  const write = existing
    ? await db.from('student_progress_reports').update(payload).eq('id', existing.id).select('id').single()
    : await db.from('student_progress_reports').insert(payload).select('id').single();
  if (write.error) return NextResponse.json({ error: write.error.message }, { status: 400 });
  if (calculationMode === 'manual') {
    await logAudit(db as any, {
      action: 'create_protected_manual_result',
      actorId: user.id,
      resourceType: 'student_progress_report',
      resourceId: write.data.id,
      newValue: `Opened typed report for ${student.full_name}`,
      newValues: {
        student_id: student.id,
        class_id: klass.id,
        course_id: course.id,
        academic_offering_id: klass.academic_offering_id,
        offering_period_id: klass.offering_period_id,
        calculation_mode: 'manual',
      },
    });
    return NextResponse.json({ data: { report_id: write.data.id, calculation_mode: 'manual', message: 'Opened in Write. Auto-fill will not change these scores.' } }, { status: existing ? 200 : 201 });
  }
  const { data: calculation, error: calculationError } = await db.rpc('recalculate_academic_result', { p_report_id: write.data.id, p_actor_id: user.id });
  if (calculationError) return NextResponse.json({ error: calculationError.message, detail: calculationError.details }, { status: 400 });
  const { data: quality, error: qualityError } = await db.rpc('evaluate_progress_report_academic_qa', { p_report_id: write.data.id });
  if (qualityError) return NextResponse.json({ error: qualityError.message }, { status: 400 });
  await logAudit(db as any, {
    action: existing ? 'refresh_automatic_academic_result' : 'create_automatic_academic_result',
    actorId: user.id,
    resourceType: 'student_progress_report',
    resourceId: write.data.id,
    newValue: `${existing ? 'Refreshed' : 'Created'} automatic result for ${student.full_name}`,
    newValues: {
      student_id: student.id,
      class_id: klass.id,
      course_id: course.id,
      academic_offering_id: klass.academic_offering_id,
      offering_period_id: klass.offering_period_id,
      calculation,
      academic_quality: quality,
    },
  });
  return NextResponse.json({ data: {
    report_id: write.data.id,
    calculation_mode: calculationMode,
    pathway: offering?.pathway,
    academic_model: offering?.academic_model,
    calculation,
    academic_quality: quality,
    message: autoFillResultMessage(calculation),
    reused: false,
  } }, { status: existing ? 200 : 201 });
}
