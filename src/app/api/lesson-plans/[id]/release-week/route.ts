import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { releasePreparedWeek } from '@/lib/academic/release-week-content';

export const dynamic = 'force-dynamic';

/**
 * Plan-page "Release week" — same write path as the approvals inbox.
 *
 * Previously this route matched legacy metadata.week_number / lesson_plan_id
 * while the generators wrote curriculum_week_number + lesson_plan_id columns,
 * so a release from the plan page could no-op while the approvals queue worked
 * (or the reverse). Both now call releasePreparedWeek.
 */
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

  const result = await releasePreparedWeek({ planId: id, week: weekNumber });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    lessonsReleased: result.lessons_released,
    assignmentsReleased: result.assignments_released,
    flashcardsReleased: result.flashcards_released,
    week_number: weekNumber,
    year_number: Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null,
    term_number: Number.isFinite(termNumber) && termNumber > 0 ? termNumber : null,
  });
}
