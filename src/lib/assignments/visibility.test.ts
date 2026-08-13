import type { SupabaseClient } from '@supabase/supabase-js';
import { assignmentVisibleToStudent, resolveStudentProgramScope } from './visibility';
import { vi } from 'vitest';

describe('resolveStudentProgramScope', () => {
  const mockFrom = vi.fn();
  const mockAdmin = {
    from: mockFrom,
  } as unknown as SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes program from class when student has no enrollments', async () => {
    // Mock enrollments query returning empty
    mockFrom.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            data: [],
          }),
        }),
      }),
    }));
    // Mock classes query returning a program_id
    mockFrom.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { program_id: 'prog-123' } }),
        }),
      }),
    }));
    // Mock courses query returning no courses (not needed for this test)
    mockFrom.mockImplementationOnce(() => ({
      select: () => ({
        in: () => ({ data: [] }),
      }),
    }));

    const result = await resolveStudentProgramScope(mockAdmin, 'student-1', 'class-1');
    expect(result.programIds.has('prog-123')).toBe(true);
    expect(result.courseIds.size).toBe(0);
  });
});

describe('assignmentVisibleToStudent', () => {
  it('allows any course in the learner programme instead of only the class current course', () => {
    const visible = assignmentVisibleToStudent(
      {
        id: 'assignment-2',
        program_id: 'prog-123',
        course_id: 'course-module-2',
        school_id: null,
        school_name: null,
        created_by: 'admin-1',
        metadata: {},
      },
      {
        id: 'student-1',
        school_id: null,
        school_name: null,
        class_id: 'class-1',
        section_class: null,
        primary_teacher_id: null,
        enrollment_type: 'special',
      },
      {
        programIds: new Set(['prog-123']),
        courseIds: new Set(['course-module-1', 'course-module-2']),
      },
      { 'admin-1': 'admin' },
      null,
    );

    expect(visible).toBe(true);
  });
});
