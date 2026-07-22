import { describe, expect, it } from 'vitest';
import {
  buildSchoolCourseDetections,
  curriculaAppliesToSchool,
  matchCourseFromClassName,
  normalizeProgrammeLabel,
  programmeCourseKey,
  resolveClassCourseForScope,
  resolveProgressReportCourseEvidence,
  scopeCurriculaForReport,
  scopeCurriculaForSchool,
  resolveProgrammeForCourseEvidence,
  supplementProgrammeScopeFromEvidence,
} from './school-curriculum-scope';

describe('school-curriculum-scope', () => {
  it('normalizes Young Innov variants to Young Innovators', () => {
    expect(normalizeProgrammeLabel('Young Innov 3')).toBe('Young Innovators');
    expect(normalizeProgrammeLabel('Young Innovators')).toBe('Young Innovators');
    expect(normalizeProgrammeLabel('Teen Dev')).toBe('Teen Developers');
  });

  it('merges programme/course keys across label variants', () => {
    expect(programmeCourseKey('Young Innov', 'Scratch')).toBe(
      programmeCourseKey('Young Innovators', 'Scratch'),
    );
  });

  it('includes school-specific and scoped platform curricula for enrolled active courses', () => {
    const schoolId = 'school-1';
    const schoolCourseIds = new Set(['course-a']);
    expect(curriculaAppliesToSchool({ school_id: schoolId, course_id: 'course-a' }, schoolId, schoolCourseIds)).toBe(true);
    expect(curriculaAppliesToSchool({ school_id: null, course_id: 'course-a' }, schoolId, schoolCourseIds)).toBe(true);
    expect(curriculaAppliesToSchool({ school_id: null, course_id: 'course-b' }, schoolId, schoolCourseIds)).toBe(false);
    expect(curriculaAppliesToSchool({ school_id: schoolId, course_id: 'course-b' }, schoolId, schoolCourseIds)).toBe(false);
  });

  it('scopeCurriculaForSchool keeps only active enrolled course syllabi', () => {
    const scope = [
      {
        programme: 'Young Innovators',
        course: 'Scratch',
        courseId: 'course-a',
        programmeId: 'p1',
        enrolledStudents: 12,
        classIds: ['cls1'],
        classNames: ['JSS1'],
      },
    ];
    const filtered = scopeCurriculaForSchool(
      [
        { id: 'cur1', school_id: 'school-1', course_id: 'course-a', courses: { is_active: true } },
        { id: 'cur2', school_id: 'school-1', course_id: 'course-b', courses: { is_active: true } },
        { id: 'cur3', school_id: null, course_id: 'course-a', courses: { is_active: false } },
      ],
      'school-1',
      scope,
    );
    expect(filtered.map((row) => row.id)).toEqual(['cur1']);
  });

  it('scopeCurriculaForReport keeps syllabi for snapshot-resolved course ids', () => {
    const filtered = scopeCurriculaForReport(
      [
        { id: 'cur1', school_id: 'school-1', course_id: 'course-a', courses: { is_active: true } },
        { id: 'cur2', school_id: null, course_id: 'course-b', courses: { is_active: true } },
      ],
      'school-1',
      [],
      ['course-b'],
    );
    expect(filtered.map((row) => row.id)).toEqual(['cur2']);
  });

  it('matches Scratch from class name instead of defaulting to intro course', () => {
    const programCourses = [
      { id: 'intro', title: 'Hello World: Introduction to Computers', program_id: 'p1', is_active: true },
      { id: 'scratch', title: 'Coding with Scratch', program_id: 'p1', is_active: true },
    ];
    expect(matchCourseFromClassName('Franej · Young Innovators · JSS1 Scratch', programCourses)?.id).toBe('scratch');
    expect(matchCourseFromClassName('Young Innovators · JSS1', programCourses)).toBeNull();
    expect(matchCourseFromClassName('Abundant Grace · Young Innov · Basic 4 - 6', programCourses)?.id).toBe('scratch');
  });

  it('prefers class-name course match over stale intro current_course_id', () => {
    const programCourses = [
      { id: 'intro', title: 'Hello World: Introduction to Computers', program_id: 'p1', is_active: true },
      { id: 'scratch', title: 'Coding with Scratch', program_id: 'p1', is_active: true },
      { id: 'python', title: 'Python Programming', program_id: 'p1', is_active: true },
    ];
    const courseById = new Map(programCourses.map((course) => [course.id, course]));
    const coursesByProgram = new Map([['p1', programCourses]]);

    expect(
      resolveClassCourseForScope(
        {
          name: 'Abundant Grace · JSS2 Python',
          program_id: 'p1',
          current_course_id: 'intro',
          programs: { name: 'Young Innovators' },
        },
        courseById,
        coursesByProgram,
      )?.courseId,
    ).toBe('python');

    expect(
      resolveClassCourseForScope(
        {
          name: 'Abundant Grace · JSS1 Scratch',
          program_id: 'p1',
          current_course_id: 'intro',
          programs: { name: 'Young Innovators' },
        },
        courseById,
        coursesByProgram,
      )?.courseId,
    ).toBe('scratch');
  });

  it('supplements scope with additional courses from learner evidence', () => {
    const scope = supplementProgrammeScopeFromEvidence(
      [
        {
          programme: 'Young Innovators',
          course: 'Scratch',
          courseId: 'c1',
          programmeId: 'p1',
          enrolledStudents: 20,
          classIds: ['cls1'],
          classNames: ['JSS1 Scratch'],
        },
      ],
      [
        { studentId: 's1', courseId: 'c2', courseName: 'Python Programming', programme: 'Young Innovators' },
        { studentId: 's2', courseId: 'c2', courseName: 'Python Programming', programme: 'Young Innovators' },
      ],
    );

    expect(scope).toHaveLength(2);
    expect(scope.find((row) => row.course === 'Python Programming')?.enrolledStudents).toBe(2);
    expect(scope.find((row) => row.course === 'Scratch')?.enrolledStudents).toBe(20);
  });

  it('supplements scope from published reports that only have a course name', () => {
    const scope = supplementProgrammeScopeFromEvidence(
      [],
      [
        { studentId: 's1', courseName: 'Python Programming', programme: 'Teen Developers' },
        { studentId: 's2', courseName: 'Python Programming', programme: 'Teen Developers' },
      ],
    );

    expect(scope).toHaveLength(1);
    expect(scope[0]?.course).toBe('Python Programming');
    expect(scope[0]?.enrolledStudents).toBe(2);
  });

  it('resolves programme labels from enrolment scope for name-only evidence', () => {
    expect(
      resolveProgrammeForCourseEvidence(
        [
          {
            programme: 'Teen Developers',
            course: 'Python Programming',
          },
        ],
        'Python Programming',
      ),
    ).toBe('Teen Developers');
  });

  it('prefers Teen Dev section_class over stale Scratch course_name on progress reports', () => {
    const scope = [
      {
        programme: 'Young Innovators',
        course: 'Creative Coding with Scratch',
        courseId: 'scratch-id',
        programmeId: 'yi-id',
        enrolledStudents: 20,
        classIds: [],
        classNames: [],
      },
      {
        programme: 'Teen Developers',
        course: 'Python for Beginners',
        courseId: 'python-id',
        programmeId: 'td-id',
        enrolledStudents: 4,
        classIds: [],
        classNames: [],
      },
    ];
    const resolved = resolveProgressReportCourseEvidence(
      {
        student_id: 'student-1',
        course_id: 'scratch-id',
        course_name: 'Creative Coding with Scratch',
        section_class: 'Abundant Grace · Teen Dev · JSS 1 - SS 3',
        current_module: 'Python For Beginners',
      },
      scope,
      { rosterClassName: 'Abundant Grace · Teen Dev · JSS 1 - SS 3' },
      new Map([['scratch-id', { course: 'Creative Coding with Scratch', programme: 'Young Innovators' }]]),
    );
    expect(resolved.programme).toBe('Teen Developers');
    expect(resolved.course).toBe('Python for Beginners');
    expect(resolved.courseId).toBe('python-id');
  });

  it('detects per-course tracking coverage', () => {
    const detections = buildSchoolCourseDetections({
      scope: [
        {
          programme: 'Young Innovators',
          course: 'Scratch',
          courseId: 'c1',
          programmeId: 'p1',
          enrolledStudents: 12,
          classIds: ['cls1'],
          classNames: ['Young Innov 3'],
        },
        {
          programme: 'Teen Developers',
          course: 'Python',
          courseId: 'c2',
          programmeId: 'p2',
          enrolledStudents: 8,
          classIds: ['cls2'],
          classNames: ['Teen Dev JSS1'],
        },
      ],
      curricula: [
        { id: 'cur1', course_id: 'c1', school_id: 'school-1' },
        { id: 'cur2', course_id: 'c2', school_id: null },
      ],
      trackingRows: [
        { curriculum_id: 'cur1', term_number: 1, week_number: 2, status: 'completed' },
        { curriculum_id: 'cur1', term_number: 1, week_number: 3, status: 'completed' },
      ],
      academicTermNumber: 1,
      inRange: () => true,
    });

    expect(detections).toHaveLength(2);
    expect(detections.find((row) => row.course === 'Scratch')?.trackedWeeks).toBe(2);
    expect(detections.find((row) => row.course === 'Scratch')?.inReportRange).toBe(true);
    expect(detections.find((row) => row.course === 'Python')?.inReportRange).toBe(false);
    expect(detections.find((row) => row.course === 'Python')?.enrolledStudents).toBe(8);
  });
});
