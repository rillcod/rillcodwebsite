import { describe, expect, it } from 'vitest';
import {
  courseConflictsWithClassSection,
  matchCourseFromCatalog,
  matchCourseFromClassName,
  reconcileCourseWithClassSection,
  resolveClassLinkedCourse,
  resolveLinkedCourseForClass,
  resolveProgressReportCourseEvidence,
} from './class-course-resolution';

const catalog = [
  { id: 'scratch-id', title: 'Creative Coding with Scratch', program_id: 'yi-id', is_active: true },
  { id: 'python-id', title: 'Python for Beginners', program_id: 'td-id', is_active: true },
];

describe('class-course-resolution', () => {
  it('links Teen Dev class to Python even when current_course_id is stale Scratch', () => {
    const linked = resolveClassLinkedCourse(
      {
        name: 'Abundant Grace · Teen Dev · JSS 1 - SS 3',
        program_id: 'td-id',
        current_course_id: 'scratch-id',
      },
      catalog,
    );
    expect(linked?.id).toBe('python-id');
  });

  it('links Young Innov Basic class to Scratch with guard pattern', () => {
    const linked = resolveClassLinkedCourse(
      {
        name: 'Abundant Grace · Young Innov · Basic 4 - 6',
        program_id: 'yi-id',
        current_course_id: null,
      },
      catalog,
    );
    expect(linked?.id).toBe('scratch-id');
  });

  it('does not infer Scratch for Young Innov + JSS without course keyword', () => {
    expect(matchCourseFromClassName('Young Innovators · JSS1', catalog)).toBeNull();
    expect(
      resolveLinkedCourseForClass(
        { name: 'Young Innovators · JSS1', program_id: 'yi-id', current_course_id: null },
        catalog,
      ),
    ).toBeNull();
  });

  it('matches explicit Scratch in class label', () => {
    expect(
      matchCourseFromCatalog('Franej · Young Innovators · JSS1 Scratch', catalog)?.id,
    ).toBe('scratch-id');
  });

  it('detects programme conflict between Teen Dev section and Scratch course_name', () => {
    expect(
      courseConflictsWithClassSection({
        sectionClass: 'Abundant Grace · Teen Dev · JSS 1 - SS 3',
        courseName: 'Creative Coding with Scratch',
      }),
    ).toBe(true);
  });

  it('reconciles stale report course fields from class registration', () => {
    const reconciled = reconcileCourseWithClassSection(
      {
        course_id: 'scratch-id',
        course_name: 'Creative Coding with Scratch',
      },
      'Abundant Grace · Teen Dev · JSS 1 - SS 3',
      catalog,
      { name: 'Abundant Grace · Teen Dev · JSS 1 - SS 3', program_id: 'td-id' },
    );
    expect(reconciled.course_id).toBe('python-id');
    expect(reconciled.course_name).toBe('Python for Beginners');
  });

  it('resolves progress report course from section_class and current_module over stale course_name', () => {
    const scope = [
      {
        programme: 'Young Innovators',
        course: 'Creative Coding with Scratch',
        courseId: 'scratch-id',
      },
      {
        programme: 'Teen Developers',
        course: 'Python for Beginners',
        courseId: 'python-id',
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
      catalog,
    );
    expect(resolved.programme).toBe('Teen Developers');
    expect(resolved.course).toBe('Python for Beginners');
    expect(resolved.courseId).toBe('python-id');
  });
});
