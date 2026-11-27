import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { getParentLinkScope } from '@/lib/parents/links';
import { getCurrentAcademicYear } from '@/lib/reports/academic-period';
import {
  normalizeSchoolTermCalendar,
  type SchoolDeliveryTiming,
} from '@/lib/curriculum/school-calendar-alignment';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id, class_id, email')
    .eq('id', user.id)
    .maybeSingle();

  const role = String(profile?.role ?? '');
  if (!['admin', 'teacher', 'school', 'student', 'parent'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const requestedSchoolId = url.searchParams.get('school_id') || '';
  const requestedChildId = url.searchParams.get('child_id') || '';
  const requestedCourseId = url.searchParams.get('course_id') || '';
  const requestedClassId = url.searchParams.get('class_id') || '';

  let schools: Array<{ id: string; name: string }> = [];
  let children: Array<{
    id: string;
    full_name: string;
    school_id: string | null;
    school_name: string | null;
    class_id: string | null;
    current_course_id: string | null;
  }> = [];
  let effectiveSchoolId: string | null = null;
  let effectiveClassId: string | null = requestedClassId || null;

  if (role === 'admin') {
    const { data: rows } = await admin
      .from('schools')
      .select('id, name')
      .eq('status', 'approved')
      .order('name', { ascending: true })
      .limit(500);
    schools = (rows ?? []).filter((r: any) => r?.id && r?.name);
    if (requestedSchoolId && schools.some((s) => s.id === requestedSchoolId)) {
      effectiveSchoolId = requestedSchoolId;
    } else if (requestedSchoolId === 'platform') {
      effectiveSchoolId = null;
    } else {
      effectiveSchoolId = null;
    }
  } else if (role === 'teacher') {
    const teacherSchoolIds = await getTeacherSchoolIds(user.id, profile?.school_id ?? null);
    if (teacherSchoolIds.length > 0) {
      const { data: rows } = await admin
        .from('schools')
        .select('id, name')
        .in('id', teacherSchoolIds)
        .order('name', { ascending: true });
      schools = (rows ?? []).filter((r: any) => r?.id && r?.name);
    }
    if (requestedSchoolId && schools.some((s) => s.id === requestedSchoolId)) {
      effectiveSchoolId = requestedSchoolId;
    } else {
      effectiveSchoolId = schools[0]?.id ?? profile?.school_id ?? null;
    }
  } else if (role === 'school') {
    effectiveSchoolId = profile?.school_id ?? null;
    if (effectiveSchoolId) {
      const { data: row } = await admin
        .from('schools')
        .select('id, name')
        .eq('id', effectiveSchoolId)
        .maybeSingle();
      if (row?.id) schools = [{ id: row.id, name: row.name }];
    }
  } else if (role === 'student') {
    effectiveSchoolId = profile?.school_id ?? null;
    effectiveClassId = effectiveClassId || profile?.class_id || null;
    if (effectiveSchoolId) {
      const { data: row } = await admin
        .from('schools')
        .select('id, name')
        .eq('id', effectiveSchoolId)
        .maybeSingle();
      if (row?.id) schools = [{ id: row.id, name: row.name }];
    }
  } else if (role === 'parent') {
    const { studentUserIds } = await getParentLinkScope(admin, {
      id: user.id,
      email: user.email ?? profile?.email,
    });
    if (studentUserIds.length > 0) {
      const { data: childUsers } = await admin
        .from('portal_users')
        .select('id, full_name, school_id, class_id')
        .in('id', studentUserIds)
        .order('full_name', { ascending: true });

      const schoolIds = Array.from(
        new Set((childUsers ?? []).map((c: any) => c.school_id).filter(Boolean)),
      ) as string[];
      const classIds = Array.from(
        new Set((childUsers ?? []).map((c: any) => c.class_id).filter(Boolean)),
      ) as string[];

      const [schoolsRes, classesRes] = await Promise.all([
        schoolIds.length > 0
          ? admin.from('schools').select('id, name').in('id', schoolIds)
          : Promise.resolve({ data: [] }),
        classIds.length > 0
          ? admin.from('classes').select('id, current_course_id, school_id').in('id', classIds)
          : Promise.resolve({ data: [] }),
      ]);

      const schoolMap = new Map<string, string>(
        (schoolsRes.data ?? []).map((s: any) => [String(s.id), String(s.name)]),
      );
      const classMap = new Map<string, { current_course_id: string | null; school_id: string | null }>(
        (classesRes.data ?? []).map((c: any) => [
          String(c.id),
          { current_course_id: c.current_course_id ?? null, school_id: c.school_id ?? null },
        ]),
      );

      children = (childUsers ?? []).map((c: any) => {
        const cls = c.class_id ? classMap.get(String(c.class_id)) : undefined;
        const sid = c.school_id ?? cls?.school_id ?? null;
        return {
          id: String(c.id),
          full_name: String(c.full_name || 'Learner'),
          school_id: sid,
          school_name: sid ? schoolMap.get(String(sid)) ?? null : null,
          class_id: c.class_id ?? null,
          current_course_id: cls?.current_course_id ?? null,
        };
      });

      schools = Array.from(schoolMap.entries()).map(([id, name]) => ({ id, name }));
      const chosenChild =
        children.find((c) => c.id === requestedChildId) ??
        children.find((c) => requestedSchoolId && c.school_id === requestedSchoolId) ??
        children[0] ??
        null;
      effectiveSchoolId = chosenChild?.school_id ?? profile?.school_id ?? null;
      effectiveClassId = effectiveClassId || chosenChild?.class_id || null;
    } else if (profile?.school_id) {
      effectiveSchoolId = profile.school_id;
    }
  }

  // Load platform + school academic year & term_calendar + canonical academic_terms + delivery schedule
  const settingKeys = ['academic_year', 'term_calendar'];
  if (effectiveSchoolId) {
    settingKeys.push(
      `academic_year_school_${effectiveSchoolId}`,
      `term_calendar_school_${effectiveSchoolId}`,
    );
  }

  const [settingsRes, termsRes, schedulesRes, adoptionsRes] = await Promise.all([
    admin.from('app_settings').select('key, value').in('key', settingKeys),
    admin
      .from('academic_terms')
      .select('academic_year, term_number, term_label, start_date, end_date, is_current')
      .order('academic_year', { ascending: false })
      .order('term_number', { ascending: true }),
    effectiveSchoolId
      ? (() => {
          let q = admin
            .from('academic_curriculum_delivery_schedules')
            .select(
              'id, school_id, class_id, course_id, release_id, status, entry_term_number, entry_week_number, curriculum_year_number, curriculum_term_number, curriculum_week_number, sessions_per_week, pacing_mode',
            )
            .eq('school_id', effectiveSchoolId)
            .eq('status', 'active')
            .order('updated_at', { ascending: false });
          if (requestedCourseId) q = q.eq('course_id', requestedCourseId);
          return q;
        })()
      : Promise.resolve({ data: [] }),
    effectiveSchoolId
      ? (() => {
          let q = admin
            .from('academic_curriculum_adoptions')
            .select('id, school_id, course_id, release_id, academic_session, status')
            .eq('school_id', effectiveSchoolId)
            .eq('status', 'active')
            .order('adopted_at', { ascending: false });
          if (requestedCourseId) q = q.eq('course_id', requestedCourseId);
          return q;
        })()
      : Promise.resolve({ data: [] }),
  ]);

  const settingsMap = new Map<string, any>(
    (settingsRes.data ?? []).map((row: any) => [String(row.key), row.value]),
  );

  const platformSession = String(settingsMap.get('academic_year') || getCurrentAcademicYear());
  const schoolSession = effectiveSchoolId
    ? settingsMap.get(`academic_year_school_${effectiveSchoolId}`)
    : null;
  const adoptionSession = (adoptionsRes.data ?? [])[0]?.academic_session;
  const academicSession = String(schoolSession || adoptionSession || platformSession);

  const rawSchoolCal = effectiveSchoolId
    ? settingsMap.get(`term_calendar_school_${effectiveSchoolId}`)
    : null;
  const rawPlatformCal = settingsMap.get('term_calendar');
  const termCalendar =
    normalizeSchoolTermCalendar(rawSchoolCal) ??
    normalizeSchoolTermCalendar(rawPlatformCal) ??
    null;

  const scheduleRows = (schedulesRes.data ?? []) as any[];
  const classMatch = effectiveClassId
    ? scheduleRows.find((r) => r.class_id === effectiveClassId)
    : null;
  const schoolDefaultMatch =
    scheduleRows.find((r) => !r.class_id) ?? scheduleRows[0] ?? null;
  const chosenSchedule = classMatch ?? schoolDefaultMatch ?? null;

  const schedule: SchoolDeliveryTiming | null = chosenSchedule
    ? {
        entryTerm: Number(chosenSchedule.entry_term_number ?? 1),
        entryWeek: Number(chosenSchedule.entry_week_number ?? 1),
        programmeYear: Number(chosenSchedule.curriculum_year_number ?? 1),
        programmeTerm: Number(chosenSchedule.curriculum_term_number ?? 1),
        programmeWeek: Number(chosenSchedule.curriculum_week_number ?? 1),
        sessionsPerWeek: Number(chosenSchedule.sessions_per_week ?? 1),
        pacingMode: chosenSchedule.pacing_mode || 'standard',
        source: classMatch ? 'class_schedule' : 'school_schedule',
      }
    : null;

  const selectedSchoolName = effectiveSchoolId
    ? schools.find((s) => s.id === effectiveSchoolId)?.name ?? null
    : null;

  return NextResponse.json({
    data: {
      role,
      schools,
      children,
      selectedSchoolId: effectiveSchoolId,
      selectedSchoolName,
      selectedClassId: effectiveClassId,
      academicSession,
      platformSession,
      hasSchoolCalendarOverride: Boolean(rawSchoolCal),
      termCalendar,
      academicTerms: termsRes.data ?? [],
      schedule,
      adoptions: adoptionsRes.data ?? [],
    },
  });
}
