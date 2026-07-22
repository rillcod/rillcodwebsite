import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { loadSchoolProgrammeScope } from '@/lib/school-reports/school-curriculum-scope';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';
import { reportWeekNumbers } from '@/lib/school-reports/delivery-declaration';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can generate curricula.' }, { status: 403 });
  }

  const { reportId } = await req.json();
  if (!reportId) return NextResponse.json({ error: 'reportId is required.' }, { status: 400 });

  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle();

  if (error || !report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot manage this school report.' }, { status: 403 });
  }

  const row = report as SchoolPerformanceReportRow;
  const schoolId = row.school_id;

  const { data: students } = await actor.admin
    .from('portal_users')
    .select('id,class_id,full_name,section_class,grade,class_arm')
    .eq('role', 'student')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .limit(5000);

  const schoolScope = await loadSchoolProgrammeScope(actor.admin, schoolId, (students ?? []) as any[]);
  const courseMap = new Map<string, { id: string; title: string; programme: string }>();

  for (const item of schoolScope) {
    if (item.courseId && item.enrolledStudents > 0) {
      courseMap.set(item.courseId, {
        id: item.courseId,
        title: item.course,
        programme: item.programme,
      });
    }
  }

  if (!courseMap.size) {
    return NextResponse.json(
      {
        error:
          'No active enrolled courses were found for this school. Assign learners to classes with an active course, then refresh the report.',
      },
      { status: 409 },
    );
  }

  let createdCount = 0;
  const termNumber = row.snapshot?.period?.academicTermNumber || row.curriculum_start_term || 1;
  const startWeek = row.curriculum_start_week || row.snapshot?.period?.curriculumStart?.week || 1;
  const endWeek = row.curriculum_end_week || row.snapshot?.period?.curriculumEnd?.week || startWeek;
  const reportWeeks = reportWeekNumbers(startWeek, endWeek);

  for (const course of courseMap.values()) {
    // Check if curriculum exists for this school & course
    const { data: existing } = await actor.admin
      .from('course_curricula')
      .select('id,content')
      .eq('course_id', course.id)
      .or(`school_id.eq.${schoolId},school_id.is.null`);

    const existingWeekNumbers = new Set((existing ?? []).flatMap((curriculum: any) =>
      (Array.isArray(curriculum.content?.terms) ? curriculum.content.terms : [])
        .filter((term: any) => Number(term.term ?? term.term_number) === termNumber)
        .flatMap((term: any) => (Array.isArray(term.weeks) ? term.weeks : []).map((item: any) => Number(item.week ?? item.week_number))),
    ));
    const existingHasWindow = reportWeeks.every((week) => existingWeekNumbers.has(week));
    const missingWeeks = reportWeeks.filter((week) => !existingWeekNumbers.has(week));
    if (!existingHasWindow) {
      // Generate on-the-spot curriculum content
      const content = {
        course_title: course.title,
        overview: `Progressive STEM & Computer Science curriculum tailored for ${row.snapshot?.school?.name || 'partner school'} learners during ${row.term_label || 'Term ' + termNumber}.`,
        learning_outcomes: [
          `Master core computational thinking concepts in ${course.title}`,
          'Build hands-on practical projects and problem-solving exercises',
          'Develop collaborative technical skills and digital literacy',
        ],
        terms: [
          {
            term: termNumber,
            year: 1,
            title: `${course.programme} — Term ${termNumber} Progressive Delivery`,
            weeks: missingWeeks.map((week) => ({
              week,
              type: week % 3 === 0 ? 'assessment' : 'lesson',
              topic: week % 3 === 0
                ? `${course.title} — Progress Check & Practical Demonstration ${Math.ceil(week / 3)}`
                : `${course.title} Module ${week}: Practical Application & Hands-On Exercises`,
              lesson_plan: {
                duration_minutes: 40,
                objectives: [
                  `Understand Week ${week} concepts in ${course.title}`,
                  'Complete guided practical lab exercise',
                ],
                teacher_activities: ['Introduce weekly concept', 'Demonstrate practical code sample', 'Guide student exercises'],
                student_activities: ['Listen to teacher intro', 'Write and test code exercises', 'Submit weekly output'],
                classwork: { title: `Week ${week} Lab`, instructions: 'Complete the lab exercise.', materials: ['Computer/Tablet'] },
                assignment: { title: `Week ${week} Practice`, instructions: 'Practice at home.', due: 'Next Session' },
              },
            })),
          },
        ],
      };

      const { error: insertError } = await actor.admin.from('course_curricula').insert({
        course_id: course.id,
        school_id: schoolId,
        content,
        version: 1,
        created_by: actor.user.id,
        is_visible_to_school: true,
      });
      if (insertError) return NextResponse.json({ error: `Could not create the ${course.programme} / ${course.title} delivery checklist: ${insertError.message}` }, { status: 500 });
      createdCount++;
    }
  }

  return NextResponse.json({ success: true, createdCount, courseCount: courseMap.size, reportingWeeks: reportWeeks.length });
}
