import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type EnrollmentRow = {
  id: string;
  student_id: string;
  course_id: string;
  school_id: string | null;
  term_label: string;
  start_week: number;
  status: string;
  promoted_to: string | null;
  updated_at: string;
  courses?: {
    title?: string | null;
    level_order?: number | null;
    programs?: { name?: string | null } | null;
  } | null;
};

type VisibilityMode = 'full' | 'milestone';

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function weekTopicFromCurriculum(
  content: Record<string, unknown> | null,
  termNumber: number,
  weekNumber: number,
): string | null {
  const terms = Array.isArray(content?.terms) ? (content?.terms as Array<Record<string, unknown>>) : [];
  const term = terms.find((t) => Number(t.term ?? 0) === termNumber) ?? null;
  if (!term) return null;
  const weeks = Array.isArray(term.weeks) ? (term.weeks as Array<Record<string, unknown>>) : [];
  const week = weeks.find((w) => Number(w.week ?? 0) === weekNumber) ?? null;
  return typeof week?.topic === 'string' ? week.topic : null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient() as any;
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, email')
    .eq('id', user.id)
    .single();
  if (!profile || !['student', 'parent', 'teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const childId = url.searchParams.get('child_id');
  const studentId = url.searchParams.get('student_id');

  let targetStudentIds: string[] = [];
  let childOptions: Array<{ id: string; full_name: string; user_id: string | null }> = [];

  if (profile.role === 'student') {
    targetStudentIds = [profile.id];
  } else if (profile.role === 'parent') {
    const parentEmail = String(profile.email ?? '').trim().toLowerCase();
    let linkedIds: string[] = [];
    try {
      const { data: links } = await admin
        .from('parent_student_links')
        .select('student_id')
        .eq('parent_id', profile.id);
      linkedIds = (links ?? []).map((x: { student_id: string }) => x.student_id).filter(Boolean);
    } catch {
      linkedIds = [];
    }

    let q = admin
      .from('students')
      .select('id, full_name, user_id, parent_email')
      .order('full_name', { ascending: true });
    if (parentEmail && linkedIds.length > 0) {
      q = q.or(`parent_email.ilike.${parentEmail},id.in.(${linkedIds.join(',')})`);
    } else if (parentEmail) {
      q = q.ilike('parent_email', parentEmail);
    } else if (linkedIds.length > 0) {
      q = q.in('id', linkedIds);
    } else {
      return NextResponse.json({ data: { children: [], paths: [] } });
    }
    const { data: children } = await q;
    childOptions = (children ?? []).map((c: any) => ({
      id: c.id,
      full_name: c.full_name,
      user_id: c.user_id,
    }));
    const filtered = childId ? childOptions.filter((c) => c.id === childId) : childOptions;
    targetStudentIds = filtered.map((c) => c.user_id).filter(Boolean) as string[];
  } else {
    if (!studentId) {
      return NextResponse.json({ error: 'student_id is required for staff view' }, { status: 400 });
    }
    targetStudentIds = [studentId];
  }

  if (targetStudentIds.length === 0) {
    return NextResponse.json({ data: { children: childOptions, paths: [] } });
  }

  const { data: enrollmentsRaw, error: enrErr } = await admin
    .from('student_level_enrollments')
    .select('id, student_id, course_id, school_id, term_label, start_week, status, promoted_to, updated_at, courses(title, level_order, programs(name))')
    .in('student_id', targetStudentIds)
    .order('updated_at', { ascending: false });
  if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 });
  const enrollments = (enrollmentsRaw ?? []) as EnrollmentRow[];

  const uniqueStudentIds = Array.from(new Set(enrollments.map((e) => e.student_id)));
  const { data: studentRows } = uniqueStudentIds.length > 0
    ? await admin
        .from('portal_users')
        .select('id, class_id')
        .in('id', uniqueStudentIds)
    : { data: [] };
  const classByStudent: Record<string, string | null> = Object.fromEntries(
    (studentRows ?? []).map((s: any) => [s.id, s.class_id ?? null]),
  );

  const classKeys = Array.from(new Set(Object.values(classByStudent).filter(Boolean))).map(
    (id) => `progression.path_visibility.class.${id}`,
  );
  const studentKeys = uniqueStudentIds.map((id) => `progression.path_visibility.student.${id}`);
  const allVisibilityKeys = [...classKeys, ...studentKeys];
  const { data: settingRows } = allVisibilityKeys.length > 0
    ? await admin
        .from('app_settings')
        .select('key, value')
        .in('key', allVisibilityKeys)
    : { data: [] };
  const visibilityByKey: Record<string, string> = Object.fromEntries(
    (settingRows ?? []).map((r: any) => [String(r.key), String(r.value)]),
  );

  const paths = [];
  for (const enr of enrollments) {
    const classId = classByStudent[enr.student_id] ?? null;
    const classMode = classId ? visibilityByKey[`progression.path_visibility.class.${classId}`] : null;
    const studentMode = visibilityByKey[`progression.path_visibility.student.${enr.student_id}`] ?? null;
    const visibilityMode: VisibilityMode = (studentMode ?? classMode ?? 'full') === 'milestone' ? 'milestone' : 'full';

    const { data: curricula } = await admin
      .from('course_curricula')
      .select('id, school_id, content, version, updated_at')
      .eq('course_id', enr.course_id)
      .order('updated_at', { ascending: false });

    const pickedCurriculum =
      (curricula ?? []).find((c: any) => c.school_id && c.school_id === enr.school_id) ??
      (curricula ?? []).find((c: any) => c.school_id == null) ??
      null;

    const curriculumContent = pickedCurriculum?.content && typeof pickedCurriculum.content === 'object'
      ? (pickedCurriculum.content as Record<string, unknown>)
      : null;
    const totalWeeks =
      Array.isArray(curriculumContent?.terms)
        ? (curriculumContent?.terms as Array<Record<string, unknown>>).reduce((acc, term) => {
            const weeks = Array.isArray(term.weeks) ? term.weeks.length : 0;
            return acc + weeks;
          }, 0)
        : 0;

    let lessonPlan = null;
    if (pickedCurriculum?.id) {
      const { data: lp } = await admin
        .from('lesson_plans')
        .select('id, title, plan_data, status, updated_at')
        .eq('course_id', enr.course_id)
        .eq('curriculum_version_id', pickedCurriculum.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lessonPlan = lp ?? null;
    }

    const progression = asObject(asObject(lessonPlan?.plan_data).progression);
    const generatedTerms = asObject(progression.generated_terms);
    const termStatuses = Object.entries(generatedTerms).map(([key, value]) => ({
      key,
      status: String(asObject(value).term_status ?? 'draft'),
    }));

    let currentTerm = 1;
    let currentWeek = Math.max(1, Number(enr.start_week ?? 1));
    let completionPct = 0;
    let lastTopic: string | null = null;
    let completedWeeks = 0;

    if (pickedCurriculum?.id) {
      let q = admin
        .from('curriculum_week_tracking')
        .select('term_number, week_number, status, updated_at')
        .eq('curriculum_id', pickedCurriculum.id);
      if (enr.school_id) q = q.eq('school_id', enr.school_id);
      else q = q.is('school_id', null);
      const { data: trackingRows } = await q;
      const completed = (trackingRows ?? [])
        .filter((t: any) => t.status === 'completed')
        .sort((a: any, b: any) => (a.term_number - b.term_number) || (a.week_number - b.week_number));
      completedWeeks = completed.length;
      if (completed.length > 0) {
        const last = completed[completed.length - 1];
        currentTerm = Number(last.term_number ?? 1);
        currentWeek = Number(last.week_number ?? 1) + 1;
        lastTopic = weekTopicFromCurriculum(curriculumContent, Number(last.term_number ?? 1), Number(last.week_number ?? 1));
      }
      completionPct = totalWeeks > 0 ? Math.min(100, Math.round((completedWeeks / totalWeeks) * 100)) : 0;
    }

    const statusSummary =
      enr.status === 'active'
        ? 'On active learning path'
        : enr.status === 'completed'
          ? 'Learning path completed'
          : `Enrollment status: ${enr.status}`;

    paths.push({
      enrollment_id: enr.id,
      student_id: enr.student_id,
      course_id: enr.course_id,
      course_title: enr.courses?.title ?? 'Course',
      program_name: enr.courses?.programs?.name ?? 'Program',
      level_order: enr.courses?.level_order ?? null,
      school_id: enr.school_id,
      enrollment_status: enr.status,
      promoted_to: enr.promoted_to,
      term_label: enr.term_label,
      start_week: enr.start_week,
      curriculum_id: pickedCurriculum?.id ?? null,
      curriculum_version: pickedCurriculum?.version ?? null,
      lesson_plan_id: lessonPlan?.id ?? null,
      lesson_plan_status: lessonPlan?.status ?? null,
      term_statuses: termStatuses,
      current_term: currentTerm,
      current_week: currentWeek,
      completed_weeks: completedWeeks,
      total_weeks: totalWeeks,
      completion_pct: completionPct,
      last_topic: lastTopic,
      status_summary: statusSummary,
      visibility_mode: visibilityMode,
      can_view_full: visibilityMode === 'full',
      updated_at: enr.updated_at,
    });
  }

  return NextResponse.json({
    data: {
      role: profile.role,
      children: childOptions,
      paths,
    },
  });
}
