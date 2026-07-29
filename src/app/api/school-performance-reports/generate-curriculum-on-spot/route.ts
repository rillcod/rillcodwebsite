import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { resolveDeliveryCoursesForReport } from '@/lib/school-reports/school-curriculum-scope';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';
import {
  endWeekForReportWindow,
  normalizeReportingWeeks,
  reportWeekNumbers,
  reportingWeekCount,
} from '@/lib/school-reports/delivery-declaration';
import { syntheticWeekTopicLabel } from '@/lib/school-reports/topics-covered-presentation';
import { expandCourseDeliveryWeeks } from '@/lib/school-reports/week-expansion';

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

  const deliveryCourses = await resolveDeliveryCoursesForReport(
    actor.admin,
    schoolId,
    (students ?? []) as any[],
    row.snapshot,
  );

  if (!deliveryCourses.length) {
    return NextResponse.json(
      {
        error:
          'No courses could be resolved for this report. Refresh the report snapshot first so programme courses are detected, then try again.',
      },
      { status: 409 },
    );
  }

  let createdCount = 0;
  let aiCourseCount = 0;
  let placeholderCourseCount = 0;
  const unresolvedCourses: string[] = [];
  const range = {
    startTerm: row.curriculum_start_term || row.snapshot?.period?.academicTermNumber || 1,
    startWeek: row.curriculum_start_week || row.snapshot?.period?.curriculumStart?.week || 1,
    endTerm: row.curriculum_end_term || row.curriculum_start_term || 1,
    endWeek: row.curriculum_end_week || row.snapshot?.period?.curriculumEnd?.week || 14,
  };
  const reportingWeeks = reportingWeekCount(range);
  const startWeek = range.startWeek;
  const endWeek = endWeekForReportWindow(startWeek, normalizeReportingWeeks(reportingWeeks));
  const termNumber = range.startTerm;
  const reportWeeks = reportWeekNumbers(startWeek, endWeek);

  for (const course of deliveryCourses) {
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
      // Expand from the topics this course has genuinely reached, so the checklist
      // staff tick against is real teaching content rather than a phrase list
      // cycled by week number and repeated identically for every course.
      const reachedTopics = (existing ?? []).flatMap((curriculum: any) =>
        (Array.isArray(curriculum.content?.terms) ? curriculum.content.terms : [])
          .flatMap((term: any) => (Array.isArray(term.weeks) ? term.weeks : []))
          .map((item: any) => String(item?.topic ?? '').trim())
          .filter(Boolean),
      );

      const expansion = await expandCourseDeliveryWeeks({
        courseTitle: course.title,
        programme: course.programme,
        schoolName: row.snapshot?.school?.name ?? null,
        termLabel: row.term_label ?? null,
        termNumber,
        weekNumbers: missingWeeks,
        reachedTopics,
      });
      if (expansion.source === 'ai') aiCourseCount++;
      else {
        placeholderCourseCount++;
        unresolvedCourses.push(`${course.programme} / ${course.title}`);
        continue;
      }

      const weekByNumber = new Map(expansion.weeks.map((week) => [week.week, week]));

      const content = {
        course_title: course.title,
        overview: `Progressive STEM & Computer Science curriculum tailored for ${row.snapshot?.school?.name || 'partner school'} learners during ${row.term_label || 'Term ' + termNumber}.`,
        learning_outcomes: [
          `Master core computational thinking concepts in ${course.title}`,
          'Build hands-on practical projects and problem-solving exercises',
          'Develop collaborative technical skills and digital literacy',
        ],
        // Recorded so a placeholder plan can never be mistaken for an authored one.
        generated_source: expansion.source,
        generated_model: expansion.model,
        generated_at: new Date().toISOString(),
        terms: [
          {
            term: termNumber,
            year: 1,
            title: `${course.programme} — Term ${termNumber} Progressive Delivery`,
            weeks: missingWeeks.map((week) => {
              const planned = weekByNumber.get(week);
              const topic = planned?.topic || syntheticWeekTopicLabel(course.title, week);
              const objectives = planned?.objectives?.length
                ? planned.objectives
                : [`Understand Week ${week} concepts in ${course.title}`, 'Complete guided practical lab exercise'];
              return {
                week,
                type: planned?.weekType ?? (week % 4 === 0 ? 'assessment' : 'lesson'),
                topic,
                source: expansion.source,
                lesson_plan: {
                  duration_minutes: 40,
                  objectives,
                  teacher_activities: ['Introduce weekly concept', 'Demonstrate practical code sample', 'Guide student exercises'],
                  student_activities: ['Listen to teacher intro', 'Write and test code exercises', 'Submit weekly output'],
                  classwork: { title: `${topic} — Lab`, instructions: 'Complete the lab exercise.', materials: ['Computer/Tablet'] },
                  assignment: { title: `${topic} — Practice`, instructions: 'Practice at home.', due: 'Next Session' },
                },
              };
            }),
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
      if (insertError) {
        return NextResponse.json(
          { error: `Could not create the ${course.programme} / ${course.title} delivery checklist: ${insertError.message}` },
          { status: 500 },
        );
      }
      createdCount++;
    }
  }

  return NextResponse.json({
    success: true,
    createdCount,
    courseCount: deliveryCourses.length,
    reportingWeeks: reportWeeks.length,
    unresolvedCourses,
    // Courses that could not be expanded reliably are returned as unresolved;
    // they never receive synthetic week labels.
    aiCourseCount,
    placeholderCourseCount,
    usedPlaceholder: placeholderCourseCount > 0,
  });
}
