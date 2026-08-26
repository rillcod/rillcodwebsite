import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

type Actor = { id: string; role: string; school_id: string | null; full_name: string | null; class_id: string | null };

async function actor(): Promise<Actor | null> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const db: any = createAdminClient();
  const { data } = await db.from('portal_users')
    .select('id,role,school_id,full_name,class_id').eq('id', user.id).maybeSingle();
  return data as Actor | null;
}

async function visibleClassIds(db: any, user: Actor) {
  let query = db.from('classes').select('id,name,school_id,term_id,current_course_id,program_id,teacher_id,academic_offering_id');
  if (user.role === 'teacher') query = query.eq('teacher_id', user.id);
  if (user.role === 'school') query = query.eq('school_id', user.school_id);
  if (user.role === 'student') query = query.eq('id', user.class_id);
  const { data } = await query;
  return data ?? [];
}

export async function GET(req: NextRequest) {
  const user = await actor();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'teacher', 'school', 'student'].includes(user.role)) {
    return NextResponse.json({ error: 'Academic access required' }, { status: 403 });
  }

  const db: any = createAdminClient();
  const classes = await visibleClassIds(db, user);
  const classIds = classes.map((row: any) => row.id);
  const requestedClass = new URL(req.url).searchParams.get('class_id');
  if (requestedClass && !classIds.includes(requestedClass)) {
    return NextResponse.json({ error: 'This class is outside your academic scope' }, { status: 403 });
  }
  const scopedClassIds = requestedClass ? [requestedClass] : classIds;
  if (user.role !== 'admin' && scopedClassIds.length === 0) {
    return NextResponse.json({ data: { classes: [], totals: {}, attention: [], message: 'No classes are assigned to this account yet.' } });
  }

  const applyClassScope = (query: any) => (
    user.role === 'admin' && !requestedClass ? query : query.in('class_id', scopedClassIds)
  );
  const studentId = user.role === 'student' ? user.id : null;
  const schoolIds = Array.from(new Set(classes.map((row: any) => row.school_id).filter(Boolean)));
  const offeringIds = Array.from(new Set(classes.map((row: any) => row.academic_offering_id).filter(Boolean)));

  let adoptionQuery = db.from('academic_curriculum_adoptions')
    .select('id,school_id,course_id,release_id,status', { count: 'exact' })
    .eq('status', 'active');
  let offeringDirectionQuery = db.from('academic_offering_curriculum_directions')
    .select('id,academic_offering_id,course_id,release_id,status', { count: 'exact' })
    .eq('status', 'active');
  if (user.role !== 'admin') {
    adoptionQuery = schoolIds.length
      ? adoptionQuery.in('school_id', schoolIds)
      : adoptionQuery.eq('school_id', '00000000-0000-0000-0000-000000000000');
    offeringDirectionQuery = offeringIds.length
      ? offeringDirectionQuery.in('academic_offering_id', offeringIds)
      : offeringDirectionQuery.eq('academic_offering_id', '00000000-0000-0000-0000-000000000000');
  }

  const scopeEvidence = (query: any) => {
    const scoped = applyClassScope(query);
    return studentId ? scoped.eq('student_id', studentId) : scoped;
  };
  const scopeReports = (query: any) => {
    const scoped = applyClassScope(query);
    return studentId ? scoped.eq('student_id', studentId).eq('is_published', true) : scoped;
  };

  const reportQuery = scopeReports(db.from('student_progress_reports')
    .select('id,student_id,student_name,section_class,course_name,report_term,report_period,is_published,academic_trace_status,academic_qa_status,academic_qa_issues,curriculum_coverage,teaching_delivery_pct,class_id,updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false }).limit(80));

  const [
    plans,
    deliveries,
    deliveredLessons,
    assessments,
    linkedAssessments,
    evidence,
    linkedEvidence,
    legacyEvidence,
    reports,
    traceableReports,
    readyReports,
    publishedReports,
    progressions,
    adoptions,
    offeringDirections,
  ] = await Promise.all([
    applyClassScope(db.from('lesson_plans').select('id,class_id,curriculum_release_id,status', { count: 'exact' }).neq('status', 'archived')),
    applyClassScope(db.from('class_lesson_delivery').select('id,status,class_id', { count: 'exact' })),
    applyClassScope(db.from('class_lesson_delivery').select('id', { count: 'exact', head: true }).eq('status', 'delivered')),
    applyClassScope(db.from('assignments').select('id', { count: 'exact', head: true })),
    applyClassScope(db.from('assignments').select('id', { count: 'exact', head: true })
      .not('lesson_plan_id', 'is', null).not('curriculum_release_id', 'is', null)),
    scopeEvidence(db.from('academic_assessment_evidence').select('id', { count: 'exact', head: true })
      .neq('context_status', 'legacy_unscoped')),
    scopeEvidence(db.from('academic_assessment_evidence').select('id', { count: 'exact', head: true })
      .neq('context_status', 'legacy_unscoped')
      .not('lesson_plan_id', 'is', null).not('curriculum_release_id', 'is', null)),
    scopeEvidence(db.from('academic_assessment_evidence').select('id', { count: 'exact', head: true })
      .eq('context_status', 'legacy_unscoped')),
    reportQuery,
    scopeReports(db.from('student_progress_reports').select('id', { count: 'exact', head: true })
      .eq('academic_trace_status', 'traceable')),
    scopeReports(db.from('student_progress_reports').select('id', { count: 'exact', head: true })
      .eq('academic_qa_status', 'ready')),
    scopeReports(db.from('student_progress_reports').select('id', { count: 'exact', head: true })
      .eq('is_published', true)),
    applyClassScope(db.from('academic_progression_decisions').select('id,status,class_id', { count: 'exact' })),
    adoptionQuery,
    offeringDirectionQuery,
  ]);

  const errors = [
    plans, deliveries, deliveredLessons, assessments, linkedAssessments,
    evidence, linkedEvidence, legacyEvidence, reports, traceableReports, readyReports,
    publishedReports, progressions, adoptions, offeringDirections,
  ]
    .map((result: any) => result.error?.message).filter(Boolean);
  if (errors.length) return NextResponse.json({ error: errors[0] }, { status: 500 });

  const planRows = plans.data ?? [];
  const deliveryRows = deliveries.data ?? [];
  const reportRows = reports.data ?? [];
  const officiallyDirectedPlans = planRows.filter((row: any) => row.curriculum_release_id).length;
  const classesWithPlans = new Set(planRows.map((row: any) => row.class_id).filter(Boolean));
  const classesWithDelivery = new Set(deliveryRows.map((row: any) => row.class_id).filter(Boolean));
  const draftPlans = planRows.filter((row: any) => row.status === 'draft').length;
  const publishedPlans = planRows.filter((row: any) => row.status === 'published').length;
  const assignedDirections = (adoptions.count ?? adoptions.data?.length ?? 0)
    + (offeringDirections.count ?? offeringDirections.data?.length ?? 0);

  return NextResponse.json({ data: {
    classes,
    totals: {
      classes: classes.length,
      assigned_directions: assignedDirections,
      classes_with_teaching_plans: classesWithPlans.size,
      classes_waiting_for_teaching_plans: Math.max(0, classes.length - classesWithPlans.size),
      classes_with_delivery_started: classesWithDelivery.size,
      draft_teaching_plans: draftPlans,
      published_teaching_plans: publishedPlans,
      teaching_plans: plans.count ?? planRows.length,
      officially_directed_plans: officiallyDirectedPlans,
      delivery_records: deliveries.count ?? deliveryRows.length,
      delivered_lessons: deliveredLessons.count ?? 0,
      assessments: assessments.count ?? 0,
      linked_assessments: linkedAssessments.count ?? 0,
      evidence_records: evidence.count ?? 0,
      legacy_evidence_records: legacyEvidence.count ?? 0,
      linked_evidence: linkedEvidence.count ?? 0,
      progress_reports: reports.count ?? reportRows.length,
      traceable_reports: traceableReports.count ?? 0,
      ready_reports: readyReports.count ?? 0,
      published_reports: publishedReports.count ?? 0,
      progression_decisions: progressions.count ?? (progressions.data ?? []).length,
    },
    attention: user.role === 'student'
      ? []
      : reportRows.filter((row: any) => row.academic_trace_status === 'traceable' && row.academic_qa_status !== 'ready'),
    recent_reports: reportRows.slice(0, 20),
    pathway: [
      'Official academic direction', 'Class teaching plan', 'Delivered lesson',
      'Assessment evidence', 'Moderated result', 'Progress report', 'Progression decision',
    ],
  }});
}

export async function POST(req: NextRequest) {
  const user = await actor();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'teacher'].includes(user.role)) {
    return NextResponse.json({ error: 'Only the Academic Office and assigned teacher can perform this check.' }, { status: 403 });
  }
  const body = await req.json();
  const db: any = createAdminClient();

  if (body.action === 'check_report') {
    const reportId = typeof body.report_id === 'string' ? body.report_id : '';
    const { data: report } = await db.from('student_progress_reports')
      .select('id,class_id,school_id').eq('id', reportId).maybeSingle();
    if (!report) return NextResponse.json({ error: 'Progress report not found' }, { status: 404 });
    if (user.role === 'teacher') {
      const schoolIds = await getTeacherSchoolIds(user.id, user.school_id);
      const { data: klass } = await db.from('classes').select('teacher_id').eq('id', report.class_id).maybeSingle();
      if (!schoolIds.includes(report.school_id) || klass?.teacher_id !== user.id) {
        return NextResponse.json({ error: 'This report belongs to another teaching assignment.' }, { status: 403 });
      }
    }
    const { data, error } = await db.rpc('evaluate_progress_report_academic_qa', { p_report_id: reportId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAudit(db, {
      action: 'evaluate_progress_report_academic_qa',
      actorId: user.id,
      resourceType: 'student_progress_report',
      resourceId: reportId,
      tableName: 'student_progress_reports',
      newValue: 'Academic QA check completed',
      newValues: { class_id: report.class_id, school_id: report.school_id },
    });
    return NextResponse.json({ data });
  }

  if (body.action === 'record_progression') {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'The Academic Office approves progression decisions.' }, { status: 403 });
    }
    const allowed = new Set(['continue', 'advance', 'advance_with_support', 'repeat_focus', 'review_required']);
    if (!allowed.has(body.decision) || !body.student_id || !body.school_id || !body.academic_term_id || !String(body.rationale ?? '').trim()) {
      return NextResponse.json({ error: 'Student, term, decision and a human rationale are required.' }, { status: 400 });
    }
    const { data, error } = await db.from('academic_progression_decisions').insert({
      student_id: body.student_id,
      school_id: body.school_id,
      class_id: body.class_id ?? null,
      academic_term_id: body.academic_term_id,
      progress_report_id: body.progress_report_id ?? null,
      decision: body.decision,
      next_class_id: body.next_class_id ?? null,
      rationale: String(body.rationale).trim(),
      support_plan: body.support_plan ?? {},
      evidence_snapshot: body.evidence_snapshot ?? {},
      status: 'approved',
      decided_by: user.id,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logAudit(db, {
      action: 'record_academic_progression_decision',
      actorId: user.id,
      resourceType: 'academic_progression_decision',
      resourceId: data.id,
      tableName: 'academic_progression_decisions',
      newValue: `Approved ${body.decision} progression decision`,
      newValues: {
        student_id: body.student_id,
        school_id: body.school_id,
        class_id: body.class_id ?? null,
        academic_term_id: body.academic_term_id,
        decision: body.decision,
        next_class_id: body.next_class_id ?? null,
      },
    });
    return NextResponse.json({ data }, { status: 201 });
  }

  return NextResponse.json({ error: 'Unknown academic action' }, { status: 400 });
}
