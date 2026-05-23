import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { metadataMatchesWeek } from '@/lib/progression/lessonPlanOperation';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

type MetadataRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

type LessonRow = MetadataRow & {
  status: string | null;
};

type AssignmentRow = MetadataRow & {
  is_active: boolean | null;
};

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { week_number, year_number, term_number } = await req.json().catch(() => ({}));
  const weekNumber = Number(week_number);
  const yearNumber = Number(year_number ?? 0);
  const termNumber = Number(term_number ?? 0);
  if (!Number.isFinite(weekNumber) || weekNumber <= 0) {
    return NextResponse.json({ error: 'week_number must be a positive number', field: 'week_number' }, { status: 400 });
  }

  const { data: plan, error: planErr } = await supabase
    .from('lesson_plans')
    .select('id, school_id, course_id')
    .eq('id', id)
    .single();
  if (planErr || !plan) return NextResponse.json({ error: 'Lesson plan not found.' }, { status: 404 });
  if (profile.role !== 'admin') {
    const allowedSchoolIds = await getTeacherSchoolIds(user.id, profile.school_id);
    if (!allowedSchoolIds.includes(plan.school_id ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const targetWeek = {
    week: weekNumber,
    syllabus_ref: {
      year_number: Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : undefined,
      term_number: Number.isFinite(termNumber) && termNumber > 0 ? termNumber : undefined,
    },
  };
  const scopedToYearTerm = Number.isFinite(yearNumber) && yearNumber > 0 && Number.isFinite(termNumber) && termNumber > 0;
  const matchesReleaseTarget = (metadata: Record<string, unknown> | null) => {
    if (scopedToYearTerm) return metadataMatchesWeek(metadata, targetWeek, yearNumber, termNumber);
    return Number(metadata?.week_number ?? metadata?.week ?? -1) === weekNumber;
  };

  const [lessonsRes, assignmentsRes] = await Promise.all([
    (supabase as any)
      .from('lessons')
      .select('id,status,metadata')
      .eq('course_id', plan.course_id)
      .eq('school_id', plan.school_id),
    (supabase as any)
      .from('assignments')
      .select('id,is_active,metadata')
      .eq('school_id', plan.school_id)
      .eq('course_id', plan.course_id),
  ]);
  if (lessonsRes.error || assignmentsRes.error) {
    return NextResponse.json({
      error: lessonsRes.error?.message ?? assignmentsRes.error?.message ?? 'Failed to load release targets',
    }, { status: 500 });
  }

  const lessonIds = ((lessonsRes.data ?? []) as LessonRow[])
    .filter((row) => row.status === 'draft')
    .filter((row) => row.metadata?.lesson_plan_id === id)
    .filter((row) => matchesReleaseTarget(row.metadata))
    .map((row) => row.id);
  const assignmentIds = ((assignmentsRes.data ?? []) as AssignmentRow[])
    .filter((row) => row.is_active !== true)
    .filter((row) => row.metadata?.lesson_plan_id === id)
    .filter((row) => matchesReleaseTarget(row.metadata))
    .map((row) => row.id);

  if (lessonIds.length > 0) {
    const { error } = await (supabase as any)
      .from('lessons')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .in('id', lessonIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (assignmentIds.length > 0) {
    const { error } = await (supabase as any)
      .from('assignments')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .in('id', assignmentIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { triggerAssignmentReleaseNotifications } = await import('@/lib/assignments/notifications');
    Promise.all(
      assignmentIds.map(aid => triggerAssignmentReleaseNotifications(aid).catch(console.error))
    ).catch(console.error);
  }

  return NextResponse.json({
    success: true,
    lessonsReleased: lessonIds.length,
    assignmentsReleased: assignmentIds.length,
    week_number: weekNumber,
    year_number: Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null,
    term_number: Number.isFinite(termNumber) && termNumber > 0 ? termNumber : null,
  });
}
