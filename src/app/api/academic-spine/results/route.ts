import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    academic_offerings(title,enrollment_type,academic_model),
    academic_offering_periods(label),academic_terms(term_label,academic_year)
  `).order('name');
  if (user.role === 'teacher') classQuery = classQuery.eq('teacher_id', user.id);
  const { data: classes, error: classError } = await classQuery;
  if (classError) return NextResponse.json({ error: classError.message }, { status: 500 });
  const classIds = (classes ?? []).map((item: any) => item.id);
  if (!classIds.length) return NextResponse.json({ data: { classes: [], students: [], plans: [], reports: [] } });
  const [students, plans, reports] = await Promise.all([
    db.from('portal_users').select('id,full_name,class_id,enrollment_type').eq('role', 'student').in('class_id', classIds).eq('is_deleted', false).order('full_name'),
    db.from('lesson_plans').select('id,class_id,course_id,curriculum_release_id,status,courses(title)').in('class_id', classIds).neq('status', 'archived'),
    db.from('student_progress_reports').select('id,student_id,class_id,course_id,student_name,course_name,report_term,report_period,overall_score,grade,calculation_mode,academic_qa_status,is_published,updated_at').in('class_id', classIds).order('updated_at', { ascending: false }).limit(250),
  ]);
  const error = students.error || plans.error || reports.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: {
    classes: classes ?? [], students: students.data ?? [], plans: plans.data ?? [], reports: reports.data ?? [],
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
    const { data: report } = await db.from('student_progress_reports').select('id,class_id').eq('id', reportId).maybeSingle();
    if (!report) return NextResponse.json({ error: 'Result record not found' }, { status: 404 });
    if (user.role === 'teacher') {
      const { data: klass } = await db.from('classes').select('teacher_id').eq('id', report.class_id).maybeSingle();
      if (klass?.teacher_id !== user.id) return NextResponse.json({ error: 'This result belongs to another class.' }, { status: 403 });
    }
    const { data: calculation, error: calculationError } = await db.rpc('recalculate_academic_result', { p_report_id: reportId, p_actor_id: user.id });
    if (calculationError) return NextResponse.json({ error: calculationError.message, detail: calculationError.details }, { status: 400 });
    const { data: quality, error: qualityError } = await db.rpc('evaluate_progress_report_academic_qa', { p_report_id: reportId });
    if (qualityError) return NextResponse.json({ error: qualityError.message }, { status: 400 });
    return NextResponse.json({ data: { report_id: reportId, calculation, academic_quality: quality } });
  }

  const studentId = typeof body.student_id === 'string' ? body.student_id : '';
  const classId = typeof body.class_id === 'string' ? body.class_id : '';
  const courseId = typeof body.course_id === 'string' ? body.course_id : '';
  if (!studentId || !classId || !courseId) return NextResponse.json({ error: 'Learner, class and course are required.' }, { status: 400 });

  const [{ data: klass }, { data: student }, { data: course }] = await Promise.all([
    db.from('classes').select('id,name,school_id,teacher_id,program_id,term_id,academic_offering_id,offering_period_id,schools(name),academic_terms(term_label,academic_year),academic_offerings(title,pathway,academic_model,delivery_mode,enrollment_type),academic_offering_periods(label,starts_on,ends_on)').eq('id', classId).maybeSingle(),
    db.from('portal_users').select('id,full_name,class_id,school_id,section_class,grade,enrollment_type').eq('id', studentId).eq('role', 'student').maybeSingle(),
    db.from('courses').select('id,title,program_id').eq('id', courseId).maybeSingle(),
  ]);
  if (!klass || !student || !course) return NextResponse.json({ error: 'The learner, class or course could not be found.' }, { status: 404 });
  if (student.class_id !== klass.id) return NextResponse.json({ error: 'This learner is not in the selected class or cohort.' }, { status: 400 });
  if (user.role === 'teacher' && klass.teacher_id !== user.id) return NextResponse.json({ error: 'You can only prepare results for your assigned class.' }, { status: 403 });
  if (!klass.academic_offering_id || !klass.offering_period_id) return NextResponse.json({ error: 'Choose the class academic pathway and reporting period first.' }, { status: 409 });
  const offering = one<any>(klass.academic_offerings);
  if (!student.enrollment_type || student.enrollment_type !== offering?.enrollment_type) {
    return NextResponse.json({
      error: 'The learner enrollment type does not match this class pathway. Correct the enrollment or class placement before preparing a result.',
    }, { status: 409 });
  }

  let planQuery = db.from('lesson_plans').select('id,curriculum_release_id,status')
    .eq('class_id', classId).eq('course_id', courseId).eq('offering_period_id', klass.offering_period_id).neq('status', 'archived');
  if (klass.term_id) planQuery = planQuery.eq('term_id', klass.term_id);
  const { data: plan } = await planQuery.maybeSingle();
  if (!plan?.curriculum_release_id) return NextResponse.json({ error: 'Assign an official academic direction and teaching plan before preparing this result.' }, { status: 409 });

  const period = one<any>(klass.academic_offering_periods);
  const term = one<any>(klass.academic_terms);
  const school = one<any>(klass.schools);
  const isTermly = offering?.academic_model === 'termly_school';
  const periodLabel = isTermly ? term?.term_label : period?.label || offering?.title;
  const periodContext = isTermly
    ? term?.academic_year
    : [period?.starts_on, period?.ends_on].filter(Boolean).join(' to ') || offering?.title;
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
    term_id: klass.term_id,
    student_name: student.full_name,
    school_name: school?.name ?? null,
    section_class: student.section_class || klass.name,
    student_grade: student.grade ?? null,
    course_name: course.title,
    report_term: periodLabel || 'Current learning period',
    report_period: periodContext || 'Current programme',
    report_date: new Date().toISOString().slice(0, 10),
    calculation_mode: calculationMode,
    academic_trace_status: 'traceable',
    academic_qa_status: 'not_checked',
    is_published: false,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await db.from('student_progress_reports').select('id,calculation_mode')
    .eq('student_id', student.id).eq('course_id', course.id)
    .eq('academic_offering_id', klass.academic_offering_id).eq('offering_period_id', klass.offering_period_id).maybeSingle();
  if (existing?.calculation_mode === 'manual' && calculationMode !== 'manual') {
    return NextResponse.json({ error: 'This learner already has a protected manual result for this course and period. It was not changed.' }, { status: 409 });
  }
  if (existing?.calculation_mode === 'manual') {
    return NextResponse.json({ data: { report_id: existing.id, calculation_mode: 'manual',
      message: 'Protected manual result already exists. No fields were changed.' } });
  }


  const write = existing
    ? await db.from('student_progress_reports').update(payload).eq('id', existing.id).select('id').single()
    : await db.from('student_progress_reports').insert(payload).select('id').single();
  if (write.error) return NextResponse.json({ error: write.error.message }, { status: 400 });
  if (calculationMode === 'manual') {
    return NextResponse.json({ data: { report_id: write.data.id, calculation_mode: 'manual', message: 'Manual result created. Entered marks will not be overwritten.' } }, { status: existing ? 200 : 201 });
  }
  const { data: calculation, error: calculationError } = await db.rpc('recalculate_academic_result', { p_report_id: write.data.id, p_actor_id: user.id });
  if (calculationError) return NextResponse.json({ error: calculationError.message, detail: calculationError.details }, { status: 400 });
  const { data: quality, error: qualityError } = await db.rpc('evaluate_progress_report_academic_qa', { p_report_id: write.data.id });
  if (qualityError) return NextResponse.json({ error: qualityError.message }, { status: 400 });
  return NextResponse.json({ data: {
    report_id: write.data.id,
    pathway: offering?.pathway,
    academic_model: offering?.academic_model,
    calculation,
    academic_quality: quality,
  } }, { status: existing ? 200 : 201 });
}
