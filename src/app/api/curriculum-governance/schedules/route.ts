import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { actorSchoolIds, requireGovernanceActor } from '@/lib/curriculum/governance-server';
import { humanTermLabel } from '@/lib/curriculum/humanLabels';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  const url = new URL(req.url);
  const db: any = createAdminClient();
  let query = db
    .from('academic_curriculum_delivery_schedules')
    .select('*, schools(name), classes(name), courses(title), release:academic_curriculum_releases(title, academic_session, audience_label)')
    .order('updated_at', { ascending: false });
  if (url.searchParams.get('school_id')) query = query.eq('school_id', url.searchParams.get('school_id'));
  if (url.searchParams.get('class_id')) query = query.eq('class_id', url.searchParams.get('class_id'));
  if (url.searchParams.get('course_id')) query = query.eq('course_id', url.searchParams.get('course_id'));
  if (actor.role !== 'admin') {
    const allowed = await actorSchoolIds(actor);
    if (allowed.length === 0) return NextResponse.json({ data: [] });
    query = query.in('school_id', allowed);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  if (actor.role !== 'admin') {
    return NextResponse.json({
      error: 'School and class timing is managed by the Academic Office. Your assigned class will update automatically.',
    }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const schoolId = typeof body.school_id === 'string' ? body.school_id : '';
  const classId = typeof body.class_id === 'string' && body.class_id ? body.class_id : null;
  const courseId = typeof body.course_id === 'string' ? body.course_id : '';
  const releaseId = typeof body.release_id === 'string' ? body.release_id : '';
  if (!schoolId || !courseId || !releaseId) {
    return NextResponse.json({ error: 'Choose a school and its official academic direction.' }, { status: 400 });
  }
  const entryTerm = Number(body.entry_term_number ?? 1);
  const entryWeek = Number(body.entry_week_number ?? 1);
  if (![1, 2, 3].includes(entryTerm) || !Number.isInteger(entryWeek) || entryWeek < 1 || entryWeek > 12) {
    return NextResponse.json({ error: 'Choose First Term, Second Term, or Third Term, and a starting week from 1 to 12.' }, { status: 400 });
  }
  const db: any = createAdminClient();
  const { data: adoption } = await db
    .from('academic_curriculum_adoptions')
    .select('id, release_id')
    .eq('school_id', schoolId)
    .eq('course_id', courseId)
    .eq('release_id', releaseId)
    .eq('status', 'active')
    .maybeSingle();
  if (!adoption) {
    return NextResponse.json({ error: 'Assign this official academic direction to the school before setting its timing.' }, { status: 409 });
  }
  if (classId) {
    const { data: klass } = await db.from('classes').select('id, school_id, program_id').eq('id', classId).maybeSingle();
    const { data: course } = await db.from('courses').select('program_id').eq('id', courseId).maybeSingle();
    if (!klass || klass.school_id !== schoolId) return NextResponse.json({ error: 'The selected class does not belong to this school.' }, { status: 400 });
    if (klass.program_id && course?.program_id && klass.program_id !== course.program_id) {
      return NextResponse.json({ error: 'The selected course is not part of this class programme.' }, { status: 400 });
    }
  }

  const payload = {
    school_id: schoolId,
    class_id: classId,
    course_id: courseId,
    release_id: releaseId,
    academic_term_id: typeof body.academic_term_id === 'string' ? body.academic_term_id : null,
    entry_term_number: entryTerm,
    entry_week_number: entryWeek,
    curriculum_year_number: Number(body.curriculum_year_number ?? 1),
    curriculum_term_number: Number(body.curriculum_term_number ?? 1),
    curriculum_week_number: Number(body.curriculum_week_number ?? 1),
    sessions_per_week: Number(body.sessions_per_week ?? 1),
    pacing_mode: ['standard', 'accelerated', 'extended', 'custom'].includes(body.pacing_mode) ? body.pacing_mode : 'standard',
    status: 'active',
    created_by: actor.id,
    updated_at: new Date().toISOString(),
  };
  let existingQuery = db.from('academic_curriculum_delivery_schedules').select('id');
  existingQuery = classId
    ? existingQuery.eq('class_id', classId).eq('course_id', courseId).is('academic_term_id', null)
    : existingQuery.eq('school_id', schoolId).eq('course_id', courseId).is('class_id', null).is('academic_term_id', null);
  const { data: existing } = await existingQuery.maybeSingle();
  const write = existing
    ? db.from('academic_curriculum_delivery_schedules').update(payload).eq('id', existing.id)
    : db.from('academic_curriculum_delivery_schedules').insert(payload);
  const { data, error } = await write.select('*, schools(name), classes(name), courses(title)').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    data: {
      ...data,
      message: `${data.classes?.name ?? data.schools?.name ?? 'School'} begins in ${humanTermLabel(entryTerm)}, Week ${entryWeek}. Earlier weeks are not overdue.`,
    },
  }, { status: existing ? 200 : 201 });
}
