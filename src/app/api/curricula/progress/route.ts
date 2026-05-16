import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/curricula/progress
// Returns delivery progress per curriculum per school
// Admin/Teacher: all schools (or filtered by ?school_id=)
// School role: just their school

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { getTeacherSchoolIds } = await import('@/lib/auth-utils');
  const userSchoolIds: string[] = [];
  if (profile.school_id) userSchoolIds.push(profile.school_id);
  if (profile.role === 'teacher') {
    const sids = await getTeacherSchoolIds(profile.id, profile.school_id);
    sids.forEach(id => { if (!userSchoolIds.includes(id)) userSchoolIds.push(id); });
  }

  const admin = createAdminClient() as any;
  const url = new URL(req.url);
  const filterSchoolId = url.searchParams.get('school_id');

  // Fetch curricula with course and program info
  let currQuery = admin
    .from('course_curricula')
    .select('id, course_id, school_id, version, content, is_visible_to_school, created_at, updated_at, courses(id, title, programs(id, name))')
    .order('created_at', { ascending: false });

  // Access control
  if (profile.role === 'school') {
    currQuery = currQuery.eq('is_visible_to_school', true).eq('school_id', profile.school_id);
  } else if (profile.role === 'teacher') {
    if (userSchoolIds.length > 0) {
      currQuery = currQuery.or(`school_id.in.(${userSchoolIds.join(',')}),school_id.is.null`);
    }
  }

  const { data: curricula, error: currErr } = await currQuery;
  if (currErr) return NextResponse.json({ error: currErr.message }, { status: 500 });

  // Fetch tracking records — always include null school_id (platform curriculum tracking)
  let trackQuery = admin.from('curriculum_week_tracking').select('*');
  if (profile.role === 'school' && profile.school_id) {
    trackQuery = trackQuery.eq('school_id', profile.school_id);
  } else if (profile.role === 'teacher') {
    if (userSchoolIds.length > 0) {
      trackQuery = trackQuery.or(`school_id.in.(${userSchoolIds.join(',')}),school_id.is.null`);
    } else {
      trackQuery = trackQuery.is('school_id', null);
    }
  } else if (filterSchoolId) {
    // Admin filtered by school: include that school + platform (null) tracking
    trackQuery = trackQuery.or(`school_id.eq.${filterSchoolId},school_id.is.null`);
  }
  const { data: tracking } = await trackQuery;
  const trackingArr: any[] = tracking ?? [];

  // Fetch schools list for name lookup
  let schoolsQuery = admin
    .from('schools')
    .select('id, name, status')
    .eq('status', 'approved');

  if (profile.role === 'school' && profile.school_id) {
    schoolsQuery = schoolsQuery.eq('id', profile.school_id);
  } else if (profile.role === 'teacher' && userSchoolIds.length > 0) {
    schoolsQuery = schoolsQuery.in('id', userSchoolIds);
  }

  const { data: schools } = await schoolsQuery.order('name');
  const schoolsArr: any[] = schools ?? [];

  // Compute progress stats per curriculum per school
  const result = (curricula ?? []).map((curr: any) => {
    const content = curr.content ?? {};
    const terms: any[] = content.terms ?? [];
    const allWeeks = terms.flatMap((t: any) => (t.weeks ?? []).map((w: any) => ({ ...w, term: t.term })));
    const totalWeeks = allWeeks.length;

    // All tracking rows for this curriculum
    const trackForCurr = trackingArr.filter((t: any) => t.curriculum_id === curr.id);

    // Distinct school_ids from tracking — null is valid (platform curriculum tracking)
    const rawKeys: Array<string | null> = Array.from(new Set(trackForCurr.map((t: any) => t.school_id)));
    // If nothing tracked yet, show one placeholder row
    const trackingKeys: Array<string | null | '__none__'> = rawKeys.length > 0 ? rawKeys : ['__none__'];

    const perSchool = trackingKeys.map((schoolId) => {
      const isPlaceholder = schoolId === '__none__';
      const isNullSchool = schoolId === null;

      const schoolTrack = isPlaceholder
        ? []
        : isNullSchool
          ? trackForCurr.filter((t: any) => t.school_id === null)
          : trackForCurr.filter((t: any) => t.school_id === schoolId);

      const school = (!isPlaceholder && !isNullSchool)
        ? schoolsArr.find((s: any) => s.id === schoolId)
        : null;

      const completed = schoolTrack.filter((t: any) => t.status === 'completed').length;
      const inProgress = schoolTrack.filter((t: any) => t.status === 'in_progress').length;
      const skipped = schoolTrack.filter((t: any) => t.status === 'skipped').length;
      const pct = totalWeeks > 0 ? Math.round((completed / totalWeeks) * 100) : 0;

      const completedWeekNums = new Set(
        schoolTrack.filter((t: any) => t.status === 'completed').map((t: any) => `${t.term_number}-${t.week_number}`)
      );
      // Exclude skipped weeks from "current week" calculation
      const skippedWeekNums = new Set(
        schoolTrack.filter((t: any) => t.status === 'skipped').map((t: any) => `${t.term_number}-${t.week_number}`)
      );
      const nextWeek = allWeeks.find((w: any) =>
        !completedWeekNums.has(`${w.term}-${w.week}`) && !skippedWeekNums.has(`${w.term}-${w.week}`)
      );

      // Upcoming assessments/exams not yet completed
      const upcomingAssessments = allWeeks
        .filter((w: any) => (w.type === 'assessment' || w.type === 'examination') && !completedWeekNums.has(`${w.term}-${w.week}`))
        .slice(0, 2);

      // Per-term breakdown
      const termProgress = terms.map((term: any) => {
        const termWeeks = term.weeks ?? [];
        const termCompleted = schoolTrack.filter((t: any) =>
          t.term_number === term.term && t.status === 'completed'
        ).length;
        return {
          term: term.term,
          title: term.title,
          totalWeeks: termWeeks.length,
          completed: termCompleted,
          pct: termWeeks.length > 0 ? Math.round((termCompleted / termWeeks.length) * 100) : 0,
        };
      });

      return {
        school_id: isPlaceholder ? null : schoolId,
        school_name: school?.name ?? (isNullSchool ? 'Platform' : 'Not yet started'),
        total_weeks: totalWeeks,
        completed,
        in_progress: inProgress,
        skipped,
        pct,
        current_week: nextWeek ?? null,
        upcoming_assessments: upcomingAssessments,
        term_progress: termProgress,
        last_activity: schoolTrack.sort((a: any, b: any) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )[0]?.updated_at ?? null,
      };
    });

    return {
      curriculum_id: curr.id,
      course_id: curr.course_id,
      course_title: (curr.courses as any)?.title ?? 'Unknown Course',
      program_name: (curr.courses as any)?.programs?.name ?? 'Unknown Program',
      version: curr.version,
      total_weeks: totalWeeks,
      term_count: terms.length,
      is_visible_to_school: curr.is_visible_to_school ?? true,
      per_school: perSchool,
    };
  });

  return NextResponse.json({ data: result, schools: schoolsArr });
}
