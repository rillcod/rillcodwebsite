import { describe, expect, it } from 'vitest';
import { cbtExamVisibleToStudent } from './visibility';
import { isPriorSessionUntaggedCbtExam } from './session';
import { resolveStudentProgramScope } from '@/lib/assignments/visibility';

describe('old/promoted student CBT exam allocation & stale bleed prevention', () => {
  const promotedStudent = {
    id: 'stu-old-1',
    school_id: 'school-1',
    school_name: 'Quincy Academy',
    class_id: 'class-jss1',
    section_class: 'JSS 1',
  };

  it('derives current programme from class current_course_id even when classes.program_id is null, overriding old enrollments', async () => {
    const fakeAdmin: any = {
      from(table: string) {
        if (table === 'enrollments') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({
                  data: [{ program_id: 'prog-basic6-old' }],
                }),
              }),
            }),
          };
        }
        if (table === 'classes') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { program_id: null, current_course_id: 'course-jss1-python' },
                }),
              }),
            }),
          };
        }
        if (table === 'courses') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: 'course-jss1-python', program_id: 'prog-teen-devs' },
                }),
              }),
              in: async () => ({
                data: [{ id: 'course-jss1-python' }, { id: 'course-jss1-web' }],
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const scope = await resolveStudentProgramScope(fakeAdmin, promotedStudent.id, promotedStudent.class_id);
    expect(scope.programIds.has('prog-basic6-old')).toBe(false);
    expect(scope.programIds.has('prog-teen-devs')).toBe(true);
    expect(scope.courseIds.has('course-jss1-python')).toBe(true);

    // Old Basic 6 exam is completely invisible
    expect(
      cbtExamVisibleToStudent(
        { school_id: 'school-1', program_id: 'prog-basic6-old', class_id: null, metadata: {} },
        promotedStudent,
        scope,
      ),
    ).toBe(false);

    // Current JSS 1 class-scoped exam IS visible
    expect(
      cbtExamVisibleToStudent(
        { school_id: 'school-1', program_id: 'prog-teen-devs', class_id: 'class-jss1', metadata: { visibility: 'class' } },
        promotedStudent,
        scope,
      ),
    ).toBe(true);

    // Another arm/class exam in same programme is NOT visible
    expect(
      cbtExamVisibleToStudent(
        { school_id: 'school-1', program_id: 'prog-teen-devs', class_id: 'class-jss2', metadata: { visibility: 'class' } },
        promotedStudent,
        scope,
      ),
    ).toBe(false);
  });

  it('filters out untagged prior-session CBT exams created before the current academic session', () => {
    const sessionStartMs = Date.parse('2026-08-01T00:00:00.000Z');
    expect(
      isPriorSessionUntaggedCbtExam(
        {
          term_id: null,
          metadata: {},
          start_date: null,
          end_date: null,
          created_at: '2025-11-12T10:00:00.000Z',
        },
        sessionStartMs,
      ),
    ).toBe(true);

    expect(
      isPriorSessionUntaggedCbtExam(
        {
          term_id: null,
          metadata: {},
          start_date: null,
          end_date: null,
          created_at: '2026-10-05T10:00:00.000Z',
        },
        sessionStartMs,
      ),
    ).toBe(false);

    expect(
      isPriorSessionUntaggedCbtExam(
        {
          term_id: 'term-2026-t1',
          metadata: {},
          start_date: null,
          end_date: null,
          created_at: '2025-11-12T10:00:00.000Z',
        },
        sessionStartMs,
      ),
    ).toBe(false);
  });
});
