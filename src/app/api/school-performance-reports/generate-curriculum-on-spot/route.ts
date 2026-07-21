import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import { loadSchoolProgrammeScope } from '@/lib/school-reports/school-curriculum-scope';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

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
    if (item.courseId) {
      courseMap.set(item.courseId, {
        id: item.courseId,
        title: item.course,
        programme: item.programme,
      });
    }
  }

  // Legacy fallback when classes lack programme links
  if (!courseMap.size) {
    const { data: schoolClasses } = await actor.admin
      .from('classes')
      .select('current_course_id, courses(id, title, programs(name))')
      .eq('school_id', schoolId);

    for (const cls of schoolClasses ?? []) {
      if (cls.current_course_id && cls.courses) {
        const course = Array.isArray(cls.courses) ? cls.courses[0] : cls.courses;
        if (course?.id) {
          const prog = Array.isArray(course.programs) ? course.programs[0] : course.programs;
          courseMap.set(course.id, {
            id: course.id,
            title: String(course.title || 'Coding & Robotics'),
            programme: String(prog?.name || 'STEM Innovation'),
          });
        }
      }
    }
  }

  // Fallback to courses mentioned in report snapshot if no classes linked
  if (!courseMap.size && row.snapshot?.programmeCoursePerformance?.length) {
    for (const pc of row.snapshot.programmeCoursePerformance) {
      if (pc.course && pc.course !== 'Course') {
        const { data: courseRows } = await actor.admin
          .from('courses')
          .select('id, title, programs(name)')
          .ilike('title', pc.course)
          .limit(1);
        if (courseRows?.[0]) {
          const c = courseRows[0];
          const prog = Array.isArray(c.programs) ? c.programs[0] : c.programs;
          courseMap.set(c.id, {
            id: c.id,
            title: c.title,
            programme: String(prog?.name || pc.programme || 'STEM Innovation'),
          });
        }
      }
    }
  }

  // If still no courses found, pick default active course
  if (!courseMap.size) {
    const { data: defaultCourses } = await actor.admin
      .from('courses')
      .select('id, title, programs(name)')
      .eq('is_active', true)
      .limit(2);
    for (const c of defaultCourses ?? []) {
      const prog = Array.isArray(c.programs) ? c.programs[0] : c.programs;
      courseMap.set(c.id, {
        id: c.id,
        title: c.title,
        programme: String(prog?.name || 'STEM Innovation'),
      });
    }
  }

  let createdCount = 0;
  const termNumber = row.snapshot?.period?.academicTermNumber || row.curriculum_start_term || 1;

  for (const course of courseMap.values()) {
    // Check if curriculum exists for this school & course
    const { data: existing } = await actor.admin
      .from('course_curricula')
      .select('id')
      .eq('course_id', course.id)
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .limit(1);

    if (!existing?.length) {
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
            weeks: Array.from({ length: 12 }, (_, i) => ({
              week: i + 1,
              type: (i + 1) % 3 === 0 ? 'assessment' : 'lesson',
              topic: (i + 1) % 3 === 0
                ? `${course.title} — Progress Check & Practical Demonstration ${Math.ceil((i + 1) / 3)}`
                : `${course.title} Module ${i + 1}: Practical Application & Hands-On Exercises`,
              lesson_plan: {
                duration_minutes: 40,
                objectives: [
                  `Understand Week ${i + 1} concepts in ${course.title}`,
                  'Complete guided practical lab exercise',
                ],
                teacher_activities: ['Introduce weekly concept', 'Demonstrate practical code sample', 'Guide student exercises'],
                student_activities: ['Listen to teacher intro', 'Write and test code exercises', 'Submit weekly output'],
                classwork: { title: `Week ${i + 1} Lab`, instructions: 'Complete the lab exercise.', materials: ['Computer/Tablet'] },
                assignment: { title: `Week ${i + 1} Practice`, instructions: 'Practice at home.', due: 'Next Session' },
              },
            })),
          },
        ],
      };

      await actor.admin.from('course_curricula').insert({
        course_id: course.id,
        school_id: schoolId,
        content,
        version: 1,
        created_by: actor.user.id,
        is_visible_to_school: true,
      });

      createdCount++;
    }
  }

  return NextResponse.json({ success: true, createdCount });
}
