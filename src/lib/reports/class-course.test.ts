import { describe, expect, it } from 'vitest';
import {
  courseConflictsWithClassSection,
  reconcileCourseWithClassSection,
  resolveLinkedCourseForClass,
} from './class-course';

const courses = [
  { id: 'scratch-id', title: 'Creative Coding with Scratch', program_id: 'yi-id', is_active: true },
  { id: 'python-id', title: 'Python for Beginners', program_id: 'td-id', is_active: true },
];

describe('class-course', () => {
  it('links Teen Dev class to Python, not the first Young Innovators course', () => {
    const linked = resolveLinkedCourseForClass(
      {
        name: 'Abundant Grace · Teen Dev · JSS 1 - SS 3',
        program_id: 'td-id',
        current_course_id: 'scratch-id',
      },
      courses,
    );
    expect(linked?.id).toBe('python-id');
    expect(linked?.title).toBe('Python for Beginners');
  });

  it('links Young Innov class to Scratch', () => {
    const linked = resolveLinkedCourseForClass(
      {
        name: 'Abundant Grace · Young Innov · Basic 4 - 6',
        program_id: 'yi-id',
        current_course_id: null,
      },
      courses,
    );
    expect(linked?.id).toBe('scratch-id');
  });

  it('does not infer Scratch for Young Innov + JSS without a course keyword or current_course_id', () => {
    const linked = resolveLinkedCourseForClass(
      {
        name: 'Young Innovators · JSS1',
        program_id: 'yi-id',
        current_course_id: null,
      },
      courses,
    );
    expect(linked).toBeNull();
  });

  it('detects stale Scratch course_name on a Teen Dev section', () => {
    expect(
      courseConflictsWithClassSection({
        sectionClass: 'Abundant Grace · Teen Dev · JSS 1 - SS 3',
        courseName: 'Creative Coding with Scratch',
      }),
    ).toBe(true);
  });

  it('reconciles report payload course fields from section_class', () => {
    const reconciled = reconcileCourseWithClassSection(
      {
        course_id: 'scratch-id',
        course_name: 'Creative Coding with Scratch',
        section_class: 'Abundant Grace · Teen Dev · JSS 1 - SS 3',
      },
      'Abundant Grace · Teen Dev · JSS 1 - SS 3',
      courses,
      { name: 'Abundant Grace · Teen Dev · JSS 1 - SS 3', program_id: 'td-id' },
    );
    expect(reconciled.course_id).toBe('python-id');
    expect(reconciled.course_name).toBe('Python for Beginners');
  });
});
