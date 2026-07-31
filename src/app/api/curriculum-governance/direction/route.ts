import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { effectiveDeliverySchedule } from '@/lib/curriculum/deliverySchedule';
import { mapSessionCalendarToCurriculumPosition } from '@/lib/curriculum/sessionAwareSchedule';
import {
  humanAcademicSession,
  humanCurriculumContext,
  humanEntryPoint,
  humanGradeLabel,
  humanTermLabel,
} from '@/lib/curriculum/humanLabels';
import { requireGovernanceActor } from '@/lib/curriculum/governance-server';

export const dynamic = 'force-dynamic';

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function GET(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  const url = new URL(req.url);
  const classId = url.searchParams.get('class_id') ?? '';
  const courseId = url.searchParams.get('course_id') ?? '';
  const requestedWeek = Number(url.searchParams.get('calendar_week') ?? 1);
  if (!classId || !courseId) {
    return NextResponse.json({ error: 'Choose a class and course to view its academic direction.' }, { status: 400 });
  }
  const db: any = createAdminClient();
  const { data: klass } = await db
    .from('classes')
    .select('id, name, school_id, teacher_id, program_id, qa_grade_key, term_id, schools(name), academic_terms(id, academic_year, term_number, term_label)')
    .eq('id', classId)
    .maybeSingle();
  if (!klass) return NextResponse.json({ error: 'Class not found.' }, { status: 404 });
  if (actor.role === 'teacher') {
    const schools = await getTeacherSchoolIds(actor.id, actor.school_id);
    if (klass.teacher_id !== actor.id || !schools.includes(klass.school_id)) {
      return NextResponse.json({ error: 'This class is not assigned to you.' }, { status: 403 });
    }
  }
  if (actor.role === 'school' && klass.school_id !== actor.school_id) {
    return NextResponse.json({ error: 'This class belongs to another school.' }, { status: 403 });
  }
  const { data: course } = await db.from('courses').select('id, title, program_id, programs(name)').eq('id', courseId).maybeSingle();
  if (!course || (klass.program_id && course.program_id && klass.program_id !== course.program_id)) {
    return NextResponse.json({ error: 'This course is not part of the class programme.' }, { status: 400 });
  }
  const { data: adoption } = await db
    .from('academic_curriculum_adoptions')
    .select('release_id, academic_session, release:academic_curriculum_releases!academic_curriculum_adoptions_release_id_fkey(id, title, content, source_metadata, academic_session, effective_term_number, grade_key, audience_label)')
    .eq('school_id', klass.school_id)
    .eq('course_id', courseId)
    .eq('status', 'active')
    .maybeSingle();
  const release: any = relation(adoption?.release);
  if (!release) {
    return NextResponse.json({
      data: {
        available: false,
        message: `No official academic direction has been assigned to ${relation<any>(klass.schools)?.name ?? 'this school'} for ${course.title}.`,
      },
    });
  }

  const { data: schedules } = await db
    .from('academic_curriculum_delivery_schedules')
    .select('*')
    .eq('school_id', klass.school_id)
    .eq('course_id', courseId)
    .eq('release_id', release.id)
    .eq('status', 'active')
    .or(`class_id.is.null,class_id.eq.${classId}`);
  const schoolDefault = (schedules ?? []).find((row: any) => !row.class_id) ?? null;
  const classOverride = (schedules ?? []).find((row: any) => row.class_id === classId) ?? null;
  const academicTerm: any = relation(klass.academic_terms);
  const rawSchedule: any = effectiveDeliverySchedule({ schoolDefault, classOverride }) ?? {
    entry_term_number: academicTerm?.term_number ?? release.effective_term_number ?? 1,
    entry_week_number: 1,
    curriculum_year_number: 1,
    curriculum_term_number: 1,
    curriculum_week_number: 1,
  };
  const schedule = {
    entryTerm: Number(rawSchedule.entry_term_number ?? 1),
    entryWeek: Number(rawSchedule.entry_week_number ?? 1),
    curriculumYear: Number(rawSchedule.curriculum_year_number ?? 1),
    curriculumTerm: Number(rawSchedule.curriculum_term_number ?? 1),
    curriculumWeek: Number(rawSchedule.curriculum_week_number ?? 1),
  };
  const calendarTerm = Number(academicTerm?.term_number ?? release.effective_term_number ?? 1);
  const entryAcademicSession = adoption.academic_session ?? release.academic_session;
  const currentAcademicSession = academicTerm?.academic_year ?? entryAcademicSession;
  const position = mapSessionCalendarToCurriculumPosition({
    entryAcademicSession,
    currentAcademicSession,
    calendarTerm,
    calendarWeek: Math.max(1, Math.min(12, requestedWeek)),
    schedule,
  });
  const terms: any[] = Array.isArray(release.content?.terms) ? release.content.terms : [];
  const term = position
    ? terms.find((entry) => Number(entry.year ?? 1) === position.year && Number(entry.term) === position.term)
      ?? terms.find((entry) => Number(entry.term) === position.term)
    : null;
  const week = position && term?.weeks
    ? term.weeks.find((entry: any) => Number(entry.week) === position.week)
    : null;
  const gradeKey = klass.qa_grade_key ?? release.grade_key ?? null;
  const school: any = relation(klass.schools);
  const program: any = relation(course.programs);

  return NextResponse.json({
    data: {
      available: true,
      heading: `${course.title} Academic Direction`,
      context: humanCurriculumContext({
        academicSession: currentAcademicSession,
        termNumber: calendarTerm,
        gradeKey,
        programmeYear: position?.year ?? 1,
      }),
      school_name: school?.name ?? 'School',
      class_name: klass.name,
      programme_name: program?.name ?? 'Programme',
      level: humanGradeLabel(gradeKey),
      academic_session: humanAcademicSession(currentAcademicSession),
      current_term: humanTermLabel(calendarTerm),
      entry_point: humanEntryPoint({ termNumber: schedule.entryTerm, weekNumber: schedule.entryWeek }),
      before_entry: !position,
      message: !position
        ? `Teaching for this class begins in ${humanTermLabel(schedule.entryTerm)}, Week ${schedule.entryWeek}. Nothing is overdue.`
        : week
          ? `This class is on ${humanTermLabel(calendarTerm)}, Week ${requestedWeek}. The official focus is ${week.topic ?? 'the scheduled learning outcome'}.`
          : 'The class position is mapped, but this official direction has no content for the mapped week.',
      this_week: week ? {
        calendar_label: `${humanTermLabel(calendarTerm)}, Week ${requestedWeek}`,
        curriculum_position: `Programme Year ${position?.year}, ${humanTermLabel(position?.term)}, Week ${position?.week}`,
        topic: week.topic ?? 'Topic not set',
        subtopics: Array.isArray(week.subtopics) ? week.subtopics : [],
        lesson_plan: week.lesson_plan ?? null,
        assessment_plan: week.assessment_plan ?? null,
      } : null,
      source: {
        name: release.source_metadata?.name ?? 'Rillcod Academic Framework',
        framework: release.source_metadata?.framework ?? 'Approved Coding and Robotics Standard',
      },
      internal: { release_id: release.id, class_id: classId, course_id: courseId },
    },
  });
}
