import { createClient } from '@supabase/supabase-js';
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
  const schoolIds: string[] = [];
  if (profile.school_id) schoolIds.push(profile.school_id);
  if (profile.role === 'teacher') {
    const sids = await getTeacherSchoolIds(profile.id, profile.school_id);
    sids.forEach(id => { if (!schoolIds.includes(id)) schoolIds.push(id); });
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
    if (schoolIds.length > 0) {
      currQuery = currQuery.or(`school_id.in.(${schoolIds.join(',')}),school_id.is.null`);
    }
  }

  const { data: curricula, error: currErr } = await currQuery;

  if (currErr) return NextResponse.json({ error: currErr.message }, { status: 500 });

  // Fetch all tracking records
  let trackQuery = admin.from('curriculum_week_tracking').select('*');
  if (profile.role === 'school' && profile.school_id) {
    trackQuery = trackQuery.eq('school_id', profile.school_id);
  } else if (profile.role === 'teacher') {
    if (schoolIds.length > 0) {
      trackQuery = trackQuery.in('school_id', schoolIds);
    }
  } else if (filterSchoolId) {
    trackQuery = trackQuery.eq('school_id', filterSchoolId);
  }
  const { data: tracking } = await trackQuery;
  const trackingArr: any[] = tracking ?? [];

  // Fetch schools list for name lookup
  const { data: schools } = await admin
    .from('schools')
    .select('id, name, status')
    .eq('status', 'approved')
    .order('name');

  const schoolsArr: any[] = schools ?? [];

  // Compute progress stats per curriculum per school
  const result = (curricula ?? []).map((curr: any) => {
    const content = curr.content ?? {};
    const terms: any[] = content.terms ?? [];
    const allWeeks = terms.flatMap((t: any) => (t.weeks ?? []).map((w: any) => ({ ...w, term: t.term })));
    const totalWeeks = allWeeks.length;

    // Group tracking by school_id
    const trackForCurr = trackingArr.filter((t: any) => t.curriculum_id === curr.id);
    const schoolIds = Array.from(new Set(trackForCurr.map((t: any) => t.school_id).filter(Boolean))) as string[];

    // Also include schools that have no tracking yet (all pending)
    if (schoolIds.length === 0) {
      schoolIds.push('__none__');
    }

    const perSchool = schoolIds.map(schoolId => {
      const schoolTrack = schoolId === '__none__' ? [] : trackForCurr.filter((t: any) => t.school_id === schoolId);
      const school = schoolId === '__none__' ? null : schoolsArr.find((s: any) => s.id === schoolId);

      const completed = schoolTrack.filter((t: any) => t.status === 'completed').length;
      const inProgress = schoolTrack.filter((t: any) => t.status === 'in_progress').length;
      const skipped = schoolTrack.filter((t: any) => t.status === 'skipped').length;
      const pct = totalWeeks > 0 ? Math.round((completed / totalWeeks) * 100) : 0;

      // Find current week (first non-completed lesson week)
      const completedWeekNums = new Set(
        schoolTrack.filter((t: any) => t.status === 'completed').map((t: any) => `${t.term_number}-${t.week_number}`)
      );
      const nextWeek = allWeeks.find((w: any) => !completedWeekNums.has(`${w.term}-${w.week}`));

      // Find upcoming assessments/exams (assessment or examination type, not completed)
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
        school_id: schoolId === '__none__' ? null : schoolId,
        school_name: school?.name ?? 'Not yet started by any school',
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
