import { describe, expect, it } from 'vitest';
import { buildProgrammeCoursePerformance, mergeProgrammeCoursePerformanceWithEnrolment } from './programme-course-performance';

describe('buildProgrammeCoursePerformance', () => {
  const scope = [
    {
      programme: 'Young Innovators',
      course: 'Scratch',
      courseId: 'c1',
      programmeId: 'p1',
      enrolledStudents: 18,
      classIds: ['cls1'],
      classNames: ['JSS1 Scratch'],
    },
    {
      programme: 'Teen Developers',
      course: 'Python Programming',
      courseId: 'c2',
      programmeId: 'p2',
      enrolledStudents: 12,
      classIds: ['cls2'],
      classNames: ['JSS2 Python'],
    },
  ];

  it('prefers published term assessment scores over gradebook submissions', () => {
    const rows = buildProgrammeCoursePerformance({
      scope,
      publishedReports: [
        { student_id: 's1', course_name: 'Scratch', overall_score: 72, is_published: true },
        { student_id: 's2', course_name: 'Scratch', overall_score: 78, is_published: true },
      ],
      submissions: [
        {
          portal_user_id: 's1',
          grade: 10,
          assignments: { title: 'Quiz', max_points: 20, courses: { title: 'Scratch', programs: { name: 'Young Innovators' } } },
        },
      ],
      courseMetaById: new Map(),
      enrollmentByKey: new Map([
        ['young innovators::scratch', 18],
      ]),
    });

    const scratch = rows.find((row) => row.course === 'Scratch');
    expect(scratch?.submissions).toBe(2);
    expect(scratch?.averageScore).toBe(75);
    expect(scratch?.students).toBe(2);
  });

  it('falls back to gradebook average when no published overall_score exists', () => {
    const rows = buildProgrammeCoursePerformance({
      scope,
      publishedReports: [{ student_id: 's1', course_name: 'Python Programming', is_published: true }],
      submissions: [
        {
          portal_user_id: 's1',
          grade: 15,
          assignments: { title: 'Loops', max_points: 20, courses: { title: 'Python Programming', programs: { name: 'Teen Developers' } } },
        },
      ],
      courseMetaById: new Map(),
      enrollmentByKey: new Map([
        ['teen developers::python programming', 12],
      ]),
    });

    const python = rows.find((row) => row.course === 'Python Programming');
    expect(python?.students).toBe(1);
    expect(python?.averageScore).toBe(75);
    expect(python?.submissions).toBe(1);
  });

  it('groups stale Scratch course_name under Teen Dev Python when section_class says Teen Dev', () => {
    const rows = buildProgrammeCoursePerformance({
      scope,
      publishedReports: [
        {
          student_id: 'teen-1',
          course_id: 'c1',
          course_name: 'Scratch',
          section_class: 'Abundant Grace · Teen Dev · JSS 1 - SS 3',
          current_module: 'Python For Beginners',
          overall_score: 89,
          is_published: true,
          resolvedProgramme: 'Teen Developers',
          resolvedCourse: 'Python Programming',
          resolvedCourseId: 'c2',
        },
      ],
      submissions: [],
      courseMetaById: new Map([['c1', { course: 'Scratch', programme: 'Young Innovators' }]]),
      enrollmentByKey: new Map([
        ['young innovators::scratch', 18],
        ['teen developers::python programming', 12],
      ]),
    });

    expect(rows.find((row) => row.course === 'Python Programming')?.students).toBe(1);
    expect(rows.find((row) => row.course === 'Scratch')?.students ?? 0).toBe(0);
  });

  it('merges enrolled programmes missing from score evidence', () => {
    const rows = mergeProgrammeCoursePerformanceWithEnrolment(
      [
        {
          programme: 'Young Innovators',
          course: 'Scratch',
          submissions: 18,
          averageScore: 72,
          students: 18,
          enrolledStudents: 18,
        },
      ],
      [
        { programme: 'Teen Developers', course: 'Python Programming', enrolledStudents: 12 },
      ],
    );

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.course === 'Python Programming')?.enrolledStudents).toBe(12);
  });
});
