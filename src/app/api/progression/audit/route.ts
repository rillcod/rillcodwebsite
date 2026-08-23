import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

type Dict = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('id,role,school_id,is_active,is_deleted')
    .eq('id', user.id)
    .single();
  if (!profile?.is_active || profile.is_deleted || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
  const requestedSchoolId = url.searchParams.get('school_id');
  const action = url.searchParams.get('action_type');
  const planId = url.searchParams.get('lesson_plan_id');

  let schoolScope: string[] | null = null;
  if (profile.role === 'teacher') {
    schoolScope = await getTeacherSchoolIds(user.id, profile.school_id);
  } else if (profile.role === 'school') {
    schoolScope = profile.school_id ? [profile.school_id] : [];
  } else if (requestedSchoolId) {
    schoolScope = [requestedSchoolId];
  }
  if (schoolScope && schoolScope.length === 0) return NextResponse.json({ data: [] });

  const decisionAction = action?.startsWith('curriculum_level_') === true;
  let overrideRows: any[] = [];
  if (!decisionAction) {
    let query = admin
      .from('progression_override_audit')
      .select('id,lesson_plan_id,school_id,actor_id,actor_role,year_number,term_number,week_number,action_type,reason,before_state,after_state,created_at')
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    if (schoolScope) query = query.in('school_id', schoolScope);
    if (action) query = query.eq('action_type', action);
    if (planId) query = query.eq('lesson_plan_id', planId);
    const result = await query;
    if (result.error) return NextResponse.json({ error: 'Unable to load academic history.' }, { status: 500 });
    overrideRows = result.data ?? [];
  }

  let decisionRows: any[] = [];
  if (!planId && (!action || decisionAction)) {
    let query = admin
      .from('student_level_decision_audit')
      .select('id,enrollment_id,student_id,school_id,course_id,resulting_course_id,decision,previous_status,resulting_status,previous_term_label,resulting_term_label,actor_id,actor_role,teacher_notes,created_at')
      .order('created_at', { ascending: false })
      .limit(limit * 2);
    if (schoolScope) query = query.in('school_id', schoolScope);
    if (decisionAction) query = query.eq('decision', action!.replace('curriculum_level_', ''));
    const result = await query;
    if (result.error && !['42P01', '42703'].includes(result.error.code ?? '')) {
      console.warn('[progression-audit] curriculum decisions unavailable', { code: result.error.code ?? null });
    } else {
      decisionRows = result.data ?? [];
    }
  }

  const actorIds = [...new Set([...overrideRows, ...decisionRows].map((row) => row.actor_id).filter(Boolean))];
  const studentIds = [...new Set(decisionRows.map((row) => row.student_id).filter(Boolean))];
  const schoolIds = [...new Set([...overrideRows, ...decisionRows].map((row) => row.school_id).filter(Boolean))];
  const courseIds = [...new Set(decisionRows.flatMap((row) => [row.course_id, row.resulting_course_id]).filter(Boolean))];
  const planIds = [...new Set(overrideRows.map((row) => row.lesson_plan_id).filter(Boolean))];

  const [actorsRes, studentsRes, schoolsRes, coursesRes, plansRes] = await Promise.all([
    actorIds.length ? admin.from('portal_users').select('id,full_name').in('id', actorIds) : Promise.resolve({ data: [] }),
    studentIds.length ? admin.from('portal_users').select('id,full_name').in('id', studentIds) : Promise.resolve({ data: [] }),
    schoolIds.length ? admin.from('schools').select('id,name').in('id', schoolIds) : Promise.resolve({ data: [] }),
    courseIds.length ? admin.from('courses').select('id,title').in('id', courseIds) : Promise.resolve({ data: [] }),
    planIds.length
      ? admin.from('lesson_plans').select('id,classes!lesson_plans_class_id_fkey(name),courses(title)').in('id', planIds)
      : Promise.resolve({ data: [] }),
  ]);
  const byId = (rows: any[] | null | undefined, field: string) =>
    new Map((rows ?? []).map((row) => [String(row.id), String(row[field] ?? '')]));
  const actorNames = byId(actorsRes.data, 'full_name');
  const studentNames = byId(studentsRes.data, 'full_name');
  const schoolNames = byId(schoolsRes.data, 'name');
  const courseNames = byId(coursesRes.data, 'title');
  const planNames = new Map((plansRes.data ?? []).map((plan: any) => [
    String(plan.id),
    [plan.classes?.name, plan.courses?.title].filter(Boolean).join(' · ') || 'Teaching plan',
  ]));

  const normalizedOverrides = overrideRows.map((row) => ({
    ...row,
    actor_name: actorNames.get(String(row.actor_id)) || null,
    school_name: schoolNames.get(String(row.school_id)) || null,
    plan_label: planNames.get(String(row.lesson_plan_id)) || 'Teaching plan',
    student_name: null,
    course_title: null,
  }));
  const normalizedDecisions = decisionRows.map((row) => ({
    id: row.id,
    lesson_plan_id: null,
    school_id: row.school_id,
    actor_id: row.actor_id,
    actor_role: row.actor_role,
    year_number: null,
    term_number: null,
    week_number: null,
    action_type: `curriculum_level_${row.decision}`,
    reason: row.teacher_notes,
    before_state: {
      status: row.previous_status,
      course: courseNames.get(String(row.course_id)) || 'Current level',
      term: row.previous_term_label,
    } satisfies Dict,
    after_state: {
      status: row.resulting_status,
      course: courseNames.get(String(row.resulting_course_id)) || courseNames.get(String(row.course_id)) || 'Current level',
      term: row.resulting_term_label,
    } satisfies Dict,
    created_at: row.created_at,
    actor_name: actorNames.get(String(row.actor_id)) || null,
    school_name: schoolNames.get(String(row.school_id)) || null,
    plan_label: null,
    student_name: studentNames.get(String(row.student_id)) || 'Learner',
    course_title: courseNames.get(String(row.course_id)) || 'Curriculum level',
  }));

  const rows = [...normalizedOverrides, ...normalizedDecisions]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
  return NextResponse.json({ data: rows });
}
